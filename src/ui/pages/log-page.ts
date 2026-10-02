import { t, type MessageKey } from '../../i18n';
import { buildLogData } from '../../lib/history/package-log';
import type { PageContext } from '../page-context';
import { renderExerciseLog } from './log-exercise';
import { renderMonthly } from './log-monthly';
import { renderPackageLog } from './log-package';
import type { LogEnv, LogMode, LogPageState } from './log-shared';

const MODES: readonly LogMode[] = ['package', 'exercise', 'month'];

/**
 * ログページ: パッケージ（パッケージの中での伸び）／種目（パッケージごとの線）／月ごと。
 * 同じ種目でもパッケージで扱える重量が変わるので、まずはパッケージの中どうしで比べる。
 */
export function renderLogPage(ctx: PageContext, el: HTMLElement): void {
	const state = ctx.pageState<LogPageState>('log', () => ({
		mode: 'package',
		group: null,
		detail: null,
		metric: null,
		compare: false,
		query: '',
		hidden: new Set(),
		othersOpen: false,
	}));
	const tabs = el.createDiv({
		cls: 'fitness-log-seg',
		attr: { role: 'tablist' },
	});
	for (const mode of MODES) {
		const tab = tabs.createEl('button', {
			text: t(`log.mode.${mode}` as MessageKey),
			attr: {
				type: 'button',
				role: 'tab',
				'aria-selected': String(state.mode === mode),
			},
		});
		tab.addEventListener('click', () => {
			if (state.mode === mode && state.detail === null) return;
			state.mode = mode;
			state.detail = null;
			ctx.navigate({});
		});
	}

	if (state.mode === 'month') {
		renderMonthly(ctx, el);
		return;
	}
	const { store, index } = ctx.services;
	const env: LogEnv = {
		ctx,
		state,
		data: buildLogData(
			index.allDays(),
			store.current.packages,
			store.current.exercises,
		),
		packages: store.current.packages,
		unit: store.settings.weightUnit,
	};
	if (state.mode === 'exercise') renderExerciseLog(env, el);
	else renderPackageLog(env, el);
}
