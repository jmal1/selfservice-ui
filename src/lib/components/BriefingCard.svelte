<!--
  BriefingCard.svelte

  The pod page's briefing card. Renders nothing when no briefing is published
  (or the request fails), so pods without briefings look exactly as before.
  Collapsed by default; "Open in new window" reuses one named popup so the
  briefing can sit beside the VM console, and falls back to the new-tab link
  when the browser blocks popups.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getPodBriefing, type BriefingSection } from '$lib/api/client';
	import { briefingHref, openBriefingWindow } from '$lib/briefing/open';
	import BriefingView from './BriefingView.svelte';

	let { podId }: { podId: string } = $props();

	let sections = $state<BriefingSection[]>([]);
	let expanded = $state(false);
	let popupBlocked = $state(false);

	onMount(async () => {
		try {
			sections = await getPodBriefing(podId);
		} catch {
			sections = [];
		}
	});

	function openWindow() {
		popupBlocked = openBriefingWindow(podId) === null;
	}
</script>

{#if sections.length > 0}
	<section
		aria-labelledby="pod-briefing-title"
		class="rounded-2xl border border-surface-200 bg-surface-100/50 px-5 py-4 backdrop-blur-xl dark:border-surface-800 dark:bg-surface-900/50"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 id="pod-briefing-title" class="text-sm font-semibold text-surface-900 dark:text-surface-100">Briefing</h2>
			<div class="flex flex-wrap items-center gap-2 text-xs">
				<button class="btn btn-sm btn-ghost" onclick={openWindow}>Open in new window</button>
				<a class="btn btn-sm btn-ghost" href={briefingHref(podId)} target="_blank" rel="noopener">Open in new tab</a>
			</div>
		</div>
		{#if popupBlocked}
			<p class="mb-2 text-xs text-warning-500" role="status">
				Your browser blocked the popup. Use “Open in new tab”, or allow popups for this site.
			</p>
		{/if}
		<div class="relative {expanded ? '' : 'max-h-64 overflow-hidden'}" id="pod-briefing-body">
			<BriefingView {sections} />
			{#if !expanded}
				<div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-100 dark:from-surface-900"></div>
			{/if}
		</div>
		<button
			class="mt-2 text-xs text-primary-500 hover:underline"
			aria-expanded={expanded}
			aria-controls="pod-briefing-body"
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? 'Collapse' : 'Expand'}
		</button>
	</section>
{/if}
