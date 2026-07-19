/**
 * ドメイン型定義。
 * この層は Obsidian API を一切 import しない（Vitest で純粋にテストするため）。
 */

export type TaskType = 'task' | 'meeting' | 'delegated';
export type TaskStatus = 'backlog' | 'ready' | 'doing' | 'waiting' | 'done';
export type MeetingRole = 'decision' | 'contribute' | 'listen';

export const TASK_TYPES: readonly TaskType[] = ['task', 'meeting', 'delegated'];
export const TASK_STATUSES: readonly TaskStatus[] = [
	'backlog',
	'ready',
	'doing',
	'waiting',
	'done',
];
export const MEETING_ROLES: readonly MeetingRole[] = ['decision', 'contribute', 'listen'];

/** ボードに描画する列の順序。Expedite は列ではなく横断レーンなので含めない。 */
export const BOARD_COLUMNS: readonly TaskStatus[] = [
	'backlog',
	'ready',
	'doing',
	'waiting',
	'done',
];

export interface MeetingFields {
	role: MeetingRole;
	replaceable: boolean;
	attendees: number;
	/** ISO datetime */
	start?: string;
	/** 分 */
	duration: number;
	/** ICS の UID。再取得時の重複排除に使う。 */
	uid?: string;
}

export interface DelegationFields {
	assignee?: string;
	/** ISO date */
	delegatedAt?: string;
	/** ISO date */
	expectedBy?: string;
}

export interface Task {
	/** Vault 内パス。タスクの同一性はこれで判定する。 */
	path: string;
	title: string;
	type: TaskType;
	status: TaskStatus;
	sortKey: number;
	/** 見積（分） */
	estimate: number;
	/** ISO date */
	due?: string;
	project?: string;
	ticketUrl?: string;

	expedite: boolean;
	/** ISO datetime。Expedite 着手時に自動記録。 */
	expediteStarted?: string;
	/** 中断したタスクへの wikilink。Expedite 着手時に自動記録。 */
	expediteInterrupted?: string;

	meeting?: MeetingFields;
	delegation?: DelegationFields;

	/**
	 * status が最後に変わった時刻（ISO datetime）。
	 * F9 の「委譲後7日間状態変化なし」検知に必須。要求の frontmatter 一覧には無いが、
	 * 状態変更時刻を永続化しないと検知が成立しないため追加している。
	 */
	statusChangedAt: string;
	/** ISO datetime。backlog 滞留日数の起点。 */
	createdAt: string;

	/** ファイルの mtime。競合検知に使う（infra が充填）。 */
	mtime: number;
}
