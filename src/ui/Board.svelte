<script lang="ts">
	import { detectRot, groupRotByPath } from '../domain/rot';
	import { BOARD_COLUMNS, type TaskStatus } from '../domain/types';
	import { evaluateWip } from '../domain/wip';
	import type { BoardActions } from './actions';
	import CapacityBar from './CapacityBar.svelte';
	import Lane from './Lane.svelte';
	import { nowStore, settingsStore, tasksStore } from './state';

	interface Props {
		actions: BoardActions;
	}

	let { actions }: Props = $props();

	const COLUMN_LABELS: Record<TaskStatus, string> = {
		backlog: 'Backlog',
		ready: 'Ready',
		doing: 'Doing',
		waiting: 'Waiting',
		done: 'Done',
	};

	const tasks = $derived($tasksStore);
	const settings = $derived($settingsStore);

	const wip = $derived(evaluateWip(tasks, settings.wipLimit));

	const rotByPath = $derived(
		groupRotByPath(
			detectRot(
				tasks,
				{
					staleBacklogDays: settings.staleBacklogDays,
					silentDelegationDays: settings.silentDelegationDays,
				},
				$nowStore,
			),
		),
	);

	// Expedite は列ではなく最上段の横断レーン（要求 §F3）。完了したものは載せない。
	const expediteTasks = $derived(
		tasks
			.filter((t) => t.expedite && t.status !== 'done')
			.sort((a, b) => a.sortKey - b.sortKey),
	);

	function columnTasks(status: TaskStatus) {
		return tasks
			.filter((t) => t.status === status && !(t.expedite && status !== 'done'))
			.sort((a, b) => a.sortKey - b.sortKey);
	}
</script>

<div class="tm-board">
	<div class="tm-board-toolbar">
		<button onclick={() => actions.startPlanning()}>デイリープランニング</button>
		<button onclick={() => void actions.refreshMeetings()}>会議を更新</button>
	</div>

	<CapacityBar />

	<!-- 所属は expedite フラグで決まるので、D&D のドロップ先にはしない -->
	<div class="tm-expedite-lane">
		<Lane
			title="Expedite（割り込み）"
			status="doing"
			tasks={expediteTasks}
			{rotByPath}
			{actions}
			badge={String(expediteTasks.length)}
			horizontal
			droppable={false}
		/>
	</div>

	<div class="tm-columns">
		{#each BOARD_COLUMNS as status (status)}
			<Lane
				title={COLUMN_LABELS[status]}
				{status}
				tasks={columnTasks(status)}
				{rotByPath}
				{actions}
				alert={status === 'doing' && wip.exceeded}
				badge={status === 'doing' ? `${wip.count} / ${wip.limit}` : ''}
			/>
		{/each}
	</div>
</div>

<style>
	.tm-board {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 8px 12px 12px;
		overflow: hidden;
	}

	.tm-board-toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.tm-expedite-lane {
		margin-bottom: 10px;
	}

	.tm-columns {
		display: flex;
		gap: 10px;
		flex: 1;
		min-height: 0;
		overflow-x: auto;
	}

	/* モバイルは横スクロールだと扱いづらいので縦積みにする（閲覧+タップ操作のみ） */
	@media (max-width: 700px) {
		.tm-columns {
			flex-direction: column;
			overflow-x: hidden;
			overflow-y: auto;
		}
	}
</style>
