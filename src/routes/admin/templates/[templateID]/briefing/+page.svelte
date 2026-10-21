<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { adminListTemplates } from '$lib/api/client';
	import BriefingEditor from '$lib/components/BriefingEditor.svelte';

	const templateID = $derived(page.params.templateID as string);
	let name = $state('');

	onMount(async () => {
		try {
			name = (await adminListTemplates()).find((t) => t.id === templateID)?.name ?? '';
		} catch {
			// the editor reports load errors itself; the name is cosmetic
		}
	});
</script>

<svelte:head><title>Briefing — {name || 'Template'} · Crucible</title></svelte:head>

<div class="space-y-3">
	<a href="/admin/templates" class="text-xs text-primary-500 hover:underline">← Templates</a>
	{#key templateID}
		<BriefingEditor kind="templates" ownerId={templateID} ownerName={name || 'Template'} />
	{/key}
</div>
