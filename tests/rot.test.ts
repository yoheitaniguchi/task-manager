import { describe, expect, it } from 'vitest';
import { DEFAULT_ROT_INPUT, detectRot } from '../src/domain/rot';
import { daysAgo, makeTask } from './helpers';

const NOW = new Date('2026-07-19T09:00:00.000Z');

function kinds(tasks: Parameters<typeof detectRot>[0]) {
	return detectRot(tasks, DEFAULT_ROT_INPUT, NOW).map((f) => f.kind);
}

describe('滞留 backlog', () => {
	it('しきい値を超えたら発火', () => {
		const t = makeTask({ status: 'backlog', createdAt: daysAgo(NOW, 15) });
		expect(kinds([t])).toContain('stale-backlog');
	});

	it('しきい値ちょうどでは発火しない（超過で発火）', () => {
		const t = makeTask({ status: 'backlog', createdAt: daysAgo(NOW, 14) });
		expect(kinds([t])).not.toContain('stale-backlog');
	});

	it('backlog 以外は対象外', () => {
		const t = makeTask({ status: 'ready', createdAt: daysAgo(NOW, 30) });
		expect(kinds([t])).not.toContain('stale-backlog');
	});

	it('done は一切検知しない', () => {
		const t = makeTask({ status: 'done', createdAt: daysAgo(NOW, 100) });
		expect(kinds([t])).toHaveLength(0);
	});
});

describe('委譲の expected_by 超過', () => {
	it('期待返答日を過ぎたら発火', () => {
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 1),
			delegation: { assignee: '田中', expectedBy: daysAgo(NOW, 2) },
		});
		expect(kinds([t])).toContain('overdue-delegation');
	});

	it('期待返答日が未来なら発火しない', () => {
		const future = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 1),
			delegation: { assignee: '田中', expectedBy: future },
		});
		expect(kinds([t])).not.toContain('overdue-delegation');
	});
});

describe('委譲後の無変化', () => {
	it('7日間状態変化なしで発火', () => {
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 7),
			delegation: { assignee: '田中' },
		});
		expect(kinds([t])).toContain('silent-delegation');
	});

	it('6日では発火しない', () => {
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 6),
			delegation: { assignee: '田中' },
		});
		expect(kinds([t])).not.toContain('silent-delegation');
	});

	it('expected_by 未設定でも発火する（要求 §F8）', () => {
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 10),
			delegation: { assignee: '田中' },
		});
		expect(kinds([t])).toEqual(['silent-delegation']);
	});

	it('expected_by 超過と無変化は同時に発火しうる', () => {
		const t = makeTask({
			type: 'delegated',
			status: 'waiting',
			statusChangedAt: daysAgo(NOW, 10),
			delegation: { assignee: '田中', expectedBy: daysAgo(NOW, 3) },
		});
		expect(kinds([t]).sort()).toEqual(['overdue-delegation', 'silent-delegation']);
	});
});
