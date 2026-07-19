/**
 * イベントログ（要求 §5, §8）。
 *
 * WIP超過・Expedite・会議判断・プランニング実施を JSONL で記録する。
 * 成功指標は「4週間の自己運用」で判定するため、後から遡れない。初回リリースから記録を始める。
 *
 * 保存先はプラグインのデータフォルダ配下（Vault のノートとしては見せない）。
 */

import type { App } from 'obsidian';

export type LogEventType =
	| 'wip-exceeded'
	| 'expedite-started'
	| 'meeting-declined'
	| 'meeting-shortened'
	| 'planning-completed'
	| 'planning-skipped';

export interface LogEvent {
	/** ISO datetime */
	at: string;
	type: LogEventType;
	/** 対象タスクのパス（あれば） */
	path?: string;
	/** WIP超過時の理由入力など */
	note?: string;
	/** 型ごとの付随データ（超過件数、短縮した分数など） */
	value?: number;
}

export class EventLog {
	private buffer: LogEvent[] = [];
	private flushing = false;

	constructor(
		private readonly app: App,
		private readonly filePath: string,
	) {}

	async record(event: Omit<LogEvent, 'at'>): Promise<void> {
		this.buffer.push({ at: new Date().toISOString(), ...event });
		await this.flush();
	}

	/**
	 * バッファを追記する。
	 * adapter.append() は存在しないファイルに対して失敗しうるので、先に作る。
	 */
	private async flush(): Promise<void> {
		if (this.flushing || this.buffer.length === 0) return;
		this.flushing = true;
		const pending = this.buffer;
		this.buffer = [];

		try {
			const { adapter } = this.app.vault;
			const dir = this.filePath.slice(0, this.filePath.lastIndexOf('/'));
			if (dir && !(await adapter.exists(dir))) {
				await adapter.mkdir(dir);
			}
			if (!(await adapter.exists(this.filePath))) {
				await adapter.write(this.filePath, '');
			}
			const lines = pending.map((e) => JSON.stringify(e)).join('\n') + '\n';
			await adapter.append(this.filePath, lines);
		} catch (err) {
			// 書き戻して次回リトライ。ログの失敗で操作自体を止めない。
			this.buffer = [...pending, ...this.buffer];
			console.error('[task-manager] failed to write event log', err);
		} finally {
			this.flushing = false;
		}
	}

	/** 期間内のイベントを読む。週次サマリーの集計元。 */
	async readSince(since: Date): Promise<LogEvent[]> {
		const { adapter } = this.app.vault;
		if (!(await adapter.exists(this.filePath))) return [];

		const raw = await adapter.read(this.filePath);
		const events: LogEvent[] = [];
		for (const line of raw.split('\n')) {
			if (!line.trim()) continue;
			try {
				const event = JSON.parse(line) as LogEvent;
				if (new Date(event.at) >= since) events.push(event);
			} catch {
				// 壊れた行は捨てる。ログの1行のためにサマリーを落とさない。
			}
		}
		return events;
	}

	async countSince(since: Date, type: LogEventType): Promise<number> {
		const events = await this.readSince(since);
		return events.filter((e) => e.type === type).length;
	}
}
