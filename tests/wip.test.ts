import { describe, expect, it } from 'vitest';
import { countWip, evaluateWip, wouldExceedWip } from '../src/domain/wip';
import { makeTask } from './helpers';

describe('countWip', () => {
	it('doing のみを数える', () => {
		const tasks = [
			makeTask({ status: 'doing' }),
			makeTask({ status: 'doing' }),
			makeTask({ status: 'ready' }),
			makeTask({ status: 'backlog' }),
			makeTask({ status: 'done' }),
		];
		expect(countWip(tasks)).toBe(2);
	});

	it('waiting はカウント外（要求 §3.2）', () => {
		const tasks = [
			makeTask({ status: 'doing' }),
			makeTask({ status: 'waiting' }),
			makeTask({ status: 'waiting' }),
		];
		expect(countWip(tasks)).toBe(1);
	});

	it('Expedite はカウント外（要求 §3.2）', () => {
		const tasks = [
			makeTask({ status: 'doing' }),
			makeTask({ status: 'doing', expedite: true }),
			makeTask({ status: 'doing', expedite: true }),
		];
		expect(countWip(tasks)).toBe(1);
	});
});

describe('evaluateWip', () => {
	it('上限ちょうどは超過ではない', () => {
		const tasks = [1, 2, 3].map(() => makeTask({ status: 'doing' }));
		expect(evaluateWip(tasks, 3)).toMatchObject({ count: 3, exceeded: false, overBy: 0 });
	});

	it('上限を1件超えると exceeded', () => {
		const tasks = [1, 2, 3, 4].map(() => makeTask({ status: 'doing' }));
		expect(evaluateWip(tasks, 3)).toMatchObject({ count: 4, exceeded: true, overBy: 1 });
	});
});

describe('wouldExceedWip（UI操作のブロック判定）', () => {
	const doing = [1, 2, 3].map(() => makeTask({ status: 'doing' }));

	it('上限に達している状態で4件目を doing に入れるとブロック', () => {
		const incoming = makeTask({ status: 'ready' });
		expect(wouldExceedWip([...doing, incoming], incoming.path, 'doing', 3)).toBe(true);
	});

	it('doing 以外への移動はブロックしない', () => {
		const incoming = makeTask({ status: 'ready' });
		expect(wouldExceedWip([...doing, incoming], incoming.path, 'waiting', 3)).toBe(false);
	});

	it('Expedite タスクは上限に関わらず doing に入れる', () => {
		const incoming = makeTask({ status: 'ready', expedite: true });
		expect(wouldExceedWip([...doing, incoming], incoming.path, 'doing', 3)).toBe(false);
	});

	it('すでに doing にあるカードの並べ替えはブロックしない', () => {
		expect(wouldExceedWip(doing, doing[0].path, 'doing', 3)).toBe(false);
	});
});
