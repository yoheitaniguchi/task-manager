<script lang="ts">
	import { calcCapacity } from '../domain/capacity';
	import { nowStore, settingsStore, tasksStore } from './state';

	const capacity = $derived(
		calcCapacity(
			$tasksStore,
			{
				disposableMin: $settingsStore.disposableMin,
				followUpCostMin: $settingsStore.followUpCostMin,
			},
			$nowStore,
		),
	);

	// available が 0 以下だと割合が出せないので、バーは可処分時間を分母にする。
	const usedPct = $derived(
		Math.min(100, (capacity.committedMin / Math.max(1, capacity.disposableMin)) * 100),
	);
	const availablePct = $derived(
		Math.max(0, Math.min(100, (capacity.availableMin / Math.max(1, capacity.disposableMin)) * 100)),
	);

	function h(min: number): string {
		const sign = min < 0 ? '-' : '';
		const abs = Math.abs(min);
		const hours = Math.floor(abs / 60);
		const mins = abs % 60;
		return `${sign}${hours}h${mins.toString().padStart(2, '0')}m`;
	}
</script>

<div class="tm-capacity" class:tm-capacity-over={capacity.isOver}>
	<div class="tm-capacity-track">
		<div class="tm-capacity-available" style="width: {availablePct}%"></div>
		<div class="tm-capacity-used" style="width: {usedPct}%"></div>
	</div>

	<div class="tm-capacity-legend">
		<span>可処分 {h(capacity.disposableMin)}</span>
		<span>− 会議 {h(capacity.meetingMin)}</span>
		<span>− フォローアップ {h(capacity.followUpMin)}</span>
		<span class="tm-capacity-available-label">= 使える {h(capacity.availableMin)}</span>
		<span>／ doing 合計 {h(capacity.committedMin)}</span>
		{#if capacity.isOver}
			<span class="tm-capacity-warning">
				キャパシティ超過 {h(capacity.committedMin - capacity.availableMin)}
			</span>
		{/if}
	</div>
</div>

<style>
	.tm-capacity {
		padding: 8px 4px 12px;
	}

	.tm-capacity-track {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: var(--background-modifier-border);
		overflow: hidden;
	}

	.tm-capacity-available {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--background-modifier-success, #2d5a3d);
	}

	.tm-capacity-used {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--interactive-accent);
		opacity: 0.85;
	}

	.tm-capacity-over .tm-capacity-used {
		background: var(--background-modifier-error);
		opacity: 1;
	}

	.tm-capacity-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 6px;
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.tm-capacity-available-label {
		color: var(--text-normal);
		font-weight: 600;
	}

	.tm-capacity-warning {
		color: var(--text-error);
		font-weight: 600;
	}
</style>
