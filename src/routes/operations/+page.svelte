<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError, safeErrorText } from '$lib/errors/friendly';
	import { getMyJobs, getMyRuns } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { Job, Run } from '$lib/types';
	import JobPanel from '$lib/components/JobPanel.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	let jobs = $state<Job[]>([]);
	let runs = $state<Run[]>([]);
	let error = $state<string | null>(null);
	let prevJobStatuses = $state<Map<string, string>>(new Map());

	const jobTypeLabels: Record<string, string> = {
		pod_create: 'Pod created',
		pod_destroy: 'Pod destroyed',
		vm_add: 'VM added',
		vm_destroy: 'VM destroyed',
		vm_start: 'VM started',
		vm_stop: 'VM stopped',
		vm_restart: 'VM restarted',
		vm_reset: 'VM reset',
		vm_snapshot: 'Snapshot created',
		vm_revert: 'Snapshot restored',
		vm_snapshot_delete: 'Snapshot deleted',
	};

	function checkJobTransitions(newJobs: Job[]) {
		for (const job of newJobs) {
			const prev = prevJobStatuses.get(job.id);
			if (!prev) continue;
			if (prev === job.status) continue;

			const label = jobTypeLabels[job.type] ?? job.type.replace(/_/g, ' ');
			const vmName = (job.payload?.vm_name as string) || '';
			const detail = vmName ? `${vmName}` : undefined;

			if (job.status === 'completed' && prev !== 'completed') {
				toastStore.success(label, detail);
			} else if (job.status === 'failed' && prev !== 'failed') {
				const errorMsg = safeErrorText(job.result) ?? detail;
				toastStore.error(`${label} failed`, errorMsg);
			}
		}
		prevJobStatuses = new Map(newJobs.map((j) => [j.id, j.status]));
	}

	async function loadData() {
		try {
			const newJobs = await getMyJobs();
			checkJobTransitions(newJobs);
			jobs = newJobs;
		} catch (e) {
			error = friendlyError(e, 'Failed to load operations');
			jobs = [];
		}
		try {
			runs = await getMyRuns();
		} catch {
			runs = [];
		}
	}

	onMount(() => {
		loadData();
		const interval = setInterval(() => {
			if (!document.hidden) loadData();
		}, 10000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">Current Operations</h1>
		<p class="mt-1 text-sm text-surface-500">Provisioning jobs and recent vulnerability assessments.</p>
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	<JobPanel {jobs} title="Provisioning jobs" />

	<div class="panel overflow-hidden rounded-2xl">
		<div class="border-b border-surface-200-800 px-5 py-3">
			<h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Vulnerability assessments</h2>
		</div>
		{#if runs.length === 0}
			<p class="px-5 py-8 text-sm text-surface-500">No recent assessments.</p>
		{:else}
			<ul class="divide-y divide-surface-200-800">
				{#each runs as run (run.id)}
					<li class="flex items-center justify-between gap-3 px-5 py-3">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
								{run.playlist_name || 'Assessment'}
								{#if run.pod_name}
									<span class="font-normal text-surface-500">· {run.pod_name}</span>
								{/if}
							</p>
							<p class="text-xs text-surface-500">
								{run.target_vm_name || 'VM'}
								{#if run.started_at}
									· {new Date(run.started_at).toLocaleString()}
								{/if}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<StatusBadge status={run.status} />
							<a
								href="/pods/{run.pod_id}/testing/runs/{run.id}"
								class="text-sm font-semibold text-primary-500 hover:text-primary-400"
							>
								Open
							</a>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
