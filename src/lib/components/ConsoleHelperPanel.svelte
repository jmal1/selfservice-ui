<!--
  ConsoleHelperPanel — collapsible overlay of resolveConsoleHelpers()
  sections. Mounted beside WMKS on the student console (absolute) or
  inline on the resume interstitial (static). Must never steal focus
  from #console-canvas: buttons use mousedown preventDefault and restore
  canvas focus after click when the canvas exists.
-->
<script lang="ts">
	import type { ConsoleHelperSection } from '$lib/console/helpers';
	import { copyToClipboard } from '$lib/utils/clipboard';

	let {
		sections = [],
		variant = 'overlay'
	}: {
		sections: ConsoleHelperSection[];
		/** overlay = absolute on WMKS canvas; inline = flow layout (resume interstitial). */
		variant?: 'overlay' | 'inline';
	} = $props();

	let expanded = $state(true);
	let copiedField = $state<string | null>(null);
	let showSecrets = $state<Record<string, boolean>>({});

	function restoreConsoleFocus() {
		const canvas = document.getElementById('console-canvas') as HTMLElement | null;
		canvas?.focus({ preventScroll: true });
	}

	/** Keep pointer activation without moving keyboard focus onto the helper. */
	function keepCanvasFocus(event: MouseEvent) {
		event.preventDefault();
	}

	async function handleCopy(text: string, fieldKey: string) {
		const ok = await copyToClipboard(text);
		if (ok) {
			copiedField = fieldKey;
			setTimeout(() => {
				if (copiedField === fieldKey) copiedField = null;
			}, 2000);
		}
		restoreConsoleFocus();
	}

	function toggleSecret(fieldKey: string) {
		showSecrets = { ...showSecrets, [fieldKey]: !showSecrets[fieldKey] };
		restoreConsoleFocus();
	}

	function toggleExpanded() {
		expanded = !expanded;
		restoreConsoleFocus();
	}

	const rootClass = $derived(
		variant === 'overlay'
			? 'pointer-events-auto absolute right-3 top-3 z-20 w-72 max-w-[min(18rem,calc(100%-1.5rem))] rounded-xl border border-surface-600 bg-surface-950/95 text-surface-100 shadow-xl backdrop-blur'
			: 'w-full rounded-xl border border-surface-600 bg-surface-950/80 text-surface-100'
	);
</script>

{#if sections.length > 0}
	<aside
		data-testid="console-helper"
		aria-label="VM console helper"
		tabindex="-1"
		class={rootClass}
	>
		<button
			type="button"
			class="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-surface-300 hover:bg-surface-800/60"
			aria-expanded={expanded}
			aria-controls="console-helper-body"
			data-testid="console-helper-toggle"
			onmousedown={keepCanvasFocus}
			onclick={toggleExpanded}
		>
			<span>VM Access</span>
			<span class="text-surface-500" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
		</button>

		{#if expanded}
			<div id="console-helper-body" class="space-y-3 border-t border-surface-700 px-3 py-3">
				{#each sections as section (section.id)}
					<section
						data-testid={`console-helper-${section.id}`}
						aria-label={section.title}
						class="space-y-2"
					>
						<h2 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400">
							{section.title}
						</h2>
						{#if section.body}
							<p class="text-[11px] leading-snug text-surface-400">{section.body}</p>
						{/if}
						{#if section.fields?.length}
							<ul class="space-y-1.5">
								{#each section.fields as field (field.id)}
									<li class="flex items-center gap-2">
										<span class="w-14 shrink-0 text-[10px] uppercase tracking-wide text-surface-500">
											{field.label}
										</span>
										<code
											class="min-w-0 flex-1 truncate rounded bg-surface-800 px-2 py-1 font-mono text-xs text-surface-100"
											title={field.secret && !showSecrets[`${section.id}:${field.id}`]
												? undefined
												: field.value}
										>
											{#if field.secret && !showSecrets[`${section.id}:${field.id}`]}
												••••••••
											{:else}
												{field.value}
											{/if}
										</code>
										{#if field.secret}
											<button
												type="button"
												class="rounded border border-surface-600 px-2 py-1 text-[10px] text-surface-300 hover:bg-surface-800"
												aria-label={showSecrets[`${section.id}:${field.id}`]
													? `Hide ${field.label}`
													: `Show ${field.label}`}
												onmousedown={keepCanvasFocus}
												onclick={() => toggleSecret(`${section.id}:${field.id}`)}
											>
												{showSecrets[`${section.id}:${field.id}`] ? 'Hide' : 'Show'}
											</button>
										{/if}
										{#if field.copyable}
											<button
												type="button"
												class="rounded border border-primary-500/30 bg-primary-500/10 px-2 py-1 text-[10px] font-medium text-primary-400 hover:bg-primary-500/20"
												aria-label={`Copy ${field.label}`}
												data-testid={`console-helper-copy-${section.id}-${field.id}`}
												onmousedown={keepCanvasFocus}
												onclick={() => handleCopy(field.value, `${section.id}:${field.id}`)}
											>
												{copiedField === `${section.id}:${field.id}` ? '✓' : 'Copy'}
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	</aside>
{/if}
