import { describe, expect, it } from 'vitest';
import { calcCapacity, meetingMinutesOn } from '../src/domain/capacity';
import { makeTask } from './helpers';

const TODAY = new Date(2026, 6, 19, 9, 0, 0); // 2026-07-19 ローカル
const INPUT = { disposableMin: 360, followUpCostMin: 10 };

function meeting(durationMin: number, start: Date, attendees = 1) {
	return makeTask({
		type: 'meeting',
		meeting: {
			role: 'contribute',
			replaceable: false,
			attendees,
			start: start.toISOString(),
			duration: durationMin,
		},
	});
}

describe('meetingMinutesOn', () => {
	it('当日の会議のみ合計する', () => {
		const tomorrow = new Date(2026, 6, 20, 10, 0, 0);
		const tasks = [
			meeting(60, new Date(2026, 6, 19, 10, 0, 0)),
			meeting(30, new Date(2026, 6, 19, 14, 0, 0)),
			meeting(120, tomorrow),
		];
		expect(meetingMinutesOn(tasks, TODAY)).toBe(90);
	});

	it('start 未設定の会議は無視する', () => {
		const t = makeTask({
			type: 'meeting',
			meeting: { role: 'contribute', replaceable: false, attendees: 1, duration: 60 },
		});
		expect(meetingMinutesOn([t], TODAY)).toBe(0);
	});
});

describe('calcCapacity', () => {
	it('会議時間とフォローアップコストを控除する', () => {
		const tasks = [
			meeting(90, new Date(2026, 6, 19, 10, 0, 0)),
			makeTask({ status: 'waiting' }),
			makeTask({ status: 'waiting' }),
		];
		const result = calcCapacity(tasks, INPUT, TODAY);

		expect(result.meetingMin).toBe(90);
		expect(result.followUpMin).toBe(20); // waiting 2件 × 10分
		expect(result.availableMin).toBe(360 - 90 - 20);
	});

	it('doing の estimate 合計が available を超えたら isOver', () => {
		const tasks = [
			meeting(300, new Date(2026, 6, 19, 10, 0, 0)),
			makeTask({ status: 'doing', estimate: 120 }),
		];
		const result = calcCapacity(tasks, INPUT, TODAY);

		expect(result.availableMin).toBe(60);
		expect(result.committedMin).toBe(120);
		expect(result.isOver).toBe(true);
	});

	it('収まっていれば isOver は false', () => {
		const tasks = [makeTask({ status: 'doing', estimate: 60 })];
		expect(calcCapacity(tasks, INPUT, TODAY).isOver).toBe(false);
	});

	it('控除しきると available は負になりうる', () => {
		const tasks = [meeting(400, new Date(2026, 6, 19, 9, 0, 0))];
		expect(calcCapacity(tasks, INPUT, TODAY).availableMin).toBeLessThan(0);
	});
});
