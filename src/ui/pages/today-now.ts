import { setIcon } from 'obsidian';
import { t } from '../../i18n';
import type { NextStep, NowState } from '../../lib/today/now';
import { elapsedSeconds, formatDuration, parseTime } from '../../lib/time/date';
import { toDisplayWeight } from '../../lib/units';
import { textButton } from '../helpers';
import type { PageContext } from '../page-context';
import { endSessionWithNotice, finishSet, startSet } from './today-actions';

/** これより長く空いたら休憩ではなく「次」を出す（休憩が延々と数え続けないように） */
const STALE_REST_SEC = 60 * 60;

/**
 * 画面の下に固定する「いま」の帯（ジムで探さずに次の操作ができるように）。
 * - セット中: 種目・セット番号・重量・経過時間と「■ 記録」
 * - 休憩中: 休憩の経過と目安に対する進み（目安を過ぎると色が変わる）、次の一手（▶ 次のセット／次の種目／筋トレを終了）
 * - 開始直後: 最初の種目の「▶ 開始」
 */
export function renderNowBar(ctx: PageContext, state: NowState): void {
	const bar = ctx.footer.createDiv({
		cls: ['fitness-log-now', `is-${state.kind}`],
		attr: { role: 'status' },
	});
	const info = bar.createDiv({ cls: 'fitness-log-now-info' });
	const label = info.createDiv({ cls: 'fitness-log-now-label' });
	const main = info.createDiv({ cls: 'fitness-log-now-main' });
	const sub = info.createDiv({ cls: 'fitness-log-now-sub' });
	const actions = bar.createDiv({ cls: 'fitness-log-now-actions' });

	switch (state.kind) {
		case 'running': {
			const active = ctx.services.store.current.activeSet;
			if (!active) return;
			const unit = ctx.services.store.settings.weightUnit;
			labelWithIcon(label, 'timer', t('now.running'));
			main.createSpan({
				cls: 'fitness-log-now-name',
				text: state.card.name,
			});
			const timer = main.createSpan({ cls: 'fitness-log-now-timer' });
			ctx.addTicker((now) =>
				timer.setText(
					formatDuration(elapsedSeconds(active.startedAt, now)),
				),
			);
			sub.setText(
				[
					t('today.set', { n: active.setIndex }),
					active.weight === undefined
						? null
						: `${toDisplayWeight(active.weight, unit)} ${unit}`,
				]
					.filter((s) => s !== null)
					.join(' ・ '),
			);
			textButton(
				actions,
				t('now.record'),
				() => finishSet(ctx, state.section, state.card),
				{ icon: 'square', cta: true, cls: 'fitness-log-now-primary' },
			);
			return;
		}
		case 'resting': {
			const endSec = parseTime(state.lastEnd);
			labelWithIcon(label, 'coffee', t('now.resting'));
			const timer = main.createSpan({ cls: 'fitness-log-now-timer' });
			const target =
				state.restSec === null
					? null
					: main.createSpan({
							cls: 'fitness-log-now-target',
							text: `/ ${formatDuration(state.restSec)}`,
						});
			const progress = bar.createDiv({ cls: 'fitness-log-now-progress' });
			const fill = progress.createDiv({
				cls: 'fitness-log-now-progress-fill',
			});
			progress.toggleClass('is-hidden', state.restSec === null);
			sub.setText(
				state.next
					? t('now.nextUp', {
							exercise: state.next.card.name,
							n: state.next.setNumber,
						})
					: t('now.allDone'),
			);
			ctx.addTicker((now) => {
				const nowSec =
					now.getHours() * 3600 +
					now.getMinutes() * 60 +
					now.getSeconds();
				const rest =
					endSec === null ? -1 : (nowSec - endSec + 86_400) % 86_400;
				const stale = rest < 0 || rest >= STALE_REST_SEC;
				bar.toggleClass('is-stale', stale);
				timer.setText(stale ? '' : formatDuration(rest));
				target?.toggleClass('is-hidden', stale);
				const ratio = state.restSec
					? Math.min(1, rest / state.restSec)
					: 0;
				fill.setCssProps({ '--fitness-log-progress': String(ratio) });
				bar.toggleClass(
					'is-over',
					!stale && state.restSec !== null && rest >= state.restSec,
				);
			});
			renderNext(ctx, actions, state.next, state.section);
			return;
		}
		case 'ready': {
			labelWithIcon(label, 'arrow-right', t('now.next'));
			if (state.next)
				main.createSpan({
					cls: 'fitness-log-now-name',
					text: state.next.card.name,
				});
			else
				main.createSpan({
					cls: 'fitness-log-now-name',
					text: t('now.allDone'),
				});
			renderNext(ctx, actions, state.next, state.section);
			return;
		}
	}
}

function labelWithIcon(el: HTMLElement, icon: string, text: string): void {
	setIcon(el.createSpan({ cls: 'fitness-log-now-icon' }), icon);
	el.createSpan({ text });
}

/** 次の一手のボタン。全部終わっていれば「筋トレを終了」（パッケージ外は終了が無いので出さない） */
function renderNext(
	ctx: PageContext,
	actions: HTMLElement,
	next: NextStep | null,
	section: NextStep['section'],
): void {
	if (next) {
		textButton(
			actions,
			next.sameExercise
				? t('now.nextSet', { n: next.setNumber })
				: t('now.start'),
			() => startSet(ctx, next.section, next.card),
			{ icon: 'play', cta: true, cls: 'fitness-log-now-primary' },
		);
		return;
	}
	if (section.status === 'in-progress')
		textButton(
			actions,
			t('session.end'),
			() => endSessionWithNotice(ctx, section),
			{ icon: 'square', cta: true, cls: 'fitness-log-now-primary' },
		);
}
