import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import { formatSetResult, formatSetsCompact } from '../../lib/format';
import type { CardModel, SectionModel } from '../../lib/today/day-model';
import type { CardRole } from '../../lib/today/focus';
import type { RestState } from '../../lib/today/rest';
import { elapsedSeconds, formatDuration, parseTime } from '../../lib/time/date';
import {
	fromDisplayWeight,
	parseNumberInput,
	toDisplayWeight,
} from '../../lib/units';
import { iconButton, openNoteInNewTab } from '../helpers';
import { ConfirmModal } from '../modals/confirm-modal';
import type { PageContext } from '../page-context';
import { addSetManually, finishSet, startSet } from './today-actions';
import { renderSetRow } from './today-set-row';

export interface CardEnv {
	isToday: boolean;
	/**
	 * timer: ▶／■ でタイマー記録（筋トレ中・その他）
	 * manual: ＋ で手入力（過去日・終えた筋トレの修正）
	 * readonly: 見るだけ（未来の予定）
	 */
	mode: 'timer' | 'manual' | 'readonly';
	/** 休憩を出す種目（このカードなら、セットの下に休憩の経過と進みを出す） */
	rest?: RestState | null;
	/**
	 * timer のときの見せ方（cardLayout）。current: いまの種目（開いてセットをサブタスクで並べる）、
	 * done: 終わった種目（1 行にたたむ）、upcoming: まだの種目（▶ だけ）。null はすべて開いて見せる
	 */
	role?: CardRole | null;
	/** 「次」の印（いまの種目が目標のセット数に届いたとき、最初のまだの種目） */
	suggested?: boolean;
	/** その種目の今日のセット数（同じ種目を 2 欄に分けていても合計） */
	total?: number;
	/** 終わった種目を押したとき（いまの種目として開く） */
	onFocus?: () => void;
}

/** これより長く空いたら休憩とみなさない（休憩が延々と数え続けないように） */
const STALE_REST_SEC = 60 * 60;

/**
 * 種目の行（TaskChute と同じく、左の列にボタン、右に種目名）。左の列は「状態と操作」の列で、
 * まだの種目は ▶、終わった種目はセット数の丸、いまの種目のセットは番号の丸・実行中の ■・次の ▶ が縦に並ぶ。
 * - いまの種目（current）: セットをサブタスクとして並べる。終えたセット（数字はその場で直せる）→ 休憩 →
 *   実行中のセット（■）か次のセット（▶）→ 目標のセット数までの残り（薄い行）→ 目標を超えたら「＋ セットを追加」
 * - 終わった種目（done）: 1 行（セット数・要約）。押すといまの種目として開く
 * - まだの種目（upcoming）: ▶ で 1 セット目を開始（いまの種目になる）
 * - 手入力・閲覧（role なし）: すべて開いて、左は ＋（セットを手で足す）
 */
