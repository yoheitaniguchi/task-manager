import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MEETING_EVAL_INPUT,
	evaluateMeeting,
} from '../src/domain/meetingEval';
import type { MeetingRole } from '../src/domain/types';
import { makeTask } from './helpers';

function meetingTask(
	role: MeetingRole,
	replaceable: boolean,
	duration = 60,
	attendees = 2,
) {
	return makeTask({
		type: 'meeting',
		meeting: { role, replaceable, attendees, duration, start: '2026-07-19T01:00:00.000Z' },
	});
}

describe('evaluateMeeting', () => {
	it('会議以外は評価しない', () => {
		expect(evaluateMeeting(makeTask({ type: 'task' }), DEFAULT_MEETING_EVAL_INPUT)).toBeNull();
	});

	it('役割係数を重要度に使う', () => {
		expect(evaluateMeeting(meetingTask('decision', false), DEFAULT_MEETING_EVAL_INPUT)?.importance).toBe(3);
		expect(evaluateMeeting(meetingTask('contribute', false), DEFAULT_MEETING_EVAL_INPUT)?.importance).toBe(2);
		expect(evaluateMeeting(meetingTask('listen', false), DEFAULT_MEETING_EVAL_INPUT)?.importance).toBe(1);
	});

	it('コストは 時間(分) × 人数 ÷ 60 の人時', () => {
		const result = evaluateMeeting(meetingTask('listen', false, 90, 4), DEFAULT_MEETING_EVAL_INPUT);
		expect(result?.costPersonHours).toBe(6); // 90 × 4 ÷ 60
	});

	it('listen かつ replaceable なら辞退候補', () => {
		expect(evaluateMeeting(meetingTask('listen', true), DEFAULT_MEETING_EVAL_INPUT)?.verdict)
			.toBe('declinable');
	});

	it('listen でも replaceable: false なら辞退候補から除外（要求 §F4）', () => {
		expect(evaluateMeeting(meetingTask('listen', false), DEFAULT_MEETING_EVAL_INPUT)?.verdict)
			.not.toBe('declinable');
	});

	it('replaceable: true でも listen 以外は辞退候補にしない', () => {
		expect(evaluateMeeting(meetingTask('decision', true), DEFAULT_MEETING_EVAL_INPUT)?.verdict)
			.not.toBe('declinable');
		expect(evaluateMeeting(meetingTask('contribute', true), DEFAULT_MEETING_EVAL_INPUT)?.verdict)
			.not.toBe('declinable');
	});

	it('高重要 × 高コストは交渉候補', () => {
		// decision(3) × 120分 × 4人 ÷ 60 = 8人時 ≧ 4
		const result = evaluateMeeting(meetingTask('decision', false, 120, 4), DEFAULT_MEETING_EVAL_INPUT);
		expect(result?.verdict).toBe('negotiable');
	});

	it('高重要でも低コストなら keep', () => {
		// decision(3) × 30分 × 2人 ÷ 60 = 1人時 < 4
		const result = evaluateMeeting(meetingTask('decision', false, 30, 2), DEFAULT_MEETING_EVAL_INPUT);
		expect(result?.verdict).toBe('keep');
	});
});
