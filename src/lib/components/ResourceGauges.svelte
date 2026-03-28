<script lang="ts">
	import type { ResourceUsage } from '$lib/types';
	import LoadingSkeleton from './LoadingSkeleton.svelte';

	let { usage }: { usage: ResourceUsage | null } = $props();

	interface GaugeItem {
		label: string;
		used: number;
		max: number;
		unit: string;
	}

	const gauges = $derived.by((): GaugeItem[] => {
		if (!usage) return [];
		const storageUsed = usage.used_storage_gb ?? 0;
		return [
			{ label: 'vCPU', used: usage.used_vcpus ?? 0, max: usage.max_vcpus ?? 0, unit: 'cores' },
			{ label: 'RAM', used: Math.round((usage.used_ram_mb ?? 0) / 1024), max: Math.round((usage.max_ram_mb ?? 0) / 1024), unit: 'GB' },
			{ label: 'Pods', used: usage.active_pods ?? 0, max: usage.max_pods ?? 0, unit: '' },
			{ label: 'Storage', used: storageUsed, max: storageUsed > 0 ? Math.ceil(storageUsed * 2) : 100, unit: 'GB' }
		];
	});

	function percentage(used: number, max: number): number {
		if (max <= 0) return 0;
		return Math.min(Math.round((used / max) * 100), 100);
	}

	function barColor(pct: number): string {
		if (pct >= 80) return 'bg-error-500';
		if (pct >= 50) return 'bg-warning-500';
		return 'bg-success-500';
	}
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#if usage === null}
		{#each Array(4) as _}
			<div class="card rounded-2xl p-5">
				<LoadingSkeleton width="4rem" height="0.75rem" rounded="rounded" />
				<div class="mt-3">
					<LoadingSkeleton width="6rem" height="1.75rem" rounded="rounded" />
				</div>
				<div class="mt-3">
					<LoadingSkeleton height="0.375rem" rounded="rounded-full" />
				</div>
				<div class="mt-2">
					<LoadingSkeleton width="3rem" height="0.75rem" rounded="rounded" />
				</div>
			</div>
		{/each}
	{:else}
		{#each gauges as gauge}
			{@const pct = percentage(gauge.used, gauge.max)}
			<div class="card rounded-2xl p-5">
				<p class="text-xs font-semibold uppercase tracking-[0.05em] text-surface-500">
					{gauge.label}
				</p>
				<p class="mt-2 text-2xl font-semibold tracking-tight text-surface-900 dark:text-surface-100">
					{gauge.used} <span class="text-sm font-normal text-surface-500">/ {gauge.max}{gauge.unit ? ` ${gauge.unit}` : ''}</span>
				</p>
				<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800/60">
					<div
						class="h-full rounded-full transition-all duration-1000 {barColor(pct)}"
						style="width: {pct}%"
					></div>
				</div>
				<div class="mt-1.5 flex justify-between text-[11px] text-surface-500">
					<span>{pct}% used</span>
					<span>{gauge.max - gauge.used} remaining</span>
				</div>
			</div>
		{/each}
	{/if}
</div>
