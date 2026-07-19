/**
 * カンバンボードの ItemView（要求 §F1）。
 * Svelte コンポーネントのマウント先であり、状態の流し込み口。
 */

import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import Board from './Board.svelte';
import type { BoardActions } from './actions';
import { tickNow } from './state';

export const BOARD_VIEW_TYPE = 'task-manager-board';

export class BoardView extends ItemView {
	private component: ReturnType<typeof mount> | null = null;
	private tickHandle: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly actions: BoardActions,
	) {
		super(leaf);
	}

	getViewType(): string {
		return BOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'タスクボード';
	}

	getIcon(): string {
		return 'kanban-square';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('task-manager-board-view');

		this.component = mount(Board, {
			target: this.contentEl,
			props: { actions: this.actions },
		});

		// 滞留日数・キャパシティの基準時刻を進める。
		// 日付をまたいだまま開きっぱなしでも表示が古びないようにする。
		this.tickHandle = window.setInterval(tickNow, 60_000);
		this.registerInterval(this.tickHandle);
	}

	async onClose(): Promise<void> {
		if (this.component) {
			await unmount(this.component);
			this.component = null;
		}
		if (this.tickHandle !== null) {
			window.clearInterval(this.tickHandle);
			this.tickHandle = null;
		}
		this.contentEl.empty();
	}
}
