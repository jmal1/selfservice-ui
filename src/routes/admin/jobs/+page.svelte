<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetJobs } from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import type { Job, WSJobStatusEvent } from '$lib/types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let jobs = $state<Job[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expandedJob = $state<string | null>(null);
	onMount(() => {
		if (!authStore.isAdmin) return;
		loadJobs();

		wsStore.connect();
		const unsubJob = wsStore.on('job.status', (event) => {
			const e = event as WSJobStatusEvent;
			jobs = jobs.map((j) =>
				j.id === e.job_id ? { ...j, status: e.status, result: e.result ?? j.result } : j
			);
		});

		const interval = setInterval(() => {
			if (!document.hidden) loadJobs();
		}, 15000);

		return () => {
			clearInterval(interval);
			unsubJob();
		};
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

	function getJobError(job: Job): string | null {
		const result = job.result as Record<string, unknown> | null;
		if (!result?.error) return null;
		return String(result.error);
	}

	function getJobPayloadSummary(job: Job): { key: string; value: string }[] {
		if (!job.payload) return [];
		const entries: { key: string; value: string }[] = [];
		for (const [key, value] of Object.entries(job.payload)) {
			if (key === 'user_id') continue; // Not useful for admin display
			entries.push({ key, value: String(value) });
		}
		return entries;
	}

	function toggleExpand(jobId: string) {
		expandedJob = expandedJob === jobId ? null : jobId;
	}

	let statusFilter = $state<string>('all');
	const filteredJobs = $derived(
		statusFilter === 'all' ? jobs : jobs.filter(j => j.status === statusFilter)
	);
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Job Monitor</h1>
		<div class="flex items-center gap-2">
			<div class="flex rounded-lg border border-surface-200 dark:border-surface-800 overflow-hidden">
				{#each ['all', 'failed', 'in_progress', 'completed'] as status}
					<button
						class="px-3 py-1.5 text-xs font-medium transition-colors {statusFilter === status ? 'bg-primary-500 text-white' : 'text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800'}"
						onclick={() => statusFilter = status}
					>
						{status === 'all' ? 'All' : status === 'in_progress' ? 'Running' : status.charAt(0).toUpperCase() + status.slice(1)}
					</button>
				{/each}
			</div>
			<button
				class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1.5 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800"
				onclick={loadJobs}
			>
				Refresh
			</button>
		</div>
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
		<div class="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="sr-only">Background jobs and their statuses</caption>
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th scope="col" class="px-5 py-3">ID</th>
							<th scope="col" class="px-5 py-3">Type</th>
							<th scope="col" class="px-5 py-3">Status</th>
							<th scope="col" class="px-5 py-3">Claimed By</th>
							<th scope="col" class="px-5 py-3">Duration</th>
							<th scope="col" class="px-5 py-3">Created</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(5) as _}
								<tr class="border-b border-surface-200 dark:border-surface-800">
									{#each Array(6) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if filteredJobs.length === 0}
							<tr>
								<td colspan="6" class="px-5 py-12 text-center text-surface-500">No jobs found.</td>
							</tr>
						{:else}
							{#each filteredJobs as job (job.id)}
								<tr
									class="border-b border-surface-200 dark:border-surface-800 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800/30 cursor-pointer {job.status === 'failed' ? 'bg-error-500/5' : ''}"
									onclick={() => toggleExpand(job.id)}
								>
									<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400" title={job.id}>
										{truncateId(job.id)}
									</td>
									<td class="px-5 py-3">
										<div class="font-medium text-surface-900 dark:text-surface-100">{formatType(job.type)}</div>
										{#if job.payload?.vm_name}
											<div class="text-xs text-surface-500">{job.payload.vm_name}{job.payload.pod_name ? ` · ${job.payload.pod_name}` : ''}</div>
										{/if}
									</td>
									<td class="px-5 py-3"><StatusBadge status={job.status} /></td>
									<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400">{job.claimed_by || '—'}</td>
									<td class="px-5 py-3 text-surface-600 dark:text-surface-400">{formatDuration(job)}</td>
									<td class="px-5 py-3 text-xs text-surface-600 dark:text-surface-400">{formatTime(job.created_at)}</td>
								</tr>
								{#if expandedJob === job.id}
									<tr class="border-b border-surface-200 dark:border-surface-800">
										<td colspan="6" class="px-5 py-4">
											<div class="space-y-3">
												<!-- Error message -->
												{#if getJobError(job)}
													<div class="rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3">
														<div class="text-xs font-semibold uppercase tracking-wider text-error-400 mb-1">Error</div>
														<p class="text-sm text-error-300 font-mono">{getJobError(job)}</p>
													</div>
												{/if}

												<!-- Job details grid -->
												<div class="grid grid-cols-2 gap-4 text-sm">
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Job ID</span>
														<p class="font-mono text-xs text-surface-300 mt-0.5">{job.id}</p>
													</div>
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Type</span>
														<p class="text-surface-300 mt-0.5">{job.type}</p>
													</div>
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Started</span>
														<p class="text-surface-300 mt-0.5">{formatTime(job.started_at)}</p>
													</div>
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Completed</span>
														<p class="text-surface-300 mt-0.5">{formatTime(job.completed_at)}</p>
													</div>
												</div>

												<!-- Payload -->
												{#if getJobPayloadSummary(job).length > 0}
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Payload</span>
														<div class="mt-1 rounded-lg bg-surface-800/50 px-3 py-2">
															{#each getJobPayloadSummary(job) as entry}
																<div class="flex gap-2 py-0.5 text-xs">
																	<span class="font-medium text-surface-400 min-w-[100px]">{entry.key}:</span>
																	<span class="font-mono text-surface-300 break-all">{entry.value}</span>
																</div>
															{/each}
														</div>
													</div>
												{/if}

												<!-- Result -->
												{#if job.result && Object.keys(job.result).length > 0}
													<div>
														<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Result</span>
														<pre class="mt-1 rounded-lg bg-surface-800/50 px-3 py-2 text-xs text-surface-300 overflow-x-auto">{JSON.stringify(job.result, null, 2)}</pre>
													</div>
												{/if}
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
