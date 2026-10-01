<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { friendlyError } from '$lib/errors/friendly';
	import { createSingleVM, getTemplates } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import { provisioningStore } from '$lib/stores/provisioning.svelte';
	import { eligibleSingleVMTemplates } from '$lib/labs/single-vm';
	import type { Template } from '$lib/types';

	let templates = $state<Template[]>([]);
	let name = $state('');
	let templateId = $state('');
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const choices = $derived(eligibleSingleVMTemplates(templates, authStore.user?.role));

	onMount(async () => {
		try {
			templates = await getTemplates();
			templateId = eligibleSingleVMTemplates(templates, authStore.user?.role)[0]?.id ?? '';
		} catch (e) {
			error = friendlyError(e, 'Failed to load templates');
		} finally {
			loading = false;
		}
	});

	async function submit() {
		if (!provisioningStore.canProvision || !name.trim() || !templateId) return;
		submitting = true;
		error = null;
		try {
			const created = await createSingleVM({ name: name.trim(), template_id: templateId });
			await goto(`/pods/${created.pod_id}`);
		} catch (e) {
			error = friendlyError(e, 'Failed to create VM');
			submitting = false;
		}
	}
</script>

<div class="mx-auto max-w-xl space-y-6">
	<div>
		<a href="/single-vm" class="text-sm text-primary-500 hover:text-primary-400">← Single VM</a>
		<h1 class="mt-2 text-2xl font-bold text-surface-900 dark:text-surface-100">New VM</h1>
		<p class="mt-1 text-sm text-surface-500">Pick any template you can already use.</p>
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-sm text-surface-500">Loading templates…</p>
	{:else if choices.length === 0}
		<p class="text-sm text-surface-500">No templates are available.</p>
	{:else}
		<form
			class="space-y-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<label class="block">
				<span class="text-xs font-medium text-surface-500">Name</span>
				<input
					bind:value={name}
					required
					class="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs font-medium text-surface-500">Template</span>
				<select
					bind:value={templateId}
					class="mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm"
				>
					{#each choices as template (template.id)}
						<option value={template.id}>
							{template.name}{template.single_vm_only ? ' (Single VM only)' : ''}
						</option>
					{/each}
				</select>
			</label>
			<button
				type="submit"
				class="rounded-[10px] bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
				disabled={submitting || !provisioningStore.canProvision || !name.trim()}
			>
				{submitting ? 'Deploying…' : 'Deploy'}
			</button>
		</form>
	{/if}
</div>