export function renderExerciseCard(
	ctx: PageContext,
	parent: HTMLElement,
	section: SectionModel,
	card: CardModel,
	env: CardEnv,
): { box: HTMLElement; header: HTMLElement } {
	const role = env.role ?? null;
	const box = parent.createDiv({
		cls: ['fitness-log-card', `is-${role ?? 'full'}`],
	});
	box.toggleClass('is-active', card.active);
	box.toggleClass('is-suggested', env.suggested === true);
	const header = box.createDiv({ cls: 'fitness-log-card-header' });
	const slot = header.createDiv({ cls: 'fitness-log-slot' });

	if (role === 'done') {
		renderDoneRow(ctx, box, header, slot, card, env);
		return { box, header };
	}

	if (role === 'upcoming') {
		if (card.exercise) {
			const play = iconButton(
				slot,
				'play',
				t('today.start'),
				() => startSet(ctx, section, card),
				'fitness-log-play',
			);
			play.disabled = ctx.services.store.current.activeSet !== null;
			play.toggleClass('is-filled', env.suggested === true);
		}
		renderTitle(ctx, header, card);
		if (env.suggested)
			header.createSpan({
				cls: 'fitness-log-next-chip',
				text: t('today.nextChip'),
			});
	} else if (role === 'current') {
		renderTitle(ctx, header, card);
		const target = card.item?.targetSets;
		const total = env.total ?? card.sets.length;
		header.createSpan({
			cls: 'fitness-log-card-count',
			text:
				target === undefined
					? t('today.setCount', { n: total })
					: t('today.setProgress', { done: total, target }),
		});
		renderSubtasks(ctx, box, section, card, env);
	} else {
		// 手入力・閲覧: すべて開く
		if (card.exercise && env.mode === 'manual')
			iconButton(
				slot,
				'plus',
				t('today.addSet'),
				() => addSetManually(ctx, section, card),
				'fitness-log-play',
			);
		renderTitle(ctx, header, card);
		if (card.sets.length > 0) {
			const rows = box.createDiv({ cls: 'fitness-log-set-rows' });
			card.sets.forEach((_, index) =>
				renderSetRow(
					ctx,
					rows,
					section,
					card,
					index,
					env.mode !== 'readonly',
				),
			);
		}
		if (env.rest?.card === card) renderRestRow(ctx, box, env.rest);
	}

	if (!card.exercise)
		box.createDiv({
			cls: 'fitness-log-muted fitness-log-card-warning',
			text: t('today.unknownExercise'),
		});
	return { box, header };
}

/** 種目名。押すと種目ノート（フォームやコツのメモ）を開く */
function renderTitle(
	ctx: PageContext,
	header: HTMLElement,
	card: CardModel,
): void {
	const title = header.createDiv({ cls: 'fitness-log-card-title' });
	const notePath = card.exercise?.path;
	if (notePath) {
		const link = title.createEl('a', {
			cls: 'fitness-log-card-name',
			text: card.name,
			href: '#',
			attr: { 'aria-label': t('exerciseEdit.openNote') },
		});
		link.addEventListener('click', (event) => {
			event.preventDefault();
			openNoteInNewTab(ctx.app, notePath);
		});
	} else title.createSpan({ text: card.name });
}

/** 終わった種目: 「② シーテッドカーフレイズ  15 kg × 8 / 20 kg × 7 ›」。押すといまの種目として開く */
function renderDoneRow(
	ctx: PageContext,
	box: HTMLElement,
	header: HTMLElement,
	slot: HTMLElement,
	card: CardModel,
	env: CardEnv,
): void {
	slot.createSpan({
		cls: 'fitness-log-done-count',
		text: String(card.sets.length),
	});
	header.createDiv({ cls: 'fitness-log-card-title', text: card.name });
	const meta = header.createSpan({ cls: 'fitness-log-card-summary' });
	if (env.rest?.card === card) renderRestChip(ctx, meta, env.rest);
	else
		meta.setText(
			formatSetsCompact(
				card.sets,
				ctx.services.store.settings.weightUnit,
				card.recordType,
			),
		);
	setIcon(
		header.createSpan({ cls: 'fitness-log-card-chevron' }),
		'chevron-right',
	);
	header.setAttrs({
		role: 'button',
		tabindex: '0',
		'aria-label': t('today.openExercise', { exercise: card.name }),
	});
	const open = () => env.onFocus?.();
	header.addEventListener('click', open);
	header.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			open();
		}
	});
	box.addClass('is-clickable');
}

