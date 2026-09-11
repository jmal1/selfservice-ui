<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getTestingRun, cancelTestingRun } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import RunDetailsCard from '$lib/components/RunDetailsCard.svelte';
	import type { Run } from '$lib/types';

	const podId = $derived(page.params.id as string);
	const runId = $derived(page.params.runId as string);

	let run = $state<Run | null>(null);
	let loading = $state(true);
	let error = $state('');
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
		<RunDetailsCard {run}>
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
		</RunDetailsCard>
	{/if}
</div>
