/**
 * 週の初回起動時に出す3行サマリー（要求 §F9）。
 */

import { App, Modal } from 'obsidian';

export interface WeeklySummary {
	staleCount: number;
	expediteCount: number;
	wipExceededCount: number;
}

export class WeeklySummaryModal extends Modal {
	constructor(
		app: App,
		private readonly summary: WeeklySummary,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '今週のふりかえり' });

		const list = contentEl.createEl('ul');
		list.createEl('li', { text: `滞留カード ${this.summary.staleCount} 件` });
		list.createEl('li', { text: `Expedite ${this.summary.expediteCount} 回` });
		list.createEl('li', { text: `WIP超過 ${this.summary.wipExceededCount} 回` });

		contentEl.createEl('p', {
			text: '先週1週間の記録です。',
			cls: 'setting-item-description',
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
