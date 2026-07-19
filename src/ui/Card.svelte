<script lang="ts">
	import { evaluateMeeting } from '../domain/meetingEval';
	import type { RotFlag } from '../domain/rot';
	import type { Task } from '../domain/types';
	import type { BoardActions } from './actions';
	import { isMobileStore, settingsStore } from './state';

	interface Props {
		task: Task;
		rotFlags: RotFlag[];
		actions: BoardActions;
		draggable: boolean;
	}

	let { task, rotFlags, actions, draggable }: Props = $props();

	const settings = $derived($settingsStore);

	const meetingEval = $derived(
		evaluateMeeting(task, {
			roleWeights: settings.roleWeights,
			highImportanceThreshold: settings.highImportanceThreshold,
			highCostThreshold: settings.highCostThreshold,
		}),
	);

	// 辞退候補はグレー表示（要求 §F4）。
	const declinable = $derived(meetingEval?.verdict === 'declinable');
	const negotiable = $derived(meetingEval?.verdict === 'negotiable');

	function onDragStart(event: DragEvent) {
		event.dataTransfer?.setData('text/plain', task.path);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function onContextMenu(event: MouseEvent) {
		event.preventDefault();
		actions.showCardMenu(task, event);
	}

	function onClick(event: MouseEvent) {
		// モバイルは D&D 非対応なので、タップでメニューを出して状態変更する（要求 §F1）。
		if ($isMobileStore) {
			event.preventDefault();
			actions.showCardMenu(task, event);
			return;
		}
		void actions.openTask(task.path);
	}

	function rotLabel(flag: RotFlag): string {
		switch (flag.kind) {
			case 'stale-backlog':
				return `滞留 ${flag.days}日`;
			case 'overdue-delegation':
				return `返答期限 ${flag.days}日超過`;
			case 'silent-delegation':
				return `${flag.days}日 無変化`;
		}
	}

	function formatEstimate(min: number): string {
		if (min <= 0) return '';
		if (min < 60) return `${min}分`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m === 0 ? `${h}h` : `${h}h${m}m`;
	}
</script>

<div
	class="tm-card"
	class:tm-card-expedite={task.expedite}
	class:tm-card-declinable={declinable}
	{draggable}
	role="button"
	tabindex="0"
	ondragstart={onDragStart}
	oncontextmenu={onContextMenu}
	onclick={onClick}
	onkeydown={(e: KeyboardEvent) => {
		if (e.key === 'Enter') void actions.openTask(task.path);
	}}
>
	<div class="tm-card-title">{task.title}</div>

	<div class="tm-card-meta">
		{#if task.project}
			<span class="tm-chip">{task.project}</span>
		{/if}
		{#if task.estimate > 0}
			<span class="tm-chip">{formatEstimate(task.estimate)}</span>
		{/if}
		{#if task.due}
			<span class="tm-chip">〜{task.due}</span>
		{/if}
		{#if task.type === 'delegated' && task.delegation?.assignee}
			<span class="tm-chip">→ {task.delegation.assignee}</span>
		{/if}
	</div>

	{#if task.type === 'meeting' && meetingEval}
		<div class="tm-card-meta">
			<span class="tm-chip">{task.meeting?.role}</span>
			<span class="tm-chip">{meetingEval.costPersonHours.toFixed(1)}人時</span>
			{#if declinable}
				<span class="tm-badge tm-badge-muted">辞退・委任候補</span>
			{:else if negotiable}
				<span class="tm-badge tm-badge-warn">短縮・少人数化の交渉候補</span>
			{/if}
		</div>
	{/if}

	{#if rotFlags.length > 0}
		<div class="tm-card-meta">
			{#each rotFlags as flag (flag.kind)}
				<span class="tm-badge tm-badge-rot">{rotLabel(flag)}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tm-card {
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		padding: 8px 10px;
		margin-bottom: 6px;
		cursor: pointer;
		user-select: none;
	}

	.tm-card:hover {
		border-color: var(--interactive-accent);
	}

	.tm-card-expedite {
		border-left: 3px solid var(--color-orange, #e0813a);
	}

	/* 辞退候補はグレー表示（要求 §F4） */
	.tm-card-declinable {
		opacity: 0.55;
	}

	.tm-card-title {
		font-size: var(--font-ui-small);
		line-height: 1.4;
		margin-bottom: 4px;
		word-break: break-word;
	}

	.tm-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.tm-chip {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		background: var(--background-secondary);
		border-radius: 4px;
		padding: 1px 5px;
	}

	.tm-badge {
		font-size: var(--font-ui-smaller);
		border-radius: 4px;
		padding: 1px 5px;
	}

	.tm-badge-muted {
		background: var(--background-modifier-border);
		color: var(--text-muted);
	}

	.tm-badge-warn {
		background: var(--background-modifier-error-hover, #5a3a3a);
		color: var(--text-normal);
	}

	.tm-badge-rot {
		background: var(--background-modifier-error);
		color: var(--text-on-accent, #fff);
	}
</style>
