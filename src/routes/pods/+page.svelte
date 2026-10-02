<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { getPods } from '$lib/api/client';
	import type { Pod } from '$lib/types';
	import PodList from '$lib/components/PodList.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { provisioningStore } from '$lib/stores/provisioning.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { isolatedLabsDeniedMessage, labsPageDenied, showDeploy } from '$lib/labs/access';
	import { isolatedPods } from '$lib/labs/single-vm';

	let pods = $state<Pod[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadPods() {
		try {
			pods = await getPods();
		} catch (e) {
			error = friendlyError(e, 'Failed to load environments');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadPods();

		const interval = setInterval(() => {
			if (!document.hidden) loadPods();
		}, 10000);

		return () => clearInterval(interval);
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">My Labs</h1>
		{#if showDeploy(authStore.user) && provisioningStore.canProvision}
			<a
				href="/deploy"
				class="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				New lab
			</a>
		{:else if showDeploy(authStore.user)}
			<span
				class="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-surface-300 px-4 py-2.5 text-sm font-semibold text-surface-500 dark:bg-surface-800"
				role="link"
				aria-disabled="true"
				title={provisioningStore.message}
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				New lab
			</span>
		{/if}
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	{#if labsPageDenied(authStore.user, pods, loading)}
		<div class="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 px-4 py-3 text-sm text-surface-600 dark:text-surface-300">
			{isolatedLabsDeniedMessage}
		</div>
	{:else}
		<PodList pods={isolatedPods(pods)} {loading} />
	{/if}
</div>
