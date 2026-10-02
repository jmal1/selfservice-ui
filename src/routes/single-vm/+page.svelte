<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { listSingleVMs } from '$lib/api/client';
	import { provisioningStore } from '$lib/stores/provisioning.svelte';
	import { emptySingleVMMessage } from '$lib/labs/single-vm';
	import type { Pod } from '$lib/types';
	import PodList from '$lib/components/PodList.svelte';

	let pods = $state<Pod[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function load() {
		try {
			pods = await listSingleVMs();
		} catch (e) {
			error = friendlyError(e, 'Failed to load VMs');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
		const interval = setInterval(() => {
			if (!document.hidden) load();
		}, 10000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">Single VM</h1>
			<p class="mt-1 text-sm text-surface-500">One lab VM on a shared network</p>
		</div>
		{#if provisioningStore.canProvision}
			<a
				href="/single-vm/new"
				class="inline-flex items-center gap-2 rounded-[10px] bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-600"
			>
				New environment
			</a>
		{/if}
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	{#if !loading && pods.length === 0 && !error}
		<div class="rounded-xl border border-surface-200 dark:border-surface-800 px-4 py-8 text-center text-sm text-surface-500">
			{emptySingleVMMessage}
		</div>
	{:else}
		<PodList {pods} {loading} onrefresh={load} />
	{/if}
</div>
