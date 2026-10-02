import { beforeEach, describe, expect, it } from 'vitest';
import {
	addPackageSection,
	CatalogError,
	createPackage,
	movePackage,
	movePackageItemTo,
	movePackageRow,
	packageRows,
	removeExerciseFromPackages,
	removePackageItem,
	removePackageSection,
	renamePackageSection,
	sectionOfItem,
} from '../../../src/lib/model/catalog';
import { createEmptyData } from '../../../src/lib/model/data';
import type { Package, PluginData } from '../../../src/lib/model/types';

const NOW = '2026-10-01T00:00:00.000Z';
const item = (exerciseId: string) => ({
	exerciseId,
	targetSets: 2,
	targetReps: '6-9',
});

/** 行を「[背中] a b [腕] c」のような文字列にする */
const layout = (pkg: Package) =>
	packageRows(pkg)
		.map((row) =>
			row.kind === 'section'
				? `[${row.section.name}]`
				: row.item.exerciseId,
		)
		.join(' ');

describe('パッケージの区切り（セクション）', () => {
	let data: PluginData;
	let pkg: Package;
	beforeEach(() => {
		data = createEmptyData();
		pkg = createPackage(data, 'PULL', NOW);
		pkg.items = ['a', 'b', 'c'].map(item);
	});

	it('足した区切りは末尾。ドラッグ（行の移動）で位置を決める', () => {
		const back = addPackageSection(data, pkg.id, ' 背中 ');
		expect(back).toMatchObject({ name: '背中', at: 3 });
		expect(back.id).toMatch(/^sc_/);
		expect(layout(pkg)).toBe('a b c [背中]');
		movePackageRow(data, pkg.id, 3, 0);
		addPackageSection(data, pkg.id, '腕');
		movePackageRow(data, pkg.id, 4, 3);
		expect(layout(pkg)).toBe('[背中] a b [腕] c');
		expect(pkg.sections?.map((s) => s.at)).toEqual([0, 2]);
		expect(sectionOfItem(pkg, 1)?.name).toBe('背中');
		expect(sectionOfItem(pkg, 2)?.name).toBe('腕');
		// 種目を区切りの向こうへ
		movePackageRow(data, pkg.id, 1, 3);
		expect(layout(pkg)).toBe('[背中] b [腕] a c');
	});

	it('区切りを隠したままの並べ替え・外す・消すでも区切りは崩れない', () => {
		addPackageSection(data, pkg.id, '腕');
		movePackageRow(data, pkg.id, 3, 2); // a b [腕] c
		movePackageItemTo(data, pkg.id, 2, 0); // c を先頭へ（先頭の種目の区切りに入る）
		expect(layout(pkg)).toBe('c a b [腕]');
		movePackageItemTo(data, pkg.id, 0, 2); // c を末尾へ（直前の種目 b の区切りに入る）
		expect(layout(pkg)).toBe('a b c [腕]');
		movePackageRow(data, pkg.id, 3, 1); // a [腕] b c
		removePackageItem(data, pkg.id, 0);
		expect(layout(pkg)).toBe('[腕] b c');
		pkg.items.push(item('d'));
		removeExerciseFromPackages(data, 'c');
		expect(layout(pkg)).toBe('[腕] b d');
	});

	it('名前の変更・削除（中の種目は残る）', () => {
		const section = addPackageSection(data, pkg.id, '脚');
		renamePackageSection(data, pkg.id, section.id, '下半身');
		expect(pkg.sections?.[0]?.name).toBe('下半身');
		expect(() =>
			renamePackageSection(data, pkg.id, section.id, ' '),
		).toThrow(CatalogError);
		expect(() => addPackageSection(data, pkg.id, '')).toThrow(CatalogError);
		removePackageSection(data, pkg.id, section.id);
		expect(pkg.sections).toBeUndefined();
		expect(layout(pkg)).toBe('a b c');
	});

	it('パッケージ一覧の並べ替え', () => {
		createPackage(data, 'PUSH', NOW);
		createPackage(data, 'LEGS', NOW);
		movePackage(data, 2, 0);
		expect(data.packages.map((p) => p.name)).toEqual([
			'LEGS',
			'PULL',
			'PUSH',
		]);
	});
});
