/**
 * 日次キャパシティバー（要求 §F5）。
 *
 * 可処分時間 − 当日会議時間合計 − (waiting件数 × フォローアップコスト)
 * 委譲は無料ではない、という設計原則（要求 §2-5）を数式に落としたもの。
 */

import type { Task } from './types';

export interface CapacityInput {
	/** 可処分時間（分）。既定 6h = 360。 */
	disposableMin: number;
	/** waiting 1件あたりのフォローアップコスト（分）。既定 10。 */
	followUpCostMin: number;
}

export interface CapacityResult {
	disposableMin: number;
	meetingMin: number;
	followUpMin: number;
	/** 実際に使える時間。控除しきって負になることもある（＝すでに破綻している）。 */
	availableMin: number;
	/** doing 列の estimate 合計。 */
	committedMin: number;
	isOver: boolean;
}

/** ISO datetime が指定日（ローカル日付）に属するか。 */
function isOnDate(iso: string | undefined, date: Date): boolean {
	if (!iso) return false;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return false;
	return (
		d.getFullYear() === date.getFullYear() &&
		d.getMonth() === date.getMonth() &&
		d.getDate() === date.getDate()
	);
}

/** 当日の会議時間合計（分）。done の会議も当日枠は消費済みなので含める。 */
export function meetingMinutesOn(tasks: readonly Task[], date: Date): number {
	return tasks
		.filter((t) => t.type === 'meeting' && isOnDate(t.meeting?.start, date))
		.reduce((sum, t) => sum + (t.meeting?.duration ?? 0), 0);
}

export function calcCapacity(
	tasks: readonly Task[],
	input: CapacityInput,
	today: Date,
): CapacityResult {
	const meetingMin = meetingMinutesOn(tasks, today);
	const waitingCount = tasks.filter((t) => t.status === 'waiting').length;
	const followUpMin = waitingCount * input.followUpCostMin;

	const availableMin = input.disposableMin - meetingMin - followUpMin;
	const committedMin = tasks
		.filter((t) => t.status === 'doing')
		.reduce((sum, t) => sum + t.estimate, 0);

	return {
		disposableMin: input.disposableMin,
		meetingMin,
		followUpMin,
		availableMin,
		committedMin,
		isOver: committedMin > availableMin,
	};
}
