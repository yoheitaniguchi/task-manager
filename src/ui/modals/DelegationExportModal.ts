/**
 * 委譲の定型文エクスポート（要求 §F8）。
 *
 * Vault 共有によるチーム同期はスコープ外なので、Slack 等へ手で貼る前提の
 * Markdown を作ってクリップボードへ渡すだけにとどめる。
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type { Task } from '../../domain/types';

export function buildDelegationMarkdown(task: Task): string {
	const lines = [`## 依頼: ${task.title}`, ''];

	if (task.delegation?.assignee) lines.push(`- 担当: ${task.delegation.assignee}`);
	if (task.delegation?.expectedBy) lines.push(`- 期待返答日: ${task.delegation.expectedBy}`);
	if (task.due) lines.push(`- 期限: ${task.due}`);
	if (task.project) lines.push(`- プロジェクト: ${task.project}`);
	if (task.ticketUrl) lines.push(`- チケット: ${task.ticketUrl}`);

	lines.push('', '### 依頼内容', '', '(ここに依頼内容を記入)');
	return lines.join('\n');
}

export class DelegationExportModal extends Modal {
	private markdown: string;

	constructor(app: App, task: Task) {
		super(app);
		this.markdown = buildDelegationMarkdown(task);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '委譲メッセージ' });

		const textarea = contentEl.createEl('textarea', { text: this.markdown });
		textarea.rows = 14;
		textarea.style.width = '100%';
		textarea.addEventListener('input', () => {
			this.markdown = textarea.value;
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('クリップボードにコピー')
				.setCta()
				.onClick(async () => {
					await navigator.clipboard.writeText(this.markdown);
					new Notice('コピーしました');
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
