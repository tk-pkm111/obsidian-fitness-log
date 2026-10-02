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
import {
	nearestIndex,
	repsChoices,
	splitClock,
	splitDuration,
	stepRange,
	weightChoices,
} from '../../lib/picker';
import { iconButton } from '../helpers';
import { inlineInput } from '../inline-input';
import { ConfirmModal } from '../modals/confirm-modal';
import { TextPromptModal } from '../modals/text-prompt-modal';
import { WheelPickerModal } from '../modals/wheel-picker-modal';
import type { PageContext } from '../page-context';
import { wheelMaxWeight } from './today-actions';

/** 直したセットを日ノートに書く（描き直しで新しい値が出る）。true を返す */
type SaveSet = (updated: SetLog) => boolean;

/**
 * 終えたセットの 1 行: 「① ｜ 15 kg × 5 回 ｜ 22:40–22:40 (0:22) 休憩 2:33 ｜ 💬」。
 * 左の列（種目の ▶ と同じ列）にセット番号の丸。数字は押せばその場で直せる。右のアイコンでコメント（感じたこと）を書く。
 * 番号の丸を押す（右クリック）とメニュー（コメント・削除）。
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
		row.createDiv({ cls: 'fitness-log-slot' }).createSpan({
			cls: 'fitness-log-set-dot',
			text: String(n),
			attr: { 'aria-label': t('today.set', { n }) },
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

	const label = row
		.createDiv({ cls: 'fitness-log-slot' })
		.createEl('button', {
			cls: 'fitness-log-set-dot',
			text: String(n),
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

	const title = `${card.name} ・ ${t('today.set', { n })}`;
	const field = { ctx, set, key, save, title };
	renderResult(
		row.createSpan({ cls: 'fitness-log-set-result' }),
		field,
		card,
		unit,
	);

	const time = row.createSpan({ cls: 'fitness-log-set-time' });
	timeField(time, field, 'start');
	time.appendText('–');
	timeField(time, field, 'end');
	if (set.start && set.end)
		time.appendText(` (${formatDuration(setDurationSec(set))})`);
	const rest = card.rests[index];
	if (rest) {
		const restEl = time.createSpan({ cls: 'fitness-log-set-rest' });
		restEl.appendText(`${t('today.restLabel')} `);
		const commitRest = (text: string) => {
			const sec = parseDurationInput(text);
			const updated =
				sec === null ? null : withRest(set, rest.prevEnd, sec);
			if (!updated) {
				new Notice(t('today.invalidRest'));
				return false;
			}
			return save(updated);
		};
		inlineInput(restEl, {
			value: formatDuration(rest.sec),
			label: t('today.restBefore'),
			focusKey: `${key}:rest`,
			inputMode: 'decimal',
			onCommit: commitRest,
			onPick: () => {
				const [m, sec] = splitDuration(rest.sec);
				const minutes = stepRange(0, Math.max(59, m), 1);
				new WheelPickerModal(ctx.app, {
					title: t('today.restBefore'),
					hint: title,
					columns: [
						{
							items: minutes.map(String),
							index: m,
							label: t('wheel.minutes'),
						},
						{
							items: twoDigits(60),
							index: sec,
							label: t('wheel.seconds'),
						},
					],
					separators: [':'],
					submitText: t('wheel.done'),
					onSubmit: ([mi = 0, si = 0]) => {
						const updated = withRest(
							set,
							rest.prevEnd,
							mi * 60 + si,
						);
						if (updated) save(updated);
					},
					keyboard: {
						value: formatDuration(rest.sec),
						inputMode: 'decimal',
						onSubmit: commitRest,
					},
				}).open();
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

/** 1 つのセットの値を直すのに要るもの */
interface SetField {
	ctx: PageContext;
	set: SetLog;
	key: string;
	save: SaveSet;
	/** ホイールの補足（「レッグカール ・ セット 2」） */
	title: string;
}

/** '00'〜'(n-1)' の 2 桁の文字 */
function twoDigits(n: number): string[] {
	return Array.from({ length: n }, (_, i) => String(i).padStart(2, '0'));
}

/**
 * 「15 kg × 5 回」の数字を入力欄にする（スマホはホイール）。時間だけの種目は長さ（開始・終了で直す）
 */
