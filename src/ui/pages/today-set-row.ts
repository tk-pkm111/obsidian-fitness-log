import { Menu, Notice } from 'obsidian';
import { t } from '../../i18n';
import { formatSetResult } from '../../lib/format';
import { setDurationSec } from '../../lib/history/stats';
import type { SetAddress } from '../../lib/log/day-ops';
import { withRest } from '../../lib/log/set-rest';
import type { SetLog, WeightUnit } from '../../lib/model/types';
import type { CardModel, SectionModel } from '../../lib/today/day-model';
import {
	formatDuration,
	formatHm,
	parseClockInput,
	parseDurationInput,
	secondsToTime,
} from '../../lib/time/date';
import {
	fromDisplayWeight,
	parseNumberInput,
	toDisplayWeight,
} from '../../lib/units';
import { iconButton } from '../helpers';
import { inlineInput } from '../inline-input';
import { ConfirmModal } from '../modals/confirm-modal';
import { TextPromptModal } from '../modals/text-prompt-modal';
import type { PageContext } from '../page-context';

/** 直したセットを日ノートに書く（描き直しで新しい値が出る）。true を返す */
type SaveSet = (updated: SetLog) => boolean;

/**
 * 終えたセットの 1 行: 「セット 1 ｜ 15 kg × 5 回 ｜ 22:40–22:40 (0:22) 休憩 2:33 ｜ 💬」。
 * 重量・回数・開始・終了・休憩の数字は押せばその場で直せる。右のアイコンでコメント（感じたこと）を書く。
 * 「セット 1」を押す（右クリック）とメニュー（コメント・削除）。
 */
export function renderSetRow(
	ctx: PageContext,
	parent: HTMLElement,
	section: SectionModel,
	card: CardModel,
	index: number,
	editable: boolean,
): void {
	const set = card.sets[index];
	if (!set) return;
	const unit = ctx.services.store.settings.weightUnit;
	const n = card.setOffset + index + 1;
	const row = parent.createDiv({ cls: 'fitness-log-set-row' });
	const address = editable ? setAddress(section, card, index) : null;

	if (!address) {
		row.createSpan({
			cls: 'fitness-log-set-label',
			text: t('today.set', { n }),
		});
		row.createSpan({
			cls: 'fitness-log-set-result',
			text: formatSetResult(set, unit, card.recordType),
		});
		const time = row.createSpan({ cls: 'fitness-log-set-time' });
		if (set.start && set.end)
			time.setText(
				`${formatHm(set.start)}–${formatHm(set.end)} (${formatDuration(setDurationSec(set))})`,
			);
		if (set.note)
			row.createDiv({ cls: 'fitness-log-set-note', text: set.note });
		return;
	}

	const save: SaveSet = (updated) => {
		ctx.run(() =>
			ctx.services.controller.editSet(ctx.date, address, updated),
		);
		return true;
	};
	const key = `set:${address.sessionIndex}:${address.exerciseIndex}:${index}`;
	const comment = () => editComment(ctx, card, set, n, save);

	const label = row.createEl('button', {
		cls: 'fitness-log-set-label',
		text: t('today.set', { n }),
		attr: { type: 'button', 'aria-label': t('today.setMenu', { n }) },
	});
	const openMenu = (event: MouseEvent) => {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t('today.comment'))
				.setIcon('message-circle')
				.onClick(comment),
		);
		menu.addItem((item) =>
			item
				.setTitle(t('today.deleteSet'))
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => confirmDelete(ctx, card, n, address)),
		);
		// キーボードで押したときはマウスの位置が無いので、ボタンの下に出す
		if (event.clientX === 0 && event.clientY === 0) {
			const rect = label.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		} else menu.showAtMouseEvent(event);
	};
	label.addEventListener('click', openMenu);
	row.addEventListener('contextmenu', openMenu);

	renderResult(
		row.createSpan({ cls: 'fitness-log-set-result' }),
		set,
		card,
		unit,
		key,
		save,
	);

	const time = row.createSpan({ cls: 'fitness-log-set-time' });
	timeField(time, set, 'start', key, save);
	time.appendText('–');
	timeField(time, set, 'end', key, save);
	if (set.start && set.end)
		time.appendText(` (${formatDuration(setDurationSec(set))})`);
	const rest = card.rests[index];
	if (rest) {
		const restEl = time.createSpan({ cls: 'fitness-log-set-rest' });
		restEl.appendText(`${t('today.restLabel')} `);
		inlineInput(restEl, {
			value: formatDuration(rest.sec),
			label: t('today.restBefore'),
			focusKey: `${key}:rest`,
			inputMode: 'decimal',
			onCommit: (text) => {
				const sec = parseDurationInput(text);
				const updated =
					sec === null ? null : withRest(set, rest.prevEnd, sec);
				if (!updated) {
					new Notice(t('today.invalidRest'));
					return false;
				}
				return save(updated);
			},
		});
	}

	const button = iconButton(
		row,
		'message-circle',
		set.note ? t('today.editComment') : t('today.addComment'),
		comment,
		'fitness-log-comment-button',
	);
	button.toggleClass('has-comment', set.note.length > 0);
	if (set.note) {
		const note = row.createDiv({
			cls: 'fitness-log-set-note',
			text: set.note,
		});
		note.addEventListener('click', comment);
	}
}

