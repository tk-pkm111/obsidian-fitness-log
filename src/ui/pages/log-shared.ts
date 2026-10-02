import { t, type MessageKey } from '../../i18n';
import { formatSetsCompact } from '../../lib/format';
import type { Delta, Metric } from '../../lib/history/metrics';
import type {
	LogData,
	LogEntry,
	LogExercise,
	LogGroup,
} from '../../lib/history/package-log';
import type { Package, WeightUnit } from '../../lib/model/types';
import { weekdayLabel } from '../../lib/schedule/routine';
import { packageColorIndex } from '../../lib/schedule/calendar';
import { formatDuration, formatMonthDay, weekdayOf } from '../../lib/time/date';
import { toDisplayWeight } from '../../lib/units';
import type { PageContext } from '../page-context';

/** パッケージの色の数（styles.css の .fitness-log-pkg-color-0〜7。ルーチンのカレンダーと同じ色） */
export const PACKAGE_COLORS = 8;

export type LogMode = 'package' | 'exercise' | 'month';

/** ログページの一時的な状態（ビューが開いている間だけ） */
export interface LogPageState {
	mode: LogMode;
	/** パッケージのタブで選んでいるまとまり */
	group: string | null;
	/** パッケージのタブで開いている種目 */
	detail: string | null;
	metric: Metric | null;
	/** 種目の詳細で、ほかのパッケージの線も重ねる */
	compare: boolean;
	query: string;
	/** 種目のタブで線を隠したまとまり */
	hidden: Set<string>;
	/** 「今の内容に無い種目」を開いている */
	othersOpen: boolean;
}

export interface LogEnv {
	ctx: PageContext;
	state: LogPageState;
	data: LogData;
	packages: readonly Package[];
	unit: WeightUnit;
}

const numberFormat = new Intl.NumberFormat('ja-JP', {
	maximumFractionDigits: 1,
});

export function formatNumber(value: number): string {
	return numberFormat.format(value);
}

export function groupName(group: LogGroup): string {
	return group.kind === 'outside' ? t('log.outside') : group.name;
}

/** パッケージの色（作った順。消したパッケージはその後ろから、パッケージ外は灰） */
export function groupColorCls(env: LogEnv, key: string): string {
	const group = env.data.groups.find((g) => g.key === key);
	if (!group || group.kind === 'outside') return 'fitness-log-pkg-color-none';
	if (group.kind === 'package') {
		const index = packageColorIndex(env.packages, key, PACKAGE_COLORS);
		if (index !== null) return `fitness-log-pkg-color-${index}`;
	}
	const removed = env.data.groups.filter((g) => g.kind === 'removed-package');
	const index =
		(env.packages.length + removed.findIndex((g) => g.key === key)) %
		PACKAGE_COLORS;
	return `fitness-log-pkg-color-${index}`;
}

export function colorDot(parent: HTMLElement, colorCls: string): HTMLElement {
	return parent.createSpan({ cls: ['fitness-log-dot', colorCls] });
}

/** '10/1 (木)' */
export function formatDay(date: string): string {
	return `${formatMonthDay(date)} (${weekdayLabel(weekdayOf(date))})`;
}

export function metricLabel(metric: Metric): string {
	return t(`log.metric.${metric}` as MessageKey);
}

/** 指標の値（基準の単位）を表示の単位で */
export function displayValue(
	value: number,
	metric: Metric,
	unit: WeightUnit,
): number {
	switch (metric) {
		case 'estimatedOneRepMax':
		case 'maxWeight':
			return toDisplayWeight(value, unit);
		case 'volume':
			return Math.round(toDisplayWeight(value, unit));
		default:
			return value;
	}
}

export function metricUnit(metric: Metric, unit: WeightUnit): string {
	switch (metric) {
		case 'estimatedOneRepMax':
		case 'maxWeight':
		case 'volume':
			return unit;
		case 'totalReps':
		case 'maxReps':
			return t('format.reps', { n: '' }).trim();
		case 'duration':
			return '';
	}
}

