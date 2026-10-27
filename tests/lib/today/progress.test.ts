import { describe, expect, it } from 'vitest';
import type { SetLog } from '../../../src/lib/model/types';
import type {
	CardModel,
	SectionModel,
	SectionStatus,
} from '../../../src/lib/today/day-model';
import { dayStatus } from '../../../src/lib/today/progress';

const timed: SetLog = {
	weight: 50,
	reps: 12,
	start: '00:59:00',
	end: '01:00:16',
	note: '',
};

function section(
	status: SectionStatus,
	sets: SetLog[] = [],
	isOther = false,
): SectionModel {
	const card: CardModel = {
		key: 'ex:ex_a',
		exercise: null,
		name: 'A',
		noteName: 'A',
		source: null,
		item: null,
		sets,
		setOffset: 0,
		rests: [],
		active: false,
		recordType: 'weight-reps',
	};
	return {
		key: isOther ? 'other' : 'pkg:pk_a',
		status,
		pkg: null,
		sessionName: isOther ? null : 'A',
		isOther,
		title: 'A',
		inNote: true,
		plannedBy: null,
		notes: [],
		cards: [card],
	};
}

describe('dayStatus（その日の筋トレ全体）', () => {
	it('筋トレ中のパッケージがあれば running。終えたものと混ざっていても', () => {
		expect(
			dayStatus([section('finished'), section('in-progress')], true),
		).toBe('running');
	});

	it('今日の単発の種目は、時刻のあるセットがあれば running（過去の日・記録の無い単発は数えない）', () => {
		const other = section('manual', [timed], true);
		expect(dayStatus([other], true)).toBe('running');
		expect(dayStatus([other], false)).toBe('none');
		expect(dayStatus([section('manual', [], true)], true)).toBe('none');
		expect(
			dayStatus(
				[
					section(
						'manual',
						[{ ...timed, start: null, end: null }],
						true,
					),
				],
				true,
			),
		).toBe('none');
	});

	it('筋トレ中のものが無く、終えたものがあれば finished。予定だけなら none', () => {
		expect(dayStatus([section('finished'), section('planned')], true)).toBe(
			'finished',
		);
		expect(dayStatus([section('planned')], true)).toBe('none');
		expect(dayStatus([], true)).toBe('none');
	});
});