function renderResult(
	el: HTMLElement,
	field: SetField,
	card: CardModel,
	unit: WeightUnit,
): void {
	const { ctx, set, key, save, title } = field;
	if (card.recordType === 'duration') {
		el.setText(formatSetResult(set, unit, card.recordType));
		return;
	}
	const weightText =
		set.weight === null ? '' : String(toDisplayWeight(set.weight, unit));
	const commitWeight = (text: string) => {
		const value = parseNumberInput(text);
		if (value === undefined || (value !== null && value < 0)) {
			new Notice(t('prompt.invalidNumber'));
			return false;
		}
		return save({
			...set,
			weight: value === null ? null : fromDisplayWeight(value, unit),
		});
	};
	const pickWeight = () => {
		const current =
			set.weight === null ? null : toDisplayWeight(set.weight, unit);
		const choices = weightChoices(
			current,
			ctx.services.store.settings.weightStep,
			wheelMaxWeight(unit),
			true,
		);
		new WheelPickerModal(ctx.app, {
			title: t('setEdit.weight', { unit }),
			hint: title,
			columns: [
				{
					items: choices.map((v) =>
						v === null ? t('wheel.none') : String(v),
					),
					index: nearestIndex(choices, current),
					label: t('setEdit.weight', { unit }),
					width: 5,
				},
			],
			unit,
			submitText: t('wheel.done'),
			onSubmit: ([i = 0]) => {
				const value = choices[i] ?? null;
				if (value === current) return;
				save({
					...set,
					weight:
						value === null ? null : fromDisplayWeight(value, unit),
				});
			},
			keyboard: {
				value: weightText,
				inputMode: 'decimal',
				onSubmit: commitWeight,
			},
		}).open();
	};
	const weightField = () =>
		inlineInput(el, {
			value: weightText,
			placeholder: '-',
			label: t('setEdit.weight', { unit }),
			focusKey: `${key}:weight`,
			inputMode: 'decimal',
			onCommit: commitWeight,
			onPick: pickWeight,
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
	const repsUnit = t('format.reps', { n: '' }).trim();
	const commitReps = (text: string) => {
		const value = parseNumberInput(text);
		if (
			value === undefined ||
			(value !== null && (value < 0 || !Number.isInteger(value)))
		) {
			new Notice(t('prompt.invalidNumber'));
			return false;
		}
		return save({ ...set, reps: value });
	};
	inlineInput(el, {
		value: set.reps === null ? '' : String(set.reps),
		placeholder: '-',
		label: t('setEdit.reps'),
		focusKey: `${key}:reps`,
		inputMode: 'numeric',
		onCommit: commitReps,
		onPick: () => {
			const choices = repsChoices(set.reps);
			new WheelPickerModal(ctx.app, {
				title: t('setEdit.reps'),
				hint: title,
				columns: [
					{
						items: choices.map(String),
						index: nearestIndex(choices, set.reps ?? 8),
						label: t('setEdit.reps'),
					},
				],
				unit: repsUnit,
				submitText: t('wheel.done'),
				onSubmit: ([i = 0]) => {
					const value = choices[i] ?? null;
					if (value !== set.reps) save({ ...set, reps: value });
				},
				keyboard: {
					value: set.reps === null ? '' : String(set.reps),
					inputMode: 'numeric',
					onSubmit: commitReps,
				},
			}).open();
		},
	});
	el.appendText(` ${repsUnit}`);
}

/** 開始・終了の時刻。普段は '22:40'、直すときは秒まで '22:40:01'（スマホは時・分・秒のホイール） */
function timeField(
	parent: HTMLElement,
	field: SetField,
	which: 'start' | 'end',
): void {
	const { ctx, set, key, save, title } = field;
	const value = set[which];
	const label = which === 'start' ? t('setEdit.start') : t('setEdit.end');
	const commit = (text: string) => {
		if (text === '') return save({ ...set, [which]: null });
		const seconds = parseClockInput(text);
		if (seconds === null) {
			new Notice(t('setEdit.invalidTime'));
			return false;
		}
		return save({ ...set, [which]: secondsToTime(seconds) });
	};
	inlineInput(parent, {
		value: value ? formatHm(value) : '',
		editValue: value ?? '',
		placeholder: '--:--',
		label,
		focusKey: `${key}:${which}`,
		inputMode: 'decimal',
		onCommit: commit,
		onPick: () => {
			const now = new Date();
			const seconds =
				(value ? parseClockInput(value) : null) ??
				now.getHours() * 3600 +
					now.getMinutes() * 60 +
					now.getSeconds();
			const [h, m, sec] = splitClock(seconds);
			new WheelPickerModal(ctx.app, {
				title: label,
				hint: title,
				columns: [
					{
						items: twoDigits(24),
						index: h,
						label: t('wheel.hours'),
						width: 3,
					},
					{
						items: twoDigits(60),
						index: m,
						label: t('wheel.minutes'),
						width: 3,
					},
					{
						items: twoDigits(60),
						index: sec,
						label: t('wheel.seconds'),
						width: 3,
					},
				],
				separators: [':', ':'],
				submitText: t('wheel.done'),
				onSubmit: ([hi = 0, mi = 0, si = 0]) => {
					const next = secondsToTime(hi * 3600 + mi * 60 + si);
					if (next !== value) save({ ...set, [which]: next });
				},
				keyboard: {
					value: value ?? '',
					inputMode: 'decimal',
					placeholder: '--:--:--',
					onSubmit: commit,
				},
			}).open();
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
