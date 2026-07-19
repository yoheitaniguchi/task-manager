/**
 * 設定画面（要求 §F10）。
 */

import { PluginSettingTab, Setting, type App } from 'obsidian';
import type TaskManagerPlugin from '../main';

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: TaskManagerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const s = this.plugin.settings;

		const save = async () => {
			await this.plugin.saveSettings();
		};

		/** 数値入力。空欄や非数値は既定に戻さず、直前の値を保つ。 */
		const numberSetting = (
			name: string,
			desc: string,
			get: () => number,
			set: (v: number) => void,
		) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((text) =>
					text.setValue(String(get())).onChange(async (value) => {
						const n = Number(value);
						if (!Number.isFinite(n)) return;
						set(n);
						await save();
					}),
				);
		};

		containerEl.createEl('h3', { text: 'フロー制御' });

		numberSetting(
			'WIP上限',
			'doing 列に同時に置ける件数。超えると摩擦（ブロック・警告・理由記録）が働きます。',
			() => s.wipLimit,
			(v) => (s.wipLimit = v),
		);

		numberSetting(
			'1日の可処分時間（分）',
			'会議とフォローアップを差し引く前の、作業に充てられる時間。',
			() => s.disposableMin,
			(v) => (s.disposableMin = v),
		);

		numberSetting(
			'フォローアップコスト（分/件）',
			'waiting 1件あたりのコスト。委譲は無料ではないため、キャパシティから差し引きます。',
			() => s.followUpCostMin,
			(v) => (s.followUpCostMin = v),
		);

		containerEl.createEl('h3', { text: '会議評価' });

		numberSetting(
			'役割係数: decision',
			'意思決定者として出る会議の重要度。',
			() => s.roleWeights.decision,
			(v) => (s.roleWeights.decision = v),
		);
		numberSetting(
			'役割係数: contribute',
			'発言・貢献が求められる会議の重要度。',
			() => s.roleWeights.contribute,
			(v) => (s.roleWeights.contribute = v),
		);
		numberSetting(
			'役割係数: listen',
			'聞くだけの会議の重要度。',
			() => s.roleWeights.listen,
			(v) => (s.roleWeights.listen = v),
		);
		numberSetting(
			'高重要とみなす下限',
			'これ以上の役割係数を「高重要」として交渉候補の判定に使います。',
			() => s.highImportanceThreshold,
			(v) => (s.highImportanceThreshold = v),
		);
		numberSetting(
			'高コストとみなす下限（人時）',
			'会議時間 × 参加人数 ÷ 60 がこれ以上なら「高コスト」とみなします。',
			() => s.highCostThreshold,
			(v) => (s.highCostThreshold = v),
		);

		containerEl.createEl('h3', { text: 'カレンダー購読' });

		new Setting(containerEl)
			.setName('ICS購読URL')
			.setDesc('Google/Outlook の公開ICSリンクを1行に1つ。')
			.addTextArea((text) =>
				text
					.setPlaceholder('https://calendar.google.com/calendar/ical/.../basic.ics')
					.setValue(s.icsUrls.join('\n'))
					.onChange(async (value) => {
						s.icsUrls = value
							.split('\n')
							.map((line) => line.trim())
							.filter((line) => line !== '');
						await save();
					}),
			);

		numberSetting(
			'自動取得間隔（分）',
			'0 にすると自動取得せず、手動更新のみになります。',
			() => s.icsRefreshIntervalMin,
			(v) => (s.icsRefreshIntervalMin = v),
		);

		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText('いま会議を取得する').onClick(async () => {
				await this.plugin.refreshMeetings();
			}),
		);

		containerEl.createEl('h3', { text: '習慣と検知' });

		new Setting(containerEl)
			.setName('プランニング提案時刻')
			.setDesc('この時刻以降の初回表示でデイリープランニングを提案します（HH:mm）。')
			.addText((text) =>
				text.setValue(s.planningPromptTime).onChange(async (value) => {
					if (!/^\d{1,2}:\d{2}$/.test(value)) return;
					s.planningPromptTime = value;
					await save();
				}),
			);

		numberSetting(
			'滞留とみなす日数',
			'backlog にこの日数を超えて留まったカードにバッジを出します。',
			() => s.staleBacklogDays,
			(v) => (s.staleBacklogDays = v),
		);

		numberSetting(
			'委譲の無変化を警告する日数',
			'委譲後、状態が変わらないまま経過したら警告します。',
			() => s.silentDelegationDays,
			(v) => (s.silentDelegationDays = v),
		);

		new Setting(containerEl)
			.setName('タスクノートの作成先')
			.setDesc('昇格・新規作成でタスクノートを置くフォルダ。')
			.addText((text) =>
				text.setValue(s.taskFolder).onChange(async (value) => {
					s.taskFolder = value.trim() || 'Tasks';
					await save();
				}),
			);
	}
}
