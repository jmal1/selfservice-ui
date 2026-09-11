<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { authStore } from '$lib/stores/auth.svelte';
	import {
		adminListTemplates,
		adminCreateTemplate,
		adminUpdateTemplate,
		adminDeleteTemplate,
		adminListPlaylists,
		adminGetTemplatePlaylists,
		adminSetTemplatePlaylists,
		ApiError
	} from '$lib/api/client';
	import type { CreateTemplateRequest, TemplateVisibility } from '$lib/api/client';
	import type { Template, Playlist } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import VCenterTemplatePicker from '$lib/components/VCenterTemplatePicker.svelte';
	import MarkdownField from '$lib/components/MarkdownField.svelte';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatAttribution } from '$lib/utils/run';

	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	// Playlist assignment state
	let playlists = $state<Playlist[]>([]);
	let playlistsLoaded = $state(false);
	let templatePlaylists = $state<Record<string, string[]>>({});
	let savingPlaylists = $state(false);

	// Edit state
	let editingId = $state<string | null>(null);
	let editingUpdatedAt = $state<string | undefined>(undefined);
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
			is_active: true,
			default_username: '',
			default_password: '',
			kind: 'clone_with_customize',
			assign_ip: true,
			visibility: 'public'
		};
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		loadTemplates();

		const interval = setInterval(() => {
			if (!document.hidden) loadTemplates();
		}, 15000);

		return () => clearInterval(interval);
	});

	async function loadTemplates() {
		try {
			templates = await adminListTemplates();
			if (!playlistsLoaded) {
				playlists = await adminListPlaylists();
				playlistsLoaded = true;
			}
		} catch (e) {
			error = friendlyError(e, 'Failed to load templates');
		} finally {
			loading = false;
		}
	}

	// Playlist assignment for a template
	let playlistEditingTemplateId = $state<string | null>(null);
	let playlistSelections = $state<Set<string>>(new Set());

	async function openPlaylistEditor(templateId: string) {
		if (playlistEditingTemplateId === templateId) {
			playlistEditingTemplateId = null;
			return;
		}
		playlistEditingTemplateId = templateId;
		try {
			const result = await adminGetTemplatePlaylists(templateId);
			playlistSelections = new Set(result.playlist_ids || []);
		} catch {
			playlistSelections = new Set();
		}
	}

	function togglePlaylistSelection(playlistId: string) {
		const next = new Set(playlistSelections);
		if (next.has(playlistId)) next.delete(playlistId);
		else next.add(playlistId);
		playlistSelections = next;
	}

	async function savePlaylistAssignment() {
		if (!playlistEditingTemplateId) return;
		savingPlaylists = true;
		try {
			await adminSetTemplatePlaylists(playlistEditingTemplateId, [...playlistSelections]);
			toastStore.success('Playlists updated');
			playlistEditingTemplateId = null;
		} catch (e: any) {
			error = friendlyError(e, 'Failed to save playlists');
		} finally {
			savingPlaylists = false;
		}
	}

	function startEdit(t: Template) {
		editingId = t.id;
		editingUpdatedAt = t.updated_at;
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
			is_active: t.is_active,
			default_username: t.default_username ?? '',
			default_password: t.default_password ?? '',
			kind: t.kind ?? 'clone_with_customize',
			assign_ip: t.assign_ip ?? true,
			visibility: t.visibility ?? 'public'
		};
	}

	function cancelEdit() {
		editingId = null;
		editingUpdatedAt = undefined;
	}

	async function saveEdit(id: string) {
		saving = true;
		error = null;
		try {
			const updated = await adminUpdateTemplate(id, {
				...editValues,
				expected_updated_at: editingUpdatedAt
			});
			templates = templates.map((t) => (t.id === id ? updated : t));
			editingId = null;
			editingUpdatedAt = undefined;
		} catch (e) {
			if (e instanceof ApiError && e.status === 409) {
				error =
					'This template was modified by another admin since you opened the edit form. ' +
					'Cancel and re-open the row to load the latest version, then re-apply your changes.';
			} else {
				error = friendlyError(e, 'Failed to update template');
			}
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
			error = friendlyError(e, 'Failed to toggle template');
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
			error = friendlyError(e, 'Failed to create template');
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
			error = friendlyError(e, 'Failed to delete template');
		} finally {
			saving = false;
		}
	}

	const inputClass =
		'w-full rounded border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-2 py-1 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none';
	const inputSmClass =
		'w-20 rounded border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-2 py-1 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none';

	function stateBadgeClass(s: string | undefined): string {
		switch (s) {
			case 'ready':
			case 'active':
				return 'bg-success-500/15 text-success-500';
			case 'draft':
				return 'bg-surface-500/15 text-surface-500 dark:text-surface-300';
			case 'provisioning':
			case 'configuring':
			case 'generalizing':
				return 'bg-primary-500/15 text-primary-500';
			case 'error':
				return 'bg-error-500/15 text-error-500';
			default:
				return 'bg-surface-500/15 text-surface-500';
		}
	}

	function isWizardState(s: string | undefined): boolean {
		return s === 'draft' || s === 'provisioning' || s === 'configuring' || s === 'generalizing' || s === 'error';
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Template Management</h1>
		{#if authStore.isInstructor && !showCreate}
			<div class="flex gap-2">
				<a
					href="/admin/templates/new"
					class="rounded-lg bg-secondary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
					title="Open the multi-step wizard (Draft → Provision → Configure → Generalize → Publish)"
				>
					+ New (wizard)
				</a>
				<button
					class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
					onclick={openCreate}
				>
					+ Add Template
				</button>
			</div>
		{/if}
	</div>

	{#if !authStore.isInstructor}
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
				class="rounded-2xl border border-primary-500/30 bg-surface-100/50 dark:bg-surface-900/50 p-5 backdrop-blur-xl"
			>
				<h2 class="mb-4 text-lg font-semibold text-surface-900 dark:text-surface-100">New Template</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Name</span>
						<input type="text" bind:value={createValues.name} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">vCenter Template</span>
						<VCenterTemplatePicker bind:value={createValues.vcenter_template} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">OS Type</span>
						<select bind:value={createValues.os_type} class={inputClass}>
							<option value="linux">Linux</option>
							<option value="windows">Windows</option>
						</select>
					</label>
					<label class="block sm:col-span-2 lg:col-span-3">
						<span class="text-xs font-medium text-surface-500">Provisioning Mode</span>
						<select bind:value={createValues.kind} class={inputClass}>
							<option value="clone_with_customize">
								Clone &amp; Customize — generate per-pod password, sysprep / cloud-init
							</option>
							<option value="clone_no_customize">
								Clone, No Customization — linked clone, guest keeps baked-in credentials
							</option>
							<option value="registered_existing_vm">
								Registered Existing VM — link-clone an already-built VM, static creds
							</option>
						</select>
						<span class="mt-1 block text-xs text-surface-500">
							{#if createValues.kind === 'clone_with_customize'}
								Default. Each pod gets a freshly generated password injected via guestinfo.
							{:else if createValues.kind === 'clone_no_customize'}
								Linked clone of the template; no customization is run. Use the Default Username / Password below for the credentials students will see.
							{:else}
								The vCenter Template field above should point at an already-prepared VM. Each pod gets a linked clone of it.
							{/if}
						</span>
					</label>
					<label class="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
						<input type="checkbox" bind:checked={createValues.assign_ip} class="accent-primary-500" />
						<span class="text-sm text-surface-900 dark:text-surface-100">
							Assign IP from the pod VLAN (uncheck if the guest manages its own networking — DHCP from inside, static config, etc.)
						</span>
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
						<MarkdownField
							bind:value={createValues.description}
							placeholder="Markdown supported — # headings, **bold**, `code`, [links](https://…), lists, etc."
						/>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Default Username</span>
						<input type="text" bind:value={createValues.default_username} class={inputClass} placeholder="e.g. student" />
					</label>
					<div class="block">
						<PasswordField
							bind:value={createValues.default_password}
							placeholder="e.g. changeme"
							hint="Visible to admins only. Stored as plaintext (shared instructor credential)."
						/>
					</div>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Visibility</span>
						<select bind:value={createValues.visibility} class={inputClass}>
							<option value="public">Public — visible to students</option>
							<option value="instructor_only">Instructor only — hidden from students (for staging)</option>
						</select>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={createValues.is_active} class="accent-primary-500" />
						<span class="text-sm text-surface-900 dark:text-surface-100">Active</span>
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
						class="rounded-lg border border-surface-200 dark:border-surface-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
						onclick={cancelCreate}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Templates table -->
		<div
			class="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl"
		>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="sr-only">VM templates</caption>
					<thead>
						<tr
							class="border-b border-surface-200 dark:border-surface-800 text-xs font-semibold uppercase tracking-wider text-surface-500"
						>
							<th scope="col" class="px-5 py-3">Name</th>
							<th scope="col" class="px-5 py-3">State</th>
							<th scope="col" class="px-5 py-3">Created by</th>
							<th scope="col" class="px-5 py-3">vCenter Template</th>
							<th scope="col" class="px-5 py-3">OS</th>
							<th scope="col" class="px-5 py-3">Defaults (CPU/RAM/Disk)</th>
							<th scope="col" class="px-5 py-3">Minimums (CPU/RAM)</th>
							<th scope="col" class="px-5 py-3">Active</th>
							<th scope="col" class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(4) as _}
								<tr class="border-b border-surface-200 dark:border-surface-800">
									{#each Array(9) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if templates.length === 0}
							<tr>
								<td colspan="9" class="px-5 py-12 text-center text-surface-500"
									>No templates found.</td
								>
							</tr>
						{:else}
							{#each templates as t (t.id)}
								{#if editingId === t.id}
									<!-- Inline edit row -->
									<tr class="border-b border-primary-500/20 bg-primary-500/5">
										<td class="px-5 py-3">
											<input type="text" bind:value={editValues.name} class={inputSmClass} style="width:8rem" aria-label="Template name" />
										</td>
										<td class="px-5 py-3 text-xs text-surface-500">
											{t.template_state ?? '—'}
										</td>
										<td class="px-5 py-3 text-sm text-surface-600 dark:text-surface-400">
											{t.creator ? formatAttribution(t.creator.display_name, t.creator.username) : '—'}
										</td>
										<td class="px-5 py-3">
											<input
												type="text"
												bind:value={editValues.vcenter_template}
												class={inputSmClass}
												style="width:10rem"
												aria-label="vCenter template"
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
														aria-label="Default vCPUs"
												/>
												<input
													type="number"
													min="512"
													step="512"
													bind:value={editValues.default_ram_mb}
													class={inputSmClass}
													title="RAM (MB)"
														aria-label="Default RAM in MB"
												/>
												<input
													type="number"
													min="1"
													bind:value={editValues.default_disk_gb}
													class={inputSmClass}
													title="Disk (GB)"
														aria-label="Default disk in GB"
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
														aria-label="Minimum vCPUs"
												/>
												<input
													type="number"
													min="512"
													step="512"
													bind:value={editValues.min_ram_mb}
													class={inputSmClass}
													title="Min RAM (MB)"
														aria-label="Minimum RAM in MB"
												/>
											</div>
										</td>
										<td class="px-5 py-3">
											<div class="flex flex-col gap-1">
												<select bind:value={editValues.kind} class={inputSmClass} aria-label="Provisioning mode">
													<option value="clone_with_customize">Clone+Customize</option>
													<option value="clone_no_customize">Clone, no customize</option>
													<option value="registered_existing_vm">Registered VM</option>
												</select>
												<label class="flex items-center gap-1 text-xs">
													<input
														type="checkbox"
														bind:checked={editValues.assign_ip}
														class="accent-primary-500"
														aria-label="Assign IP"
													/>
													<span>Assign IP</span>
												</label>
												<label class="flex items-center gap-1 text-xs">
													<select bind:value={editValues.visibility} class="rounded border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-1.5 py-0.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none" aria-label="Visibility">
														<option value="public">Public</option>
														<option value="instructor_only">Instructor only</option>
													</select>
												</label>
												<label class="flex items-center gap-1 text-xs">
													<input
														type="checkbox"
														bind:checked={editValues.is_active}
														class="accent-primary-500"
														aria-label="Template active"
													/>
													<span>Active</span>
												</label>
											</div>
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
													class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
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
										<td colspan="9" class="px-5 py-3">
											<div class="flex items-center justify-between">
												<span class="text-sm text-surface-900 dark:text-surface-100">
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
														class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
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
										class="border-b border-surface-200 dark:border-surface-800 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800/30"
									>
										<td class="px-5 py-3 font-medium text-surface-900 dark:text-surface-100">
											{t.name}
											{#if t.visibility === 'instructor_only'}
												<span class="ml-2 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-500/10 text-warning-500">
													🔒 Instructor only
												</span>
											{/if}
										</td>
										<td class="px-5 py-3">
											<span class="rounded-full px-2 py-0.5 text-xs font-medium {stateBadgeClass(t.template_state)}">
												{t.template_state ?? 'unknown'}
											</span>
										</td>
										<td class="px-5 py-3 text-sm text-surface-600 dark:text-surface-400">
											{t.creator ? formatAttribution(t.creator.display_name, t.creator.username) : '—'}
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400"
											>{t.vcenter_template}</td
										>
										<td class="px-5 py-3">
											<span
												class="rounded-full px-2 py-0.5 text-xs font-medium {t.os_type === 'windows'
													? 'bg-secondary-500/10 text-secondary-500'
													: 'bg-success-500/10 text-success-500'}"
											>
												{t.os_type}
											</span>
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400">
											{t.default_vcpus} vCPU / {t.default_ram_mb} MB / {t.default_disk_gb} GB
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400">
											{t.min_vcpus} vCPU / {t.min_ram_mb} MB
										</td>
										<td class="px-5 py-3">
											<button
												class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {t.is_active
													? 'bg-success-500'
													: 'bg-surface-300 dark:bg-surface-700'}"
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
												{#if isWizardState(t.template_state)}
													<a
														class="text-xs text-secondary-500 hover:text-secondary-400"
														href={`/admin/templates/${t.id}/wizard`}
														title="Open the multi-step wizard for this template"
													>
														Resume wizard
													</a>
												{/if}
												<button
													class="text-xs text-primary-500 hover:text-primary-400"
													onclick={() => openPlaylistEditor(t.id)}
												>
													Playlists
												</button>
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
									{#if playlistEditingTemplateId === t.id}
										<tr class="border-b border-primary-500/20 bg-primary-500/5">
											<td colspan="9" class="px-5 py-4">
												<div class="space-y-3">
													<p class="text-sm font-semibold">Assign Playlists to {t.name}</p>
													{#if playlists.length === 0}
														<p class="text-xs text-surface-500">No playlists exist yet. <a href="/admin/playlists" class="text-primary-500 hover:underline">Create one</a> first.</p>
													{:else}
														<div class="flex flex-wrap gap-2">
															{#each playlists as pl}
																<button
																	class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
																		{playlistSelections.has(pl.id)
																			? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
																			: 'border-surface-200 dark:border-surface-700 text-surface-500 hover:border-primary-500/50'}"
																	onclick={() => togglePlaylistSelection(pl.id)}
																>
																	{playlistSelections.has(pl.id) ? '✓ ' : ''}{pl.name}
																</button>
															{/each}
														</div>
													{/if}
													<div class="flex items-center gap-2">
														<button
															class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
															disabled={savingPlaylists}
															onclick={savePlaylistAssignment}
														>
															{savingPlaylists ? 'Saving…' : 'Save Playlists'}
														</button>
														<button
															class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
															onclick={() => playlistEditingTemplateId = null}
														>
															Cancel
														</button>
														<span class="text-xs text-surface-400">{playlistSelections.size} selected</span>
													</div>
												</div>
											</td>
										</tr>
									{/if}
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
