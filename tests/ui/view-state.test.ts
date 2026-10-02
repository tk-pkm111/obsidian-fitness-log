import { describe, expect, it } from 'vitest';
import { parseViewState } from '../../src/ui/main-view';

describe('parseViewState（ワークスペースに保存された状態の復元）', () => {
	it('正しい状態はそのまま', () => {
		expect(
			parseViewState({
				page: 'log',
				date: '2026-09-30',
				exerciseId: 'ex_1',
				selectedId: null,
			}),
		).toEqual({
			page: 'log',
			date: '2026-09-30',
			exerciseId: 'ex_1',
			selectedId: null,
		});
	});

	it('壊れた値・古い形式は既定（今日ページ・今日に追従）に倒す', () => {
		expect(parseViewState(null)).toEqual({
			page: 'today',
			date: null,
			exerciseId: null,
			selectedId: null,
		});
		expect(
			parseViewState({
				page: 'unknown',
				date: '2026-02-30',
				exerciseId: 3,
			}),
		).toEqual({
			page: 'today',
			date: null,
			exerciseId: null,
			selectedId: null,
		});
	});
});
