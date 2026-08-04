<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
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

	// Filter state from URL query params
	let triggeredBy = $state('');
	let podOwner = $state('');
	let status = $state('');
	let fromDate = $state('');
	let toDate = $state('');

	async function loadRuns() {
		try {
			const params: any = {};
			if (triggeredBy) params.triggered_by = triggeredBy;
			if (podOwner) params.pod_owner = podOwner;
			if (status) params.status = status;
			if (fromDate) params.from = fromDate;
			if (toDate) params.to = toDate;
			runs = (await adminListRuns(Object.keys(params).length > 0 ? params : undefined)) ?? [];
		} catch { /* ignore */ }
		finally { loading = false; }
	}

	function updateFilters() {
		const params = new URLSearchParams();
		if (triggeredBy) params.set('triggered_by', triggeredBy);
		if (podOwner) params.set('pod_owner', podOwner);
		if (status) params.set('status', status);
		if (fromDate) params.set('from', fromDate);
		if (toDate) params.set('to', toDate);
		const query = params.toString();
		window.history.replaceState({}, '', query ? `?${query}` : '');
		loading = true;
		loadRuns();
	}

	function clearFilters() {
		triggeredBy = '';
		podOwner = '';
		status = '';
		fromDate = '';
		toDate = '';
		window.history.replaceState({}, '', '');
		loading = true;
		loadRuns();
	}

	onMount(() => {
		// Load filters from URL query params
		triggeredBy = $page.url.searchParams.get('triggered_by') || '';
		podOwner = $page.url.searchParams.get('pod_owner') || '';
		status = $page.url.searchParams.get('status') || '';
		fromDate = $page.url.searchParams.get('from') || '';
		toDate = $page.url.searchParams.get('to') || '';
		
		loadRuns();
		const interval = setInterval(loadRuns, 15000);
		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<h1 class="text-2xl font-bold">All Assessment Runs</h1>

	<!-- Filters -->
	<div class="rounded border border-surface-300 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900">
		<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label class="block text-sm font-medium">Triggered By</label>
				<input
					type="text"
					bind:value={triggeredBy}
					placeholder="Username, display name, or UUID"
					class="mt-1 w-full rounded border border-surface-300 px-3 py-2 text-sm dark:border-surface-600"
				/>
			</div>
			<div>
				<label class="block text-sm font-medium">Pod Owner</label>
				<input
					type="text"
					bind:value={podOwner}
					placeholder="Username, display name, or UUID"
					class="mt-1 w-full rounded border border-surface-300 px-3 py-2 text-sm dark:border-surface-600"
				/>
			</div>
			<div>
				<label class="block text-sm font-medium">Status</label>
				<select
					bind:value={status}
					class="mt-1 w-full rounded border border-surface-300 px-3 py-2 text-sm dark:border-surface-600"
				>
					<option value="">All Statuses</option>
					<option value="pending">Pending</option>
					<option value="provisioning">Provisioning</option>
					<option value="running">Running</option>
					<option value="completed">Completed</option>
					<option value="failed">Failed</option>
					<option value="cancelled">Cancelled</option>
					<option value="timeout">Timeout</option>
				</select>
			</div>
			<div>
				<label class="block text-sm font-medium">From (Date/Time)</label>
				<input
					type="datetime-local"
					bind:value={fromDate}
					class="mt-1 w-full rounded border border-surface-300 px-3 py-2 text-sm dark:border-surface-600"
				/>
			</div>
			<div>
				<label class="block text-sm font-medium">To (Date/Time)</label>
				<input
					type="datetime-local"
					bind:value={toDate}
					class="mt-1 w-full rounded border border-surface-300 px-3 py-2 text-sm dark:border-surface-600"
				/>
			</div>
		</div>
		<div class="flex gap-2">
			<button
				onclick={updateFilters}
				class="rounded bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
			>
				Apply Filters
			</button>
			<button
				onclick={clearFilters}
				class="rounded bg-surface-200 px-4 py-2 text-sm font-medium dark:bg-surface-700"
			>
				Clear Filters
			</button>
		</div>
	</div>

	{#if loading}
		<LoadingSkeleton />
	{:else if runs.length === 0}
		<p class="text-surface-600 dark:text-surface-400">
			{triggeredBy || podOwner || status || fromDate || toDate
				? 'No runs match the selected filters.'
				: 'No runs yet.'}
		</p>
	{:else}
		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Status</th>
						<th>Who</th>
						<th>Pod</th>
						<th>Pod Owner</th>
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
						{@const podOwnerDisplay = run.pod_owner_username || '(unknown)'}
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
									<div class="text-sm" class:text-surface-500={podOwnerDisplay === '(unknown)'}>{podOwnerDisplay}</div>
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
