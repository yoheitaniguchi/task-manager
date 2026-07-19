/**
 * frontmatter ⇄ Task の変換。
 *
 * frontmatter のキー名（snake_case）がリテラルで登場してよいのはこのファイルだけ。
 * 他所は必ず Task 型のプロパティ経由でアクセスすること。
 */

import {
	MEETING_ROLES,
	TASK_STATUSES,
	TASK_TYPES,
	type MeetingRole,
	type Task,
	type TaskStatus,
	type TaskType,
} from './types';

/** frontmatter のキー名。書き込み側もここを参照する。 */
export const FM = {
	type: 'type',
	status: 'status',
	sortKey: 'sort_key',
	estimate: 'estimate',
	due: 'due',
	project: 'project',
	ticketUrl: 'ticket_url',
	expedite: 'expedite',
	expediteStarted: 'expedite_started',
	expediteInterrupted: 'expedite_interrupted',

	meetingRole: 'meeting_role',
	replaceable: 'replaceable',
	attendees: 'attendees',
	meetingStart: 'meeting_start',
	meetingDuration: 'meeting_duration',
	meetingUid: 'meeting_uid',

	assignee: 'assignee',
	delegatedAt: 'delegated_at',
	expectedBy: 'expected_by',

	statusChangedAt: 'status_changed_at',
	createdAt: 'created_at',
} as const;

/** 未設定時の既定値（要求 §F4：meeting_role / replaceable の既定は contribute / false）。 */
export const DEFAULTS = {
	status: 'backlog' as TaskStatus,
	estimate: 0,
	expedite: false,
	meetingRole: 'contribute' as MeetingRole,
	replaceable: false,
	attendees: 1,
	meetingDuration: 0,
} as const;

export type Frontmatter = Record<string, unknown>;

function asString(v: unknown): string | undefined {
	if (typeof v === 'string' && v.trim() !== '') return v;
	if (typeof v === 'number') return String(v);
	return undefined;
}

function asNumber(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return fallback;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'string') {
		const s = v.trim().toLowerCase();
		if (s === 'true') return true;
		if (s === 'false') return false;
	}
	return fallback;
}

function asEnum<T extends string>(
	v: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	const s = typeof v === 'string' ? v.trim().toLowerCase() : undefined;
	return s !== undefined && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/**
 * frontmatter がタスクノートのものかを判定する。
 * TaskRepository の Vault 走査フィルタ。
 */
export function isTaskFrontmatter(fm: Frontmatter | undefined | null): boolean {
	if (!fm) return false;
	const t = fm[FM.type];
	return typeof t === 'string' && (TASK_TYPES as readonly string[]).includes(t.trim().toLowerCase());
}

export interface ParseContext {
	path: string;
	title: string;
	mtime: number;
	/** frontmatter に created_at / status_changed_at が無い旧ノート用のフォールバック（ファイルの ctime 等）。 */
	fallbackTimestamp: string;
}

/**
 * frontmatter から Task を組み立てる。
 * 不正値は握りつぶして既定値に倒す（Vault は手編集されうるので、1件の壊れた値で
 * ボード全体が落ちる方が害が大きい）。
 */
export function parseTask(fm: Frontmatter, ctx: ParseContext): Task {
	const type = asEnum<TaskType>(fm[FM.type], TASK_TYPES, 'task');
	const status = asEnum<TaskStatus>(fm[FM.status], TASK_STATUSES, DEFAULTS.status);

	const task: Task = {
		path: ctx.path,
		title: ctx.title,
		type,
		status,
		sortKey: asNumber(fm[FM.sortKey], 0),
		estimate: asNumber(fm[FM.estimate], DEFAULTS.estimate),
		due: asString(fm[FM.due]),
		project: asString(fm[FM.project]),
		ticketUrl: asString(fm[FM.ticketUrl]),
		expedite: asBoolean(fm[FM.expedite], DEFAULTS.expedite),
		expediteStarted: asString(fm[FM.expediteStarted]),
		expediteInterrupted: asString(fm[FM.expediteInterrupted]),
		statusChangedAt: asString(fm[FM.statusChangedAt]) ?? ctx.fallbackTimestamp,
		createdAt: asString(fm[FM.createdAt]) ?? ctx.fallbackTimestamp,
		mtime: ctx.mtime,
	};

	if (type === 'meeting') {
		task.meeting = {
			role: asEnum<MeetingRole>(fm[FM.meetingRole], MEETING_ROLES, DEFAULTS.meetingRole),
			replaceable: asBoolean(fm[FM.replaceable], DEFAULTS.replaceable),
			attendees: asNumber(fm[FM.attendees], DEFAULTS.attendees),
			start: asString(fm[FM.meetingStart]),
			duration: asNumber(fm[FM.meetingDuration], DEFAULTS.meetingDuration),
			uid: asString(fm[FM.meetingUid]),
		};
	}

	if (type === 'delegated') {
		task.delegation = {
			assignee: asString(fm[FM.assignee]),
			delegatedAt: asString(fm[FM.delegatedAt]),
			expectedBy: asString(fm[FM.expectedBy]),
		};
	}

	return task;
}

/**
 * 新規タスクノート用の frontmatter を組み立てる。
 * 空の任意項目はキーごと落とす（frontmatter に null が並ぶのを避ける）。
 */
export function buildFrontmatter(task: Partial<Task> & { type: TaskType }): Frontmatter {
	const now = new Date().toISOString();
	const fm: Frontmatter = {
		[FM.type]: task.type,
		[FM.status]: task.status ?? DEFAULTS.status,
		[FM.sortKey]: task.sortKey ?? 0,
		[FM.estimate]: task.estimate ?? DEFAULTS.estimate,
		[FM.expedite]: task.expedite ?? DEFAULTS.expedite,
		[FM.createdAt]: task.createdAt ?? now,
		[FM.statusChangedAt]: task.statusChangedAt ?? now,
	};

	if (task.due) fm[FM.due] = task.due;
	if (task.project) fm[FM.project] = task.project;
	if (task.ticketUrl) fm[FM.ticketUrl] = task.ticketUrl;

	if (task.type === 'meeting' && task.meeting) {
		fm[FM.meetingRole] = task.meeting.role;
		fm[FM.replaceable] = task.meeting.replaceable;
		fm[FM.attendees] = task.meeting.attendees;
		fm[FM.meetingDuration] = task.meeting.duration;
		if (task.meeting.start) fm[FM.meetingStart] = task.meeting.start;
		if (task.meeting.uid) fm[FM.meetingUid] = task.meeting.uid;
	}

	if (task.type === 'delegated' && task.delegation) {
		if (task.delegation.assignee) fm[FM.assignee] = task.delegation.assignee;
		if (task.delegation.delegatedAt) fm[FM.delegatedAt] = task.delegation.delegatedAt;
		if (task.delegation.expectedBy) fm[FM.expectedBy] = task.delegation.expectedBy;
	}

	return fm;
}
