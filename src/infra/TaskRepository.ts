/**
 * Vault とドメインの唯一の境界。
 *
 * - 読み取りは metadataCache の frontmatter のみ（ファイル本文は読まない）
 * - 書き込みは mtime 比較で競合検知してから processFrontMatter()
 * - status を変える経路は必ず statusChangedAt も更新する（腐敗検知の前提）
 */

import { TFile, type App, type EventRef } from 'obsidian';
import { planTransition } from '../domain/transition';
import { FM, isTaskFrontmatter, parseTask, type Frontmatter } from '../domain/taskSchema';
import type { Task, TaskStatus } from '../domain/types';

export type UpdateResult =
	| { ok: true }
	| { ok: false; reason: 'conflict' | 'missing' | 'error'; error?: unknown };

type Listener = (tasks: Task[]) => void;

export class TaskRepository {
	private cache = new Map<string, Task>();
	private listeners = new Set<Listener>();
	private eventRefs: EventRef[] = [];

	constructor(private readonly app: App) {}

	// --- ライフサイクル ---

	/** Vault 全体を走査してキャッシュを作り、以降の変更購読を始める。 */
	async initialize(): Promise<void> {
		this.cache.clear();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const task = this.readTask(file);
			if (task) this.cache.set(file.path, task);
		}
		this.subscribe();
		this.emit();
	}

	dispose(): void {
		for (const ref of this.eventRefs) this.app.metadataCache.offref(ref);
		this.eventRefs = [];
		this.listeners.clear();
	}

	private subscribe(): void {
		const { metadataCache, vault } = this.app;

		// frontmatter が変わったファイルだけ差分更新する（外部編集も含めてここを通る）。
		this.eventRefs.push(
			metadataCache.on('changed', (file) => {
				this.refreshFile(file);
				this.emit();
			}),
		);

		this.eventRefs.push(
			vault.on('delete', (file) => {
				if (this.cache.delete(file.path)) this.emit();
			}),
		);

		this.eventRefs.push(
			vault.on('rename', (file, oldPath) => {
				this.cache.delete(oldPath);
				if (file instanceof TFile) this.refreshFile(file);
				this.emit();
			}),
		);
	}

	// --- 読み取り ---

	private readTask(file: TFile): Task | null {
		if (file.extension !== 'md') return null;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
			| Frontmatter
			| undefined;
		if (!isTaskFrontmatter(fm)) return null;

		return parseTask(fm!, {
			path: file.path,
			title: file.basename,
			mtime: file.stat.mtime,
			// frontmatter に日時が無い旧ノートはファイル作成時刻で代用する。
			fallbackTimestamp: new Date(file.stat.ctime).toISOString(),
		});
	}

	private refreshFile(file: TFile): void {
		const task = this.readTask(file);
		if (task) this.cache.set(file.path, task);
		else this.cache.delete(file.path); // タスクでなくなった（type を消された等）
	}

	getAll(): Task[] {
		return [...this.cache.values()];
	}

	get(path: string): Task | undefined {
		return this.cache.get(path);
	}

	/** 指定列のタスクを sort_key 昇順で返す。 */
	getColumn(status: TaskStatus, options: { expedite?: boolean } = {}): Task[] {
		return this.getAll()
			.filter((t) => t.status === status)
			.filter((t) => (options.expedite === undefined ? true : t.expedite === options.expedite))
			.sort((a, b) => a.sortKey - b.sortKey);
	}

	// --- 購読 ---

	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		listener(this.getAll());
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		const tasks = this.getAll();
		for (const listener of this.listeners) listener(tasks);
	}

	// --- 書き込み ---

	/**
	 * frontmatter を更新する。
	 *
	 * キャッシュ保持の mtime とディスク上の mtime が食い違う場合は、外部で編集された
	 * とみなして書き込まない（要求 §5：上書きせず再読み込み）。
	 */
	async update(path: string, mutate: (fm: Frontmatter) => void): Promise<UpdateResult> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return { ok: false, reason: 'missing' };

		const cached = this.cache.get(path);
		if (cached && file.stat.mtime !== cached.mtime) {
			// 競合。呼び出し側が Notice を出せるよう、先にキャッシュを最新化しておく。
			this.refreshFile(file);
			this.emit();
			return { ok: false, reason: 'conflict' };
		}

		try {
			await this.app.fileManager.processFrontMatter(file, mutate);
			// metadataCache の 'changed' が遅れて届くことがあるため、ここでも一度読み直す。
			this.refreshFile(file);
			this.emit();
			return { ok: true };
		} catch (error) {
			return { ok: false, reason: 'error', error };
		}
	}

	/**
	 * 状態遷移。status 単独では書き換えさせず、必ず付随する副作用込みで適用する。
	 */
	async transition(
		path: string,
		target: TaskStatus,
		options: { interruptedTaskLink?: string; sortKey?: number } = {},
	): Promise<UpdateResult> {
		const task = this.cache.get(path);
		if (!task) return { ok: false, reason: 'missing' };

		const effect = planTransition(task, target, new Date(), {
			interruptedTaskLink: options.interruptedTaskLink,
		});

		return this.update(path, (fm) => {
			fm[FM.status] = effect.status;
			fm[FM.statusChangedAt] = effect.statusChangedAt;
			if (effect.delegatedAt) fm[FM.delegatedAt] = effect.delegatedAt;
			if (effect.expediteStarted) fm[FM.expediteStarted] = effect.expediteStarted;
			if (effect.expediteInterrupted) fm[FM.expediteInterrupted] = effect.expediteInterrupted;
			if (options.sortKey !== undefined) fm[FM.sortKey] = options.sortKey;
		});
	}

	/** 並べ替えのみ（列は変えない）。 */
	async setSortKey(path: string, sortKey: number): Promise<UpdateResult> {
		return this.update(path, (fm) => {
			fm[FM.sortKey] = sortKey;
		});
	}

	/**
	 * 列全体の sort_key を振り直す（fractional indexing の精度枯渇時のみ）。
	 * 複数ファイルを書き換えるので、通常の並べ替え経路では呼ばない。
	 */
	async applyRebalance(assignments: ReadonlyArray<{ path: string; sortKey: number }>): Promise<void> {
		for (const { path, sortKey } of assignments) {
			await this.setSortKey(path, sortKey);
		}
	}
}
