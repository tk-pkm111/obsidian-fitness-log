import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import { availableMetrics } from '../../lib/history/metrics';
import {
	entriesFor,
	exerciseLog,
	recentExercises,
	searchExercises,
	type LogExercise,
} from '../../lib/history/package-log';
import { renderSeriesChart, type ChartSeries } from '../chart';
import {
	chartPoints,
	colorDot,
	formatDay,
	formatDisplay,
	formatMetric,
	formatNumber,
	groupColorCls,
	groupName,
	metricLabel,
	metricUnit,
	openDay,
	renderMetricChips,
	setsText,
	type LogEnv,
} from './log-shared';

const RECENT_CHIPS = 8;

/**
 * ログ ＞ 種目: 1 つの種目を、パッケージごとの線で並べて見る。
 * パッケージから外した種目・消したパッケージの記録もここでずっと見られる。
 */
export function renderExerciseLog(env: LogEnv, el: HTMLElement): void {
	const { ctx, state, data } = env;
	if (data.entries.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('log.noHistory') });
		return;
	}
	const recent = recentExercises(data, RECENT_CHIPS);
	const selected =
		(ctx.state.exerciseId !== null
			? data.exercises.get(ctx.state.exerciseId)
			: undefined) ?? recent[0];

	const pick = (exercise: LogExercise) => {
		state.query = '';
		state.hidden = new Set();
		ctx.navigate({ exerciseId: exercise.key });
	};
	renderSearch(env, el, recent, selected, pick);
	if (!selected) return;

	el.createDiv({ cls: 'fitness-log-detail-name', text: selected.name });
	const groups = exerciseLog(data, selected.key, state.metric);
	const first = groups[0];
	if (!first) return;
	const metric = first.trend.metric;
	renderMetricChips(
		el,
		availableMetrics(
			selected.recordType,
			entriesFor(data, null, selected.key).map((e) => e.stat),
		),
		metric,
		(m) => {
			state.metric = m;
			ctx.refresh();
		},
	);

	// 凡例（押すとその線を隠す・出す）。色はパッケージに付いて回る
	if (groups.length > 1) {
		const legend = el.createDiv({ cls: 'fitness-log-legend' });
		for (const { group } of groups) {
			const button = legend.createEl('button', {
				cls: ['fitness-log-legend-item', groupColorCls(env, group.key)],
				attr: {
					type: 'button',
					'aria-pressed': String(!state.hidden.has(group.key)),
				},
			});
			button.createSpan({ cls: 'fitness-log-dot' });
			button.createSpan({ text: groupName(group) });
			button.addEventListener('click', () => {
				if (state.hidden.has(group.key)) state.hidden.delete(group.key);
				else state.hidden.add(group.key);
				ctx.refresh();
			});
		}
	}

	const series: ChartSeries[] = groups
		.filter(({ group }) => !state.hidden.has(group.key))
		.map(({ group, trend }) => ({
			key: group.key,
			label: groupName(group),
			colorCls: groupColorCls(env, group.key),
			points: chartPoints(
				trend.entries.map((e) => e.date),
				trend.values,
				metric,
				env.unit,
			),
		}))
		.filter((s) => s.points.length > 0);
	if (series.length === 0)
		el.createDiv({ cls: 'fitness-log-empty', text: t('log.allHidden') });
	else
		renderSeriesChart(el, {
			series,
			label: t('log.chartLabel', {
				name: selected.name,
				metric: metricLabel(metric),
			}),
			unit: metricUnit(metric, env.unit),
			formatValue: (v) => formatDisplay(v, metric, env.unit),
			formatAxis: (v) =>
				metric === 'duration'
					? formatDisplay(v, metric, env.unit)
					: formatNumber(v),
			formatDate: formatDay,
			describe: (s, point) => {
				const entry = entriesFor(data, s.key, selected.key)
					.filter((e) => e.date === point.date)
					.pop();
				return entry ? setsText(entry, selected, env.unit) : '';
			},
			endLabels: series.length > 1 && series.length <= 4,
			labelDates:
				series.length === 1
					? (() => {
							const trend = groups.find(
								(g) => g.group.key === series[0]?.key,
							)?.trend;
							return [
								...new Set(
									[
										trend?.best?.date,
										trend?.last.date,
									].filter(
										(d): d is string => d !== undefined,
									),
								),
							];
						})()
					: [],
			onSelect: (_, point) => openDay(ctx, point.date),
		});

	const title = el.createDiv({ cls: 'fitness-log-section-title' });
	title.createSpan({ text: t('log.byPackage') });
	title.createSpan({
		text: t('log.bestOf', { metric: metricLabel(metric) }),
	});
	const list = el.createDiv({ cls: 'fitness-log-group-rows' });
	for (const { group, trend } of groups) {
		const row = list.createEl('button', {
			cls: 'fitness-log-group-row',
			attr: { type: 'button' },
		});
		colorDot(row, groupColorCls(env, group.key));
		const body = row.createSpan({ cls: 'fitness-log-group-row-body' });
		body.createSpan({
			cls: 'fitness-log-group-row-name',
			text: groupName(group),
		});
		body.createSpan({
			cls: 'fitness-log-muted',
			text: `${t('log.groupSummary', {
				n: trend.entries.length,
				date: formatDay(trend.last.date),
			})} ・ ${setsText(trend.last, selected, env.unit)}`,
		});
		row.createSpan({
			cls: 'fitness-log-group-row-value',
			text: trend.best
				? formatMetric(trend.best.value, metric, env.unit)
				: '-',
		});
		setIcon(
			row.createSpan({ cls: 'fitness-log-list-chevron' }),
			'chevron-right',
		);
		row.addEventListener('click', () => {
			state.mode = 'package';
			state.group = group.key;
			state.detail = selected.key;
			state.compare = false;
			ctx.navigate({});
		});
	}
}

