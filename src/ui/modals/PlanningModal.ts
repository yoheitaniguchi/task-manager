/**
 * デイリープランニングモード（要求 §F6）。
 *
 * ready 列の上位を提示し、当日キャパシティに収まる分だけ「今日の枠」に確定させる。
 * 実施だけでなくスキップも記録する（成功指標「プランニング実施率」の分母になるため）。
 */

import { App, Modal, Setting } from 'obsidian';
import { calcCapacity } from '../../domain/capacity';
import type { Task } from '../../domain/types';
import type { PluginSettings } from '../../infra/settings';

export interface PlanningOutcome {
	/** 「今日の枠」に確定したタスク。 */
	selected: Task[];
}

export class PlanningModal extends Modal {
	private selected = new Set<string>();
	private candidates: Task[];
	private availableMin: number;
	private summaryEl: HTMLElement | null = null;
	private decided = false;

	constructor(
		app: App,
		private readonly tasks: Task[],
		private readonly settings: PluginSettings,
		private readonly onDecide: (outcome: PlanningOutcome | null) => void,
	) {
		super(app);

		this.candidates = tasks
			.filter((t) => t.status === 'ready')
			.sort((a, b) => a.sortKey - b.sortKey);

		this.availableMin = calcCapacity(
			tasks,
			{
				disposableMin: settings.disposableMin,
				followUpCostMin: settings.followUpCostMin,
			},
			new Date(),
		).availableMin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '今日の枠を決める' });

		if (this.candidates.length === 0) {
			contentEl.createEl('p', {
				text: 'ready 列が空です。まず backlog から着手候補を引き上げてください。',
				cls: 'setting-item-description',
			});
		}

		this.summaryEl = contentEl.createEl('p', { cls: 'setting-item-description' });

		// doing にすでにあるものは自動的に今日の枠に含まれているとみなし、初期選択にする。
		for (const task of this.tasks) {
			if (task.status === 'doing' && !task.expedite) this.selected.add(task.path);
		}

		for (const task of this.candidates) {
			new Setting(contentEl)
				.setName(task.title)
				.setDesc(this.describe(task))
				.addToggle((toggle) =>
					toggle.setValue(this.selected.has(task.path)).onChange((value) => {
						if (value) this.selected.add(task.path);
						else this.selected.delete(task.path);
						this.renderSummary();
					}),
				);
		}

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('今日の枠を確定')
					.setCta()
					.onClick(() => {
						this.decided = true;
						const selected = this.candidates.filter((t) => this.selected.has(t.path));
						this.onDecide({ selected });
						this.close();
					}),
			)
			.addButton((btn) =>
				btn.setButtonText('スキップ').onClick(() => {
					this.decided = true;
					this.onDecide(null);
					this.close();
				}),
			);

		this.renderSummary();
	}

	private describe(task: Task): string {
		const parts: string[] = [];
		if (task.estimate > 0) parts.push(`見積 ${task.estimate}分`);
		if (task.project) parts.push(task.project);
		if (task.due) parts.push(`期限 ${task.due}`);
		return parts.join(' / ') || '見積なし';
	}

	private renderSummary(): void {
		if (!this.summaryEl) return;

		const total = this.tasks
			.filter((t) => this.selected.has(t.path))
			.reduce((sum, t) => sum + t.estimate, 0);

		const over = total > this.availableMin;
		this.summaryEl.setText(
			`選択 ${total}分 / 使える時間 ${this.availableMin}分` +
				(over ? `（${total - this.availableMin}分 超過）` : ''),
		);
		this.summaryEl.toggleClass('mod-warning', over);
	}

	onClose(): void {
		this.contentEl.empty();
		// × で閉じた場合もスキップとして記録する（実施率の分母を保つため）。
		if (!this.decided) this.onDecide(null);
	}
}
