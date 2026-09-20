<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { authStore } from '$lib/stores/auth.svelte';
	import { getPods, adminGetUsers, getClusterUsage } from '$lib/api/client';
	import type { ClusterUsage } from '$lib/api/client';
	import type { Pod, User } from '$lib/types';
	import PodList from '$lib/components/PodList.svelte';
	import ClusterUsageChart from '$lib/components/ClusterUsageChart.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let pods = $state<Pod[]>([]);
	let users = $state<User[]>([]);
	let usage = $state<ClusterUsage | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const totalVMs = $derived(pods.reduce((s, p) => s + (p.vms ?? []).length, 0));

	async function loadData() {
		try {
			pods = await getPods();
		} catch (e) {
			error = friendlyError(e, 'Failed to load admin data');
		}
		try {
			users = await adminGetUsers();
		} catch (e) {
			if (!error) error = friendlyError(e, 'Failed to load users');
		}
		try {
			usage = await getClusterUsage();
		} catch {
			usage = {
				available: false,
				cpu_percent: null,
				ram_percent: null,
				series: { cpu: [], ram: [] },
				allocated_vcpus: 0,
				allocated_ram_mb: 0,
				active_pods: 0,
				message: 'Capacity history unavailable'
			};
		}
		loading = false;
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		loadData();

		const interval = setInterval(() => {
			if (!document.hidden) loadData();
		}, 15000);

		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Admin Overview</h1>

	{#if !authStore.isInstructor}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{#if loading}
				{#each Array(3) as _}
					<div class="panel rounded-2xl p-5">
						<LoadingSkeleton width="4rem" height="0.75rem" />
						<div class="mt-2"><LoadingSkeleton width="3rem" height="2rem" /></div>
					</div>
				{/each}
			{:else}
				<div class="panel rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Users</p>
					<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">{users.length}</p>
				</div>
				<div class="panel rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Total Environments</p>
					<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">{pods.length}</p>
				</div>
				<div class="panel rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Total VMs</p>
					<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">{totalVMs}</p>
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			<div class="panel rounded-2xl p-5">
				<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Allocated vCPU</p>
				<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">{usage?.allocated_vcpus ?? '—'}</p>
			</div>
			<div class="panel rounded-2xl p-5">
				<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Allocated RAM</p>
				<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">
					{usage ? Math.round(usage.allocated_ram_mb / 1024) : '—'}
					{#if usage}<span class="text-base font-normal text-surface-500">GB</span>{/if}
				</p>
			</div>
			<div class="panel rounded-2xl p-5">
				<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Host CPU / RAM now</p>
				<p class="mt-1 text-3xl font-bold text-surface-900 dark:text-surface-100">
					{#if usage?.available && usage.cpu_percent != null && usage.ram_percent != null}
						{usage.cpu_percent.toFixed(0)}% / {usage.ram_percent.toFixed(0)}%
					{:else}
						—
					{/if}
				</p>
			</div>
		</div>

		{#if usage && !usage.available}
			<div class="rounded-xl border border-surface-200-800 px-4 py-3 text-sm text-surface-500">
				{usage.message || 'Capacity history unavailable'}
			</div>
		{:else if usage}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<ClusterUsageChart label="Host CPU (7 days)" points={usage.series.cpu} />
				<ClusterUsageChart label="Host RAM (7 days)" points={usage.series.ram} />
			</div>
		{/if}

		<div>
			<h2 class="mb-3 text-lg font-semibold text-surface-900 dark:text-surface-100">All Environments</h2>
			<PodList {pods} {loading} showOwner={true} />
		</div>
	{/if}
</div>
