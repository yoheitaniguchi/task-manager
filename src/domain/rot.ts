/**
 * 腐敗検知（要求 §F9 / §F8）。
 *
 * 1) backlog 滞留がしきい値超え
 * 2) 委譲の expected_by 超過
 * 3) 委譲後、状態変化なしのまま一定日数経過
 */

import type { Task } from './types';

export type RotKind = 'stale-backlog' | 'overdue-delegation' | 'silent-delegation';

export interface RotFlag {
	path: string;
	kind: RotKind;
	/** 経過日数。バッジに出す。 */
	days: number;
}

export interface RotInput {
	/** backlog 滞留のしきい値（日）。既定 14。 */
	staleBacklogDays: number;
	/** 委譲後、無変化を警告するまでの日数。既定 7。 */
	silentDelegationDays: number;
}

export const DEFAULT_ROT_INPUT: RotInput = {
	staleBacklogDays: 14,
	silentDelegationDays: 7,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string | undefined, now: Date): number | null {
	if (!fromIso) return null;
	const from = new Date(fromIso);
	if (Number.isNaN(from.getTime())) return null;
	return Math.floor((now.getTime() - from.getTime()) / MS_PER_DAY);
}

export function detectRot(
	tasks: readonly Task[],
	input: RotInput,
	now: Date,
): RotFlag[] {
	const flags: RotFlag[] = [];

	for (const task of tasks) {
		if (task.status === 'done') continue;

		if (task.status === 'backlog') {
			const days = daysBetween(task.createdAt, now);
			if (days !== null && days > input.staleBacklogDays) {
				flags.push({ path: task.path, kind: 'stale-backlog', days });
			}
		}

		if (task.type === 'delegated') {
			const expectedBy = task.delegation?.expectedBy;
			if (expectedBy) {
				const overdueDays = daysBetween(expectedBy, now);
				if (overdueDays !== null && overdueDays > 0) {
					flags.push({ path: task.path, kind: 'overdue-delegation', days: overdueDays });
				}
			}

			// expected_by とは独立に発火させる（要求 §F8：「委譲後7日間状態変化なしでも警告」）。
			const silentDays = daysBetween(task.statusChangedAt, now);
			if (silentDays !== null && silentDays >= input.silentDelegationDays) {
				flags.push({ path: task.path, kind: 'silent-delegation', days: silentDays });
			}
		}
	}

	return flags;
}

/** パス単位で引けるようにまとめる。カードのバッジ描画用。 */
export function groupRotByPath(flags: readonly RotFlag[]): Map<string, RotFlag[]> {
	const map = new Map<string, RotFlag[]>();
	for (const flag of flags) {
		const list = map.get(flag.path);
		if (list) list.push(flag);
		else map.set(flag.path, [flag]);
	}
	return map;
}
