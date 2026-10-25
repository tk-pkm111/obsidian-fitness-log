import { t } from '../../i18n';
import { goalProgress } from '../../lib/body/stats';
import { textButton } from '../helpers';
import { BodyGoalModal } from '../modals/body-goal-modal';
import {
	formatBodyWithUnit,
	goalAmount,
	goalColorCls,
	goalGlyph,
	type BodyEnv,
} from './body-shared';
import { formatDay } from './log-shared';

function openGoal(env: BodyEnv, name: string | null): void {
	new BodyGoalModal(env.ctx.app, {
		services: env.ctx.services,
		today: env.ctx.today,
		name,
	}).open();
}

/**
 * 目標: 項目ごとに「今」と「あと 1.3 kg 増」、決めた日の値から目標までのバー。
 * バーは数の小さいほうが左（増やす目標は左から右へ、減らす目標は右から左へ伸びる）
 */
export function renderBodyGoals(env: BodyEnv, el: HTMLElement): void {
	const { goals, items } = env.settings;
	const order = (name: string) => {
		const i = items.findIndex((item) => item.name === name);
		return i < 0 ? items.length : i;
	};
	const sorted = [...goals].sort((a, b) => order(a.name) - order(b.name));
	if (sorted.length === 0) {
		const empty = el.createDiv({ cls: 'fitness-log-empty' });
		empty.createDiv({ text: t('body.goalsEmpty') });
		textButton(empty, t('body.addGoal'), () => openGoal(env, null), {
			icon: 'plus',
			cta: true,
		});
		return;
	}
	const list = el.createDiv({ cls: 'fitness-log-body-goals' });
	for (const goal of sorted) {
		const progress = goalProgress(env.ms, env.index, goal);
		const row = list.createEl('button', {
			cls: 'fitness-log-body-goal',
			attr: { type: 'button', 'aria-label': t('body.changeGoal') },
		});
		row.addEventListener('click', () => openGoal(env, goal.name));
		const top = row.createDiv({ cls: 'fitness-log-body-goal-top' });
		top.createSpan({ cls: 'fitness-log-body-goal-name', text: goal.name });
		if (!progress) {
			top.createSpan({
				cls: 'fitness-log-body-goal-now',
				text: t('body.goal.noRecord'),
			});
			row.createDiv({
				cls: 'fitness-log-body-goal-meta',
				text: t('body.goalValue', {
					value: formatBodyWithUnit(env, goal.name, goal.target),
				}),
			});
			continue;
		}
		top.createSpan({
			cls: 'fitness-log-body-goal-now',
			text: t('body.now', {
				value: formatBodyWithUnit(env, goal.name, progress.current),
			}),
		});
		const left = top.createSpan({ cls: 'fitness-log-body-goal-left' });
		if (progress.reached) left.setText(t('body.reached'));
		else {
			goalGlyph(left, progress);
			left.createSpan({
				text: t('body.left', {
					amount: goalAmount(env, goal.name, progress),
				}),
			});
		}
		const down = progress.direction < 0;
		const bar = row.createDiv({
			cls: ['fitness-log-body-goal-bar', goalColorCls(progress)],
		});
		bar.toggleClass('is-down', down);
		bar.createDiv({ cls: 'fitness-log-body-goal-fill' }).setCssProps({
			width: `${(progress.progress * 100).toFixed(1)}%`,
		});
		const meta = row.createDiv({ cls: 'fitness-log-body-goal-meta' });
		const since = t('body.since', {
			date: formatDay(progress.since),
			value: formatBodyWithUnit(env, goal.name, progress.start),
		});
		const target = t('body.goalValue', {
			value: formatBodyWithUnit(env, goal.name, progress.target),
		});
		// 数の小さいほうを左に
		meta.createSpan({ text: down ? target : since });
		meta.createSpan({ text: down ? since : target });
	}
	const footer = el.createDiv({ cls: 'fitness-log-body-footer' });
	textButton(footer, t('body.addGoal'), () => openGoal(env, null), {
		icon: 'plus',
		cls: 'mod-quiet',
	});
}
