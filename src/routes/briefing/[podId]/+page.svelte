<!--
  Standalone briefing page for one pod, opened from the pod page as a named
  popup or a new tab so it can sit beside the VM console. The root layout
  hides the sidebar for /briefing/*. Readable by the pod owner and by any
  instructor (the API enforces it).
-->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getPod, getPodBriefing, type BriefingSection } from '$lib/api/client';
	import BriefingView from '$lib/components/BriefingView.svelte';
	import { safeErrorText } from '$lib/errors/friendly';

	const podId = $derived(page.params.podId as string);
	let sections = $state<BriefingSection[] | null>(null);
	let podName = $state('');
	let loadError = $state('');

	onMount(async () => {
		try {
			sections = await getPodBriefing(podId);
		} catch (e) {
			loadError = safeErrorText(e) ?? 'request failed';
		}
		try {
			podName = (await getPod(podId)).name;
		} catch {
			// instructors can read any pod's briefing but not every pod; the name is cosmetic
		}
	});
</script>

<svelte:head><title>{podName ? `${podName} — Briefing` : 'Briefing'} · Crucible</title></svelte:head>

<main class="briefing-standalone mx-auto max-w-3xl px-6 py-6">
	<header class="mb-4 flex items-center justify-between gap-3">
		<h1 class="text-xl font-semibold">{podName ? `${podName} — Briefing` : 'Briefing'}</h1>
		<button class="btn btn-sm btn-ghost print:hidden" onclick={() => window.print()}>Print</button>
	</header>
	{#if loadError}
		<p class="rounded border border-error-500/30 bg-error-500/10 p-4 text-sm text-error-500" role="alert">
			Could not load the briefing: {loadError}
		</p>
	{:else if sections === null}
		<p class="text-sm text-surface-500">Loading…</p>
	{:else if sections.length === 0}
		<p class="text-sm text-surface-500">Your instructor has not published a briefing for this lab.</p>
	{:else}
		<BriefingView {sections} />
	{/if}
</main>

<style>
	@media print {
		.briefing-standalone {
			max-width: none;
			padding: 0;
			color: black;
		}
	}
</style>
