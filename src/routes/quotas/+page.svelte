<script lang="ts">
	import { onMount } from 'svelte';
	import { getResourceUsage } from '$lib/api/client';
	import type { ResourceUsage } from '$lib/types';
	import ResourceGauges from '$lib/components/ResourceGauges.svelte';

	let usage = $state<ResourceUsage | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			usage = await getResourceUsage();
		} catch {
			error = 'Could not load your quota.';
			usage = {
				used_vcpus: 0,
				used_ram_mb: 0,
				used_storage_gb: 0,
				max_vcpus: 0,
				max_ram_mb: 0,
				max_pods: 0,
				active_pods: 0
			};
		}
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">Quotas</h1>
		<p class="mt-1 text-sm text-surface-500">How much of your lab allowance is in use.</p>
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	<ResourceGauges {usage} />
</div>
