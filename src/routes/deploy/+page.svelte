<script lang="ts">
	import { onMount } from 'svelte';
	import { getPods } from '$lib/api/client';
	import type { Pod } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let pods = $state<Pod[]>([]);
	let loading = $state(true);

	const activePods = $derived(pods.filter((p) => p.status === 'active' || p.status === 'provisioning'));

	onMount(async () => {
		try {
			pods = await getPods();
		} catch {
			// If we can't load pods, that's okay — they can still create a new environment
		} finally {
			loading = false;
		}
	});
</script>

<div class="mx-auto max-w-3xl space-y-8 py-4">
	<div class="text-center">
		<h1 class="text-2xl font-bold tracking-tight text-surface-900-100">Deploy a VM</h1>
		<p class="mt-2 text-sm text-surface-500">
			Choose where to deploy your new virtual machine
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<!-- Option 1: New environment -->
		<a
			href="/pods/new"
			class="glass group flex flex-col rounded-2xl p-6 transition-all hover:-translate-y-1 hover:border-primary-500/30 hover:shadow-lg hover:shadow-primary-500/5"
		>
			<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500/10">
				<svg class="h-6 w-6 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
			</div>
			<h2 class="text-lg font-semibold text-surface-900-100">New Lab Environment</h2>
			<p class="mt-2 flex-1 text-sm text-surface-500">
				Create a fresh isolated environment with its own network. Add one or more VMs with different operating systems.
			</p>
			<div class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-500 transition-all group-hover:gap-2">
				Get started
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
			</div>
		</a>

		<!-- Option 2: Add to existing -->
		{#if loading}
			<div class="glass flex flex-col rounded-2xl p-6">
				<LoadingSkeleton width="3rem" height="3rem" rounded="rounded-xl" />
				<div class="mt-4"><LoadingSkeleton width="10rem" height="1.25rem" /></div>
				<div class="mt-2"><LoadingSkeleton height="2.5rem" /></div>
			</div>
		{:else if activePods.length > 0}
			<div class="glass flex flex-col rounded-2xl p-6">
				<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-tertiary-500/10">
					<svg class="h-6 w-6 text-tertiary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-surface-900-100">Add to Existing</h2>
				<p class="mt-2 flex-1 text-sm text-surface-500">
					Deploy another VM into one of your existing environments.
				</p>

				<div class="mt-4 space-y-2">
					{#each activePods as pod (pod.id)}
						<a
							href="/pods/{pod.id}?addvm=1"
							class="flex items-center justify-between rounded-xl border border-surface-200-800/50 px-4 py-2.5 text-sm transition-all hover:border-primary-500/30 hover:bg-primary-500/5"
						>
							<div class="flex items-center gap-3">
								<span
									class="inline-block h-2 w-2 rounded-full {pod.status === 'active' ? 'bg-success-500 status-pulse' : 'bg-surface-500'}"
								></span>
								<span class="font-medium text-surface-900-100">{pod.name}</span>
							</div>
							<span class="text-xs text-surface-500">{(pod.vms ?? []).length} VM{(pod.vms ?? []).length !== 1 ? 's' : ''}</span>
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<div class="glass flex flex-col items-center justify-center rounded-2xl p-6 text-center">
				<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-200-800/50">
					<svg class="h-6 w-6 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
				</div>
				<p class="text-sm font-medium text-surface-500">No environments yet</p>
				<p class="mt-1 text-xs text-surface-500">Create your first one to get started</p>
			</div>
		{/if}
	</div>

	<!-- Help text -->
	<div class="glass rounded-xl p-4 text-center">
		<p class="text-xs text-surface-500">
			<strong class="text-surface-600-400">What's an environment?</strong> Each lab environment is an isolated network with its own VMs.
			VMs within the same environment can communicate with each other. You connect via VPN.
		</p>
	</div>
</div>
