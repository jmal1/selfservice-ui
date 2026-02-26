<script lang="ts">
	import type { Template } from '$lib/types';

	let {
		templates,
		selections,
		onchange
	}: {
		templates: Template[];
		selections: Record<string, number>;
		onchange: (selections: Record<string, number>) => void;
	} = $props();

	function updateQuantity(templateId: string, delta: number) {
		const current = selections[templateId] ?? 0;
		const next = Math.max(0, Math.min(5, current + delta));
		const updated = { ...selections, [templateId]: next };
		if (next === 0) delete updated[templateId];
		onchange(updated);
	}

	function osIcon(osType: string): string {
		const lower = osType.toLowerCase();
		if (lower.includes('windows')) return '🪟';
		if (lower.includes('ubuntu')) return '🐧';
		if (lower.includes('linux')) return '🐧';
		return '💻';
	}
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
	{#each templates.filter((t) => t.is_active) as template (template.id)}
		{@const qty = selections[template.id] ?? 0}
		<div
			class="rounded-2xl border p-5 transition-colors
				{qty > 0
				? 'border-primary-500/50 bg-primary-500/5'
				: 'border-surface-200-800 bg-surface-100-900/50'}"
		>
			<!-- Template info -->
			<div class="mb-3 flex items-start gap-3">
				<span class="text-2xl">{osIcon(template.os_type)}</span>
				<div class="min-w-0 flex-1">
					<h3 class="font-semibold text-surface-900-100">{template.name}</h3>
					{#if template.description}
						<p class="mt-0.5 text-xs text-surface-500">{template.description}</p>
					{/if}
				</div>
			</div>

			<!-- Specs -->
			<div class="mb-4 flex flex-wrap gap-2 text-xs text-surface-500">
				<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{template.default_vcpus} vCPU</span>
				<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{Math.round(template.default_ram_mb / 1024)} GB RAM</span>
				<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{template.default_disk_gb} GB Disk</span>
			</div>

			<!-- Quantity selector -->
			<div class="flex items-center gap-3">
				<label class="text-sm text-surface-500" for="qty-{template.id}">Quantity</label>
				<div class="flex items-center gap-1">
					<button
						class="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-surface-200-800 disabled:opacity-30"
						disabled={qty === 0}
						onclick={() => updateQuantity(template.id, -1)}
						aria-label="Decrease quantity"
					>−</button>
					<input
						id="qty-{template.id}"
						type="text"
						readonly
						value={qty}
						class="h-8 w-10 rounded-lg border border-surface-200-800 bg-transparent text-center text-sm font-semibold text-surface-900-100"
					/>
					<button
						class="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-surface-200-800 disabled:opacity-30"
						disabled={qty >= 5}
						onclick={() => updateQuantity(template.id, 1)}
						aria-label="Increase quantity"
					>+</button>
				</div>
			</div>
		</div>
	{/each}
</div>
