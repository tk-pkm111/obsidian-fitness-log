/**
 * 初期データの種目マスター（Notion の種目ライブラリー 53 種目＋プログラム表にだけある種目）。実装計画 §7。
 * 出典: context/notion/02_exercise-library/, context/notion/01_training-programs/
 *
 * 別名の方針:
 * - 略語・空白・表記ゆれ・「HS」等の接頭辞の違いだけなら、ライブラリーの種目の別名にする。
 * - 「マシンorDB」のように器具を選ぶ種目は、先に書かれた方の種目の別名にする（メモに残す）。
 * - 同じ種目か判断できないもの・片側版は別の種目にする（履歴が混ざるより分かれる方が安全）。
 */
import type { Equipment, ExerciseCategory, RecordType } from '../types';

export interface ExerciseSeed {
	name: string;
	category: ExerciseCategory;
	equipment: Equipment;
	recordType?: RecordType;
	unilateral?: boolean;
	aliases?: string[];
	/** Notion の種目ライブラリーに無く、プログラム表から足した種目 */
	fromProgram?: boolean;
}

export const DEFAULT_EXERCISES: readonly ExerciseSeed[] = [
	// LEGS（13）
	{
		name: '45°レッグプレス',
		category: 'legs',
		equipment: 'machine',
		aliases: ['HS 45°レッグプレス'],
	},
	{
		name: 'シーテッドレッグカール（ワンレッグ）',
		category: 'legs',
		equipment: 'machine',
		unilateral: true,
		aliases: [
			'レッグカール',
			'ハムストリングカール',
			'ワンレッグ-レッグカール',
		],
	},
	{
		name: 'ハイパーエクステンション（ハムストリング）',
		category: 'legs',
		equipment: 'other',
		aliases: ['ハイパーエクステンション'],
	},
	// Notion では LEGS に分類されているが腹筋種目
	{ name: 'ケーブルアブクランチ', category: 'core', equipment: 'cable' },
	{ name: 'シーテッドカーフレイズ', category: 'legs', equipment: 'machine' },
	{
		name: 'スティフレッグデッドリフト',
		category: 'legs',
		equipment: 'barbell',
		aliases: ['SLDL'],
	},
	{
		name: 'スミスマシンスクワット',
		category: 'legs',
		equipment: 'smith',
		aliases: ['スミスマシンorハックスクワット'],
	},
	{ name: 'ハックスクワット', category: 'legs', equipment: 'machine' },
	{
		name: 'ヒッププレス',
		category: 'legs',
		equipment: 'machine',
		aliases: ['マシンヒッププレス'],
	},
	{
		name: 'マシンアダクター',
		category: 'legs',
		equipment: 'machine',
		aliases: ['アダクター'],
	},
	{ name: 'ライイングレッグカール', category: 'legs', equipment: 'machine' },
	{
		name: 'ルーマニアンデッドリフト',
		category: 'legs',
		equipment: 'dumbbell',
		aliases: [
			'DB ルーマニアンデットリフト',
			'DB ルーマニアンデッドリフト',
			'（DBorバーベル/スミス）ルーマニアンデッドリフト',
		],
	},
	{
		name: 'レッグエクステンション',
		category: 'legs',
		equipment: 'machine',
		aliases: ['HS レッグエクステンション'],
	},

	// PULL（16）
	{
		name: 'ワイドグリップチンニング',
		category: 'pull',
		equipment: 'bodyweight',
		recordType: 'reps',
		aliases: ['ワイドグリップチンニング（広背筋）'],
	},
	{ name: 'ケルソーシュラッグ', category: 'pull', equipment: 'machine' },
	{
		name: '広背筋（ワンハンド）マシンローイング',
		category: 'pull',
		equipment: 'machine',
		unilateral: true,
	},
	{ name: '上背部マシンローイング', category: 'pull', equipment: 'machine' },
	{
		name: 'V バー（ナロー）ラットプルダウン',
		category: 'pull',
		equipment: 'cable',
		aliases: [
			'Vバーアタッチメントラットプルダウン（広背筋）',
			'Vバーラットプルダウン',
		],
	},
	{
		name: 'アイソラテラルロウ（広背筋）',
		category: 'pull',
		equipment: 'machine',
	},
	{ name: 'アッパーバックプルダウン', category: 'pull', equipment: 'cable' },
	{
		name: 'アッパーバックマシンロウ（上背部）',
		category: 'pull',
		equipment: 'machine',
	},
	{
		name: 'ケーブルシングルアームラットプルダウン（広背筋）',
		category: 'pull',
		equipment: 'cable',
		unilateral: true,
		aliases: ['S/A ケーブルプルダウン（広背筋）'],
	},
	{ name: 'ケーブルプルオーバー', category: 'pull', equipment: 'cable' },
	{
		name: 'シングルアームケーブルラットロウ',
		category: 'pull',
		equipment: 'cable',
		unilateral: true,
		aliases: [
			'S/A ケーブルラットロウ（広背筋）',
			'S/A ケーブルラットロウ',
			'S/A ケーブルorマシンプロウ（広背筋）',
		],
	},
	{
		name: 'チェストサポーテッドT-BARロウ',
		category: 'pull',
		equipment: 'machine',
		aliases: [
			'チェストサポーテッドT-BARロウorDBロウ（上背部）',
			'チェストサポーテッドT-BAR or DBロウ',
		],
	},
	{
		name: 'ノーチラスマシンプルダウン',
		category: 'pull',
		equipment: 'machine',
	},
	{ name: 'ベントオーバーロウ', category: 'pull', equipment: 'barbell' },
	{ name: 'リバースペックフライ', category: 'pull', equipment: 'machine' },
	{
		name: 'ワイドグリップラットプルダウン',
		category: 'pull',
		equipment: 'cable',
		aliases: ['ワイドグリップ ラットプルダウン（広背筋）'],
	},

	// PUSH（13）
	{ name: 'ケーブルYレイズ', category: 'push', equipment: 'cable' },
	{ name: 'ケーブルチェストフライ', category: 'push', equipment: 'cable' },
	{
		name: 'シーテッドケーブルチェストフライ',
		category: 'push',
		equipment: 'cable',
		aliases: [
			'シーテッドケーブルフライ',
			'シーテッドケーブルフライ（デクライン）',
		],
	},
	{
		name: 'スミスマシンインクラインプレス',
		category: 'push',
		equipment: 'smith',
		aliases: ['スミスマシン インクラインプレス'],
	},
	{
		name: 'ダンベルインクラインプレス',
		category: 'push',
		equipment: 'dumbbell',
	},
	{ name: 'ダンベルサイドレイズ', category: 'push', equipment: 'dumbbell' },
	{
		name: 'ニュートラルグリップショルダープレス',
		category: 'push',
		equipment: 'machine',
		aliases: [
			'ニュートラルグリップマシンショルダープレス',
			'マシンショルダープレス（ニュートラルグリップ）',
		],
	},
	{
		name: 'ペックフライ',
		category: 'push',
		equipment: 'machine',
		aliases: ['HS マシンペックフライ'],
	},
	{
		// ライブラリーの動画名が「マシンインクラインプレス-HAMMER_STRENGTH」
		name: 'マシンインクラインプレス',
		category: 'push',
		equipment: 'machine',
		aliases: ['HS プレートロードインクラインプレス'],
	},
	{
		name: 'マシンサイドレイズ',
		category: 'push',
		equipment: 'machine',
		aliases: ['マシンorDB サイドレイズ'],
	},
	{ name: 'マシンショルダープレス', category: 'push', equipment: 'machine' },
	{
		name: 'マシンチェストプレス',
		category: 'push',
		equipment: 'machine',
		aliases: ['マシンフラットチェストプレス'],
	},
	{ name: 'ライイングYレイズ', category: 'push', equipment: 'dumbbell' },

	// ARMS（11）
	{
		name: 'ケーブルベイジアン/インクラインカール',
		category: 'arms',
		equipment: 'cable',
	},
	{
		name: 'オルタネイトダンベルカール',
		category: 'arms',
		equipment: 'dumbbell',
		aliases: ['オルタネイトDBカール（スピネイト）'],
	},
	{
		name: 'クロスボディーケーブルエクステンション',
		category: 'arms',
		equipment: 'cable',
		aliases: ['クロスボディケーブルエクステンション'],
	},
	{
		name: 'ケーブルオーバーヘッドエクステンション',
		category: 'arms',
		equipment: 'cable',
	},
	{ name: 'ケーブルカール', category: 'arms', equipment: 'cable' },
	{
		name: 'スミスマシンJMプレス',
		category: 'arms',
		equipment: 'smith',
		aliases: ['スミスマシン+レジスタンスバンドJMプレス'],
	},
	{
		name: 'ダンベルハンマーカール',
		category: 'arms',
		equipment: 'dumbbell',
		aliases: ['DBハンマーカール', 'シーテッドDBハンマーカール'],
	},
	{
		name: 'ダンベルプリーチャーカール',
		category: 'arms',
		equipment: 'dumbbell',
		aliases: ['DBプリチャーカール', 'S/A DB プリチャーカール'],
	},
	{
		name: 'ディップス',
		category: 'arms',
		equipment: 'bodyweight',
		recordType: 'reps',
	},
	{
		name: 'トライセップスプッシュダウン',
		category: 'arms',
		equipment: 'cable',
		aliases: [
			'EZバー ケーブルトライセプスプッシュダウン',
			'トライセプスプッシュダウン',
		],
	},
	{
		name: 'マシントライセプエクステンション',
		category: 'arms',
		equipment: 'machine',
		aliases: ['マシントライセプスエクステンション'],
	},

	// プログラム表にだけある種目
	{
		name: 'ハンギングレッグレイズ',
		category: 'core',
		equipment: 'bodyweight',
		recordType: 'reps',
		fromProgram: true,
	},
	{
		name: 'マシンアブクランチ',
		category: 'core',
		equipment: 'machine',
		fromProgram: true,
	},
	{
		name: 'カーフレイズ（レッグプレスマシン）',
		category: 'legs',
		equipment: 'machine',
		aliases: ['カーフレイズ(ウェイトスタック式レッグプレスマシン)'],
		fromProgram: true,
	},
	{
		name: 'ワンレッグ-レッグエクステンション',
		category: 'legs',
		equipment: 'machine',
		unilateral: true,
		fromProgram: true,
	},
	{
		name: 'ワンレッグ45°レッグプレス',
		category: 'legs',
		equipment: 'machine',
		unilateral: true,
		fromProgram: true,
	},
	{
		name: 'オーバーグリップマシンロウ（上背部）',
		category: 'pull',
		equipment: 'machine',
		fromProgram: true,
	},
	{
		name: 'チェストサポーテッドマシンロウ',
		category: 'pull',
		equipment: 'machine',
		fromProgram: true,
	},
	{
		name: 'シーテッドケーブルロウ',
		category: 'pull',
		equipment: 'cable',
		aliases: ['シーテッドケーブルロウ（ワイドVバーorVバー）広背筋/僧帽筋'],
		fromProgram: true,
	},
	{
		name: 'スミスマシン ショルダー/ハイインクラインプレス',
		category: 'push',
		equipment: 'smith',
		aliases: ['スミスマシン ハイインクラインプレス'],
		fromProgram: true,
	},
	{
		name: 'スミスマシンフラットプレス',
		category: 'push',
		equipment: 'smith',
		aliases: ['スミスマシンorDBフラットプレス'],
		fromProgram: true,
	},
	{
		name: 'S/A ケーブルサイドレイズ',
		category: 'push',
		equipment: 'cable',
		unilateral: true,
		fromProgram: true,
	},
	{
		name: 'ダンベルインクラインカール',
		category: 'arms',
		equipment: 'dumbbell',
		aliases: ['シーテッドDBインクラインカール'],
		fromProgram: true,
	},
	{
		name: 'ワンハンドケーブルトライセプスプッシュダウン',
		category: 'arms',
		equipment: 'cable',
		unilateral: true,
		fromProgram: true,
	},
];
