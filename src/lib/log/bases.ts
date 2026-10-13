/**
 * ログの Bases ファイル（.base）の中身。実装計画 §5.5。
 * 日ノートの frontmatter（date / packages / sets / volume_kg / duration_min）を表で一覧する。
 */
import { LOG_TAG } from './summary';

export const BASES_FILE_NAME = 'トレーニングログ.base';

export interface BasesFileContent {
	filters: { and: string[] };
	views: Array<{
		type: string;
		name: string;
		order: string[];
		sort: Array<{ property: string; direction: 'ASC' | 'DESC' }>;
	}>;
}

function quote(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** 日ノートのフォルダを移したとき、.base の絞り込み（file.inFolder("…")）を新しいフォルダに書き換える */
export function retargetBasesFolder(
	text: string,
	from: string,
	to: string,
): string {
	return text
		.split(`file.inFolder(${quote(from)})`)
		.join(`file.inFolder(${quote(to)})`);
}

export function basesFileContent(logFolder: string): BasesFileContent {
	return {
		filters: {
			and: [
				`file.hasTag(${quote(LOG_TAG)})`,
				`file.inFolder(${quote(logFolder)})`,
			],
		},
		views: [
			{
				type: 'table',
				name: 'トレーニングログ',
				order: [
					'file.name',
					'date',
					'packages',
					'exercises',
					'sets',
					'volume_kg',
					'duration_min',
				],
				sort: [{ property: 'date', direction: 'DESC' }],
			},
		],
	};
}
