import type { Task, TaskStatus, TaskType } from '../src/domain/types';

let seq = 0;

/** テスト用 Task ファクトリ。指定しない項目は無害な既定値で埋める。 */
export function makeTask(overrides: Partial<Task> = {}): Task {
	const now = new Date('2026-07-19T09:00:00.000Z').toISOString();
	seq += 1;
	return {
		path: `tasks/task-${seq}.md`,
		title: `Task ${seq}`,
		type: 'task' as TaskType,
		status: 'backlog' as TaskStatus,
		sortKey: 0,
		estimate: 0,
		expedite: false,
		statusChangedAt: now,
		createdAt: now,
		mtime: 0,
		...overrides,
	};
}

export function daysAgo(from: Date, days: number): string {
	return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