/** 表示の単位にした値を文字に（'52.5 kg'・'12 回'・'1:30'） */
export function formatDisplay(
	value: number,
	metric: Metric,
	unit: WeightUnit,
): string {
	switch (metric) {
		case 'estimatedOneRepMax':
		case 'maxWeight':
		case 'volume':
			return `${formatNumber(value)} ${unit}`;
		case 'totalReps':
		case 'maxReps':
			return t('format.reps', { n: value });
		case 'duration':
			return formatDuration(value);
	}
}

/** 基準の単位の値を文字に */
export function formatMetric(
	value: number,
	metric: Metric,
	unit: WeightUnit,
): string {
	return formatDisplay(displayValue(value, metric, unit), metric, unit);
}

export type DeltaKind = 'up' | 'down' | 'same';

function signed(diff: number, text: string): string {
	return diff > 0 ? `+${text}` : diff < 0 ? `−${text}` : '±0';
}

/** 前回比: '+2.5 kg'・'−1 回'・'±0' */
export function formatDelta(
	delta: Delta,
	unit: WeightUnit,
): { text: string; kind: DeltaKind } {
	const kind: DeltaKind =
		delta.diff > 0 ? 'up' : delta.diff < 0 ? 'down' : 'same';
	const abs = Math.abs(delta.diff);
	switch (delta.kind) {
		case 'weight':
			return {
				kind,
				text: signed(
					delta.diff,
					`${formatNumber(toDisplayWeight(abs, unit))} ${unit}`,
				),
			};
		case 'reps':
			return {
				kind,
				text: signed(delta.diff, t('format.reps', { n: abs })),
			};
		case 'duration':
			return { kind, text: signed(delta.diff, formatDuration(abs)) };
	}
}

/** 指標の差（表の前回比）: 表示の単位にした値どうしの差 */
export function formatMetricDiff(
	diff: number,
	metric: Metric,
): { text: string; kind: DeltaKind } {
	const rounded = Math.round(diff * 10) / 10;
	const kind: DeltaKind = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'same';
	const abs = Math.abs(rounded);
	const text =
		metric === 'duration'
			? formatDuration(abs)
			: metric === 'totalReps' || metric === 'maxReps'
				? String(abs)
				: formatNumber(abs);
	return { kind, text: signed(rounded, text) };
}

export function setsText(
	entry: LogEntry,
	exercise: LogExercise,
	unit: WeightUnit,
): string {
	return formatSetsCompact(entry.stat.sets, unit, exercise.recordType);
}

/** 指標の切り替え（1 つしかなければ出さない） */
export function renderMetricChips(
	parent: HTMLElement,
	metrics: readonly Metric[],
	current: Metric,
	onChange: (metric: Metric) => void,
): void {
	if (metrics.length < 2) return;
	const chips = parent.createDiv({
		cls: 'fitness-log-metric-chips',
		attr: { role: 'group' },
	});
	for (const metric of metrics) {
		const chip = chips.createEl('button', {
			cls: 'fitness-log-metric-chip',
			text: metricLabel(metric),
			attr: {
				type: 'button',
				'aria-pressed': String(metric === current),
			},
		});
		chip.addEventListener('click', () => onChange(metric));
	}
}

/** チャートの点（表示の単位）。同じ日に 2 回あれば大きい方（点は 1 日 1 つ） */
export function chartPoints(
	dates: readonly string[],
	values: readonly (number | null)[],
	metric: Metric,
	unit: WeightUnit,
): Array<{ date: string; value: number }> {
	const byDate = new Map<string, number>();
	dates.forEach((date, i) => {
		const value = values[i];
		if (value == null) return;
		const v = displayValue(value, metric, unit);
		const existing = byDate.get(date);
		if (existing === undefined || v > existing) byDate.set(date, v);
	});
	return [...byDate].map(([date, value]) => ({ date, value }));
}

/** その日の画面を開く */
export function openDay(ctx: PageContext, date: string): void {
	ctx.navigate({ page: 'today', date: date === ctx.today ? null : date });
}