/** いまの種目のセット（サブタスク） */
function renderSubtasks(
	ctx: PageContext,
	box: HTMLElement,
	section: SectionModel,
	card: CardModel,
	env: CardEnv,
): void {
	const active = ctx.services.store.current.activeSet;
	const list = box.createDiv({ cls: 'fitness-log-subtasks' });
	card.sets.forEach((_, index) =>
		renderSetRow(ctx, list, section, card, index, true),
	);
	if (env.rest?.card === card) renderRestRow(ctx, list, env.rest);
	if (!card.exercise) return;

	const target = card.item?.targetSets;
	const total = env.total ?? card.sets.length;
	const running = card.active && active !== null;
	let plannedFrom: number;
	if (running) {
		renderActiveRow(ctx, list, section, card);
		plannedFrom = active.setIndex + 1;
	} else if (target === undefined || total < target) {
		const n = total + 1;
		const row = list.createDiv({ cls: 'fitness-log-subtask is-next' });
		const play = iconButton(
			row.createDiv({ cls: 'fitness-log-slot' }),
			'play',
			t('today.startSet', { n }),
			() => startSet(ctx, section, card),
			'fitness-log-play is-filled',
		);
		play.disabled = active !== null;
		row.createSpan({
			cls: 'fitness-log-subtask-label',
			text: t('today.set', { n }),
		});
		const last = card.sets[card.sets.length - 1];
		if (last)
			row.createSpan({
				cls: 'fitness-log-subtask-hint',
				text: t('today.lastTime', {
					result: formatSetResult(
						last,
						ctx.services.store.settings.weightUnit,
						card.recordType,
					),
				}),
			});
		plannedFrom = n + 1;
	} else plannedFrom = Infinity;

	// 目標のセット数までの残り（薄い行）
	if (target !== undefined)
		for (let n = plannedFrom; n <= target; n++) {
			const row = list.createDiv({
				cls: 'fitness-log-subtask is-planned',
			});
			row.createDiv({ cls: 'fitness-log-slot' }).createSpan({
				cls: 'fitness-log-set-dot is-ghost',
				text: String(n),
			});
			row.createSpan({
				cls: 'fitness-log-subtask-label',
				text: t('today.set', { n }),
			});
		}

	// 目標のセット数を終えたら、もう 1 セット足せる
	if (!running && target !== undefined && total >= target) {
		const row = list.createDiv({ cls: 'fitness-log-subtask is-add' });
		row.createDiv({ cls: 'fitness-log-slot' });
		const add = row.createEl('button', {
			cls: 'fitness-log-add-set',
			text: t('today.addOneMore', { n: total + 1 }),
			attr: { type: 'button' },
		});
		add.disabled = active !== null;
		add.addEventListener('click', () => startSet(ctx, section, card));
	}
}

/** 実行中のセット: 左の ■ で終える（回数を聞いて記録）。重量はその場で変えられる */
function renderActiveRow(
	ctx: PageContext,
	parent: HTMLElement,
	section: SectionModel,
	card: CardModel,
): void {
	const { controller, store } = ctx.services;
	const active = store.current.activeSet;
	if (!active) return;
	const unit = store.settings.weightUnit;
	const row = parent.createDiv({
		cls: 'fitness-log-subtask fitness-log-active-row',
	});
	const stop = iconButton(
		row.createDiv({ cls: 'fitness-log-slot' }),
		'square',
		t('today.finish'),
		() => finishSet(ctx, section, card),
		'fitness-log-play is-running',
	);
	stop.addClass('mod-cta');
	row.createSpan({
		cls: 'fitness-log-subtask-label',
		text: t('today.set', { n: active.setIndex }),
	});

	if (card.recordType !== 'duration') {
		const weightWrap = row.createSpan({ cls: 'fitness-log-inline-weight' });
		const input = weightWrap.createEl('input', {
			type: 'text',
			cls: 'fitness-log-inline-input',
			value:
				active.weight === undefined
					? ''
					: String(toDisplayWeight(active.weight, unit)),
			attr: {
				inputmode: 'decimal',
				'aria-label': t('today.weightPlaceholder'),
				placeholder:
					card.recordType === 'reps'
						? t('today.addedWeightPlaceholder')
						: t('today.weightPlaceholder'),
			},
		});
		weightWrap.createSpan({ cls: 'fitness-log-muted', text: unit });
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.isComposing) input.blur();
		});
		input.addEventListener('change', () => {
			const value = parseNumberInput(input.value);
			if (value === undefined) return;
			ctx.run(() =>
				controller.updateActiveWeight(
					value === null ? null : fromDisplayWeight(value, unit),
				),
			);
		});
	}

	const timer = row.createSpan({ cls: 'fitness-log-timer' });
	setIcon(timer.createSpan({ cls: 'fitness-log-timer-icon' }), 'timer');
	const timerText = timer.createSpan();
	ctx.addTicker((now) =>
		timerText.setText(
			formatDuration(elapsedSeconds(active.startedAt, now)),
		),
	);

	const buttons = row.createSpan({ cls: 'fitness-log-active-buttons' });
	iconButton(buttons, 'x', t('today.cancelSet'), () =>
		new ConfirmModal(ctx.app, {
			title: card.name,
			message: t('today.cancelSetConfirm'),
			confirmText: t('today.cancelSet'),
			danger: true,
			onConfirm: () => ctx.run(() => controller.cancelSet()),
		}).open(),
	);
}

