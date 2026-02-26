<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetJobs } from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import type { Job, WSJobStatusEvent } from '$lib/types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let jobs = $state<Job[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let unsubJob: (() => void) | null = null;

	onMount(async () => {
		if (!authStore.isAdmin) return;
		await loadJobs();

		wsStore.connect();
		unsubJob = wsStore.on('job.status', (event) => {
			const e = event as WSJobStatusEvent;
			jobs = jobs.map((j) =>
				j.id === e.job_id ? { ...j, status: e.status, result: e.result ?? j.result } : j
			);
		});
	});

	onDestroy(() => {
		unsubJob?.();
	});

	async function loadJobs() {
		try {
			jobs = await adminGetJobs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load jobs';
		} finally {
			loading = false;
		}
	}

	function formatType(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function formatDuration(job: Job): string {
		if (!job.started_at) return '—';
		const start = new Date(job.started_at).getTime();
		const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
		const seconds = Math.round((end - start) / 1000);
		if (seconds < 60) return `${seconds}s`;
		return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	}

	function truncateId(id: string): string {
		return id.length > 8 ? id.slice(0, 8) + '…' : id;
	}

	function formatTime(iso: string): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900-100">Job Monitor</h1>
		<button
			class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-200-800"
			onclick={loadJobs}
		>
			Refresh
		</button>
	</div>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th class="px-5 py-3">ID</th>
							<th class="px-5 py-3">Type</th>
							<th class="px-5 py-3">Status</th>
							<th class="px-5 py-3">Claimed By</th>
							<th class="px-5 py-3">Duration</th>
							<th class="px-5 py-3">Created</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(5) as _}
								<tr class="border-b border-surface-200-800">
									{#each Array(6) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if jobs.length === 0}
							<tr>
								<td colspan="6" class="px-5 py-12 text-center text-surface-500">No jobs found.</td>
							</tr>
						{:else}
							{#each jobs as job (job.id)}
								<tr class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30">
									<td class="px-5 py-3 font-mono text-xs text-surface-600-400" title={job.id}>
										{truncateId(job.id)}
									</td>
									<td class="px-5 py-3 font-medium text-surface-900-100">{formatType(job.type)}</td>
									<td class="px-5 py-3"><StatusBadge status={job.status} /></td>
									<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{job.claimed_by || '—'}</td>
									<td class="px-5 py-3 text-surface-600-400">{formatDuration(job)}</td>
									<td class="px-5 py-3 text-xs text-surface-600-400">{formatTime(job.created_at)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
