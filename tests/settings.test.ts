import { describe, expect, it } from 'vitest';
import { coerceSetting, normalizeLogFolder } from '../src/settings';

describe('設定値の受け取り（不正な値は採用しない）', () => {
	it('ログの保存先はパス表記を揃え、空なら既定値', () => {
		expect(coerceSetting('logFolder', ' /Training//Logs/ ')).toEqual({
			logFolder: 'Training/Logs',
		});
		expect(normalizeLogFolder('   ')).toBe('Fitness/ログ');
		expect(coerceSetting('logFolder', 3)).toEqual({});
	});

	it('ノート名の形式は検証を通るものだけ', () => {
		expect(coerceSetting('fileNameFormat', ' YYYY/MM/YYYY-MM-DD ')).toEqual(
			{ fileNameFormat: 'YYYY/MM/YYYY-MM-DD' },
		);
		expect(coerceSetting('fileNameFormat', 'MM-DD')).toEqual({});
	});

	it('単位・刻み・切り替え', () => {
		expect(coerceSetting('weightUnit', 'lb')).toEqual({ weightUnit: 'lb' });
		expect(coerceSetting('weightUnit', 'stone')).toEqual({});
		expect(coerceSetting('weightStep', 1.25)).toEqual({ weightStep: 1.25 });
		expect(coerceSetting('weightStep', 0)).toEqual({});
		expect(coerceSetting('weightStep', Number.NaN)).toEqual({});
		expect(coerceSetting('showRestTimer', false)).toEqual({
			showRestTimer: false,
		});
		expect(coerceSetting('openOnStartup', 'yes')).toEqual({});
	});
});
