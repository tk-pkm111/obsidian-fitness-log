import { t, type MessageKey } from '../../i18n';
import type { ChartPoint } from '../../lib/history/chart';
import {
	decimalsOf,
	displayDecimals,
	displayUnit,
	toDisplayBody,
	unitOf,
	type BodyPartGroup,
} from '../../lib/body/items';
import type { BodyMeasurement } from '../../lib/body/note';
import type { BodySettings } from '../../lib/body/settings';
import {
	BODY_PERIODS,
	seriesPoints,
	type BodyPeriod,
	type GoalProgress,
} from '../../lib/body/stats';
import type { WeightUnit } from '../../lib/model/types';
import { renderSeriesChart, type ChartSeries } from '../chart';
import { openNoteInNewTab } from '../helpers';
import type { PageContext } from '../page-context';
import { formatDay } from './log-shared';

export type BodyView = 'whole' | 'parts' | 'goals';
export const BODY_VIEWS: readonly BodyView[] = ['whole', 'parts', 'goals'];

/** 体組成のページの一時的な状態（ビューが開いている間だけ） */
export interface BodyPageState {
	view: BodyView;
	/** 見ている測定の日付（null は最新） */
	date: string | null;
	/** 全身で開いている丸（項目名） */
	open: string | null;
	period: BodyPeriod;
	/** 部位別の項目（「筋肉量」） */
	measure: string | null;
	/** 部位別で開いている部位（腕・脚は左右を一緒に） */
	part: BodyPartGroup | null;
}

export function bodyPageState(ctx: PageContext): BodyPageState {
	return ctx.pageState<BodyPageState>('body', () => ({
		view: 'whole',
		date: null,
		open: null,
		period: '1m',
		measure: null,
		part: null,
	}));
}

/** 描画に使うもの（1 回の描画のあいだ） */
export interface BodyEnv {
	ctx: PageContext;
	state: BodyPageState;
	/** 測定（日付の昇順） */
	ms: readonly BodyMeasurement[];
	/** 見ている測定 */
	index: number;
	current: BodyMeasurement;
	settings: BodySettings;
	weightUnit: WeightUnit;
	/** 項目ごとの小数の桁（ノートの値から） */
	decimals: Map<string, number>;
}

export function createBodyEnv(
	ctx: PageContext,
	state: BodyPageState,
	ms: readonly BodyMeasurement[],
	index: number,
	current: BodyMeasurement,
): BodyEnv {
	return {
		ctx,
		state,
		ms,
		index,
		current,
		settings: ctx.services.store.bodySettings,
		weightUnit: ctx.services.store.settings.weightUnit,
		decimals: new Map(),
	};
}

/** ノートの単位（一覧 → 知っている単位） */
export function noteUnit(env: BodyEnv, name: string): string {
	return unitOf(name, env.settings.items);
}

/** 表示の単位（kg の項目は重量の単位） */
export function shownUnit(env: BodyEnv, name: string): string {
	return displayUnit(noteUnit(env, name), env.weightUnit);
}

function decimals(env: BodyEnv, name: string): number {
	let d = env.decimals.get(name);
	if (d === undefined) {
		const values = env.ms
			.map((m) => m.values[name])
			.filter((v): v is number => v !== undefined);
		d = displayDecimals(
			decimalsOf(name, values),
			noteUnit(env, name),
			env.weightUnit,
		);
		env.decimals.set(name, d);
	}
	return d;
}

/** ノートの値 → 表示の数字（単位なし） */
export function formatBody(env: BodyEnv, name: string, value: number): string {
	const shown = toDisplayBody(value, noteUnit(env, name), env.weightUnit);
	return shown.toFixed(decimals(env, name));
}

/** '66.7 kg'（単位の無い項目は数字だけ） */
export function formatBodyWithUnit(
	env: BodyEnv,
	name: string,
	value: number,
): string {
	const unit = shownUnit(env, name);
	return unit
		? `${formatBody(env, name, value)} ${unit}`
		: formatBody(env, name, value);
}

