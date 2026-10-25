import { t } from '../../i18n';
import {
	BODY_SIDES,
	partKey,
	partMeasureOrder,
	splitPartKey,
	type BodyPart,
	type BodyPartGroup,
} from '../../lib/body/items';
import {
	changeFrom,
	partMeasuresIn,
	previousIndex,
	sideBalance,
} from '../../lib/body/stats';
import {
	formatBody,
	formatBodyDelta,
	formatBodyDeltaWithUnit,
	formatBodyWithUnit,
	renderBodyChart,
	renderOpenNote,
	renderPeriodChips,
	shownUnit,
	type BodyEnv,
	type BodyLine,
} from './body-shared';

const groupOf = (part: BodyPart): BodyPartGroup =>
	part === '体幹部'
		? '体幹部'
		: part === '左腕' || part === '右腕'
			? '腕'
			: '脚';

const BODY_PART_CLS: Record<BodyPart, string> = {
	体幹部: 'trunk',
	左腕: 'left-arm',
	右腕: 'right-arm',
	左脚: 'left-leg',
	右脚: 'right-leg',
};

/** 部位の箱（値と前回からの差）。その測定に無い部位は押せない */
function renderPartBox(
	env: BodyEnv,
	parent: HTMLElement,
	part: BodyPart,
	measure: string,
): void {
	const { ms, index, current, state } = env;
	const name = partKey(part, measure);
	const value = current.values[name];
	const cls = `fitness-log-body-part fitness-log-body-part-${BODY_PART_CLS[part]}`;
	if (value === undefined) {
		const box = parent.createDiv({ cls: `${cls} is-empty` });
		box.createSpan({ cls: 'fitness-log-body-part-name', text: part });
		box.createSpan({ cls: 'fitness-log-body-part-value', text: '—' });
		box.createSpan({
			cls: 'fitness-log-body-part-sub',
			text: t('body.missing'),
		});
		return;
	}
	const group = groupOf(part);
	const box = parent.createEl('button', {
		cls,
		attr: { type: 'button', 'aria-expanded': String(state.part === group) },
	});
	box.createSpan({ cls: 'fitness-log-body-part-name', text: part });
	const valueEl = box.createSpan({ cls: 'fitness-log-body-part-value' });
	valueEl.createSpan({ text: formatBody(env, name, value) });
	const unit = shownUnit(env, name);
	if (unit) valueEl.createSpan({ cls: 'fitness-log-body-unit', text: unit });
	const prev = previousIndex(ms, index, name);
	box.createSpan({
		cls: 'fitness-log-body-part-sub',
		text:
			prev < 0
				? t('body.first')
				: formatBodyDelta(
						env,
						name,
						changeFrom(ms, index, name, prev) ?? 0,
					),
	});
	box.addEventListener('click', () => toggle(env, group));
}

function toggle(env: BodyEnv, group: BodyPartGroup): void {
	env.state.part = env.state.part === group ? null : group;
	env.ctx.refresh();
}

/** 人の形（押した部位を青く）。左腕を画面の左に置く（体組成計の画面と同じ） */
function renderFigure(env: BodyEnv, parent: HTMLElement): void {
	const wrap = parent.createDiv({ cls: 'fitness-log-body-figure' });
	const svg = wrap.createSvg('svg', {
		attr: { viewBox: '0 0 100 170', 'aria-hidden': 'true' },
	});
	const on = (group: BodyPartGroup) =>
		env.state.part === group ? 'is-on' : 'is-off';
	svg.createSvg('circle', {
		cls: ['fitness-log-body-figure-fill', 'is-off'],
		attr: { cx: 50, cy: 15, r: 11 },
	});
	const shapes: Array<{ group: BodyPartGroup; el: SVGElement }> = [
		{
			group: '体幹部',
			el: svg.createSvg('rect', {
				cls: ['fitness-log-body-figure-fill', on('体幹部')],
				attr: { x: 33, y: 31, width: 34, height: 56, rx: 9 },
			}),
		},
		{
			group: '腕',
			el: svg.createSvg('path', {
				cls: ['fitness-log-body-figure-limb', on('腕')],
				attr: { d: 'M30 40 L15 82 M70 40 L85 82', 'stroke-width': 10 },
			}),
		},
		{
			group: '脚',
			el: svg.createSvg('path', {
				cls: ['fitness-log-body-figure-limb', on('脚')],
				attr: {
					d: 'M42 92 L39 160 M58 92 L61 160',
					'stroke-width': 12,
				},
			}),
		},
	];
	for (const { group, el } of shapes)
		el.addEventListener('click', () => toggle(env, group));
}

