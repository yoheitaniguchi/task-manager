/**
 * ボードUIからプラグイン本体へ戻すコールバック群。
 * Svelte コンポーネントが Obsidian API を直接叩かないための境界。
 */

import type { MeetingRole, Task, TaskStatus } from '../domain/types';

export interface BoardActions {
	/** カードを列 target の index 番目へ移動する。WIP判定・ログ記録は実装側の責務。 */
	moveTask(path: string, target: TaskStatus, index: number): Promise<void>;
	/** カードのノートを開く。 */
	openTask(path: string): Promise<void>;
	/** カードのコンテキストメニュー（モバイルの状態変更手段でもある）。 */
	showCardMenu(task: Task, event: MouseEvent): void;
	/** Expedite フラグの切り替え（要求 §F3）。 */
	toggleExpedite(path: string): Promise<void>;
	/** 会議カードの役割変更（要求 §F4）。 */
	setMeetingRole(path: string, role: MeetingRole): Promise<void>;
	/** 会議カードの代替可否の切り替え（要求 §F4）。 */
	toggleReplaceable(path: string): Promise<void>;
	/** 委譲の定型文エクスポート（要求 §F8）。 */
	exportDelegation(task: Task): void;
	/** デイリープランニングを開く（要求 §F6）。 */
	startPlanning(): void;
	/** ICS の手動更新（要求 §F4）。 */
	refreshMeetings(): Promise<void>;
}
