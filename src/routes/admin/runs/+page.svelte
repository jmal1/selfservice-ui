<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListRuns } from '$lib/api/client';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Run } from '$lib/types';

	let runs: Run[] = $state([]);
	let loading = $state(true);

	async function loadRuns() {
		try {
			runs = await adminListRuns();
		} catch { /* ignore */ }
		finally { loading = false; }
	}

	onMount(() => {
		loadRuns();
		const interval = setInterval(loadRuns, 15000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<h1 class="text-2xl font-bold">All Assessment Runs</h1>

	{#if loading}
		<LoadingSkeleton />
	{:else if runs.length === 0}
		<p class="text-surface-600-400">No runs yet.</p>
	{:else}
		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Status</th>
						<th>Pod</th>
						<th>Passed</th>
						<th>Failed</th>
						<th>Total</th>
						<th>Started</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run}
						<tr>
							<td><StatusBadge status={run.status} /></td>
							<td class="font-mono text-xs">{run.pod_id.substring(0, 8)}…</td>
							<td class="text-success-500">{run.passed_workflows}</td>
							<td class="text-error-500">{run.failed_workflows}</td>
							<td>{run.total_workflows}</td>
							<td class="text-sm">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
