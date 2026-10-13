import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import {
	basesFileContent,
	retargetBasesFolder,
} from '../../../src/lib/log/bases';

describe('basesFileContent', () => {
	it('ログのタグとフォルダで絞り込み、集計列を日付の降順で並べる', () => {
		const content = basesFileContent('Fitness');
		expect(content.filters.and).toEqual([
			'file.hasTag("fitness-log")',
			'file.inFolder("Fitness")',
		]);
		expect(content.views[0]?.order).toEqual([
			'file.name',
			'date',
			'packages',
			'exercises',
			'sets',
			'volume_kg',
			'duration_min',
		]);
		expect(content.views[0]?.sort).toEqual([
			{ property: 'date', direction: 'DESC' },
		]);
	});

	it('フォルダ名の引用符はエスケープし、YAML として読み戻せる', () => {
		const content = basesFileContent('My "Gym"');
		expect(content.filters.and[1]).toBe('file.inFolder("My \\"Gym\\"")');
		expect(YAML.parse(YAML.stringify(content))).toEqual(content);
	});
});

describe('retargetBasesFolder', () => {
	it('日ノートのフォルダの絞り込みだけを書き換える', () => {
		const text =
			'filters:\n  and:\n    - file.hasTag("fitness-log")\n    - file.inFolder("Fitness/ログ")\n';
		expect(retargetBasesFolder(text, 'Fitness/ログ', 'Fitness/log')).toBe(
			text.replace('Fitness/ログ', 'Fitness/log'),
		);
		expect(retargetBasesFolder(text, 'Other', 'Fitness/log')).toBe(text);
	});
});