/** 左右の差（「右が 0.3 kg 多い」。事実だけ） */
function renderBalance(env: BodyEnv, parent: HTMLElement, measure: string) {
	const rows = sideBalance(env.current, measure);
	if (rows.length === 0) return;
	const box = parent.createDiv({ cls: 'fitness-log-body-balance' });
	box.createDiv({
		cls: 'fitness-log-body-balance-head',
		text: t('body.parts.balance'),
	});
	for (const row of rows) {
		const sides = BODY_SIDES[row.group];
		const leftName = partKey(sides.left, measure);
		const line = box.createDiv({ cls: 'fitness-log-body-balance-row' });
		line.createSpan({ cls: 'fitness-log-muted', text: row.group });
		line.createSpan({
			text: t('body.parts.sideValue', {
				side: t('body.parts.left'),
				value: formatBody(env, leftName, row.left),
			}),
		});
		line.createSpan({
			text: t('body.parts.sideValue', {
				side: t('body.parts.right'),
				value: formatBody(
					env,
					partKey(sides.right, measure),
					row.right,
				),
			}),
		});
		const rounded = Number(formatBody(env, leftName, Math.abs(row.diff)));
		line.createSpan({
			cls: 'fitness-log-body-balance-diff',
			text:
				rounded === 0
					? t('body.parts.same')
					: t('body.parts.more', {
							side: t(
								row.diff > 0
									? 'body.parts.right'
									: 'body.parts.left',
							),
							amount: formatBodyWithUnit(
								env,
								leftName,
								Math.abs(row.diff),
							),
						}),
		});
	}
}

/** 部位を押したときのパネル: 腕・脚は左と右の 2 本の線、体幹部は 1 本 */
function renderPartPanel(
	env: BodyEnv,
	parent: HTMLElement,
	group: BodyPartGroup,
	measure: string,
): void {
	const { ms, index, current } = env;
	const lines: BodyLine[] =
		group === '体幹部'
			? [
					{
						key: 'trunk',
						label: '体幹部',
						name: partKey('体幹部', measure),
						colorCls: 'fitness-log-pkg-color-0',
					},
				]
			: [
					{
						key: 'left',
						label: t('body.parts.left'),
						name: partKey(BODY_SIDES[group].left, measure),
						colorCls: 'fitness-log-pkg-color-0',
					},
					{
						// 橙は「減らす目標」の色なので、右は緑青
						key: 'right',
						label: t('body.parts.right'),
						name: partKey(BODY_SIDES[group].right, measure),
						colorCls: 'fitness-log-pkg-color-2',
					},
				];
	const panel = parent.createDiv({ cls: 'fitness-log-body-panel is-parts' });
	const head = panel.createDiv({ cls: 'fitness-log-body-panel-title' });
	head.createSpan({ text: t('body.parts.title', { group, measure }) });
	const first = lines[0];
	const unit = first ? shownUnit(env, first.name) : '';
	if (unit)
		head.createSpan({ cls: 'fitness-log-muted', text: `（${unit}）` });
	const stats = panel.createDiv({ cls: 'fitness-log-body-stats' });
	for (const line of lines) {
		const value = current.values[line.name];
		const diff = changeFrom(
			ms,
			index,
			line.name,
			previousIndex(ms, index, line.name),
		);
		const cell = stats.createDiv({ cls: 'fitness-log-body-stat' });
		cell.createDiv({
			cls: 'fitness-log-body-stat-label',
			text:
				group === '体幹部'
					? t('body.fromPrevious')
					: t('body.parts.fromPrevious', { side: line.label }),
		});
		cell.createDiv({
			cls: 'fitness-log-body-stat-value',
			text:
				diff === null
					? '—'
					: formatBodyDeltaWithUnit(env, line.name, diff),
		});
		cell.createDiv({
			cls: 'fitness-log-body-stat-sub',
			text:
				value === undefined
					? ''
					: t('body.parts.current', {
							value: formatBodyWithUnit(env, line.name, value),
						}),
		});
	}
	renderPeriodChips(env, panel);
	renderBodyChart(env, panel, lines);
	const links = panel.createDiv({ cls: 'fitness-log-body-links' });
	renderOpenNote(env, links);
}

/** 部位別: 項目のチップ、人の形の周りに 5 つの部位、左右の差、押した部位の推移 */
export function renderBodyParts(env: BodyEnv, el: HTMLElement): void {
	const { state } = env;
	const measures = partMeasureOrder(partMeasuresIn(env.ms, splitPartKey));
	if (measures.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('body.parts.empty') });
		return;
	}
	const measure =
		state.measure && measures.includes(state.measure)
			? state.measure
			: (measures[0] ?? '');
	if (measures.length > 1) {
		const chips = el.createDiv({
			cls: 'fitness-log-metric-chips',
			attr: { role: 'group', 'aria-label': t('body.parts.measures') },
		});
		for (const m of measures) {
			const chip = chips.createEl('button', {
				cls: 'fitness-log-metric-chip',
				text: m,
				attr: { type: 'button', 'aria-pressed': String(m === measure) },
			});
			chip.addEventListener('click', () => {
				state.measure = m;
				env.ctx.refresh();
			});
		}
	}
	const grid = el.createDiv({
		cls: 'fitness-log-body-parts fitness-log-pkg-color-0',
	});
	renderPartBox(env, grid, '体幹部', measure);
	renderPartBox(env, grid, '左腕', measure);
	renderFigure(env, grid);
	renderPartBox(env, grid, '右腕', measure);
	renderPartBox(env, grid, '左脚', measure);
	renderPartBox(env, grid, '右脚', measure);
	renderBalance(env, el, measure);
	// 開いた部位にこの項目の記録が無ければ（体幹部の筋質点数など）パネルは出さない
	const group = state.part;
	if (!group) return;
	const parts: BodyPart[] =
		group === '体幹部'
			? ['体幹部']
			: [BODY_SIDES[group].left, BODY_SIDES[group].right];
	if (
		parts.some((p) =>
			env.ms.some((m) => m.values[partKey(p, measure)] !== undefined),
		)
	)
		renderPartPanel(env, el, group, measure);
}
