import { Menu, Notice, Platform, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';

import { evaluateWip, wouldExceedWip } from './domain/wip';
import { findInterruptedTasks } from './domain/transition';
import { detectRot } from './domain/rot';
import { sortKeyForPosition, rebalance } from './domain/sortKey';
import { FM } from './domain/taskSchema';
import {
	BOARD_COLUMNS,
	MEETING_ROLES,
	type MeetingRole,
	type Task,
	type TaskStatus,
} from './domain/types';

import { EventLog } from './infra/EventLog';
import { IcsClient } from './infra/IcsClient';
import { MeetingSync } from './infra/MeetingSync';
import { NoteFactory } from './infra/NoteFactory';
import { TaskRepository } from './infra/TaskRepository';
import { DEFAULT_SETTINGS, mergeSettings, type PluginSettings } from './infra/settings';

import { BOARD_VIEW_TYPE, BoardView } from './ui/BoardView';
import { SettingsTab } from './ui/SettingsTab';
import type { BoardActions } from './ui/actions';
import { setIsMobile, setSettings, setTasks } from './ui/state';
import { DelegationExportModal } from './ui/modals/DelegationExportModal';
import { PlanningModal } from './ui/modals/PlanningModal';
import { WeeklySummaryModal } from './ui/modals/WeeklySummaryModal';
import { WipOverrideModal } from './ui/modals/WipOverrideModal';

const COLUMN_LABELS: Record<TaskStatus, string> = {
	backlog: 'Backlog',
	ready: 'Ready',
	doing: 'Doing',
	waiting: 'Waiting',
	done: 'Done',
};

function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export default class TaskManagerPlugin extends Plugin {
	settings: PluginSettings = { ...DEFAULT_SETTINGS };

	private repo!: TaskRepository;
	private notes!: NoteFactory;
	private log!: EventLog;
	private meetingSync!: MeetingSync;

	/** 直前のWIP超過状態。false→true の遷移だけを検知したい。 */
	private wasWipExceeded = false;
	/** 超過モーダルを多重表示しないためのガード。 */
	private wipModalOpen = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.repo = new TaskRepository(this.app);
		this.notes = new NoteFactory(this.app);
		this.log = new EventLog(
			this.app,
			`${this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`}/events.jsonl`,
		);
		this.meetingSync = new MeetingSync(this.repo, this.notes, new IcsClient());

		setIsMobile(Platform.isMobile);
		setSettings(this.settings);

		this.registerView(BOARD_VIEW_TYPE, (leaf) => new BoardView(leaf, this.actions()));
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerCommands();
		this.addRibbonIcon('kanban-square', 'タスクボードを開く', () => void this.activateBoard());

		// Vault のインデックスが揃ってから走査する。起動直後は metadataCache が空のことがある。
		this.app.workspace.onLayoutReady(async () => {
			await this.repo.initialize();
			this.repo.onChange((tasks) => {
				setTasks(tasks);
				void this.checkExternalWipOverrun(tasks);
			});

			this.scheduleIcsRefresh();
			await this.maybeShowWeeklySummary();
		});
	}

	onunload(): void {
		this.repo?.dispose();
	}

	// --- 設定 ---

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		setSettings({ ...this.settings });
	}

	// --- コマンド ---

	private registerCommands(): void {
		this.addCommand({
			id: 'open-board',
			name: 'タスクボードを開く',
			callback: () => void this.activateBoard(),
		});

		this.addCommand({
			id: 'create-task-note',
			name: 'タスクノートを作成',
			callback: async () => {
				const file = await this.notes.createTaskNote({
					title: '新しいタスク',
					folder: this.settings.taskFolder,
				});
				await this.app.workspace.getLeaf(true).openFile(file);
			},
		});

		// 要求 §F7：第一層のチェックボックスを第二層のタスクノートへ昇格する。
		this.addCommand({
			id: 'promote-checkbox',
			name: 'チェックボックスをタスクノートに昇格',
			editorCheckCallback: (checking, editor) => {
				const line = editor.getLine(editor.getCursor().line);
				const isCheckbox = /^\s*(?:[-*+]|\d+\.)\s+\[[ xX/\-]\]\s+\S/.test(line);
				if (checking) return isCheckbox;

				void (async () => {
					const file = await this.notes.promoteCheckbox(editor, this.settings.taskFolder);
					if (file) new Notice(`昇格しました: ${file.basename}`);
				})();
				return true;
			},
		});

		this.addCommand({
			id: 'start-planning',
			name: 'デイリープランニングを開く',
			callback: () => this.openPlanning(),
		});

		this.addCommand({
			id: 'refresh-meetings',
			name: '会議を取得（ICS）',
			callback: () => void this.refreshMeetings(),
		});
	}

	async activateBoard(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(BOARD_VIEW_TYPE);

		let leaf: WorkspaceLeaf | null;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: BOARD_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);

		await this.maybeSuggestPlanning();
	}

	// --- ボードからの操作 ---

	private actions(): BoardActions {
		return {
			moveTask: (path, target, index) => this.moveTask(path, target, index),
			openTask: (path) => this.openTask(path),
			showCardMenu: (task, event) => this.showCardMenu(task, event),
			toggleExpedite: (path) => this.toggleExpedite(path),
			setMeetingRole: (path, role) => this.setMeetingRole(path, role),
			toggleReplaceable: (path) => this.toggleReplaceable(path),
			exportDelegation: (task) => new DelegationExportModal(this.app, task).open(),
			startPlanning: () => this.openPlanning(),
			refreshMeetings: () => this.refreshMeetings(),
		};
	}

	/**
	 * カードの移動。
	 * UI 経由の WIP 超過はここでブロックする（要求 §F2：未然防止側）。
	 */
	private async moveTask(path: string, target: TaskStatus, index: number): Promise<void> {
		const tasks = this.repo.getAll();
		const task = this.repo.get(path);
		if (!task) return;

		if (wouldExceedWip(tasks, path, target, this.settings.wipLimit)) {
			new Notice(
				`WIP上限 ${this.settings.wipLimit} 件に達しています。` +
					'着手中のものを終わらせるか、waiting に逃がしてください。',
			);
			return;
		}

		// 移動先の列で並び位置を決める。列内の並べ替えでも同じ経路を通る。
		const column = tasks
			.filter((t) => t.status === target)
			.map((t) => ({ path: t.path, sortKey: t.sortKey }));
		const { sortKey, rebalanceNeeded } = sortKeyForPosition(column, path, index);

		if (rebalanceNeeded) {
			// 精度が枯渇したので列全体を振り直してから改めて挿入する。
			await this.repo.applyRebalance(rebalance(column));
			const refreshed = this.repo
				.getAll()
				.filter((t) => t.status === target)
				.map((t) => ({ path: t.path, sortKey: t.sortKey }));
			const retry = sortKeyForPosition(refreshed, path, index);
			await this.applyMove(task, target, retry.sortKey);
			return;
		}

		await this.applyMove(task, target, sortKey);
	}

	private async applyMove(task: Task, target: TaskStatus, sortKey: number): Promise<void> {
		// 列を変えないなら並べ替えだけ。statusChangedAt を無駄に更新しない
		// （更新すると「7日無変化」の判定がリセットされてしまう）。
		if (task.status === target) {
			const result = await this.repo.setSortKey(task.path, sortKey);
			this.notifyIfFailed(result);
			return;
		}

		// Expedite の着手なら、そのとき中断された doing を記録する（要求 §F3）。
		let interruptedLink: string | undefined;
		if (target === 'doing' && task.expedite && !task.expediteStarted) {
			const interrupted = findInterruptedTasks(this.repo.getAll());
			if (interrupted.length > 0) {
				interruptedLink = interrupted.map((t) => `[[${t.title}]]`).join(', ');
			}
		}

		const result = await this.repo.transition(task.path, target, {
			sortKey,
			interruptedTaskLink: interruptedLink,
		});
		this.notifyIfFailed(result);

		if (result.ok && target === 'doing' && task.expedite && !task.expediteStarted) {
			await this.log.record({ type: 'expedite-started', path: task.path });
		}
	}

	private notifyIfFailed(result: { ok: boolean; reason?: string }): void {
		if (result.ok) return;
		if (result.reason === 'conflict') {
			new Notice('このノートは外部で編集されました。最新の内容を読み込み直しました。');
		} else if (result.reason === 'missing') {
			new Notice('ノートが見つかりません。');
		} else {
			new Notice('更新に失敗しました。');
		}
	}

	private async openTask(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	/**
	 * カードのメニュー。
	 * モバイルは D&D 非対応なので、状態変更の唯一の手段でもある（要求 §F1）。
	 */
	private showCardMenu(task: Task, event: MouseEvent): void {
		const menu = new Menu();

		for (const status of BOARD_COLUMNS) {
			if (status === task.status) continue;
			menu.addItem((item) =>
				item
					.setTitle(`${COLUMN_LABELS[status]} へ移動`)
					.onClick(() => void this.moveTask(task.path, status, Number.MAX_SAFE_INTEGER)),
			);
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(task.expedite ? 'Expedite を解除' : 'Expedite にする')
				.onClick(() => void this.toggleExpedite(task.path)),
		);

		if (task.type === 'meeting') {
			menu.addSeparator();
			for (const role of MEETING_ROLES) {
				menu.addItem((item) =>
					item
						.setTitle(`役割: ${role}`)
						.setChecked(task.meeting?.role === role)
						.onClick(() => void this.setMeetingRole(task.path, role)),
				);
			}
			menu.addItem((item) =>
				item
					.setTitle('代替可能（replaceable）')
					.setChecked(task.meeting?.replaceable ?? false)
					.onClick(() => void this.toggleReplaceable(task.path)),
			);
		}

		if (task.type === 'delegated') {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('委譲メッセージを作成')
					.onClick(() => new DelegationExportModal(this.app, task).open()),
			);
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle('ノートを開く').onClick(() => void this.openTask(task.path)),
		);

		menu.showAtMouseEvent(event);
	}

	private async toggleExpedite(path: string): Promise<void> {
		const task = this.repo.get(path);
		if (!task) return;
		const result = await this.repo.update(path, (fm) => {
			fm[FM.expedite] = !task.expedite;
		});
		this.notifyIfFailed(result);
	}

	private async setMeetingRole(path: string, role: MeetingRole): Promise<void> {
		const result = await this.repo.update(path, (fm) => {
			fm[FM.meetingRole] = role;
		});
		this.notifyIfFailed(result);
	}

	private async toggleReplaceable(path: string): Promise<void> {
		const task = this.repo.get(path);
		if (!task) return;
		const next = !(task.meeting?.replaceable ?? false);
		const result = await this.repo.update(path, (fm) => {
			fm[FM.replaceable] = next;
		});
		this.notifyIfFailed(result);

		// 辞退候補になった＝会議を1つ手放す判断。指標のために記録する。
		if (result.ok && next && task.meeting?.role === 'listen') {
			await this.log.record({
				type: 'meeting-declined',
				path,
				value: task.meeting.duration,
			});
		}
	}

	// --- WIP超過の事後検知（要求 §F2：frontmatter直接編集はブロックできない） ---

	private async checkExternalWipOverrun(tasks: Task[]): Promise<void> {
		const wip = evaluateWip(tasks, this.settings.wipLimit);

		if (!wip.exceeded) {
			this.wasWipExceeded = false;
			return;
		}
		// すでに超過を検知済みなら、変更のたびに訊き直さない。
		if (this.wasWipExceeded || this.wipModalOpen) return;

		this.wasWipExceeded = true;
		this.wipModalOpen = true;

		new WipOverrideModal(this.app, wip.count, wip.limit, (reason) => {
			void this.log.record({
				type: 'wip-exceeded',
				note: reason,
				value: wip.overBy,
			});
		}).open();

		// モーダルを閉じたあとに再び開けるよう、ガードは次のイベントループで外す。
		window.setTimeout(() => {
			this.wipModalOpen = false;
		}, 0);
	}

	// --- ICS（要求 §F4） ---

	private scheduleIcsRefresh(): void {
		if (this.settings.icsRefreshIntervalMin <= 0) return;

		void this.refreshMeetings();
		this.registerInterval(
			window.setInterval(
				() => void this.refreshMeetings(),
				this.settings.icsRefreshIntervalMin * 60_000,
			),
		);
	}

	async refreshMeetings(): Promise<void> {
		if (this.settings.icsUrls.length === 0) {
			new Notice('ICS購読URLが設定されていません。');
			return;
		}

		try {
			const result = await this.meetingSync.syncForDate(this.settings, new Date());
			new Notice(`会議を更新しました（新規 ${result.created} / 更新 ${result.updated}）`);
		} catch (err) {
			console.error('[task-manager] meeting sync failed', err);
			new Notice('会議の取得に失敗しました。URLとネットワークを確認してください。');
		}
	}

	// --- デイリープランニング（要求 §F6） ---

	/** 設定時刻以降の初回表示でだけ提案する。 */
	private async maybeSuggestPlanning(): Promise<void> {
		const now = new Date();
		const today = toDateKey(now);
		if (this.settings.lastPlanningDate === today) return;

		const [h, m] = this.settings.planningPromptTime.split(':').map(Number);
		const threshold = new Date(now);
		threshold.setHours(h, m, 0, 0);
		if (now < threshold) return;

		this.openPlanning();
	}

	private openPlanning(): void {
		new PlanningModal(this.app, this.repo.getAll(), this.settings, async (outcome) => {
			this.settings.lastPlanningDate = toDateKey(new Date());
			await this.saveSettings();

			if (!outcome) {
				await this.log.record({ type: 'planning-skipped' });
				return;
			}

			// 選んだものを ready の先頭に並べ、今日やる順を確定させる。
			for (const [i, task] of outcome.selected.entries()) {
				await this.repo.setSortKey(task.path, i);
			}

			await this.log.record({
				type: 'planning-completed',
				value: outcome.selected.length,
			});
		}).open();
	}

	// --- 週次サマリー（要求 §F9） ---

	private async maybeShowWeeklySummary(): Promise<void> {
		const now = new Date();
		const today = toDateKey(now);
		if (this.settings.lastWeeklySummaryDate === today) return;

		// 週の初回＝前回表示から7日以上経過。
		if (this.settings.lastWeeklySummaryDate) {
			const last = new Date(this.settings.lastWeeklySummaryDate);
			const days = (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000);
			if (days < 7) return;
		}

		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const rot = detectRot(
			this.repo.getAll(),
			{
				staleBacklogDays: this.settings.staleBacklogDays,
				silentDelegationDays: this.settings.silentDelegationDays,
			},
			now,
		);

		new WeeklySummaryModal(this.app, {
			staleCount: rot.filter((f) => f.kind === 'stale-backlog').length,
			expediteCount: await this.log.countSince(weekAgo, 'expedite-started'),
			wipExceededCount: await this.log.countSince(weekAgo, 'wip-exceeded'),
		}).open();

		this.settings.lastWeeklySummaryDate = today;
		await this.saveSettings();
	}
}
