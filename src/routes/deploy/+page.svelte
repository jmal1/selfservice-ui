<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { isolatedLabsDeniedMessage, labsClosed } from '$lib/labs/access';

	const closed = $derived(labsClosed(authStore.user));

	onMount(() => {
		if (!labsClosed(authStore.user)) {
			goto('/pods/new', { replaceState: true });
		}
	});
</script>

<div class="mx-auto max-w-3xl py-12">
	{#if closed}
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Deploy VMs</h1>
		<p class="mt-3 text-sm text-surface-600 dark:text-surface-300">{isolatedLabsDeniedMessage}</p>
	{:else}
		<p class="text-sm text-surface-500">Redirecting…</p>
	{/if}
</div>
