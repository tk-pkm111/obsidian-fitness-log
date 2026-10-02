import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import type { CardModel, SectionModel } from '../../lib/today/day-model';
import { elapsedSeconds, formatDuration } from '../../lib/time/date';
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
}

/**
 * 種目カード（TaskChute と同じく、左にボタン、右に種目名だけ）。
 * 左のボタン: ▶ でセットを開始、実行中は ■ で終了（回数を聞いて記録）。手入力の日は ＋。
 * 下に、この欄で終えたセット（番号は種目ごとの通し。数字はその場で直せる）と実行中の行。
 * 休憩は画面の下の「いま」の帯に出す（カードには出さない。終えた筋トレで動き続けないように）。
 */
export function renderExerciseCard(
	ctx: PageContext,
	parent: HTMLElement,
	section: SectionModel,
	card: CardModel,
	env: CardEnv,
): { box: HTMLElement; header: HTMLElement } {
	const active = ctx.services.store.current.activeSet;
	const box = parent.createDiv({ cls: 'fitness-log-card' });
	box.toggleClass('is-active', card.active);
	box.toggleClass('is-done', card.sets.length > 0);

	const header = box.createDiv({ cls: 'fitness-log-card-header' });
	if (card.exercise && env.mode !== 'readonly') {
		const manual =
			env.mode === 'manual' || (section.pkg === null && !section.isOther);
		if (card.active && active) {
			const stop = iconButton(
				header,
				'square',
				t('today.finish'),
				() => finishSet(ctx, section, card),
				'fitness-log-play is-running',
			);
			stop.addClass('mod-cta');
		} else {
			const play = iconButton(
				header,
				manual ? 'plus' : 'play',
				manual ? t('today.addSet') : t('today.start'),
				() =>
					manual
						? addSetManually(ctx, section, card)
						: startSet(ctx, section, card),
				'fitness-log-play',
			);
			play.disabled = !manual && active !== null;
		}
	} else {
		header.createSpan({ cls: 'fitness-log-play-placeholder' });
	}

	// 種目名を押すと種目ノート（フォームやコツのメモ）を開く
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

	// 終えたセット
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

	if (card.active && active) renderActiveRow(ctx, box, card);

	if (!card.exercise)
		box.createDiv({
			cls: 'fitness-log-muted fitness-log-card-warning',
			text: t('today.unknownExercise'),
		});
	return { box, header };
}

function renderActiveRow(
	ctx: PageContext,
	parent: HTMLElement,
	card: CardModel,
): void {
	const { controller, store } = ctx.services;
	const active = store.current.activeSet;
	if (!active) return;
	const unit = store.settings.weightUnit;
	const row = parent.createDiv({
		cls: 'fitness-log-set-row fitness-log-active-row',
	});
	row.createSpan({
		cls: 'fitness-log-set-label',
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
