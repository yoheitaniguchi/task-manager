/**
 * WIP 摩擦設計（要求 §F2）。
 *
 * UI 経由の超過はブロックし、frontmatter 直接編集による超過は事後検知する。
 * どちらも判定はこの evaluateWip() 一本に集約し、入口だけを変える。
 */

import type { Task } from './types';

export interface WipEvaluation {
	count: number;
	limit: number;
	exceeded: boolean;
	/** 上限をいくつ超えているか（超過していなければ 0）。 */
	overBy: number;
}

/**
 * doing 列の WIP 実数。
 * waiting は要求 §3.2 でカウント外、Expedite も専用レーンでカウント外。
 */
export function countWip(tasks: readonly Task[]): number {
	return tasks.filter((t) => t.status === 'doing' && !t.expedite).length;
}

export function evaluateWip(tasks: readonly Task[], limit: number): WipEvaluation {
	const count = countWip(tasks);
	return {
		count,
		limit,
		exceeded: count > limit,
		overBy: Math.max(0, count - limit),
	};
}

/**
 * UI 操作でこの遷移を許可してよいか。
 * ここで false を返す＝D&D をブロックする（未然防止）。
 */
export function wouldExceedWip(
	tasks: readonly Task[],
	movingTaskPath: string,
	targetStatus: Task['status'],
	limit: number,
): boolean {
	if (targetStatus !== 'doing') return false;

	const moving = tasks.find((t) => t.path === movingTaskPath);
	// Expedite は WIP 枠外なので、doing に入れても上限に影響しない。
	if (moving?.expedite) return false;
	// すでに doing にあるものの並べ替えは件数を変えない。
	if (moving?.status === 'doing') return false;

	return countWip(tasks) + 1 > limit;
}
