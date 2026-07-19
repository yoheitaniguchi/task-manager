/**
 * ICS購読の取得（要求 §F4）。
 * パース自体は icsParse.ts（Obsidian非依存）に委ねる。
 */

import { requestUrl } from 'obsidian';
import { dedupeByUid, parseIcsForDate, type MeetingEvent } from './icsParse';

export type { MeetingEvent } from './icsParse';

export class IcsClient {
	/**
	 * 設定された全URLから指定日の予定を集める。
	 * 1つのURLが落ちても他は活かす（片方のカレンダーの障害で当日分が全滅しないように）。
	 */
	async fetchForDate(urls: readonly string[], date: Date): Promise<MeetingEvent[]> {
		const all: MeetingEvent[] = [];

		for (const url of urls) {
			const trimmed = url.trim();
			if (!trimmed) continue;
			try {
				// CORS を回避するため fetch ではなく Obsidian の requestUrl を使う。
				const response = await requestUrl({ url: trimmed, method: 'GET' });
				all.push(...parseIcsForDate(response.text, date));
			} catch (err) {
				console.error(`[task-manager] failed to fetch ICS: ${trimmed}`, err);
			}
		}

		return dedupeByUid(all);
	}
}
