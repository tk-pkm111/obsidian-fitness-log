import { Notice } from 'obsidian';
import { t } from '../../i18n';
import { formatSetsCompact } from '../../lib/format';
import { summarizeSession } from '../../lib/log/summary';
import {
	carryOver,
	lastPerformance,
	type ExerciseOccurrence,
} from '../../lib/history/carry-over';
import type { SetLog, WeightUnit } from '../../lib/model/types';
import type { CardModel, SectionModel } from '../../lib/today/day-model';
import { formatHm, formatMonthDay } from '../../lib/time/date';
import { quickReps, quickWeights } from '../../lib/today/quick-values';
import { fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import {
	OTHER_SESSION,
	type SessionRef,
} from '../../session/session-controller';
import { NumberPromptModal } from '../modals/number-prompt-modal';
import { SetEditModal } from '../modals/set-edit-modal';
import type { PageContext } from '../page-context';

/**
 * 今日ページの種目カードの操作（開始・終了・手入力）。
 * 前回値の引き継ぎ（実装計画 §4.3）で入力の初期値を決め、初回だけ重量を聞く。
 * 「前回 10 kg × 9, 8（9/28）」のヒントはカードには出さず、入力画面にだけ出す。
 */

/** 「50 分」。1 分未満は「1 分未満」 */
export function formatMinutes(minutes: number): string {
	return minutes < 1
		? t('session.lessThanMinute')
		: t('session.minutes', { n: minutes });
}

/** 「■ 筋トレを終了」: 終了時刻を書いて「今日もお疲れ様でした」 */
export function endSessionWithNotice(
	ctx: PageContext,
	section: SectionModel,
): void {
	const { services, date } = ctx;
	const ref = sectionRef(section);
	ctx.run(async () => {
		const day = await services.controller.endSession(date, ref);
		const session = day.sessions.find((s) =>
			services.controller.sessionMatcher(ref).match(s.name),
		);
		const summary = session ? summarizeSession(session) : null;
		if (date !== ctx.today && session?.end)
			// 過去の日は最後のセットの終了を終了時刻にした
			new Notice(
				t('notice.pastSessionEnded', { time: formatHm(session.end) }),
			);
		else
			new Notice(
				summary
					? t('notice.sessionEnded', {
							minutes: formatMinutes(summary.durationMin),
							exercises: summary.exercises,
							sets: summary.sets,
						})
					: t('session.finished'),
				8000,
			);
	});
}

/** ホイールで選べる重量の上限（それより重い記録があればそこまで広げる） */
export function wheelMaxWeight(unit: WeightUnit): number {
	return unit === 'lb' ? 500 : 250;
}

export function sectionRef(section: SectionModel): SessionRef {
	if (section.isOther) return OTHER_SESSION;
	return {
		packageId: section.pkg?.id ?? null,
		sessionName: section.sessionName,
	};
}

interface CardHistory {
	occurrences: ExerciseOccurrence[];
	isSamePackage: (sessionName: string | null) => boolean;
	/** 今日このセクションでその種目を終えたセット（欄が分かれていてもやった順） */
	done: SetLog[];
	/** 「前回 10 kg × 9, 8（9/28）」 */
	hint?: string;
}

function cardHistory(
	ctx: PageContext,
	section: SectionModel,
	card: CardModel,
): CardHistory {
	const { controller, index, store } = ctx.services;
	const exercise = card.exercise;
	const ref = sectionRef(section);
	const isSamePackage = controller.sessionMatcher(ref).match;
	const occurrences = exercise
		? index.occurrences(controller.exerciseMatcher(exercise))
		: [];
	const history: CardHistory = {
		occurrences,
		isSamePackage,
		done: exercise
			? controller.doneSets(ctx.date, ref, exercise.id)
			: card.sets,
	};
	const last = lastPerformance(occurrences, ctx.date, isSamePackage);
	if (last) {
		const sets = formatSetsCompact(
			last.occurrence.sets,
			store.settings.weightUnit,
			card.recordType,
		);
		const date = formatMonthDay(last.occurrence.date);
		history.hint = last.samePackage
			? t('today.previous', { sets, date })
			: t('today.previousOther', {
					package: last.occurrence.sessionName ?? t('today.other'),
					sets,
					date,
				});
	}
	return history;
}

export function startSet(
	ctx: PageContext,
	section: SectionModel,
	card: CardModel,
): void {
	const exercise = card.exercise;
	if (!exercise) return;
	const { controller, store } = ctx.services;
	const unit = store.settings.weightUnit;
	// セットを始めたら、その種目がいまの種目（終わった種目を開いていても戻す）
	ctx.pageState('todayFocus', () => new Map<string, string>()).delete(
		`${ctx.date}:${section.key}`,
	);
	const hist = cardHistory(ctx, section, card);
	const carry = carryOver({
		occurrences: hist.occurrences,
		date: ctx.date,
		isSamePackage: hist.isSamePackage,
		setIndex: hist.done.length + 1,
		currentSets: hist.done,
	});
	const start = (weight: number | null) =>
		ctx.run(() =>
			controller.startSet({
				date: ctx.date,
				packageId: section.pkg?.id ?? null,
				exerciseId: exercise.id,
				weight,
			}),
		);

	// その日の最初のセットだけ「今日は何 kg？」と聞く。2 セット目以降は前のセットを引き継いで即開始（行内で変更できる）
	if (exercise.recordType === 'weight-reps' && hist.done.length === 0) {
		const initial =
			carry.weight === null ? null : toDisplayWeight(carry.weight, unit);
		new NumberPromptModal(ctx.app, {
			title: exercise.name,
			question: t('prompt.weightTitle', { unit }),
			unit,
			initial,
			quick: quickWeights(initial, store.settings.weightStep),
			step: store.settings.weightStep,
			decimal: true,
			hint: hist.hint,
			submitText: t('prompt.start'),
			allowEmpty: true,
			wheelMax: wheelMaxWeight(unit),
			onSubmit: (value) =>
				start(value === null ? null : fromDisplayWeight(value, unit)),
		}).open();
		return;
	}
	start(exercise.recordType === 'duration' ? null : carry.weight);
}

export function finishSet(
	ctx: PageContext,
	section: SectionModel,
	card: CardModel,
): void {
	const { controller, store } = ctx.services;
	const active = store.current.activeSet;
	if (!active) return;
	if (card.recordType === 'duration') {
		ctx.run(() => controller.finishSet(null));
		return;
	}
	const hist = cardHistory(ctx, section, card);
	const carry = carryOver({
		occurrences: hist.occurrences,
		date: ctx.date,
		isSamePackage: hist.isSamePackage,
		setIndex: active.setIndex,
		currentSets: hist.done,
	});
	const unit = store.settings.weightUnit;
	const weight =
		active.weight === undefined
			? null
			: `${toDisplayWeight(active.weight, unit)} ${unit}`;
	new NumberPromptModal(ctx.app, {
		title: `${card.name} ・ ${t('today.set', { n: active.setIndex })}`,
		question: t('prompt.repsTitle'),
		unit: t('format.reps', { n: '' }).trim(),
		initial: carry.reps,
		quick: quickReps(carry.reps, card.item?.targetReps),
		step: 1,
		decimal: false,
		hint: [weight, hist.hint].filter((s) => s).join(' ・ '),
		submitText: t('prompt.record'),
		allowEmpty: false,
		onSubmit: (reps) => ctx.run(() => controller.finishSet(reps)),
	}).open();
}

/** 過去日・終えた筋トレの修正など、タイマーを使わずにセットを足す */
export function addSetManually(
	ctx: PageContext,
	section: SectionModel,
	card: CardModel,
): void {
	const exercise = card.exercise;
	if (!exercise) return;
	const hist = cardHistory(ctx, section, card);
	const carry = carryOver({
		occurrences: hist.occurrences,
		date: ctx.date,
		isSamePackage: hist.isSamePackage,
		setIndex: hist.done.length + 1,
		currentSets: hist.done,
	});
	new SetEditModal(ctx.app, {
		title: t('setEdit.addTitle'),
		subtitle: [
			`${card.name} ・ ${t('today.set', { n: hist.done.length + 1 })}`,
			hist.hint,
		]
			.filter((s) => s)
			.join(' ・ '),
		initial: {
			weight: carry.weight,
			reps: carry.reps,
			start: null,
			end: null,
			note: '',
		},
		unit: ctx.services.store.settings.weightUnit,
		recordType: card.recordType,
		onSave: (set) =>
			ctx.run(() =>
				ctx.services.controller.addSet(
					ctx.date,
					sectionRef(section),
					exercise.id,
					set,
				),
			),
	}).open();
}