/** 差: '+0.4'・'−0.4'・'±0.0'（色は付けない。増量中の人には増えるのが良いことなので） */
export function formatBodyDelta(
	env: BodyEnv,
	name: string,
	diff: number,
): string {
	const d = decimals(env, name);
	const shown = toDisplayBody(diff, noteUnit(env, name), env.weightUnit);
	const rounded = Number(shown.toFixed(d));
	if (rounded === 0) return `±${(0).toFixed(d)}`;
	return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(d)}`;
}

/** 差に単位を添える（'+0.4 kg'） */
export function formatBodyDeltaWithUnit(
	env: BodyEnv,
	name: string,
	diff: number,
): string {
	const unit = shownUnit(env, name);
	const text = formatBodyDelta(env, name, diff);
	return unit ? `${text} ${unit}` : text;
}

/** 目標までの量: '1.3 kg 増'・'1.5 % 減' */
export function goalAmount(
	env: BodyEnv,
	name: string,
	progress: GoalProgress,
): string {
	const unit = shownUnit(env, name);
	const amount = formatBody(env, name, Math.abs(progress.left));
	const word = t(progress.direction < 0 ? 'body.decrease' : 'body.increase');
	return unit ? `${amount} ${unit} ${word}` : `${amount} ${word}`;
}

/** 増やす目標は青、減らす目標は橙（パッケージの色の 0 番・1 番。色だけに頼らず記号・言葉・向きも添える） */
export function goalColorCls(progress: GoalProgress): string {
	return progress.direction < 0
		? 'fitness-log-pkg-color-1'
		: 'fitness-log-pkg-color-0';
}

/** ▲／▼（増やす目標・減らす目標） */
export function goalGlyph(parent: HTMLElement, progress: GoalProgress): void {
	parent.createSpan({
		cls: ['fitness-log-body-goal-glyph', goalColorCls(progress)],
		text: progress.direction < 0 ? '▼' : '▲',
		attr: { 'aria-hidden': 'true' },
	});
}

export function goalOf(env: BodyEnv, name: string) {
	return env.settings.goals.find((goal) => goal.name === name);
}

/** 期間のチップ（1か月・3か月・半年・1年・すべて） */
export function renderPeriodChips(env: BodyEnv, parent: HTMLElement): void {
	const chips = parent.createDiv({
		cls: 'fitness-log-metric-chips fitness-log-body-periods',
		attr: { role: 'group', 'aria-label': t('body.periodLabel') },
	});
	for (const period of BODY_PERIODS) {
		const chip = chips.createEl('button', {
			cls: 'fitness-log-metric-chip',
			text: t(`body.period.${period}` as MessageKey),
			attr: {
				type: 'button',
				'aria-pressed': String(env.state.period === period),
			},
		});
		chip.addEventListener('click', () => {
			env.state.period = period;
			env.ctx.refresh();
		});
	}
}

export interface BodyLine {
	key: string;
	label: string;
	/** 項目名（ノートのプロパティ名） */
	name: string;
	colorCls: string;
}

/** 推移の線（期間の中。表示の単位）。目標があれば点線を引く */
export function renderBodyChart(
	env: BodyEnv,
	parent: HTMLElement,
	lines: readonly BodyLine[],
	goal?: { value: number; cls: string },
): void {
	const first = lines[0];
	if (!first) return;
	const unit = noteUnit(env, first.name);
	const toShown = (p: ChartPoint): ChartPoint => ({
		date: p.date,
		value: toDisplayBody(p.value, unit, env.weightUnit),
	});
	const series: ChartSeries[] = lines.map((line) => ({
		key: line.key,
		label: line.label,
		colorCls: line.colorCls,
		points: seriesPoints(env.ms, line.name, env.state.period).map(toShown),
	}));
	const points = series[0]?.points ?? [];
	const ends = [points[0]?.date, points[points.length - 1]?.date].filter(
		(d): d is string => d !== undefined,
	);
	const d = (value: number) => value.toFixed(decimals(env, first.name));
	const shownGoal =
		goal === undefined
			? undefined
			: toDisplayBody(goal.value, unit, env.weightUnit);
	renderSeriesChart(parent, {
		series,
		label: t('body.chartLabel', {
			name: lines.map((l) => l.name).join('・'),
		}),
		formatValue: (value) => {
			const shown = shownUnit(env, first.name);
			return shown ? `${d(value)} ${shown}` : d(value);
		},
		formatAxis: (value) => String(Math.round(value * 100) / 100),
		unit: shownUnit(env, first.name),
		endLabels: lines.length > 1,
		keyLegend: lines.length > 1,
		labelDates: lines.length === 1 ? [...new Set(ends)] : [],
		formatDate: formatDay,
		// 同じ点をもう一度押すと、その測定を見る
		onSelect: (_series, point) => {
			env.state.date = point.date;
			env.ctx.refresh();
		},
		guides:
			goal && shownGoal !== undefined
				? [
						{
							value: shownGoal,
							label: t('body.goalLine', { value: d(shownGoal) }),
							cls: goal.cls,
						},
					]
				: [],
	});
}

/** 今見ている測定のノートを開くリンク */
export function renderOpenNote(env: BodyEnv, parent: HTMLElement): void {
	const link = parent.createEl('button', {
		cls: 'fitness-log-link-button',
		text: t('body.openNote', { date: formatDay(env.current.date) }),
		attr: { type: 'button' },
	});
	link.addEventListener('click', () =>
		openNoteInNewTab(env.ctx.app, env.current.path),
	);
}
