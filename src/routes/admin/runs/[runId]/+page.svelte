<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { adminGetRun } from '$lib/api/client';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import RunDetailsCard from '$lib/components/RunDetailsCard.svelte';
	import type { Run } from '$lib/types';

	const runId = $derived(page.params.runId as string);

	let run = $state<Run | null>(null);
	let loading = $state(true);
	let error = $state('');

	async function loadRun() {
		try {
			run = await adminGetRun(runId);
		} catch (e: any) {
			error = e.message || 'Failed to load run';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadRun();
	});
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Run Details</h1>
			<a href="/admin/runs" class="text-sm text-primary-500 hover:underline">← Back to Runs</a>
		</div>
	</div>

	{#if loading && !run}
		<LoadingSkeleton />
	{:else if error}
		<div class="card bg-error-500/10 text-error-500 p-4">{error}</div>
	{:else if run}
		<RunDetailsCard {run} />
	{/if}
</div>
