<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { getPods, adminGetUsers } from '$lib/api/client';
	import type { Pod, User } from '$lib/types';
	import PodList from '$lib/components/PodList.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let pods = $state<Pod[]>([]);
	let users = $state<User[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const totalVMs = $derived(pods.reduce((s, p) => s + (p.vms ?? []).length, 0));

	async function loadData() {
		try {
			pods = await getPods();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load admin data';
		}
		try {
			users = await adminGetUsers();
		} catch (e) {
			if (!error) error = e instanceof Error ? e.message : 'Failed to load users';
		}
		loading = false;
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadData();

		const interval = setInterval(() => {
			if (!document.hidden) loadData();
		}, 15000);

		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Admin Overview</h1>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<!-- Stats cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			{#if loading}
				{#each Array(3) as _}
					<div class="card rounded-2xl p-5">
						<LoadingSkeleton width="4rem" height="0.75rem" />
						<div class="mt-2"><LoadingSkeleton width="3rem" height="2rem" /></div>
					</div>
				{/each}
			{:else}
				<div class="card rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Users</p>
					<p class="mt-1 text-2xl font-semibold text-surface-900 dark:text-surface-100">{users.length}</p>
				</div>
				<div class="card rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Total Environments</p>
					<p class="mt-1 text-2xl font-semibold text-surface-900 dark:text-surface-100">{pods.length}</p>
				</div>
				<div class="card rounded-2xl p-5">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-500">Total VMs</p>
					<p class="mt-1 text-2xl font-semibold text-surface-900 dark:text-surface-100">{totalVMs}</p>
				</div>
			{/if}
		</div>

		<!-- All pods -->
		<div>
			<h2 class="mb-3 text-lg font-semibold text-surface-900 dark:text-surface-100">All Environments</h2>
			<PodList {pods} {loading} showOwner={true} />
		</div>
	{/if}
</div>
