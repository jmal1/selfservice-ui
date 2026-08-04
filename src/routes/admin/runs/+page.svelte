<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListRuns } from '$lib/api/client';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Run } from '$lib/types';
	import {
		formatRunActor,
		formatRunPlaylist,
		formatRunPod,
		formatRunTargetVm,
		formatTimestamp
	} from '$lib/utils/run';

	let runs: Run[] = $state([]);
	let loading = $state(true);

	async function loadRuns() {
		try {
			runs = (await adminListRuns()) ?? [];
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
		<p class="text-surface-600 dark:text-surface-400">No runs yet.</p>
	{:else}
		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Status</th>
						<th>Who</th>
						<th>Pod</th>
						<th>Target VM</th>
						<th>Playlist</th>
						<th>Passed</th>
						<th>Failed</th>
						<th>Total</th>
						<th>Started</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run}
						{@const actor = formatRunActor(run)}
						{@const pod = formatRunPod(run)}
						{@const targetVm = formatRunTargetVm(run)}
						{@const playlist = formatRunPlaylist(run)}
						{@const href = `/admin/runs/${run.id}`}
						<tr class="align-middle">
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<StatusBadge status={run.status} />
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<div class="text-sm" class:text-surface-500={actor === '(unknown)'}>{actor}</div>
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<div class="text-sm">
										{pod.label}
										{#if pod.deleted && pod.label !== '(deleted)'}
											<span class="text-surface-500"> (deleted)</span>
										{/if}
									</div>
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									{#if targetVm.recorded}
										<div class="text-sm">
											{targetVm.name}
											{#if targetVm.ip}
												<span class="text-surface-500"> ({targetVm.ip})</span>
											{/if}
										</div>
									{:else}
										<div class="text-sm text-surface-500">(not recorded)</div>
									{/if}
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<div class="text-sm" class:text-surface-500={playlist.label === '(deleted)'}>
										{playlist.label}
										{#if playlist.deleted && playlist.label !== '(deleted)'}
											<span class="text-surface-500"> (deleted)</span>
										{/if}
									</div>
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<span class="text-success-500">{run.passed_workflows}</span>
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<span class="text-error-500">{run.failed_workflows}</span>
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									{run.total_workflows}
								</a>
							</td>
							<td class="p-0 align-middle">
								<a href={href} class="block h-full w-full px-4 py-3 text-current no-underline">
									<span class="text-sm">{formatTimestamp(run.started_at, 'Pending')}</span>
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
