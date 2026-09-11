<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let { value = $bindable(''), placeholder = '', rows = 4, label = 'Description (Markdown supported)' }: { value?: string; placeholder?: string; rows?: number; label?: string } = $props();

	let showPreview = $state(false);

	// Both runtime renders go through DOMPurify so any HTML embedded in the
	// markdown (or any link/img attributes parsed by marked) is sanitized
	// against XSS before it reaches the DOM. The renderer runs entirely in
	// the browser — no markdown leaves the page until the admin clicks Save.
	const rendered = $derived.by(() => {
		const text = (value ?? '').trim();
		if (!text) return '';
		const html = marked.parse(text, { async: false }) as string;
		// dompurify accepts the parsed HTML string and returns a clean
		// HTML string with only safe tags/attributes (default config).
		return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
	});

	const inputClass = 'mt-1 w-full rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
</script>

<div class="block">
	<div class="flex items-center justify-between">
		<span class="text-xs font-medium text-surface-500">{label}</span>
		<button
			type="button"
			class="text-xs text-primary-500 hover:text-primary-400"
			onclick={() => (showPreview = !showPreview)}
		>{showPreview ? 'Edit' : 'Preview'}</button>
	</div>
	{#if showPreview}
		<div class="{inputClass} prose prose-sm max-w-none dark:prose-invert min-h-[6rem]">
			{#if rendered}
				{@html rendered}
			{:else}
				<span class="italic text-surface-400">Nothing to preview.</span>
			{/if}
		</div>
	{:else}
		<textarea
			bind:value
			{placeholder}
			{rows}
			class="{inputClass} font-mono"
		></textarea>
	{/if}
</div>
