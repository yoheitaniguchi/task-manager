/**
 * fractional indexing。
 * 並べ替え時に書き換えるのは移動したファイル1件のみ（要求 §5）。
 */

/** これを下回ったら倍精度が枯渇しかけているとみなす。 */
export const MIN_GAP = 1e-9;

export const REBALANCE_STEP = 1;

/**
 * prev と next の間に入る sort_key を返す。
 * prev 省略 = 先頭挿入、next 省略 = 末尾挿入。
 */
export function between(prev?: number, next?: number): number {
	if (prev === undefined && next === undefined) return 0;
	if (prev === undefined) return next! - REBALANCE_STEP;
	if (next === undefined) return prev + REBALANCE_STEP;
	return (prev + next) / 2;
}

/**
 * 同一箇所への反復挿入で倍精度が尽きる前に検知する。
 * true なら between() の結果は使わず、その列を再配分する。
 */
export function needsRebalance(prev?: number, next?: number): boolean {
	if (prev === undefined || next === undefined) return false;
	return Math.abs(next - prev) < MIN_GAP;
}

/**
 * 列全体を整数連番へ振り直す。
 * 通常運用では発生しないが、発生時はこの列の全ファイルを書き換える必要がある。
 */
export function rebalance<T extends { path: string; sortKey: number }>(
	items: readonly T[],
): Array<{ path: string; sortKey: number }> {
	return [...items]
		.sort((a, b) => a.sortKey - b.sortKey)
		.map((item, i) => ({ path: item.path, sortKey: i * REBALANCE_STEP }));
}

/**
 * 列内の index 番目の位置へ移動させたときの sort_key を求める。
 * `moving` 自身は列から除外して前後を決める（自分を基準にしてしまうと動かない）。
 */
export function sortKeyForPosition<T extends { path: string; sortKey: number }>(
	column: readonly T[],
	movingPath: string,
	targetIndex: number,
): { sortKey: number; rebalanceNeeded: boolean } {
	const others = column
		.filter((t) => t.path !== movingPath)
		.sort((a, b) => a.sortKey - b.sortKey);

	const clamped = Math.max(0, Math.min(targetIndex, others.length));
	const prev = clamped > 0 ? others[clamped - 1].sortKey : undefined;
	const next = clamped < others.length ? others[clamped].sortKey : undefined;

	return {
		sortKey: between(prev, next),
		rebalanceNeeded: needsRebalance(prev, next),
	};
}
