/**
 * タスクノートの生成と昇格（要求 §F7）。
 */

import { normalizePath, type App, type Editor, type TFile } from 'obsidian';
import { parseCheckboxLine, sanitizeNoteName, toPromotedLine } from '../domain/checkbox';
import { buildFrontmatter } from '../domain/taskSchema';
import type { Task, TaskType } from '../domain/types';

export interface CreateTaskOptions {
	title: string;
	type?: TaskType;
	folder: string;
	extra?: Partial<Task>;
	/** ノート本文（frontmatter の後ろ）。 */
	body?: string;
}

export class NoteFactory {
	constructor(private readonly app: App) {}

	/** タスクノートを生成して TFile を返す。同名があれば連番を付ける。 */
	async createTaskNote(options: CreateTaskOptions): Promise<TFile> {
		const { vault } = this.app;
		const folder = normalizePath(options.folder);

		if (folder && folder !== '/' && !vault.getAbstractFileByPath(folder)) {
			await vault.createFolder(folder);
		}

		const baseName = sanitizeNoteName(options.title);
		const path = await this.uniquePath(folder, baseName);

		const fm = buildFrontmatter({
			type: options.type ?? 'task',
			...options.extra,
		});
		const content = `${serializeFrontmatter(fm)}\n${options.body ?? ''}`;

		return vault.create(path, content);
	}

	/**
	 * エディタのカーソル行にあるチェックボックスをタスクノートへ昇格し、
	 * 元の行をそのノートへのリンクに置き換える。
	 *
	 * @returns 生成したノート。カーソル行がチェックボックスでなければ null。
	 */
	async promoteCheckbox(
		editor: Editor,
		folder: string,
	): Promise<TFile | null> {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const parsed = parseCheckboxLine(line);
		if (!parsed) return null;

		const file = await this.createTaskNote({
			title: parsed.text,
			folder,
			// 元の場所を辿れるように本文へ残す。
			body: `\n元の記述: ${parsed.text}\n`,
		});

		// 生成に成功してから行を置き換える。逆順だと生成失敗時に記述を失う。
		const noteName = file.basename;
		editor.setLine(cursor.line, toPromotedLine(parsed, noteName));

		return file;
	}

	private async uniquePath(folder: string, baseName: string): Promise<string> {
		const { vault } = this.app;
		const prefix = folder && folder !== '/' ? `${folder}/` : '';

		let candidate = normalizePath(`${prefix}${baseName}.md`);
		let i = 1;
		while (vault.getAbstractFileByPath(candidate)) {
			i += 1;
			candidate = normalizePath(`${prefix}${baseName} ${i}.md`);
		}
		return candidate;
	}
}

/**
 * frontmatter を YAML として直列化する。
 *
 * 生成時点ではファイルがまだ存在せず processFrontMatter() を使えないため、
 * ここだけは手書きする。値は string / number / boolean のみ（buildFrontmatter の出力）。
 */
function serializeFrontmatter(fm: Record<string, unknown>): string {
	const lines = Object.entries(fm).map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
	return `---\n${lines.join('\n')}\n---\n`;
}

function formatYamlValue(value: unknown): string {
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);
	const s = String(value);
	// コロン・引用符・先頭記号を含むと YAML が壊れるので引用する。
	if (/[:#"'\n]|^[\s\-[\]{}&*!|>%@`]/.test(s) || s === '') {
		return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	return s;
}