function setAddress(
	section: SectionModel,
	card: CardModel,
	index: number,
): SetAddress | null {
	const set = card.sets[index];
	if (!set || card.noteName === null || card.source === null) return null;
	// 位置＋名前＋表示していた値で指す（ノートが変わっていたら別のセットを書き換えない）
	return {
		...card.source,
		setIndex: index,
		sessionName: section.isOther ? null : section.sessionName,
		exerciseName: card.noteName,
		expected: set,
	};
}

/** 「15 kg × 5 回」の数字を入力欄にする。時間だけの種目は長さ（開始・終了で直す） */
function renderResult(
	el: HTMLElement,
	set: SetLog,
	card: CardModel,
	unit: WeightUnit,
	key: string,
	save: SaveSet,
): void {
	if (card.recordType === 'duration') {
		el.setText(formatSetResult(set, unit, card.recordType));
		return;
	}
	const weightField = () =>
		inlineInput(el, {
			value:
				set.weight === null
					? ''
					: String(toDisplayWeight(set.weight, unit)),
			placeholder: '-',
			label: t('setEdit.weight', { unit }),
			focusKey: `${key}:weight`,
			inputMode: 'decimal',
			onCommit: (text) => {
				const value = parseNumberInput(text);
				if (value === undefined || (value !== null && value < 0)) {
					new Notice(t('prompt.invalidNumber'));
					return false;
				}
				return save({
					...set,
					weight:
						value === null ? null : fromDisplayWeight(value, unit),
				});
			},
		});
	if (card.recordType === 'weight-reps') {
		weightField();
		el.appendText(` ${unit} × `);
	} else if (set.weight !== null) {
		// 自重＋加重
		el.appendText('+');
		weightField();
		el.appendText(` ${unit} × `);
	}
	inlineInput(el, {
		value: set.reps === null ? '' : String(set.reps),
		placeholder: '-',
		label: t('setEdit.reps'),
		focusKey: `${key}:reps`,
		inputMode: 'numeric',
		onCommit: (text) => {
			const value = parseNumberInput(text);
			if (
				value === undefined ||
				(value !== null && (value < 0 || !Number.isInteger(value)))
			) {
				new Notice(t('prompt.invalidNumber'));
				return false;
			}
			return save({ ...set, reps: value });
		},
	});
	el.appendText(` ${t('format.reps', { n: '' }).trim()}`);
}

/** 開始・終了の時刻。普段は '22:40'、直すときは秒まで '22:40:01' */
function timeField(
	parent: HTMLElement,
	set: SetLog,
	field: 'start' | 'end',
	key: string,
	save: SaveSet,
): void {
	const value = set[field];
	inlineInput(parent, {
		value: value ? formatHm(value) : '',
		editValue: value ?? '',
		placeholder: '--:--',
		label: field === 'start' ? t('setEdit.start') : t('setEdit.end'),
		focusKey: `${key}:${field}`,
		inputMode: 'decimal',
		onCommit: (text) => {
			if (text === '') return save({ ...set, [field]: null });
			const seconds = parseClockInput(text);
			if (seconds === null) {
				new Notice(t('setEdit.invalidTime'));
				return false;
			}
			return save({ ...set, [field]: secondsToTime(seconds) });
		},
	});
}

function editComment(
	ctx: PageContext,
	card: CardModel,
	set: SetLog,
	n: number,
	save: SaveSet,
): void {
	new TextPromptModal(ctx.app, {
		title: t('comment.title', { exercise: card.name, n }),
		initial: set.note,
		placeholder: t('comment.placeholder'),
		submitText: t('comment.save'),
		onSubmit: (text) => {
			const note = text.trim();
			if (note !== set.note) save({ ...set, note });
		},
	}).open();
}

function confirmDelete(
	ctx: PageContext,
	card: CardModel,
	n: number,
	address: SetAddress,
): void {
	new ConfirmModal(ctx.app, {
		title: `${card.name} ・ ${t('today.set', { n })}`,
		message: t('setEdit.deleteConfirm'),
		confirmText: t('setEdit.delete'),
		danger: true,
		onConfirm: () =>
			ctx.run(() => ctx.services.controller.deleteSet(ctx.date, address)),
	}).open();
}