/** 検索欄と、最近やった種目（検索中は候補）。入力では候補だけを描き直す（入力欄のフォーカスを保つ） */
function renderSearch(
	env: LogEnv,
	el: HTMLElement,
	recent: readonly LogExercise[],
	selected: LogExercise | undefined,
	pick: (exercise: LogExercise) => void,
): void {
	const { state, data } = env;
	const box = el.createDiv({ cls: 'fitness-log-log-search' });
	const input = box.createEl('input', {
		type: 'search',
		cls: 'fitness-log-search',
		value: state.query,
		attr: {
			placeholder: t('log.searchPlaceholder'),
			'data-focus-key': 'log-exercise-search',
			enterkeyhint: 'search',
		},
	});
	const results = box.createDiv();
	const dots = (parent: HTMLElement, exercise: LogExercise) => {
		const span = parent.createSpan({ cls: 'fitness-log-dots' });
		const groups = new Set(
			entriesFor(data, null, exercise.key).map((e) => e.group),
		);
		for (const group of data.groups)
			if (groups.has(group.key))
				colorDot(span, groupColorCls(env, group.key));
	};
	const draw = () => {
		results.empty();
		const query = state.query.trim();
		if (query.length === 0) {
			const chips = results.createDiv({ cls: 'fitness-log-chips' });
			for (const exercise of recent) {
				const chip = chips.createEl('button', {
					cls: 'fitness-log-chip',
					text: exercise.name,
					attr: { type: 'button' },
				});
				chip.toggleClass('is-active', exercise.key === selected?.key);
				chip.addEventListener('click', () => pick(exercise));
			}
			return;
		}
		const hits = searchExercises(data, query);
		if (hits.length === 0) {
			results.createDiv({
				cls: 'fitness-log-muted fitness-log-search-empty',
				text: t('log.noMatches'),
			});
			return;
		}
		const list = results.createDiv({ cls: 'fitness-log-suggest' });
		for (const exercise of hits) {
			const button = list.createEl('button', {
				cls: 'fitness-log-suggest-item',
				attr: { type: 'button' },
			});
			button.createSpan({ text: exercise.name });
			dots(button, exercise);
			button.addEventListener('click', () => pick(exercise));
		}
	};
	input.addEventListener('input', () => {
		state.query = input.value;
		draw();
	});
	input.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' || event.isComposing) return;
		const first = searchExercises(data, state.query)[0];
		if (first) pick(first);
	});
	draw();
}
