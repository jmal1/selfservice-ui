<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getTestingDashboard, createTestingRun } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { TestingDashboard, Playlist, Run } from '$lib/types';

	const podId = $derived(page.params.id as string);

	let dashboard: TestingDashboard | null = $state(null);
	let loading = $state(true);
	let error = $state('');
	let runningPlaylist = $state('');

	async function loadDashboard() {
		try {
			loading = true;
			dashboard = await getTestingDashboard(podId);
		} catch (e: any) {
			error = e.message || 'Failed to load testing dashboard';
		} finally {
			loading = false;
		}
	}

	async function runPlaylist(playlist: Playlist) {
		try {
			runningPlaylist = playlist.id;
			const result = await createTestingRun(podId, { playlist_id: playlist.id });
			toastStore.success(`Assessment started: ${result.message}`);
			// Refresh dashboard to show new run
			await loadDashboard();
		} catch (e: any) {
			if (e.status === 429) {
				toastStore.error('Rate limit: maximum 3 runs per hour');
			} else if (e.status === 409) {
				toastStore.error('An assessment is already running on this pod');
			} else {
				toastStore.error(e.message || 'Failed to start assessment');
			}
		} finally {
			runningPlaylist = '';
		}
	}

	function formatTime(ts: string): string {
		return new Date(ts).toLocaleString();
	}

	function formatDuration(start?: string, end?: string): string {
		if (!start) return '—';
		const s = new Date(start).getTime();
		const e = end ? new Date(end).getTime() : Date.now();
		const sec = Math.floor((e - s) / 1000);
		if (sec < 60) return `${sec}s`;
		return `${Math.floor(sec / 60)}m ${sec % 60}s`;
	}

	onMount(() => {
		loadDashboard();
		const interval = setInterval(loadDashboard, 10000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Assessments</h1>
			<p class="text-surface-600 dark:text-surface-400">Run assessments against your pod</p>
		</div>
		<a href="/pods/{podId}" class="btn btn-secondary">← Back to Pod</a>
	</div>

	{#if loading && !dashboard}
		<LoadingSkeleton />
	{:else if error}
		<div class="card bg-error-500/10 text-error-500 p-4">{error}</div>
	{:else if dashboard}
		<!-- Playlists -->
		<section class="space-y-4">
			<h2 class="text-lg font-semibold">Available Playlists</h2>
			{#if (dashboard.playlists ?? []).length === 0}
				<div class="card p-6 text-center">
					<p class="text-surface-600 dark:text-surface-400">No assessments assigned to this pod's template.</p>
				</div>
			{:else}
				<div class="grid gap-4">
					{#each dashboard.playlists ?? [] as playlist}
						<div class="card p-4">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-semibold">{playlist.name}</h3>
									<p class="text-sm text-surface-600 dark:text-surface-400">{playlist.description || 'No description'}</p>
								</div>
								<button
									class="btn btn-primary"
									disabled={runningPlaylist !== ''}
									onclick={() => runPlaylist(playlist)}
								>
									{#if runningPlaylist === playlist.id}
										Running...
									{:else}
										▶ Run All
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Recent Runs -->
		<section class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Recent Runs</h2>
				<a href="/pods/{podId}/testing/runs" class="text-sm text-primary-500 hover:underline">View all →</a>
			</div>
			{#if (dashboard.recent_runs ?? []).length === 0}
				<p class="text-surface-600 dark:text-surface-400">No runs yet.</p>
			{:else}
				<div class="table-container">
					<table class="table table-hover">
						<thead>
							<tr>
								<th>Status</th>
								<th>Workflows</th>
								<th>Started</th>
								<th>Duration</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each dashboard.recent_runs ?? [] as run}
								<tr>
									<td><StatusBadge status={run.status} /></td>
									<td>
										<span class="text-success-500">{run.passed_workflows} passed</span>
										{#if run.failed_workflows > 0}
											/ <span class="text-error-500">{run.failed_workflows} failed</span>
										{/if}
										<span class="text-surface-600 dark:text-surface-400">/ {run.total_workflows} total</span>
									</td>
									<td class="text-sm">{run.started_at ? formatTime(run.started_at) : '—'}</td>
									<td class="text-sm">{formatDuration(run.started_at, run.completed_at)}</td>
									<td>
										<a href="/pods/{podId}/testing/runs/{run.id}" class="btn btn-sm btn-ghost">
											Details →
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>
