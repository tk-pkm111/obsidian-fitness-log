import { t } from '../../i18n';
import type { BodyItem } from '../../lib/body/items';
import {
	changeFrom,
	discColumns,
	firstIndex,
	goalProgress,
	panelAfter,
	previousIndex,
	type GoalProgress,
} from '../../lib/body/stats';
import { textButton } from '../helpers';
import { BodyGoalModal } from '../modals/body-goal-modal';
import { BodyItemsModal } from '../modals/body-items-modal';
import {
	formatBody,
	formatBodyDelta,
	formatBodyDeltaWithUnit,
	formatBodyWithUnit,
	goalAmount,
	goalColorCls,
	goalGlyph,
	goalOf,
	renderBodyChart,
	renderOpenNote,
	renderPeriodChips,
	shownUnit,
	type BodyEnv,
} from './body-shared';
import { formatMonthDay } from '../../lib/time/date';

/** 丸の縁の円（viewBox 100 の中の半径） */
const RING_RADIUS = 46;

function progressOf(env: BodyEnv, name: string): GoalProgress | null {
	const goal = goalOf(env, name);
	return goal ? goalProgress(env.ms, env.index, goal) : null;
}

/**
 * 丸: 上に項目名、中に値と単位、下に前回からの差。
 * 縁は目標までの進み具合（増やす目標は時計回り・青、減らす目標は反時計回り・橙）。目標の無い項目は灰色の縁だけ
 */
