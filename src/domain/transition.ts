/**
 * 状態遷移の妥当性判定（要求 §3.2）。
 *
 * backlog → ready → doing → done を標準線とするが、実運用では差し戻しも
 * 起きるため任意遷移を許す。禁止するのではなく、状態の意味を保つための
 * 副作用（statusChangedAt 更新など）を漏らさないことを目的とする。
 */

import type { Task, TaskStatus } from './types';

export interface TransitionEffect {
	status: TaskStatus;
	statusChangedAt: string;
	/** waiting へ移す＝委譲成立。delegated_at を立てる。 */
	delegatedAt?: string;
	/** Expedite 着手時のみ。 */
	expediteStarted?: string;
	expediteInterrupted?: string;
}

/**
 * 遷移に伴って frontmatter へ反映すべき変更一式を返す。
 * status だけを書き換えて statusChangedAt を忘れると腐敗検知が壊れるため、
 * 遷移の副作用はここに集約する。
 */
export function planTransition(
	task: Task,
	target: TaskStatus,
	now: Date,
	options: { interruptedTaskLink?: string } = {},
): TransitionEffect {
	const nowIso = now.toISOString();
	const effect: TransitionEffect = {
		status: target,
		statusChangedAt: nowIso,
	};

	// 委譲タスクが waiting に入った時点を委譲成立とみなす（要求 §F8）。
	if (target === 'waiting' && task.type === 'delegated' && !task.delegation?.delegatedAt) {
		effect.delegatedAt = nowIso;
	}

	// Expedite タスクの着手を記録（要求 §F3）。着手日時は最初の1回だけ。
	if (target === 'doing' && task.expedite && !task.expediteStarted) {
		effect.expediteStarted = nowIso;
		if (options.interruptedTaskLink) {
			effect.expediteInterrupted = options.interruptedTaskLink;
		}
	}

	return effect;
}

/** Expedite 着手時に「中断された」とみなす doing タスク群。 */
export function findInterruptedTasks(tasks: readonly Task[]): Task[] {
	return tasks.filter((t) => t.status === 'doing' && !t.expedite);
}

export function isSameStatus(task: Task, target: TaskStatus): boolean {
	return task.status === target;
}
