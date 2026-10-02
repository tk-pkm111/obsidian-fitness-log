import { t, type MessageKey } from '../../i18n';
import { formatSetsCompact } from '../../lib/format';
import type { ChartPoint } from '../../lib/history/chart';
import { exercisesWithHistory } from '../../lib/history/overview';
import {
	exerciseTimeline,
	personalBests,
	type Best,
	type SessionStat,
} from '../../lib/history/stats';
import type { Exercise, RecordType, WeightUnit } from '../../lib/model/types';
import { weekdayLabel } from '../../lib/schedule/routine';
import { formatDuration, formatMonthDay, weekdayOf } from '../../lib/time/date';
import { toDisplayWeight } from '../../lib/units';
import { renderLineChart } from '../chart';
import { textButton } from '../helpers';
import { ExerciseSuggestModal } from '../modals/exercise-suggest-modal';
import { renderMonthly } from './log-monthly';
import type { PageContext } from '../page-context';

type LogMode = 'exercise' | 'month';
type Metric =
	| 'maxWeight'
	| 'estimatedOneRepMax'
	| 'volume'
	| 'maxReps'
	| 'totalReps'
	| 'duration';

interface LogPageState {
	mode: LogMode;
	metric: Metric | null;
}

const METRICS: Record<RecordType, Metric[]> = {
	'weight-reps': ['maxWeight', 'estimatedOneRepMax', 'volume'],
	reps: ['maxReps', 'totalReps'],
	duration: ['duration'],
};

const numberFormat = new Intl.NumberFormat('ja-JP', {
	maximumFractionDigits: 1,
});

/** ログページ（実装計画 §5.5）: 種目ごとの推移と自己ベスト／月ごとの一覧 */
export function renderLogPage(ctx: PageContext, el: HTMLElement): void {
	const state = ctx.pageState<LogPageState>('log', () => ({
		mode: 'exercise',
		metric: null,
	}));
	const tabs = el.createDiv({ cls: 'fitness-log-chips' });
	for (const mode of ['exercise', 'month'] as const) {
		const chip = tabs.createEl('button', {
			cls: 'fitness-log-chip',
			text: t(`log.mode.${mode}` as MessageKey),
			attr: { type: 'button' },
		});
		chip.toggleClass('is-active', state.mode === mode);
		chip.addEventListener('click', () => {
			state.mode = mode;
			ctx.navigate({});
		});
	}
	if (state.mode === 'month') renderMonthly(ctx, el);
	else renderExerciseHistory(ctx, el, state);
}

// ---------------------------------------------------------------------------
// 種目の推移

function renderExerciseHistory(
	ctx: PageContext,
	el: HTMLElement,
	state: LogPageState,
): void {
	const { store, index, controller } = ctx.services;
	const unit = store.settings.weightUnit;
	const exercises = store.current.exercises;
	const activity = exercisesWithHistory(index.allDays(), exercises);
	const selected =
		exercises.find((e) => e.id === ctx.state.exerciseId) ??
		activity[0]?.exercise ??
		null;

	const picker = el.createDiv({ cls: 'fitness-log-toolbar' });
	textButton(
		picker,
		selected ? selected.name : t('log.chooseExercise'),
		() =>
			new ExerciseSuggestModal(ctx.app, {
				exercises,
				allowCreate: false,
				onCreate: () => undefined,
				onChoose: (exercise) =>
					ctx.navigate({ exerciseId: exercise.id }),
			}).open(),
		{ icon: 'search', cls: 'fitness-log-picker' },
	);
	const recent = activity
		.filter((a) => a.exercise.id !== selected?.id)
		.slice(0, 6);
	if (recent.length > 0) {
		const chips = el.createDiv({
			cls: 'fitness-log-chips fitness-log-recent',
		});
		chips.createSpan({ cls: 'fitness-log-muted', text: t('log.recent') });
		for (const a of recent) {
			const chip = chips.createEl('button', {
				cls: 'fitness-log-chip',
				text: a.exercise.name,
				attr: { type: 'button' },
			});
			chip.addEventListener('click', () =>
				ctx.navigate({ exerciseId: a.exercise.id }),
			);
		}
	}

	if (!selected) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('log.noHistory') });
		return;
	}
	const occurrences = index.occurrences(controller.exerciseMatcher(selected));
	if (occurrences.length === 0) {
		el.createDiv({
			cls: 'fitness-log-empty',
			text: t('log.noRecordsFor', { name: selected.name }),
		});
		return;
	}
	const timeline = exerciseTimeline(occurrences);
	renderBests(el, selected, timeline, unit);

	const metrics = METRICS[selected.recordType];
	const metric =
		state.metric && metrics.includes(state.metric)
			? state.metric
			: (metrics[0] ?? 'maxWeight');
	if (metrics.length > 1) {
		const chips = el.createDiv({ cls: 'fitness-log-chips' });
		for (const m of metrics) {
			const chip = chips.createEl('button', {
				cls: 'fitness-log-chip',
				text: t(`log.metric.${m}` as MessageKey),
				attr: { type: 'button' },
			});
			chip.toggleClass('is-active', m === metric);
			chip.addEventListener('click', () => {
				state.metric = m;
				ctx.navigate({});
			});
		}
	}

	const points: ChartPoint[] = [];
	const statsByDate = new Map<string, SessionStat>();
	for (const stat of timeline) {
		const value = metricValue(stat, metric, unit);
		if (value === null) continue;
		// 同じ日に 2 回あれば大きい方
		const existing = points.find((p) => p.date === stat.date);
		if (existing && existing.value >= value) continue;
		if (existing) existing.value = value;
		else points.push({ date: stat.date, value });
		statsByDate.set(stat.date, stat);
	}
	if (points.length > 0) {
		const best = points.reduce((a, b) => (b.value > a.value ? b : a));
		const last = points[points.length - 1];
		renderLineChart(el, {
			points,
			label: t('log.chartLabel', {
				name: selected.name,
				metric: t(`log.metric.${metric}` as MessageKey),
			}),
			formatValue: (v) => formatMetric(v, metric, unit),
			// 年をまたぐ期間は年も付ける（'25/12/6'）
			formatDate:
				points[0]?.date.slice(0, 4) === last?.date.slice(0, 4)
					? formatMonthDay
					: (d) => `${d.slice(2, 4)}/${formatMonthDay(d)}`,
			describe: (p) => {
				const stat = statsByDate.get(p.date);
				if (!stat) return '';
				return `${stat.sessionName ?? t('today.other')} ・ ${formatSetsCompact(stat.sets, unit, selected.recordType)}`;
			},
			labelDates: [
				...new Set(
					[best.date, last?.date].filter(
						(d): d is string => d !== undefined,
					),
				),
			],
			onSelect: (p) =>
				ctx.navigate({
					page: 'today',
					date: p.date === ctx.today ? null : p.date,
				}),
		});
	}

	// 表（チャートの値を表でも読めるように）
	el.createDiv({
		cls: 'fitness-log-subheading',
		text: t('log.sessions', { n: timeline.length }),
	});
	const table = el.createDiv({ cls: 'fitness-log-table' });
	for (const stat of [...timeline].reverse()) {
		const row = table.createEl('button', {
			cls: 'fitness-log-table-row',
			attr: { type: 'button' },
		});
		row.createSpan({
			cls: 'fitness-log-table-date',
			text: `${formatMonthDay(stat.date)} (${weekdayLabel(weekdayOf(stat.date))})`,
		});
		const body = row.createSpan({ cls: 'fitness-log-table-body' });
		body.createSpan({
			cls: 'fitness-log-muted',
			text: stat.sessionName ?? t('today.other'),
		});
		body.createSpan({
			text: formatSetsCompact(stat.sets, unit, selected.recordType),
		});
		const value = metricValue(stat, metric, unit);
		row.createSpan({
			cls: 'fitness-log-table-value',
			text: value === null ? '-' : formatMetric(value, metric, unit),
		});
		row.addEventListener('click', () =>
			ctx.navigate({
				page: 'today',
				date: stat.date === ctx.today ? null : stat.date,
			}),
		);
	}
}

