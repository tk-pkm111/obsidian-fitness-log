import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import {
	availableMetrics,
	newBestFlags,
	type Metric,
} from '../../lib/history/metrics';
import {
	defaultGroup,
	entriesFor,
	packageLog,
	trendOf,
	type LogExercise,
	type LogGroup,
	type LogSession,
	type PackageLogRow,
} from '../../lib/history/package-log';
import type { SessionStat } from '../../lib/history/stats';
import { addDays } from '../../lib/time/date';
import { toDisplayWeight } from '../../lib/units';
import {
	renderBarChart,
	renderSeriesChart,
	renderSparkline,
	type ChartSeries,
} from '../chart';
import {
	chartPoints,
	colorDot,
	displayValue,
	formatDay,
	formatDelta,
	formatDisplay,
	formatMetric,
	formatMetricDiff,
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

/** 棒グラフに出す回数（スマホの幅で棒が細くなりすぎない数） */
const MAX_BARS = 24;
const RECENT_DAYS = 28;

/**
 * ログ ＞ パッケージ: パッケージを選ぶと、その中の種目が今の並び順で出て、
 * 前回比・推移・自己ベストがひと目でわかる。種目を押すと、そのパッケージの中での推移。
 * 良し悪しの判断やアドバイスは出さない（事実だけを並べ、分析は本人がする）。
 */
export function renderPackageLog(env: LogEnv, el: HTMLElement): void {
	const { data, state } = env;
	if (data.sessions.length === 0) {
		el.createDiv({ cls: 'fitness-log-empty', text: t('log.noHistory') });
		return;
	}
	const key =
		state.group && data.groups.some((g) => g.key === state.group)
			? state.group
			: defaultGroup(data);
	const group = data.groups.find((g) => g.key === key);
	if (!group) return;
	if (state.detail !== null && data.exercises.has(state.detail)) {
		renderDetail(env, el, group, state.detail);
		return;
	}
	state.detail = null;
	renderGroupChips(env, el, group.key);
	const log = packageLog(
		data,
		group.key,
		env.ctx.services.store.current.exercises,
	);
	if (!log) return;
	const colorCls = groupColorCls(env, group.key);
	if (log.sessions.length === 0) {
		el.createDiv({
			cls: 'fitness-log-empty',
			text: t('log.noGroupRecords', { name: groupName(group) }),
		});
	} else renderSummary(env, el, group, log.sessions, colorCls);

	const rows = [...log.current];
	if (rows.length > 0) {
		const title = el.createDiv({ cls: 'fitness-log-section-title' });
		title.createSpan({
			text: group.package
				? t('log.exercisesInOrder')
				: t('log.exercisesRecent'),
		});
		title.createSpan({ text: t('log.trendHeading') });
		const list = el.createDiv({ cls: 'fitness-log-ex-rows' });
		for (const row of rows) renderRow(env, list, row, colorCls, false);
	}
	if (log.others.length > 0) {
		const fold = el.createEl('details', { cls: 'fitness-log-fold' });
		fold.open = state.othersOpen;
		fold.addEventListener('toggle', () => {
			state.othersOpen = fold.open;
		});
		const summary = fold.createEl('summary');
		summary.createSpan({ text: t('log.others', { n: log.others.length }) });
		const chevron = summary.createSpan({ cls: 'fitness-log-fold-chevron' });
		setIcon(chevron, 'chevron-right');
		const list = fold.createDiv({ cls: 'fitness-log-ex-rows' });
		for (const row of log.others) renderRow(env, list, row, colorCls, true);
		fold.createDiv({
			cls: 'fitness-log-fold-note',
			text: t('log.othersNote'),
		});
	}
}

function renderGroupChips(env: LogEnv, el: HTMLElement, active: string): void {
	const chips = el.createDiv({ cls: 'fitness-log-group-chips' });
	const recorded = new Set(env.data.sessions.map((s) => s.group));
	for (const group of env.data.groups) {
		const chip = chips.createEl('button', {
			cls: ['fitness-log-group-chip', groupColorCls(env, group.key)],
			attr: {
				type: 'button',
				'aria-pressed': String(group.key === active),
			},
		});
		chip.toggleClass('is-empty', !recorded.has(group.key));
		chip.createSpan({ cls: 'fitness-log-dot' });
		chip.createSpan({ text: groupName(group) });
		chip.addEventListener('click', () => {
			env.state.group = group.key;
			env.state.detail = null;
			env.ctx.refresh();
		});
	}
}

function renderSummary(
	env: LogEnv,
	el: HTMLElement,
	group: LogGroup,
	sessions: readonly LogSession[],
	colorCls: string,
): void {
	const { ctx, unit } = env;
	const card = el.createDiv({ cls: ['fitness-log-summary', colorCls] });
	const head = card.createDiv({ cls: 'fitness-log-summary-head' });
	head.createSpan({ cls: 'fitness-log-dot' });
	head.createSpan({
		cls: 'fitness-log-summary-name',
		text: groupName(group),
	});

	const last = sessions[sessions.length - 1];
	const since = addDays(ctx.today, -(RECENT_DAYS - 1));
	const meta = card.createDiv({ cls: 'fitness-log-summary-meta' });
	meta.createSpan({ text: t('log.meta.count', { n: sessions.length }) });
	meta.createSpan({
		text: t('log.meta.recent', {
			n: sessions.filter((s) => s.date >= since && s.date <= ctx.today)
				.length,
		}),
	});
	if (last)
		meta.createSpan({
			text: t('log.meta.last', { date: formatDay(last.date) }),
		});

	const shown = sessions.slice(-MAX_BARS);
	const byVolume = shown.some((s) => s.volume > 0);
	renderBarChart(card, {
		colorCls,
		label: t('log.barsLabel', { name: groupName(group) }),
		bars: shown.map((s) => ({
			key: `${s.date}:${s.session}`,
			value: byVolume ? s.volume : s.sets,
			title: byVolume
				? `${formatNumber(Math.round(toDisplayWeight(s.volume, unit)))} ${unit}`
				: t('today.setCount', { n: s.sets }),
			detail: [
				formatDay(s.date),
				t('log.barDetail', { exercises: s.exercises, sets: s.sets }),
				t('log.openDayHint'),
			],
		})),
		onSelect: (bar) => openDay(ctx, bar.key.split(':')[0] ?? ctx.today),
	});
	const caption = card.createDiv({ cls: 'fitness-log-caption' });
	caption.setText(byVolume ? t('log.volumeCaption') : t('log.setsCaption'));
	if (sessions.length > shown.length)
		caption.appendText(
			` ・ ${t('log.latestCaption', { n: shown.length })}`,
		);
}

function renderRow(
	env: LogEnv,
	list: HTMLElement,
	row: PackageLogRow,
	colorCls: string,
	isOther: boolean,
): void {
	const { trend, exercise } = row;
	const button = list.createEl('button', {
		cls: 'fitness-log-ex-row',
		attr: { type: 'button' },
	});
	button.toggleClass('is-other', isOther);
	button.createSpan({ cls: 'fitness-log-ex-name', text: exercise.name });
	const lastLine = button.createSpan({ cls: 'fitness-log-ex-last' });
	const spark = button.createSpan({ cls: 'fitness-log-ex-spark' });
	const badges = button.createSpan({ cls: 'fitness-log-ex-badges' });
	if (!trend) {
		lastLine.setText(t('log.notYet'));
		button.disabled = true;
		return;
	}
	lastLine.createSpan({ text: setsText(trend.last, exercise, env.unit) });
	if (trend.delta) {
		const delta = formatDelta(trend.delta, env.unit);
		lastLine.createSpan({
			cls: ['fitness-log-delta', `is-${delta.kind}`],
			text: delta.text,
		});
	}
	renderSparkline(spark, trend.values, colorCls);
	if (trend.isBest) bestBadge(badges);
	if (isOther)
		badges.createSpan({
			cls: 'fitness-log-pill',
			text: t('log.until', {
				date: formatDay(trend.last.date),
				n: trend.entries.length,
			}),
		});
	else if (row.since)
		badges.createSpan({
			cls: 'fitness-log-pill',
			text: t('log.since', { date: formatDay(row.since) }),
		});
	button.addEventListener('click', () => {
		env.state.detail = exercise.key;
		env.state.compare = false;
		env.ctx.navigate({});
	});
}

function bestBadge(parent: HTMLElement): void {
	const badge = parent.createSpan({ cls: 'fitness-log-best' });
	setIcon(badge.createSpan({ cls: 'fitness-log-best-icon' }), 'star');
	badge.createSpan({ text: t('log.best') });
}

// ---------------------------------------------------------------------------
// 種目（そのパッケージの中での推移）

function renderDetail(
	env: LogEnv,
	el: HTMLElement,
	group: LogGroup,
	exerciseKey: string,
): void {
	const { ctx, state, data, unit } = env;
	const exercise = data.exercises.get(exerciseKey);
	if (!exercise) return;
	const colorCls = groupColorCls(env, group.key);
	const name = groupName(group);

	const back = el.createEl('button', {
		cls: 'fitness-log-back-link',
		attr: { type: 'button' },
	});
	setIcon(back.createSpan(), 'chevron-left');
	back.createSpan({ text: name });
	back.addEventListener('click', () => {
		state.detail = null;
		ctx.navigate({});
	});

	const head = el.createDiv({ cls: 'fitness-log-detail-head' });
	head.createDiv({ cls: 'fitness-log-detail-name', text: exercise.name });
	const context = head.createSpan({ cls: ['fitness-log-context', colorCls] });
	context.createSpan({ cls: 'fitness-log-dot' });
	context.createSpan({ text: t('log.inGroup', { name }) });

	const entries = entriesFor(data, group.key, exerciseKey);
	const trend = trendOf(entries, exercise.recordType, state.metric);
	if (!trend) {
		el.createDiv({
			cls: 'fitness-log-empty',
			text: t('log.noGroupRecords', { name }),
		});
		return;
	}
	renderStats(
		env,
		el,
		exercise,
		entries.map((e) => e.stat),
		trend.entries[0]?.date ?? '',
	);

	const metrics = availableMetrics(
		exercise.recordType,
		entries.map((e) => e.stat),
	);
	renderMetricChips(el, metrics, trend.metric, (metric) => {
		state.metric = metric;
		ctx.refresh();
	});

	// 比べる線: 同じ種目をやったほかのまとまり（同じ指標で）
	const others = data.groups.filter(
		(g) =>
			g.key !== group.key &&
			data.entries.some(
				(e) => e.exercise === exerciseKey && e.group === g.key,
			),
	);
	const series: ChartSeries[] = [
		{
			key: group.key,
			label: name,
			colorCls,
			points: chartPoints(
				trend.entries.map((e) => e.date),
				trend.values,
				trend.metric,
				unit,
			),
		},
	];
	if (state.compare)
		for (const other of others) {
			const otherTrend = trendOf(
				entriesFor(data, other.key, exerciseKey),
				exercise.recordType,
				trend.metric,
			);
			if (!otherTrend) continue;
			series.push({
				key: other.key,
				label: groupName(other),
				colorCls: groupColorCls(env, other.key),
				dashed: true,
				points: chartPoints(
					otherTrend.entries.map((e) => e.date),
					otherTrend.values,
					trend.metric,
					unit,
				),
			});
		}
	const lastValue = trend.values[trend.values.length - 1];
	renderSeriesChart(el, {
		series,
		label: t('log.chartLabel', {
			name: exercise.name,
			metric: metricLabel(trend.metric),
		}),
		unit: metricUnit(trend.metric, unit),
		formatValue: (v) => formatDisplay(v, trend.metric, unit),
		formatAxis: (v) =>
			trend.metric === 'duration'
				? formatDisplay(v, trend.metric, unit)
				: formatNumber(v),
		formatDate: formatDay,
		describe: (s, point) => {
			const entry = entriesFor(data, s.key, exerciseKey)
				.filter((e) => e.date === point.date)
				.pop();
			return entry ? setsText(entry, exercise, unit) : '';
		},
		endLabels: series.length > 1,
		keyLegend: true,
		labelDates: [
			...new Set(
				[
					trend.best?.date,
					lastValue != null ? trend.last.date : undefined,
				].filter((d): d is string => d !== undefined),
			),
		],
		onSelect: (_, point) => openDay(ctx, point.date),
	});

	if (others.length > 0) {
		const toggle = el.createEl('label', { cls: 'fitness-log-toggle' });
		const box = toggle.createEl('input', { type: 'checkbox' });
		box.checked = state.compare;
		toggle.createSpan({
			text: t('log.compare', { names: others.map(groupName).join('・') }),
		});
		box.addEventListener('change', () => {
			state.compare = box.checked;
			ctx.refresh();
		});
	}
	const all = el.createEl('button', {
		cls: 'fitness-log-link-button',
		attr: { type: 'button' },
	});
	all.createSpan({ text: t('log.viewAllPackages') });
	setIcon(all.createSpan(), 'chevron-right');
	all.addEventListener('click', () => {
		state.mode = 'exercise';
		state.hidden = new Set();
		ctx.navigate({ exerciseId: exerciseKey });
	});

	renderSessionTable(env, el, group, exercise, trend.metric);
}

function renderStats(
	env: LogEnv,
	el: HTMLElement,
	exercise: LogExercise,
	stats: readonly SessionStat[],
	firstDate: string,
): void {
	const { unit } = env;
	const last = stats[stats.length - 1];
	const first = stats[0];
	if (!last || !first) return;
	const tiles: Array<{ label: string; value: string; sub: string }> = [];
	const weighted =
		exercise.recordType === 'weight-reps' &&
		stats.some((s) => s.estimatedOneRepMax !== null);
	if (weighted) {
		const best = Math.max(...stats.map((s) => s.estimatedOneRepMax ?? 0));
		tiles.push({
			label: metricLabel('estimatedOneRepMax'),
			value:
				last.estimatedOneRepMax === null
					? '-'
					: formatMetric(
							last.estimatedOneRepMax,
							'estimatedOneRepMax',
							unit,
						),
			sub: t('log.stat.best', {
				value: formatMetric(best, 'estimatedOneRepMax', unit),
			}),
		});
		const top = last.maxWeight;
		const repsAtTop =
			top === null
				? 0
				: Math.max(
						0,
						...last.sets
							.filter((s) => s.weight === top)
							.map((s) => s.reps ?? 0),
					);
		tiles.push({
			label: t('log.stat.topSet'),
			value: top === null ? '-' : formatMetric(top, 'maxWeight', unit),
			sub: repsAtTop > 0 ? t('log.stat.topReps', { n: repsAtTop }) : '',
		});
		const from = first.estimatedOneRepMax;
		const to = last.estimatedOneRepMax;
		tiles.push({
			label: t('log.stat.change'),
			value:
				stats.length < 2 || from === null || to === null || from === 0
					? '-'
					: `${to >= from ? '+' : '−'}${formatNumber(Math.abs(((to - from) / from) * 100))}%`,
			sub:
				stats.length < 2
					? t('log.stat.firstTime')
					: t('log.stat.from', { date: formatDay(firstDate) }),
		});
	} else if (exercise.recordType === 'duration') {
		const best = Math.max(...stats.map((s) => s.durationSec));
		tiles.push(
			{
				label: t('log.stat.lastTime'),
				value: formatMetric(last.durationSec, 'duration', unit),
				sub: t('log.stat.best', {
					value: formatMetric(best, 'duration', unit),
				}),
			},
			{
				label: t('log.stat.count'),
				value: t('log.meta.count', { n: stats.length }),
				sub: t('log.stat.from', { date: formatDay(firstDate) }),
			},
		);
	} else {
		const best = Math.max(...stats.map((s) => s.totalReps));
		const maxReps = Math.max(...stats.map((s) => s.maxReps ?? 0));
		tiles.push(
			{
				label: metricLabel('totalReps'),
				value: formatMetric(last.totalReps, 'totalReps', unit),
				sub: t('log.stat.best', {
					value: formatMetric(best, 'totalReps', unit),
				}),
			},
			{
				label: t('log.stat.maxReps'),
				value: formatMetric(maxReps, 'maxReps', unit),
				sub: '',
			},
			{
				label: t('log.stat.count'),
				value: t('log.meta.count', { n: stats.length }),
				sub: t('log.stat.from', { date: formatDay(firstDate) }),
			},
		);
	}
	const grid = el.createDiv({ cls: 'fitness-log-stats' });
	for (const tile of tiles) {
		const box = grid.createDiv({ cls: 'fitness-log-stat' });
		box.createDiv({ cls: 'fitness-log-stat-label', text: tile.label });
		box.createDiv({ cls: 'fitness-log-stat-value', text: tile.value });
		box.createDiv({ cls: 'fitness-log-stat-sub', text: tile.sub });
	}
}

/** そのパッケージでの記録の表（新しい順）。値の右に前回比、その時点の最高を超えた回に ★ */
function renderSessionTable(
	env: LogEnv,
	el: HTMLElement,
	group: LogGroup,
	exercise: LogExercise,
	metric: Metric,
): void {
	const { ctx, data, unit } = env;
	const entries = entriesFor(data, group.key, exercise.key);
	const trend = trendOf(entries, exercise.recordType, metric);
	if (!trend) return;
	const flags = newBestFlags(trend.values);
	const colorCls = groupColorCls(env, group.key);
	const title = el.createDiv({ cls: 'fitness-log-section-title' });
	title.createSpan({
		text: t('log.groupRecords', {
			name: groupName(group),
			n: entries.length,
		}),
	});
	title.createSpan({ text: metricLabel(metric) });
	const table = el.createDiv({ cls: 'fitness-log-records' });
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!entry) continue;
		const value = trend.values[i];
		const prev = i > 0 ? trend.values[i - 1] : null;
		const row = table.createEl('button', {
			cls: 'fitness-log-record',
			attr: { type: 'button' },
		});
		const date = row.createSpan({ cls: 'fitness-log-record-date' });
		colorDot(date, colorCls);
		date.createSpan({ text: formatDay(entry.date) });
		row.createSpan({
			cls: 'fitness-log-record-sets',
			text: setsText(entry, exercise, unit),
		});
		const cell = row.createSpan({ cls: 'fitness-log-record-value' });
		const main = cell.createSpan({
			text: value == null ? '-' : formatMetric(value, metric, unit),
		});
		if (flags[i]) {
			const star = main.createSpan({
				cls: 'fitness-log-record-best',
				attr: { 'aria-label': t('log.best') },
			});
			setIcon(star, 'star');
		}
		if (value != null && prev != null) {
			const diff = formatMetricDiff(
				displayValue(value, metric, unit) -
					displayValue(prev, metric, unit),
				metric,
			);
			cell.createSpan({
				cls: ['fitness-log-delta', `is-${diff.kind}`],
				text: diff.text,
			});
		}
		row.addEventListener('click', () => openDay(ctx, entry.date));
	}
}
