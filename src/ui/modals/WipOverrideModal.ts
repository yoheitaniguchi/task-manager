/**
 * WIP超過の理由入力（要求 §F2）。
 *
 * frontmatter 直接編集による超過は UI でブロックできないため、事後に理由を訊く。
 * ここで摩擦を与えることが目的なので、キャンセルしても超過状態は解消しない
 * （＝勝手にタスクを戻したりしない）。記録されないだけ。
 */

import { App, Modal, Setting } from 'obsidian';

export class WipOverrideModal extends Modal {
	private reason = '';

	constructor(
		app: App,
		private readonly count: number,
		private readonly limit: number,
		private readonly onSubmit: (reason: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'WIP上限を超えています' });
		contentEl.createEl('p', {
			text: `doing が ${this.count} 件（上限 ${this.limit} 件）です。超過した理由を記録します。`,
			cls: 'setting-item-description',
		});

		new Setting(contentEl).setName('理由').addText((text) =>
			text
				.setPlaceholder('例: 障害対応で並行せざるを得ない')
				.onChange((value) => {
					this.reason = value;
				})
				.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') this.submit();
				}),
		);

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('記録する').setCta().onClick(() => this.submit()),
			)
			.addButton((btn) => btn.setButtonText('あとで').onClick(() => this.close()));
	}

	private submit(): void {
		this.onSubmit(this.reason.trim());
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
