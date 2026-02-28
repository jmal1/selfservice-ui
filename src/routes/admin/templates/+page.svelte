<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import {
		getTemplates,
		adminCreateTemplate,
		adminUpdateTemplate,
		adminDeleteTemplate
	} from '$lib/api/client';
	import type { CreateTemplateRequest } from '$lib/api/client';
	import type { Template } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	// Edit state
	let editingId = $state<string | null>(null);
	let editValues = $state<CreateTemplateRequest>(emptyTemplate());

	// Create state
	let showCreate = $state(false);
	let createValues = $state<CreateTemplateRequest>(emptyTemplate());

	// Delete confirmation
	let deletingId = $state<string | null>(null);

	function emptyTemplate(): CreateTemplateRequest {
		return {
			name: '',
			vcenter_template: '',
			os_type: 'linux',
			default_vcpus: 2,
			default_ram_mb: 2048,
			default_disk_gb: 20,
			min_vcpus: 1,
			min_ram_mb: 1024,
			description: '',
			icon_url: '',
			is_active: true
		};
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadTemplates();

		const interval = setInterval(() => {
			if (!document.hidden) loadTemplates();
		}, 15000);

		return () => clearInterval(interval);
	});

	async function loadTemplates() {
		try {
			templates = await getTemplates();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load templates';
		} finally {
			loading = false;
		}
	}

	function startEdit(t: Template) {
		editingId = t.id;
		editValues = {
			name: t.name,
			vcenter_template: t.vcenter_template,
			os_type: t.os_type,
			default_vcpus: t.default_vcpus,
			default_ram_mb: t.default_ram_mb,
			default_disk_gb: t.default_disk_gb,
			min_vcpus: t.min_vcpus,
			min_ram_mb: t.min_ram_mb,
			description: t.description,
			icon_url: t.icon_url,
			is_active: t.is_active
		};
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveEdit(id: string) {
		saving = true;
		error = null;
		try {
			const updated = await adminUpdateTemplate(id, editValues);
			templates = templates.map((t) => (t.id === id ? updated : t));
			editingId = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update template';
		} finally {
			saving = false;
		}
	}

	async function toggleActive(t: Template) {
		saving = true;
		error = null;
		try {
			const updated = await adminUpdateTemplate(t.id, { is_active: !t.is_active });
			templates = templates.map((tmpl) => (tmpl.id === t.id ? updated : tmpl));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to toggle template';
		} finally {
			saving = false;
		}
	}

	function openCreate() {
		createValues = emptyTemplate();
		showCreate = true;
	}

	function cancelCreate() {
		showCreate = false;
	}

	async function submitCreate() {
		saving = true;
		error = null;
		try {
			const created = await adminCreateTemplate(createValues);
			templates = [...templates, created];
			showCreate = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create template';
		} finally {
			saving = false;
		}
	}

	async function confirmDelete(id: string) {
		saving = true;
		error = null;
		try {
			await adminDeleteTemplate(id);
			templates = templates.filter((t) => t.id !== id);
			deletingId = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete template';
		} finally {
			saving = false;
		}
	}

	const inputClass =
		'w-full rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none';
	const inputSmClass =
		'w-20 rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none';
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900-100">Template Management</h1>
		{#if authStore.isAdmin && !showCreate}
			<button
				class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
				onclick={openCreate}
			>
				+ Add Template
			</button>
		{/if}
	</div>

	{#if !authStore.isAdmin}
		<div
			class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
		>
			You do not have admin access.
		</div>
	{:else}
		{#if error}
			<div
				class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
			>
				{error}
				<button class="ml-2 underline" onclick={() => (error = null)}>dismiss</button>
			</div>
		{/if}

		<!-- Create form -->
		{#if showCreate}
			<div
				class="rounded-2xl border border-primary-500/30 bg-surface-100-900/50 p-5 backdrop-blur-xl"
			>
				<h2 class="mb-4 text-lg font-semibold text-surface-900-100">New Template</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Name</span>
						<input type="text" bind:value={createValues.name} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">vCenter Template</span>
						<input type="text" bind:value={createValues.vcenter_template} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">OS Type</span>
						<select bind:value={createValues.os_type} class={inputClass}>
							<option value="linux">Linux</option>
							<option value="windows">Windows</option>
						</select>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Default vCPUs</span>
						<input type="number" min="1" bind:value={createValues.default_vcpus} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Default RAM (MB)</span>
						<input
							type="number"
							min="512"
							step="512"
							bind:value={createValues.default_ram_mb}
							class={inputClass}
						/>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Default Disk (GB)</span>
						<input type="number" min="1" bind:value={createValues.default_disk_gb} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Min vCPUs</span>
						<input type="number" min="1" bind:value={createValues.min_vcpus} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Min RAM (MB)</span>
						<input
							type="number"
							min="512"
							step="512"
							bind:value={createValues.min_ram_mb}
							class={inputClass}
						/>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Icon URL</span>
						<input type="text" bind:value={createValues.icon_url} class={inputClass} />
					</label>
					<label class="block sm:col-span-2 lg:col-span-3">
						<span class="text-xs font-medium text-surface-500">Description</span>
						<input type="text" bind:value={createValues.description} class={inputClass} />
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={createValues.is_active} class="accent-primary-500" />
						<span class="text-sm text-surface-900-100">Active</span>
					</label>
				</div>
				<div class="mt-4 flex gap-2">
					<button
						class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
						disabled={saving || !createValues.name || !createValues.vcenter_template}
						onclick={submitCreate}
					>
						{saving ? 'Creating…' : 'Create Template'}
					</button>
					<button
						class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200-800"
						onclick={cancelCreate}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Templates table -->
		<div
			class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl"
		>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr
							class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500"
						>
							<th class="px-5 py-3">Name</th>
							<th class="px-5 py-3">vCenter Template</th>
							<th class="px-5 py-3">OS</th>
							<th class="px-5 py-3">Defaults (CPU/RAM/Disk)</th>
							<th class="px-5 py-3">Minimums (CPU/RAM)</th>
							<th class="px-5 py-3">Active</th>
							<th class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(4) as _}
								<tr class="border-b border-surface-200-800">
									{#each Array(7) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if templates.length === 0}
							<tr>
								<td colspan="7" class="px-5 py-12 text-center text-surface-500"
									>No templates found.</td
								>
							</tr>
						{:else}
							{#each templates as t (t.id)}
								{#if editingId === t.id}
									<!-- Inline edit row -->
									<tr class="border-b border-primary-500/20 bg-primary-500/5">
										<td class="px-5 py-3">
											<input type="text" bind:value={editValues.name} class={inputSmClass} style="width:8rem" />
										</td>
										<td class="px-5 py-3">
											<input
												type="text"
												bind:value={editValues.vcenter_template}
												class={inputSmClass}
												style="width:10rem"
											/>
										</td>
										<td class="px-5 py-3">
											<select bind:value={editValues.os_type} class={inputSmClass}>
												<option value="linux">Linux</option>
												<option value="windows">Windows</option>
											</select>
										</td>
										<td class="px-5 py-3">
											<div class="flex gap-1">
												<input
													type="number"
													min="1"
													bind:value={editValues.default_vcpus}
													class={inputSmClass}
													title="vCPUs"
												/>
												<input
													type="number"
													min="512"
													step="512"
													bind:value={editValues.default_ram_mb}
													class={inputSmClass}
													title="RAM (MB)"
												/>
												<input
													type="number"
													min="1"
													bind:value={editValues.default_disk_gb}
													class={inputSmClass}
													title="Disk (GB)"
												/>
											</div>
										</td>
										<td class="px-5 py-3">
											<div class="flex gap-1">
												<input
													type="number"
													min="1"
													bind:value={editValues.min_vcpus}
													class={inputSmClass}
													title="Min vCPUs"
												/>
												<input
													type="number"
													min="512"
													step="512"
													bind:value={editValues.min_ram_mb}
													class={inputSmClass}
													title="Min RAM (MB)"
												/>
											</div>
										</td>
										<td class="px-5 py-3">
											<input
												type="checkbox"
												bind:checked={editValues.is_active}
												class="accent-primary-500"
											/>
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-1">
												<button
													class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
													disabled={saving}
													onclick={() => saveEdit(t.id)}
												>
													{saving ? 'Saving…' : 'Save'}
												</button>
												<button
													class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200-800"
													onclick={cancelEdit}
												>
													Cancel
												</button>
											</div>
										</td>
									</tr>
								{:else if deletingId === t.id}
									<!-- Delete confirmation row -->
									<tr class="border-b border-error-500/20 bg-error-500/5">
										<td colspan="7" class="px-5 py-3">
											<div class="flex items-center justify-between">
												<span class="text-sm text-surface-900-100">
													Delete <strong>{t.name}</strong>? This cannot be undone.
												</span>
												<div class="flex gap-1">
													<button
														class="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 disabled:opacity-50"
														disabled={saving}
														onclick={() => confirmDelete(t.id)}
													>
														{saving ? 'Deleting…' : 'Confirm Delete'}
													</button>
													<button
														class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200-800"
														onclick={() => (deletingId = null)}
													>
														Cancel
													</button>
												</div>
											</div>
										</td>
									</tr>
								{:else}
									<!-- Normal display row -->
									<tr
										class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30"
									>
										<td class="px-5 py-3 font-medium text-surface-900-100">{t.name}</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600-400"
											>{t.vcenter_template}</td
										>
										<td class="px-5 py-3">
											<span
												class="rounded-full px-2 py-0.5 text-xs font-medium {t.os_type === 'windows'
													? 'bg-blue-500/10 text-blue-500'
													: 'bg-emerald-500/10 text-emerald-500'}"
											>
												{t.os_type}
											</span>
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600-400">
											{t.default_vcpus} vCPU / {t.default_ram_mb} MB / {t.default_disk_gb} GB
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600-400">
											{t.min_vcpus} vCPU / {t.min_ram_mb} MB
										</td>
										<td class="px-5 py-3">
											<button
												class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {t.is_active
													? 'bg-success-500'
													: 'bg-surface-300-700'}"
												onclick={() => toggleActive(t)}
												disabled={saving}
												title={t.is_active ? 'Active – click to deactivate' : 'Inactive – click to activate'}
											>
												<span
													class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform {t.is_active
														? 'translate-x-4'
														: 'translate-x-0.5'}"
												></span>
											</button>
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-2">
												<button
													class="text-xs text-primary-500 hover:text-primary-400"
													onclick={() => startEdit(t)}
												>
													Edit
												</button>
												<button
													class="text-xs text-error-500 hover:text-error-400"
													onclick={() => (deletingId = t.id)}
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
