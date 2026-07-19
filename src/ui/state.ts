/**
 * ボードのリアクティブ状態。
 *
 * TaskRepository（Obsidian側）から一方向に流し込むだけの箱。
 * 派生値（WIP評価・キャパシティ・腐敗フラグ）は各コンポーネントで $derived する。
 *
 * runes ($state) ではなく svelte/store を使う理由:
 * esbuild-svelte は .svelte ファイルしかコンパイルしないため、.svelte.ts に書いた
 * モジュールレベルの $state() は未変換のまま出力され、実行時に ReferenceError になる。
 * store なら素の JS なのでバンドラを問わない。
 */

import { writable } from 'svelte/store';
import { DEFAULT_SETTINGS, type PluginSettings } from '../infra/settings';
import type { Task } from '../domain/types';

export const tasksStore = writable<Task[]>([]);
export const settingsStore = writable<PluginSettings>(DEFAULT_SETTINGS);

/**
 * 「今」。滞留日数やキャパシティの基準。
 * 日付をまたいだまま開きっぱなしでも表示が古びないよう、定期的に進める。
 */
export const nowStore = writable<Date>(new Date());

export const isMobileStore = writable<boolean>(false);

export function setTasks(tasks: Task[]): void {
	tasksStore.set(tasks);
}

export function setSettings(settings: PluginSettings): void {
	settingsStore.set(settings);
}

export function setIsMobile(value: boolean): void {
	isMobileStore.set(value);
}

export function tickNow(): void {
	nowStore.set(new Date());
}