function renderDisc(env: BodyEnv, grid: HTMLElement, item: BodyItem): void {
	const { state, ms, index, current } = env;
	const { name } = item;
	const value = current.values[name];
	const open = state.open === name;
	const prev = previousIndex(ms, index, name);
	const sub =
		value === undefined
			? t('body.missing')
			: prev < 0
				? t('body.first')
				: formatBodyDelta(
						env,
						name,
						changeFrom(ms, index, name, prev) ?? 0,
					);
	const button = grid.createEl('button', {
		cls: 'fitness-log-body-disc',
		attr: { type: 'button', 'aria-expanded': String(open) },
	});
	button.createSpan({ cls: 'fitness-log-body-disc-label', text: name });
	const circle = button.createSpan({ cls: 'fitness-log-body-disc-circle' });
	const svg = circle.createSvg('svg', {
		cls: 'fitness-log-body-disc-ring',
		attr: { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
	});
	svg.createSvg('circle', {
		cls: 'fitness-log-body-disc-track',
		attr: { cx: 50, cy: 50, r: RING_RADIUS },
	});
	// 縁はその測定に値があるときだけ（「—」の丸に進み具合を出さない）
	const progress = value === undefined ? null : progressOf(env, name);
	if (progress && progress.progress > 0.005) {
		const length = 2 * Math.PI * RING_RADIUS;
		svg.createSvg('circle', {
			cls: ['fitness-log-body-disc-arc', goalColorCls(progress)],
			attr: {
				cx: 50,
				cy: 50,
				r: RING_RADIUS,
				'stroke-dasharray': `${(progress.progress * length).toFixed(1)} ${length.toFixed(1)}`,
				// 減らす目標は反時計回り（上下を反転。12 時から始まるのは同じ）
				...(progress.direction < 0
					? { transform: 'translate(0 100) scale(1 -1)' }
					: {}),
			},
		});
	}
	circle.createSpan({
		cls: 'fitness-log-body-disc-value',
		text: value === undefined ? '—' : formatBody(env, name, value),
	});
	circle.createSpan({
		cls: 'fitness-log-body-disc-unit',
		text: value === undefined ? '' : shownUnit(env, name),
	});
	button.createSpan({ cls: 'fitness-log-body-disc-sub', text: sub });
	button.addEventListener('click', () => {
		state.open = open ? null : name;
		env.ctx.refresh();
	});
}

function stat(
	parent: HTMLElement,
	label: string,
	value: string,
	sub: string,
	glyph?: GoalProgress,
): void {
	const cell = parent.createDiv({ cls: 'fitness-log-body-stat' });
	cell.createDiv({ cls: 'fitness-log-body-stat-label', text: label });
	const valueEl = cell.createDiv({ cls: 'fitness-log-body-stat-value' });
	if (glyph) goalGlyph(valueEl, glyph);
	valueEl.createSpan({ text: value });
	cell.createDiv({ cls: 'fitness-log-body-stat-sub', text: sub });
}

/** 丸を押したときに、その段のすぐ下に開くパネル（差・期間・推移・ノート・目標） */
function renderPanel(
	env: BodyEnv,
	grid: HTMLElement,
	name: string,
	column: number,
	columns: number,
): void {
	const { ms, index, current } = env;
	const panel = grid.createDiv({ cls: 'fitness-log-body-panel' });
	panel.setCssProps({
		'--fitness-log-body-caret': `${(((column + 0.5) / columns) * 100).toFixed(2)}%`,
	});
	const head = panel.createDiv({ cls: 'fitness-log-body-panel-title' });
	head.createSpan({ text: name });
	const unit = shownUnit(env, name);
	if (unit)
		head.createSpan({ cls: 'fitness-log-muted', text: `（${unit}）` });

	const progress = progressOf(env, name);
	const stats = panel.createDiv({ cls: 'fitness-log-body-stats' });
	stats.toggleClass('has-goal', progress !== null);
	const prev = previousIndex(ms, index, name);
	const first = firstIndex(ms, name);
	const fromPrev = changeFrom(ms, index, name, prev);
	const fromFirst = changeFrom(ms, index, name, first);
	const prevValue = prev >= 0 ? ms[prev]?.values[name] : undefined;
	const firstMeasurement = first >= 0 ? ms[first] : undefined;
	const firstValue = firstMeasurement?.values[name];
	stat(
		stats,
		t('body.fromPrevious'),
		fromPrev === null ? '—' : formatBodyDeltaWithUnit(env, name, fromPrev),
		prevValue === undefined
			? ''
			: t('body.previousValue', {
					value: formatBodyWithUnit(env, name, prevValue),
				}),
	);
	stat(
		stats,
		t('body.fromFirst'),
		fromFirst === null
			? '—'
			: formatBodyDeltaWithUnit(env, name, fromFirst),
		firstMeasurement && firstValue !== undefined
			? t('body.firstValue', {
					date: formatMonthDay(firstMeasurement.date),
					value: formatBodyWithUnit(env, name, firstValue),
				})
			: '',
	);
	if (progress)
		stat(
			stats,
			t('body.toGoal'),
			progress.reached
				? t('body.reachedShort')
				: goalAmount(env, name, progress),
			t('body.goalValue', {
				value: formatBodyWithUnit(env, name, progress.target),
			}),
			progress.reached ? undefined : progress,
		);

	renderPeriodChips(env, panel);
	renderBodyChart(
		env,
		panel,
		[{ key: name, label: name, name, colorCls: 'fitness-log-pkg-color-0' }],
		progress
			? { value: progress.target, cls: goalColorCls(progress) }
			: undefined,
	);
	const links = panel.createDiv({ cls: 'fitness-log-body-links' });
	if (current.values[name] !== undefined) renderOpenNote(env, links);
	const goalLink = links.createEl('button', {
		cls: 'fitness-log-link-button',
		text: t(progress ? 'body.changeGoal' : 'body.setGoal'),
		attr: { type: 'button' },
	});
	goalLink.addEventListener('click', () =>
		new BodyGoalModal(env.ctx.app, {
			services: env.ctx.services,
			today: env.ctx.today,
			name,
		}).open(),
	);
}

/** 全身: 項目の一覧の順に丸を並べ、押した丸の段の下にパネル */
export function renderBodyWhole(env: BodyEnv, el: HTMLElement): void {
	const { items } = env.settings;
	const openItems = () =>
		new BodyItemsModal(env.ctx.app, { services: env.ctx.services }).open();
	if (items.length === 0) {
		const empty = el.createDiv({ cls: 'fitness-log-empty' });
		empty.createDiv({ text: t('body.noItems') });
		textButton(empty, t('body.editItems'), openItems, { icon: 'list' });
		return;
	}
	// 開いた丸の色・パネルの三角はパッケージの色の 0 番（青）
	const grid = el.createDiv({
		cls: 'fitness-log-body-discs fitness-log-pkg-color-0',
	});
	const columns = discColumns(el.clientWidth || 360);
	grid.setCssProps({ '--fitness-log-body-columns': String(columns) });
	const openIndex = items.findIndex((item) => item.name === env.state.open);
	const after = panelAfter(openIndex, items.length, columns);
	const opened = items[openIndex];
	items.forEach((item, i) => {
		renderDisc(env, grid, item);
		// パネルは開いた丸の段の最後の丸の後（中身は開いた丸の項目）
		if (i === after && opened)
			renderPanel(env, grid, opened.name, openIndex % columns, columns);
	});
	const footer = el.createDiv({ cls: 'fitness-log-body-footer' });
	textButton(footer, t('body.editItems'), openItems, {
		icon: 'list',
		cls: 'mod-quiet',
	});
}
