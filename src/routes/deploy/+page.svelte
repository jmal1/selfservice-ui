<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/pods/new', { replaceState: true });
	});
</script>

<div class="flex items-center justify-center py-12">
	<p class="text-sm text-surface-500">Redirecting…</p>
</div>
