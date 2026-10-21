<!--
  BriefingView.svelte

  Renders a pod's published briefing sections (blueprint first, then one per
  template). With more than one section it shows tabs. Fenced code blocks get
  a Copy button, because students paste commands into the VM console.
  All HTML comes from renderBriefing(), which sanitizes it.
-->
<script lang="ts">
	import type { BriefingSection } from '$lib/api/client';
	import { renderBriefing } from '$lib/wiki/markdown';
	import '$lib/wiki/wiki-prose.css';

	let { sections }: { sections: BriefingSection[] } = $props();

	let active = $state(0);
	const current = $derived(sections[Math.min(active, sections.length - 1)]);
	const html = $derived(current ? renderBriefing(current.body_md) : '');

	const label = (s: BriefingSection) => (s.scope === 'blueprint' ? 'Lab' : s.title);

	// Svelte action: re-run whenever the rendered HTML changes.
	function copyButtons(node: HTMLElement, _html: string) {
		const add = () => {
			for (const pre of node.querySelectorAll('pre')) {
				if (pre.querySelector('button.briefing-copy')) continue;
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'briefing-copy';
				btn.textContent = 'Copy';
				btn.setAttribute('aria-label', 'Copy code to clipboard');
				btn.addEventListener('click', async () => {
					const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
					try {
						await navigator.clipboard.writeText(code);
						btn.textContent = 'Copied';
					} catch {
						btn.textContent = 'Copy failed';
					}
					setTimeout(() => (btn.textContent = 'Copy'), 1500);
				});
				pre.prepend(btn);
			}
		};
		add();
		return { update: add };
	}
</script>

{#if sections.length > 1}
	<div class="mb-3 flex flex-wrap gap-1 border-b border-surface-200 dark:border-surface-800" role="tablist" aria-label="Briefing sections">
		{#each sections as s, i (s.scope + (s.template_id ?? ''))}
			<button
				role="tab"
				aria-selected={i === active}
				class="-mb-px border-b-2 px-3 py-1.5 text-sm {i === active ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-900 dark:hover:text-surface-100'}"
				onclick={() => (active = i)}
			>
				{label(s)}
			</button>
		{/each}
	</div>
{/if}

{#if current}
	{#if current.scope === 'template' && current.vm_names?.length}
		<p class="mb-2 text-xs text-surface-500">For: {current.vm_names.join(', ')}</p>
	{/if}
	<article class="wiki-prose briefing-body" role={sections.length > 1 ? 'tabpanel' : undefined} use:copyButtons={html}>
		{@html html}
	</article>
{/if}

<style>
	.briefing-body :global(pre) {
		position: relative;
	}
	.briefing-body :global(button.briefing-copy) {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		font-size: 0.7rem;
		padding: 0.1rem 0.5rem;
		border-radius: 0.25rem;
		background: rgb(0 0 0 / 0.55);
		color: white;
	}
	@media print {
		.briefing-body :global(button.briefing-copy) {
			display: none;
		}
	}
</style>