/**
 * 休憩: 「☕ 休憩 1:12 / 2:30」と、目安に対する進みのバー。目安を過ぎたらオレンジ。
 * 目安が無い（パッケージ外など）ときは経過だけ。1 時間を超えたら出さない。
 */
function renderRestRow(
	ctx: PageContext,
	parent: HTMLElement,
	rest: RestState,
): void {
	const endSec = parseTime(rest.lastEnd);
	if (endSec === null) return;
	const row = parent.createDiv({ cls: 'fitness-log-rest' });
	const line = row.createDiv({ cls: 'fitness-log-rest-line' });
	setIcon(line.createSpan({ cls: 'fitness-log-rest-icon' }), 'coffee');
	line.createSpan({
		cls: 'fitness-log-rest-label',
		text: t('today.restLabel'),
	});
	const timer = line.createSpan({ cls: 'fitness-log-rest-timer' });
	if (rest.restSec !== null)
		line.createSpan({
			cls: 'fitness-log-rest-target',
			text: `/ ${formatDuration(rest.restSec)}`,
		});
	const fill =
		rest.restSec === null
			? null
			: row
					.createDiv({ cls: 'fitness-log-rest-progress' })
					.createDiv({ cls: 'fitness-log-rest-progress-fill' });
	ctx.addTicker((now) => {
		const nowSec =
			now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		// 日付をまたいでも数える（23:58 に終えて 0:01 なら 3 分）
		const sec = (nowSec - endSec + 86_400) % 86_400;
		row.toggleClass('is-hidden', sec >= STALE_REST_SEC);
		timer.setText(formatDuration(sec));
		if (rest.restSec === null) return;
		fill?.setCssProps({
			'--fitness-log-progress': String(Math.min(1, sec / rest.restSec)),
		});
		row.toggleClass('is-over', sec >= rest.restSec);
	});
}

/** 終わった種目の行にたたまれた休憩（いまの種目を別の種目に開いたとき） */
function renderRestChip(
	ctx: PageContext,
	parent: HTMLElement,
	rest: RestState,
): void {
	const endSec = parseTime(rest.lastEnd);
	if (endSec === null) return;
	const chip = parent.createSpan({ cls: 'fitness-log-rest-chip' });
	setIcon(chip.createSpan({ cls: 'fitness-log-rest-icon' }), 'coffee');
	const text = chip.createSpan();
	ctx.addTicker((now) => {
		const nowSec =
			now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		const sec = (nowSec - endSec + 86_400) % 86_400;
		chip.toggleClass('is-hidden', sec >= STALE_REST_SEC);
		chip.toggleClass(
			'is-over',
			rest.restSec !== null && sec >= rest.restSec,
		);
		text.setText(formatDuration(sec));
	});
}
