/**
 * 会議の2軸4象限評価（要求 §F4）。
 *
 * 重要度 = 役割係数、コスト = 会議時間(分) × 参加人数 ÷ 60（人時）。
 */

import type { MeetingRole, Task } from './types';

export type MeetingVerdict =
	/** 辞退・委任候補。listen かつ replaceable のときだけ。 */
	| 'declinable'
	/** 短縮・少人数化の交渉候補。高重要 × 高コスト。 */
	| 'negotiable'
	/** そのまま出る。 */
	| 'keep';

export interface RoleWeights {
	decision: number;
	contribute: number;
	listen: number;
}

export const DEFAULT_ROLE_WEIGHTS: RoleWeights = {
	decision: 3,
	contribute: 2,
	listen: 1,
};

export interface MeetingEvalInput {
	roleWeights: RoleWeights;
	/** これ以上を「高重要」とみなす。既定 3（= decision）。 */
	highImportanceThreshold: number;
	/** これ以上を「高コスト」とみなす（人時）。既定 4。 */
	highCostThreshold: number;
}

export const DEFAULT_MEETING_EVAL_INPUT: MeetingEvalInput = {
	roleWeights: DEFAULT_ROLE_WEIGHTS,
	highImportanceThreshold: 3,
	highCostThreshold: 4,
};

export interface MeetingEvaluation {
	importance: number;
	/** 人時 */
	costPersonHours: number;
	verdict: MeetingVerdict;
}

export function roleWeight(role: MeetingRole, weights: RoleWeights): number {
	return weights[role];
}

export function evaluateMeeting(task: Task, input: MeetingEvalInput): MeetingEvaluation | null {
	if (task.type !== 'meeting' || !task.meeting) return null;

	const { role, replaceable, attendees, duration } = task.meeting;
	const importance = roleWeight(role, input.roleWeights);
	const costPersonHours = (duration * attendees) / 60;

	// 要求 §F4：replaceable: false は重要度に関わらず辞退候補から除外する。
	// listen かつ replaceable のときのみ declinable。
	const declinable = role === 'listen' && replaceable;

	let verdict: MeetingVerdict;
	if (declinable) {
		verdict = 'declinable';
	} else if (
		importance >= input.highImportanceThreshold &&
		costPersonHours >= input.highCostThreshold
	) {
		verdict = 'negotiable';
	} else {
		verdict = 'keep';
	}

	return { importance, costPersonHours, verdict };
}