function metricValue(
	stat: SessionStat,
	metric: Metric,
	unit: WeightUnit,
): number | null {
	switch (metric) {
		case 'maxWeight':
			return stat.maxWeight === null
				? null
				: toDisplayWeight(stat.maxWeight, unit);
		case 'estimatedOneRepMax':
			return stat.estimatedOneRepMax === null
				? null
				: toDisplayWeight(stat.estimatedOneRepMax, unit);
		case 'volume':
			return stat.volume > 0
				? Math.round(toDisplayWeight(stat.volume, unit))
				: null;
		case 'maxReps':
			return stat.maxReps;
		case 'totalReps':
			return stat.totalReps > 0 ? stat.totalReps : null;
		case 'duration':
			return stat.durationSec > 0 ? stat.durationSec : null;
	}
}

function formatMetric(value: number, metric: Metric, unit: WeightUnit): string {
	switch (metric) {
		case 'maxWeight':
		case 'estimatedOneRepMax':
		case 'volume':
			return `${numberFormat.format(value)} ${unit}`;
		case 'maxReps':
		case 'totalReps':
			return t('format.reps', { n: value });
		case 'duration':
			return formatDuration(value);
	}
}

/** 自己ベスト（数字だけで伝わるのでチャートにしない） */
function renderBests(
	el: HTMLElement,
	exercise: Exercise,
	timeline: SessionStat[],
	unit: WeightUnit,
): void {
	const bests = personalBests(timeline);
	const tiles: Array<{
		label: string;
		best: Best | undefined;
		format: (b: Best) => string;
	}> =
		exercise.recordType === 'weight-reps'
			? [
					{
						label: t('log.best.maxWeight'),
						best: bests.maxWeight,
						format: (b) =>
							`${numberFormat.format(toDisplayWeight(b.value, unit))} ${unit}${b.detail ? ` × ${b.detail}` : ''}`,
					},
					{
						label: t('log.best.estimatedOneRepMax'),
						best: bests.estimatedOneRepMax,
						format: (b) =>
							`${numberFormat.format(toDisplayWeight(b.value, unit))} ${unit}`,
					},
					{
						label: t('log.best.maxVolume'),
						best: bests.maxVolume,
						format: (b) =>
							`${numberFormat.format(Math.round(toDisplayWeight(b.value, unit)))} ${unit}`,
					},
				]
			: exercise.recordType === 'reps'
				? [
						{
							label: t('log.best.maxReps'),
							best: bests.maxReps,
							format: (b) => t('format.reps', { n: b.value }),
						},
					]
				: [
						{
							label: t('log.best.maxDuration'),
							best: bests.maxDurationSec,
							format: (b) => formatDuration(b.value),
						},
					];
	const row = el.createDiv({ cls: 'fitness-log-tiles' });
	for (const tile of tiles) {
		if (!tile.best) continue;
		const box = row.createDiv({ cls: 'fitness-log-tile' });
		box.createDiv({ cls: 'fitness-log-tile-label', text: tile.label });
		box.createDiv({
			cls: 'fitness-log-tile-value',
			text: tile.format(tile.best),
		});
		box.createDiv({
			cls: 'fitness-log-muted',
			text: formatMonthDay(tile.best.date),
		});
	}
}
