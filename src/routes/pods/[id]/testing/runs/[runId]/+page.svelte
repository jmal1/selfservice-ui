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

	let run = $state<Run | null>(null);
	let loading = $state(true);
	let error = $state('');
	let expandedWorkflow = $state('');
	let cancelling = $state(false);
	let liveEvents: { ts: string; type: string; message: string }[] = $state([]);
	let wsConnected = $state(false);

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

	// connectProgressWS opens the live event stream and refreshes the run
	// on each frame. It transparently falls back to the polling onMount sets
	// up if the WS errors or closes early (e.g. proxy issue, server old).
	function connectProgressWS(): WebSocket | null {
		try {
			const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
			const url = `${proto}//${location.host}/api/v1/runs/${runId}/progress/ws`;
			const ws = new WebSocket(url);
			ws.onopen = () => { wsConnected = true; };
			ws.onmessage = (ev) => {
				try {
					const frame = JSON.parse(ev.data);
					liveEvents = [
						{ ts: frame.ts || new Date().toISOString(), type: frame.type, message: frame.message || '' },
						...liveEvents
					].slice(0, 50);
					// Refresh full run state on any frame so progress bars/counts update.
					loadRun();
				} catch {
					/* ignore malformed frame */
				}
			};
			ws.onclose = () => { wsConnected = false; };
			ws.onerror = () => { wsConnected = false; };
			return ws;
		} catch {
			return null;
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
		const ws = connectProgressWS();
		// Keep a slow polling fallback in case WS drops (proxy edge case
		// or running against a server that doesn't yet expose the WS).
		const interval = setInterval(() => {
			if (isActive && !wsConnected) loadRun();
		}, 5000);
		return () => {
			clearInterval(interval);
			ws?.close();
		};
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
				class="btn btn-danger"
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
		<div class="card bg-error-500/10 text-error-500 p-4">{error}</div>
	{:else if run}
		<!-- Run Summary -->
		<div class="card p-4">
			<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Status</p>
					<StatusBadge status={run.status} />
				</div>
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Workflows</p>
					<p class="font-mono">
						<span class="text-success-500">{run.passed_workflows}</span> /
						<span class="text-error-500">{run.failed_workflows}</span> /
						{run.total_workflows}
					</p>
				</div>
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Started</p>
					<p class="text-sm">{run.started_at ? new Date(run.started_at).toLocaleString() : 'Pending'}</p>
				</div>
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Completed</p>
					<p class="text-sm">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}</p>
				</div>
			</div>
			<!-- Which VM was graded. Runs created before this was recorded have no
			     target, so say so explicitly rather than rendering an empty field
			     that reads as "no VM". -->
			<div class="mt-3 border-t border-surface-300/40 pt-3 dark:border-surface-600/40">
				<p class="text-sm text-surface-600 dark:text-surface-400">Assessed VM</p>
				{#if run.target_vm_name}
					<p class="font-mono text-sm">
						{run.target_vm_name}
						{#if run.target_vm_ip}
							<span class="text-surface-500">({run.target_vm_ip})</span>
						{/if}
					</p>
				{:else}
					<p class="text-sm text-surface-500">
						Not recorded — this run predates target tracking.
					</p>
				{/if}
			</div>
			{#if run.error_message}
				<div class="mt-3 rounded bg-error-500/10 p-2 text-sm text-error-500">{run.error_message}</div>
			{/if}
		</div>

		<!-- Live event stream — visible while run is active or has captured frames -->
		{#if isActive || liveEvents.length > 0}
			<div class="card p-4">
				<div class="mb-2 flex items-center justify-between">
					<h2 class="text-sm font-semibold">Live Progress</h2>
					<span class="text-xs {wsConnected ? 'text-success-500' : 'text-surface-500'}">
						{wsConnected ? '● live' : '○ polling'}
					</span>
				</div>
				{#if liveEvents.length === 0}
					<p class="text-xs text-surface-500">Waiting for events…</p>
				{:else}
					<ul class="max-h-40 space-y-1 overflow-auto font-mono text-xs">
						{#each liveEvents as evt}
							<li class="flex gap-2">
								<span class="text-surface-500">{new Date(evt.ts).toLocaleTimeString()}</span>
								<span class="font-semibold">{evt.type}</span>
								<span class="text-surface-600 dark:text-surface-400">{evt.message}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Workflow Results -->
		{#if run.results && run.results.length > 0}
			<section class="space-y-3">
				<h2 class="text-lg font-semibold">Workflow Results</h2>
				{#each run.results as result}
					<div class="card overflow-hidden">
						<button
							class="flex w-full items-center justify-between p-4 text-left"
							onclick={() => expandedWorkflow = expandedWorkflow === result.id ? '' : result.id}
						>
							<div class="flex items-center gap-3">
								<span class="text-xl">{statusIcon(result.status)}</span>
								<div>
									<p class="font-medium">{result.workflow_name}</p>
									{#if result.student_message}
										<p class="text-sm text-surface-600 dark:text-surface-400">{result.student_message}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-4">
								<span class="text-sm text-surface-600 dark:text-surface-400">{formatDuration(result.duration_ms)}</span>
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
												<td class="text-sm text-surface-600 dark:text-surface-400">{action.message || '—'}</td>
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
