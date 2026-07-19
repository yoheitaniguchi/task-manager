/**
 * ICS 本文のパース（要求 §F4）。
 *
 * Obsidian API を import しない（ネットワーク取得は IcsClient 側の責務）。
 * 定例会議が正しく展開されないとキャパシティ計算がそのまま狂うため、
 * RRULE / EXDATE / RECURRENCE-ID の解釈は ical.js に委ねる。
 */

import ICAL from 'ical.js';

export interface MeetingEvent {
	/** 重複排除キー。繰り返し予定は発生日時まで含めて一意にする。 */
	uid: string;
	title: string;
	start: Date;
	/** 分 */
	durationMin: number;
	attendees: number;
}

/** 1日の繰り返し展開で打ち切る上限。壊れた RRULE で無限ループしないための安全弁。 */
const MAX_OCCURRENCES = 500;

function dayRange(date: Date): { start: Date; end: Date } {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	return { start, end };
}

/**
 * ICS 本文から指定日（ローカル日付）の予定を取り出す。
 * 終日予定は会議ではないので除外する。
 */
export function parseIcsForDate(icsText: string, date: Date): MeetingEvent[] {
	const { start: dayStart, end: dayEnd } = dayRange(date);
	const results: MeetingEvent[] = [];

	const comp = new ICAL.Component(ICAL.parse(icsText));

	for (const vevent of comp.getAllSubcomponents('vevent')) {
		let event: ICAL.Event;
		try {
			event = new ICAL.Event(vevent);
		} catch {
			continue; // 壊れた VEVENT 1件で当日分を全滅させない
		}

		if (event.startDate?.isDate) continue; // 終日予定

		const attendees = Math.max(1, event.attendees?.length ?? 1);
		const durationMin = Math.max(0, Math.round((event.duration?.toSeconds() ?? 0) / 60));

		if (event.isRecurring()) {
			const iterator = event.iterator();
			let count = 0;
			for (let next = iterator.next(); next && count < MAX_OCCURRENCES; next = iterator.next()) {
				count += 1;
				const occurrence = next.toJSDate();
				if (occurrence >= dayEnd) break;
				if (occurrence < dayStart) continue;

				results.push({
					uid: `${event.uid}#${next.toICALString()}`,
					title: event.summary ?? '(無題の予定)',
					start: occurrence,
					durationMin,
					attendees,
				});
			}
		} else {
			const startDate = event.startDate?.toJSDate();
			if (!startDate || startDate < dayStart || startDate >= dayEnd) continue;

			results.push({
				uid: event.uid,
				title: event.summary ?? '(無題の予定)',
				start: startDate,
				durationMin,
				attendees,
			});
		}
	}

	return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** 同一UIDを落とす。複数カレンダーに同じ予定が現れることがある。 */
export function dedupeByUid(events: readonly MeetingEvent[]): MeetingEvent[] {
	const seen = new Set<string>();
	return events.filter((e) => {
		if (seen.has(e.uid)) return false;
		seen.add(e.uid);
		return true;
	});
}
