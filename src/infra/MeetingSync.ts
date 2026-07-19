/**
 * ICSイベント → 会議タスクノート（要求 §F4）。
 *
 * UID で既存ノートと突き合わせ、重複を作らない。
 * meeting_role / replaceable はユーザーがカード上で設定するものなので、
 * 再取得時に上書きしない（せっかくの判断を消さないため）。
 */

import { Notice } from 'obsidian';
import { FM } from '../domain/taskSchema';
import type { Task } from '../domain/types';
import type { IcsClient, MeetingEvent } from './IcsClient';
import type { NoteFactory } from './NoteFactory';
import type { PluginSettings } from './settings';
import type { TaskRepository } from './TaskRepository';

export interface SyncResult {
	created: number;
	updated: number;
	skipped: number;
}

export class MeetingSync {
	constructor(
		private readonly repo: TaskRepository,
		private readonly notes: NoteFactory,
		private readonly ics: IcsClient,
	) {}

	async syncForDate(settings: PluginSettings, date: Date): Promise<SyncResult> {
		const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

		if (settings.icsUrls.length === 0) return result;

		const events = await this.ics.fetchForDate(settings.icsUrls, date);
		const byUid = this.existingMeetingsByUid();

		for (const event of events) {
			const existing = byUid.get(event.uid);
			if (existing) {
				const changed = await this.updateExisting(existing, event);
				if (changed) result.updated += 1;
				else result.skipped += 1;
			} else {
				await this.createMeetingNote(event, settings);
				result.created += 1;
			}
		}

		return result;
	}

	private existingMeetingsByUid(): Map<string, Task> {
		const map = new Map<string, Task>();
		for (const task of this.repo.getAll()) {
			const uid = task.meeting?.uid;
			if (uid) map.set(uid, task);
		}
		return map;
	}

	/**
	 * 予定の変更（時刻・長さ・人数）だけを反映する。
	 * ユーザーが設定した meeting_role / replaceable と status には触れない。
	 */
	private async updateExisting(task: Task, event: MeetingEvent): Promise<boolean> {
		const startIso = event.start.toISOString();
		const unchanged =
			task.meeting?.start === startIso &&
			task.meeting?.duration === event.durationMin &&
			task.meeting?.attendees === event.attendees;

		if (unchanged) return false;

		const outcome = await this.repo.update(task.path, (fm) => {
			fm[FM.meetingStart] = startIso;
			fm[FM.meetingDuration] = event.durationMin;
			fm[FM.attendees] = event.attendees;
		});

		if (!outcome.ok && outcome.reason === 'conflict') {
			new Notice(`会議ノートが外部で編集されています: ${task.title}`);
		}
		return outcome.ok;
	}

	private async createMeetingNote(event: MeetingEvent, settings: PluginSettings): Promise<void> {
		await this.notes.createTaskNote({
			title: event.title,
			type: 'meeting',
			folder: settings.taskFolder,
			extra: {
				// 当日の予定として確定しているので ready から始める。
				status: 'ready',
				estimate: event.durationMin,
				meeting: {
					// 既定は contribute / false（要求 §F4）。カード上でユーザーが直す。
					role: 'contribute',
					replaceable: false,
					attendees: event.attendees,
					start: event.start.toISOString(),
					duration: event.durationMin,
					uid: event.uid,
				},
			},
			body: '\n## メモ\n\n',
		});
	}
}
