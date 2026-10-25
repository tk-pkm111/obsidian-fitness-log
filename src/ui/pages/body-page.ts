import { t, type MessageKey } from '../../i18n';
import { iconButton, textButton } from '../helpers';
import { BodyRecordModal } from '../modals/body-record-modal';
import type { PageContext } from '../page-context';
import { renderBodyGoals } from './body-goals';
import { renderBodyParts } from './body-parts';
import {
	BODY_VIEWS,
	bodyPageState,
	createBodyEnv,
	type BodyPageState,
} from './body-shared';
import { renderBodyWhole } from './body-whole';
import { formatDay } from './log-shared';

function openRecord(ctx: PageContext, state: BodyPageState): void {
	new BodyRecordModal(ctx.app, {
		services: ctx.services,
		today: ctx.today,
		onSaved: (date) => {
			state.date = date;
			ctx.refresh();
		},
	}).open();
}

/** まだ測定が無いとき: 記録のボタンと、ほかのアプリから取り込むときのノートの形 */
function renderEmpty(ctx: PageContext, el: HTMLElement, state: BodyPageState) {
	const box = el.createDiv({
		cls: 'fitness-log-empty fitness-log-body-empty',
	});
	box.createDiv({ text: t('body.empty') });
	textButton(box, t('body.record'), () => openRecord(ctx, state), {
		icon: 'plus',
		cta: true,
	});
	box.createDiv({
		cls: 'fitness-log-muted fitness-log-body-empty-note',
		text: t('body.emptyNote', { folder: ctx.services.body.folderPath }),
	});
}

/**
 * 体組成のページ（「体組成を記録する」をオンにした人だけ）。
 * 上に見ている測定（‹ ›）と「測定を記録」、タブ（全身・部位別・目標）。値は 1 測定 1 ノートから読む
 */
export function renderBodyPage(ctx: PageContext, el: HTMLElement): void {
	const { body } = ctx.services;
	body.ensureLoaded();
	const state = bodyPageState(ctx);
	const ms = body.all;
	if (ms.length === 0) {
		renderEmpty(ctx, el, state);
		return;
	}
	const found = state.date ? ms.findIndex((m) => m.date === state.date) : -1;
	const index = found >= 0 ? found : ms.length - 1;
	const current = ms[index];
	if (!current) return;
	const env = createBodyEnv(ctx, state, ms, index, current);

	const top = el.createDiv({ cls: 'fitness-log-body-top' });
	const nav = top.createDiv({ cls: 'fitness-log-body-nav' });
	const go = (to: number) => {
		const target = ms[to];
		if (!target) return;
		state.date = to === ms.length - 1 ? null : target.date;
		ctx.refresh();
	};
	const prev = iconButton(nav, 'chevron-left', t('body.prev'), () =>
		go(index - 1),
	);
	prev.disabled = index === 0;
	const label = nav.createDiv({ cls: 'fitness-log-body-date' });
	label.createDiv({
		cls: 'fitness-log-body-date-main',
		text: current.time
			? `${formatDay(current.date)} ${current.time.replace(/^0/, '')}`
			: formatDay(current.date),
	});
	const before = ms[index - 1];
	label.createDiv({
		cls: 'fitness-log-body-date-sub',
		text: before
			? t('body.previousDate', { date: formatDay(before.date) })
			: t('body.firstMeasurement'),
	});
	const next = iconButton(nav, 'chevron-right', t('body.next'), () =>
		go(index + 1),
	);
	next.disabled = index === ms.length - 1;
	textButton(top, t('body.record'), () => openRecord(ctx, state), {
		icon: 'plus',
		cta: true,
		cls: 'fitness-log-body-record',
	});

	const tabs = el.createDiv({
		cls: 'fitness-log-seg',
		attr: { role: 'tablist' },
	});
	for (const view of BODY_VIEWS) {
		const tab = tabs.createEl('button', {
			text: t(`body.view.${view}` as MessageKey),
			attr: {
				type: 'button',
				role: 'tab',
				'aria-selected': String(state.view === view),
			},
		});
		tab.addEventListener('click', () => {
			if (state.view === view) return;
			state.view = view;
			ctx.refresh();
		});
	}

	if (state.view === 'parts') renderBodyParts(env, el);
	else if (state.view === 'goals') renderBodyGoals(env, el);
	else renderBodyWhole(env, el);
}
