<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { adminGetBlueprints } from '$lib/api/client';
	import BriefingEditor from '$lib/components/BriefingEditor.svelte';

	const blueprintID = $derived(page.params.blueprintID as string);
	let name = $state('');

	onMount(async () => {
		try {
			name = (await adminGetBlueprints()).find((t) => t.id === blueprintID)?.name ?? '';
		} catch {
			// the editor reports load errors itself; the name is cosmetic
		}
	});
</script>

<svelte:head><title>Briefing — {name || 'Blueprint'} · Crucible</title></svelte:head>

<div class="space-y-3">
	<a href="/admin/blueprints" class="text-xs text-primary-500 hover:underline">← Blueprints</a>
	{#key blueprintID}
		<BriefingEditor kind="blueprints" ownerId={blueprintID} ownerName={name || 'Blueprint'} />
	{/key}
</div>
