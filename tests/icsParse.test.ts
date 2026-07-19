import { describe, expect, it } from 'vitest';
import { dedupeByUid, parseIcsForDate } from '../src/infra/icsParse';

/** ローカル時刻での ICS 日時文字列（TZ 依存を避けるため浮動時刻で書く）。 */
function local(y: number, mo: number, d: number, h: number, mi: number): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${y}${p(mo)}${p(d)}T${p(h)}${p(mi)}00`;
}

function wrap(...vevents: string[]): string {
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//test//EN',
		...vevents,
		'END:VCALENDAR',
	].join('\r\n');
}

function vevent(opts: {
	uid: string;
	summary: string;
	start: string;
	end: string;
	rrule?: string;
	exdate?: string;
	attendees?: number;
	allDay?: boolean;
}): string {
	const lines = ['BEGIN:VEVENT', `UID:${opts.uid}`, `SUMMARY:${opts.summary}`];
	if (opts.allDay) {
		lines.push(`DTSTART;VALUE=DATE:${opts.start}`, `DTEND;VALUE=DATE:${opts.end}`);
	} else {
		lines.push(`DTSTART:${opts.start}`, `DTEND:${opts.end}`);
	}
	if (opts.rrule) lines.push(`RRULE:${opts.rrule}`);
	if (opts.exdate) lines.push(`EXDATE:${opts.exdate}`);
	for (let i = 0; i < (opts.attendees ?? 0); i++) {
		lines.push(`ATTENDEE;CN=Person${i}:mailto:p${i}@example.com`);
	}
	lines.push('END:VEVENT');
	return lines.join('\r\n');
}

const TARGET = new Date(2026, 6, 19); // 2026-07-19

describe('parseIcsForDate', () => {
	it('当日の単発予定を取り出す', () => {
		const ics = wrap(
			vevent({
				uid: 'a@example.com',
				summary: '定例レビュー',
				start: local(2026, 7, 19, 10, 0),
				end: local(2026, 7, 19, 11, 0),
			}),
		);

		const events = parseIcsForDate(ics, TARGET);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ title: '定例レビュー', durationMin: 60 });
	});

	it('別日の予定は含めない', () => {
		const ics = wrap(
			vevent({
				uid: 'b@example.com',
				summary: '明日の会議',
				start: local(2026, 7, 20, 10, 0),
				end: local(2026, 7, 20, 11, 0),
			}),
		);
		expect(parseIcsForDate(ics, TARGET)).toHaveLength(0);
	});

	it('終日予定は会議として扱わない', () => {
		const ics = wrap(
			vevent({
				uid: 'c@example.com',
				summary: '有給',
				start: '20260719',
				end: '20260720',
				allDay: true,
			}),
		);
		expect(parseIcsForDate(ics, TARGET)).toHaveLength(0);
	});

	it('毎週の定例を当日分だけ展開する', () => {
		// 7/5 開始の毎週日曜。7/19 は3回目。
		const ics = wrap(
			vevent({
				uid: 'd@example.com',
				summary: '週次定例',
				start: local(2026, 7, 5, 9, 0),
				end: local(2026, 7, 5, 9, 30),
				rrule: 'FREQ=WEEKLY;COUNT=10',
			}),
		);

		const events = parseIcsForDate(ics, TARGET);
		expect(events).toHaveLength(1);
		expect(events[0].durationMin).toBe(30);
		expect(events[0].start.getDate()).toBe(19);
	});

	it('EXDATE で除外された回は展開しない', () => {
		const ics = wrap(
			vevent({
				uid: 'e@example.com',
				summary: '週次定例',
				start: local(2026, 7, 5, 9, 0),
				end: local(2026, 7, 5, 9, 30),
				rrule: 'FREQ=WEEKLY;COUNT=10',
				exdate: local(2026, 7, 19, 9, 0),
			}),
		);
		expect(parseIcsForDate(ics, TARGET)).toHaveLength(0);
	});

	it('参加人数を ATTENDEE から数える', () => {
		const ics = wrap(
			vevent({
				uid: 'f@example.com',
				summary: '大人数会議',
				start: local(2026, 7, 19, 14, 0),
				end: local(2026, 7, 19, 15, 0),
				attendees: 6,
			}),
		);
		expect(parseIcsForDate(ics, TARGET)[0].attendees).toBe(6);
	});

	it('ATTENDEE が無ければ 1 人として扱う', () => {
		const ics = wrap(
			vevent({
				uid: 'g@example.com',
				summary: '1on1',
				start: local(2026, 7, 19, 14, 0),
				end: local(2026, 7, 19, 15, 0),
			}),
		);
		expect(parseIcsForDate(ics, TARGET)[0].attendees).toBe(1);
	});

	it('開始時刻順に並べる', () => {
		const ics = wrap(
			vevent({
				uid: 'late@example.com',
				summary: '午後',
				start: local(2026, 7, 19, 15, 0),
				end: local(2026, 7, 19, 16, 0),
			}),
			vevent({
				uid: 'early@example.com',
				summary: '午前',
				start: local(2026, 7, 19, 9, 0),
				end: local(2026, 7, 19, 10, 0),
			}),
		);
		expect(parseIcsForDate(ics, TARGET).map((e) => e.title)).toEqual(['午前', '午後']);
	});

	it('繰り返し予定の UID は発生日時まで含めて一意になる', () => {
		const ics = wrap(
			vevent({
				uid: 'h@example.com',
				summary: '週次定例',
				start: local(2026, 7, 5, 9, 0),
				end: local(2026, 7, 5, 9, 30),
				rrule: 'FREQ=WEEKLY;COUNT=10',
			}),
		);

		const thisWeek = parseIcsForDate(ics, TARGET)[0];
		const nextWeek = parseIcsForDate(ics, new Date(2026, 6, 26))[0];
		expect(thisWeek.uid).not.toBe(nextWeek.uid);
	});
});

describe('dedupeByUid', () => {
	it('同一UIDを1件に畳む', () => {
		const base = { title: 'x', start: new Date(), durationMin: 30, attendees: 1 };
		const result = dedupeByUid([
			{ uid: 'same', ...base },
			{ uid: 'same', ...base },
			{ uid: 'other', ...base },
		]);
		expect(result.map((e) => e.uid)).toEqual(['same', 'other']);
	});
});
