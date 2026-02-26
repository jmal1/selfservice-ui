<script lang="ts">
	import { onMount } from 'svelte';
	import { getTemplates } from '$lib/api/client';
	import type { Template } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function osIcon(osType: string): string {
		const lower = osType.toLowerCase();
		if (lower.includes('windows')) return '🪟';
		if (lower.includes('ubuntu')) return '🐧';
		if (lower.includes('linux')) return '🐧';
		return '💻';
	}

	onMount(async () => {
		try {
			templates = await getTemplates();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load templates';
		} finally {
			loading = false;
		}
	});
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-surface-900-100">Templates</h1>
			<p class="mt-1 text-sm text-surface-500">Available VM templates you can deploy</p>
		</div>
		<a
			href="/deploy"
			class="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
		>
			Deploy VM
		</a>
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each Array(3) as _}
				<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900/50 p-5">
					<LoadingSkeleton height="1.5rem" width="60%" />
					<div class="mt-2"><LoadingSkeleton height="0.75rem" width="90%" /></div>
					<div class="mt-4 flex gap-2">
						<LoadingSkeleton height="1.25rem" width="4rem" rounded="rounded-md" />
						<LoadingSkeleton height="1.25rem" width="5rem" rounded="rounded-md" />
						<LoadingSkeleton height="1.25rem" width="4.5rem" rounded="rounded-md" />
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each templates as template (template.id)}
				<div class="glass rounded-2xl p-5 {template.is_active ? '' : 'opacity-50'}">
					<div class="mb-3 flex items-start gap-3">
						<span class="text-2xl">{osIcon(template.os_type)}</span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h3 class="font-semibold text-surface-900-100">{template.name}</h3>
								{#if !template.is_active}
									<span class="rounded-full bg-surface-200-800 px-2 py-0.5 text-xs text-surface-500">Inactive</span>
								{/if}
							</div>
							{#if template.description}
								<p class="mt-0.5 text-xs text-surface-500">{template.description}</p>
							{/if}
						</div>
					</div>

					<div class="flex flex-wrap gap-2 text-xs text-surface-500">
						<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{template.default_vcpus} vCPU</span>
						<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{Math.round(template.default_ram_mb / 1024)} GB RAM</span>
						<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{template.default_disk_gb} GB Disk</span>
						<span class="rounded-md bg-primary-500/15 px-2 py-0.5 text-primary-400">{template.os_type}</span>
					</div>
				</div>
			{/each}
		</div>

		{#if templates.length === 0}
			<div class="py-12 text-center text-surface-500">
				<p class="text-lg font-medium">No templates available</p>
			</div>
		{/if}
	{/if}
</div>
