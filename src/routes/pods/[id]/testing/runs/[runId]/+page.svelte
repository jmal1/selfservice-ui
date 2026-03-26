<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getTestingRun, cancelTestingRun } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Run, WorkflowResult } from '$lib/types';

	const podId = $derived(page.params.id as string);
	const runId = $derived(page.params.runId as string);

	let run: Run | null = $state(null);
	let loading = $state(true);
	let error = $state('');
	let expandedWorkflow = $state('');
	let cancelling = $state(false);

	const isActive = $derived(
		run?.status === 'pending' || run?.status === 'provisioning' || run?.status === 'running'
	);

	async function loadRun() {
		try {
			run = await getTestingRun(podId, runId);
		} catch (e: any) {
			error = e.message || 'Failed to load run';
		} finally {
			loading = false;
		}
	}

	async function handleCancel() {
		if (!run) return;
		try {
			cancelling = true;
			await cancelTestingRun(podId, run.id);
			toastStore.success('Assessment cancelled');
			await loadRun();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to cancel');
		} finally {
			cancelling = false;
		}
	}

	function statusIcon(status: string): string {
		switch (status) {
			case 'pass': return '✅';
			case 'fail': return '❌';
			case 'error': return '⚠️';
			case 'timeout': return '⏱️';
			case 'skipped': return '⏭️';
			case 'running': return '⏳';
			case 'pending': return '⏸️';
			default: return '•';
		}
	}

	function formatDuration(ms?: number): string {
		if (!ms) return '—';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	onMount(() => {
		loadRun();
		const interval = setInterval(() => {
			if (isActive) loadRun();
		}, 3000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-5xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Run Details</h1>
			<a href="/pods/{podId}/testing" class="text-sm text-primary-500 hover:underline">← Back to Assessments</a>
		</div>
		{#if isActive}
			<button
				class="btn variant-filled-error"
				disabled={cancelling}
				onclick={handleCancel}
			>
				{cancelling ? 'Cancelling...' : 'Cancel Run'}
			</button>
		{/if}
	</div>

	{#if loading && !run}
		<LoadingSkeleton />
	{:else if error}
		<div class="variant-filled-error card p-4">{error}</div>
	{:else if run}
		<!-- Run Summary -->
		<div class="card variant-ghost-surface p-4">
			<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div>
					<p class="text-sm text-surface-600-400">Status</p>
					<StatusBadge status={run.status} />
				</div>
				<div>
					<p class="text-sm text-surface-600-400">Workflows</p>
					<p class="font-mono">
						<span class="text-success-500">{run.passed_workflows}</span> /
						<span class="text-error-500">{run.failed_workflows}</span> /
						{run.total_workflows}
					</p>
				</div>
				<div>
					<p class="text-sm text-surface-600-400">Started</p>
					<p class="text-sm">{run.started_at ? new Date(run.started_at).toLocaleString() : 'Pending'}</p>
				</div>
				<div>
					<p class="text-sm text-surface-600-400">Completed</p>
					<p class="text-sm">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}</p>
				</div>
			</div>
			{#if run.error_message}
				<div class="mt-3 rounded bg-error-500/10 p-2 text-sm text-error-500">{run.error_message}</div>
			{/if}
		</div>

		<!-- Workflow Results -->
		{#if run.results && run.results.length > 0}
			<section class="space-y-3">
				<h2 class="text-lg font-semibold">Workflow Results</h2>
				{#each run.results as result}
					<div class="card variant-ghost-surface overflow-hidden">
						<button
							class="flex w-full items-center justify-between p-4 text-left"
							onclick={() => expandedWorkflow = expandedWorkflow === result.id ? '' : result.id}
						>
							<div class="flex items-center gap-3">
								<span class="text-xl">{statusIcon(result.status)}</span>
								<div>
									<p class="font-medium">{result.workflow_name}</p>
									{#if result.student_message}
										<p class="text-sm text-surface-600-400">{result.student_message}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-4">
								<span class="text-sm text-surface-600-400">{formatDuration(result.duration_ms)}</span>
								<span class="text-surface-400">{expandedWorkflow === result.id ? '▼' : '▶'}</span>
							</div>
						</button>

						{#if expandedWorkflow === result.id && result.action_results}
							<div class="border-t border-surface-500/20 px-4 pb-4">
								<table class="table mt-2">
									<thead>
										<tr>
											<th>Action</th>
											<th>Status</th>
											<th>Duration</th>
											<th>Message</th>
										</tr>
									</thead>
									<tbody>
										{#each result.action_results as action}
											<tr>
												<td class="font-mono text-sm">{action.action}</td>
												<td>{statusIcon(action.status)} {action.status}</td>
												<td class="text-sm">{formatDuration(action.duration_ms)}</td>
												<td class="text-sm text-surface-600-400">{action.message || '—'}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/each}
			</section>
		{/if}
	{/if}
</div>
