<script lang="ts">
	import type { RotFlag } from '../domain/rot';
	import type { Task, TaskStatus } from '../domain/types';
	import type { BoardActions } from './actions';
	import Card from './Card.svelte';
	import { isMobileStore } from './state';

	interface Props {
		title: string;
		status: TaskStatus;
		tasks: Task[];
		rotByPath: Map<string, RotFlag[]>;
		actions: BoardActions;
		/** WIP超過でヘッダーを赤くする（要求 §F2）。 */
		alert?: boolean;
		/** ヘッダー右側の補助表示（例: "3 / 3"）。 */
		badge?: string;
		horizontal?: boolean;
		/**
		 * ドロップ先にするか。
		 * Expedite レーンは expedite フラグで所属が決まるため false（D&Dでは入れない）。
		 */
		droppable?: boolean;
	}

	let {
		title,
		status,
		tasks,
		rotByPath,
		actions,
		alert = false,
		badge = '',
		horizontal = false,
		droppable = true,
	}: Props = $props();

	let dragOver = $state(false);

	function onDragOver(event: DragEvent) {
		if (!droppable) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	async function onDrop(event: DragEvent) {
		if (!droppable) return;
		event.preventDefault();
		dragOver = false;

		const path = event.dataTransfer?.getData('text/plain');
		if (!path) return;

		// ドロップ位置から挿入 index を求める。カード中央より上なら手前に入れる。
		const container = event.currentTarget as HTMLElement;
		const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-card]'));
		let index = cards.length;
		for (let i = 0; i < cards.length; i++) {
			const rect = cards[i].getBoundingClientRect();
			const midpoint = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
			const pointer = horizontal ? event.clientX : event.clientY;
			if (pointer < midpoint) {
				index = i;
				break;
			}
		}

		await actions.moveTask(path, status, index);
	}
</script>

<div class="tm-lane" class:tm-lane-horizontal={horizontal}>
	<div class="tm-lane-header" class:tm-lane-header-alert={alert}>
		<span>{title}</span>
		<span class="tm-lane-count">{badge || tasks.length}</span>
	</div>

	<div
		class="tm-lane-body"
		class:tm-lane-body-horizontal={horizontal}
		class:tm-drag-over={dragOver}
		role="list"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
	>
		{#each tasks as task (task.path)}
			<div data-card>
				<Card
					{task}
					{actions}
					rotFlags={rotByPath.get(task.path) ?? []}
					draggable={!$isMobileStore}
				/>
			</div>
		{:else}
			<div class="tm-lane-empty">—</div>
		{/each}
	</div>
</div>

<style>
	.tm-lane {
		display: flex;
		flex-direction: column;
		min-width: 200px;
		flex: 1 1 0;
		background: var(--background-secondary);
		border-radius: 8px;
		padding: 8px;
	}

	.tm-lane-horizontal {
		width: 100%;
	}

	.tm-lane-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--font-ui-small);
		font-weight: 600;
		padding: 2px 4px 8px;
		color: var(--text-muted);
	}

	/* WIP超過の可視化（要求 §F2） */
	.tm-lane-header-alert {
		color: var(--text-on-accent, #fff);
		background: var(--background-modifier-error);
		border-radius: 4px;
		padding: 4px;
		margin-bottom: 4px;
	}

	.tm-lane-count {
		font-variant-numeric: tabular-nums;
	}

	.tm-lane-body {
		flex: 1;
		min-height: 60px;
		overflow-y: auto;
	}

	.tm-lane-body-horizontal {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		min-height: 40px;
	}

	.tm-drag-over {
		outline: 2px dashed var(--interactive-accent);
		outline-offset: 2px;
		border-radius: 6px;
	}

	.tm-lane-empty {
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
		text-align: center;
		padding: 8px 0;
	}
</style>
