<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { listTestingRuns } from '$lib/api/client';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Run } from '$lib/types';

	const podId = $derived(page.params.id as string);

	let runs: Run[] = $state([]);
	let loading = $state(true);

	async function loadRuns() {
		try {
			runs = (await listTestingRuns(podId)) ?? [];
		} catch {
			// ignore
		} finally {
			loading = false;
		}
	}

	onMount(() => { loadRuns(); });
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Run History</h1>
		<a href="/pods/{podId}/testing" class="btn variant-soft-surface">← Back</a>
	</div>

	{#if loading}
		<LoadingSkeleton />
	{:else if runs.length === 0}
		<p class="text-surface-600-400">No assessment runs yet.</p>
	{:else}
		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Status</th>
						<th>Passed</th>
						<th>Failed</th>
						<th>Total</th>
						<th>Started</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run}
						<tr>
							<td><StatusBadge status={run.status} /></td>
							<td class="text-success-500">{run.passed_workflows}</td>
							<td class="text-error-500">{run.failed_workflows}</td>
							<td>{run.total_workflows}</td>
							<td class="text-sm">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
							<td>
								<a href="/pods/{podId}/testing/runs/{run.id}" class="btn btn-sm variant-ghost-primary">
									Details →
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
