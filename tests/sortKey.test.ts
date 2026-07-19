import { describe, expect, it } from 'vitest';
import {
	MIN_GAP,
	between,
	needsRebalance,
	rebalance,
	sortKeyForPosition,
} from '../src/domain/sortKey';

describe('between', () => {
	it('先頭挿入は next より小さい', () => {
		expect(between(undefined, 5)).toBeLessThan(5);
	});

	it('末尾挿入は prev より大きい', () => {
		expect(between(5, undefined)).toBeGreaterThan(5);
	});

	it('中間挿入は両者の間に入る', () => {
		const key = between(1, 2);
		expect(key).toBeGreaterThan(1);
		expect(key).toBeLessThan(2);
	});

	it('空の列では 0', () => {
		expect(between()).toBe(0);
	});
});

describe('needsRebalance', () => {
	it('十分な gap があれば false', () => {
		expect(needsRebalance(1, 2)).toBe(false);
	});

	it('gap が枯渇しかけたら true', () => {
		expect(needsRebalance(1, 1 + MIN_GAP / 2)).toBe(true);
	});

	it('端（片側 undefined）では常に false', () => {
		expect(needsRebalance(undefined, 1)).toBe(false);
		expect(needsRebalance(1, undefined)).toBe(false);
	});

	it('同一箇所への反復挿入で最終的に発火する', () => {
		let prev = 0;
		let next = 1;
		let fired = false;
		for (let i = 0; i < 100; i++) {
			if (needsRebalance(prev, next)) {
				fired = true;
				break;
			}
			next = between(prev, next);
		}
		expect(fired).toBe(true);
	});
});

describe('rebalance', () => {
	it('sort_key 順を保ったまま整数連番へ振り直す', () => {
		const items = [
			{ path: 'c.md', sortKey: 0.5000001 },
			{ path: 'a.md', sortKey: 0.5 },
			{ path: 'b.md', sortKey: 0.50000005 },
		];
		expect(rebalance(items)).toEqual([
			{ path: 'a.md', sortKey: 0 },
			{ path: 'b.md', sortKey: 1 },
			{ path: 'c.md', sortKey: 2 },
		]);
	});
});

describe('sortKeyForPosition', () => {
	const column = [
		{ path: 'a.md', sortKey: 0 },
		{ path: 'b.md', sortKey: 1 },
		{ path: 'c.md', sortKey: 2 },
	];

	it('先頭へ移動', () => {
		const { sortKey } = sortKeyForPosition(column, 'c.md', 0);
		expect(sortKey).toBeLessThan(0);
	});

	it('末尾へ移動', () => {
		const { sortKey } = sortKeyForPosition(column, 'a.md', 2);
		expect(sortKey).toBeGreaterThan(2);
	});

	it('中間へ移動すると前後の間に入る', () => {
		const { sortKey } = sortKeyForPosition(column, 'a.md', 1);
		expect(sortKey).toBeGreaterThan(1);
		expect(sortKey).toBeLessThan(2);
	});

	it('自分自身を基準にしない（移動元を除外して前後を決める）', () => {
		// 'b.md' を index 0 に動かすなら、残り [a, c] の先頭＝a より小さくなる。
		const { sortKey } = sortKeyForPosition(column, 'b.md', 0);
		expect(sortKey).toBeLessThan(0);
	});

	it('範囲外の index は列の端に丸める', () => {
		const { sortKey } = sortKeyForPosition(column, 'a.md', 999);
		expect(sortKey).toBeGreaterThan(2);
	});
});
