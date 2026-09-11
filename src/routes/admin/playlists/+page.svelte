<script lang="ts">
	import { onMount } from 'svelte';
	import {
		adminListPlaylists,
		adminGetPlaylist,
		adminCreatePlaylist,
		adminUpdatePlaylist,
		adminDeletePlaylist,
		adminListWorkflows
	} from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Playlist, Workflow } from '$lib/types';

	let playlists: Playlist[] = $state([]);
	let workflows: Workflow[] = $state([]);
	let loading = $state(true);
	let saving = $state(false);

	// Create mode
	let showCreate = $state(false);
	let newName = $state('');
	let newSlug = $state('');
	let newDescription = $state('');
	let newWorkflowIds = $state<string[]>([]);

	// Detail expansion
	let expandedId = $state('');
	let expandedPlaylist: Playlist | null = $state(null);
	let loadingDetail = $state(false);

	// Edit mode
	let editingId = $state('');
	let editName = $state('');
	let editDescription = $state('');
	let editWorkflowIds = $state<string[]>([]);

	const activeWorkflows = $derived(workflows.filter(w => w.status === 'active' || w.status === 'approved'));

	function slugify(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	async function loadData() {
		try {
			[playlists, workflows] = await Promise.all([
				adminListPlaylists().then(r => r ?? []),
				adminListWorkflows().then(r => r ?? [])
			]);
		} catch {
			toastStore.error('Failed to load data');
		} finally {
			loading = false;
		}
	}

	async function toggleDetail(id: string) {
		if (expandedId === id) {
			expandedId = '';
			expandedPlaylist = null;
			return;
		}
		expandedId = id;
		loadingDetail = true;
		try {
			expandedPlaylist = await adminGetPlaylist(id);
		} catch {
			toastStore.error('Failed to load playlist details');
			expandedId = '';
		} finally {
			loadingDetail = false;
		}
	}

	function enterEditMode(pl: Playlist) {
		editingId = pl.id;
		editName = pl.name;
		editDescription = pl.description || '';
		editWorkflowIds = (expandedPlaylist?.workflows ?? []).map(w => w.id);
		expandedId = '';
		expandedPlaylist = null;
	}

	function cancelEdit() {
		editingId = '';
	}

	function toggleEditWorkflow(id: string) {
		if (editWorkflowIds.includes(id)) {
			editWorkflowIds = editWorkflowIds.filter(w => w !== id);
		} else {
			editWorkflowIds = [...editWorkflowIds, id];
		}
	}

	function toggleNewWorkflow(id: string) {
		if (newWorkflowIds.includes(id)) {
			newWorkflowIds = newWorkflowIds.filter(w => w !== id);
		} else {
			newWorkflowIds = [...newWorkflowIds, id];
		}
	}

	async function saveEdit() {
		if (!editingId || !editName.trim()) return;
		saving = true;
		try {
			await adminUpdatePlaylist(editingId, {
				name: editName,
				description: editDescription,
				workflow_ids: editWorkflowIds
			});
			toastStore.success('Playlist updated');
			editingId = '';
			await loadData();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to update playlist');
		} finally {
			saving = false;
		}
	}

	async function toggleActive(pl: Playlist) {
		try {
			await adminUpdatePlaylist(pl.id, { is_active: !pl.is_active });
			toastStore.success(pl.is_active ? 'Deactivated' : 'Activated');
			await loadData();
		} catch (e: any) {
			toastStore.error(e.message);
		}
	}

	async function createPlaylist() {
		if (!newName || !newSlug) { toastStore.error('Name and slug are required'); return; }
		saving = true;
		try {
			await adminCreatePlaylist({
				name: newName,
				slug: newSlug,
				description: newDescription,
				workflow_ids: newWorkflowIds
			});
			toastStore.success('Playlist created');
			showCreate = false;
			newName = ''; newSlug = ''; newDescription = ''; newWorkflowIds = [];
			await loadData();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create playlist');
		} finally {
			saving = false;
		}
	}

	async function deletePlaylist(pl: Playlist) {
		if (!confirm(`Delete playlist "${pl.name}"? This cannot be undone.`)) return;
		try {
			await adminDeletePlaylist(pl.id);
			toastStore.success('Playlist deleted');
			if (expandedId === pl.id) { expandedId = ''; expandedPlaylist = null; }
			if (editingId === pl.id) editingId = '';
			await loadData();
		} catch (e: any) { toastStore.error(e.message); }
	}

	onMount(() => { loadData(); });
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Playlists</h1>
			<p class="mt-1 text-sm text-surface-500">
				Playlists group workflows into assessment sets. Assign playlists to <a href="/admin/templates" class="text-primary-500 hover:underline">VM templates</a> — students see them on their pod testing page.
			</p>
		</div>
		<button class="btn {showCreate ? 'btn-secondary' : 'btn-primary'}" onclick={() => { showCreate = !showCreate; editingId = ''; }}>
			{showCreate ? '✕ Cancel' : '+ New Playlist'}
		</button>
	</div>

	<!-- ━━━ CREATE FORM ━━━ -->
	{#if showCreate}
		<div class="card space-y-4 p-6">
			<h2 class="text-lg font-semibold">Create Playlist</h2>
			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span>Name <span class="text-red-500">*</span></span>
					<input class="input" type="text" bind:value={newName} oninput={() => newSlug = slugify(newName)} placeholder="Windows Hardening Basics" />
				</label>
				<label class="label">
					<span>Slug <span class="text-red-500">*</span></span>
					<input class="input" type="text" bind:value={newSlug} placeholder="windows-hardening-basics" />
				</label>
			</div>
			<label class="label">
				<span>Description</span>
				<textarea class="textarea" rows="2" bind:value={newDescription} placeholder="Basic Windows hardening assessment"></textarea>
			</label>

			<div>
				<span class="text-sm font-medium">Workflows ({newWorkflowIds.length} selected)</span>
				{#if activeWorkflows.length === 0}
					<p class="mt-2 text-sm text-surface-500">No active/approved workflows. <a href="/admin/workflows" class="text-primary-500 hover:underline">Create and approve workflows</a> first.</p>
				{:else}
					<div class="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-surface-200 p-2 dark:border-surface-700">
						{#each activeWorkflows as wf}
							<label class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-surface-50 dark:hover:bg-surface-800/50">
								<input type="checkbox" class="checkbox" checked={newWorkflowIds.includes(wf.id)} onchange={() => toggleNewWorkflow(wf.id)} />
								<div>
									<p class="text-sm font-medium">{wf.name}</p>
									<p class="text-xs text-surface-500">{wf.category} · {wf.execution_mode}</p>
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2">
				<button class="btn btn-secondary" onclick={() => showCreate = false}>Cancel</button>
				<button class="btn btn-primary" disabled={saving || !newName || !newSlug} onclick={createPlaylist}>
					{saving ? 'Creating...' : 'Create Playlist'}
				</button>
			</div>
		</div>
	{/if}

	<!-- ━━━ PLAYLIST LIST ━━━ -->
	{#if loading}
		<LoadingSkeleton />
	{:else if playlists.length === 0 && !showCreate}
		<div class="card p-12 text-center">
			<div class="text-4xl mb-3">🎵</div>
			<p class="text-lg font-medium mb-1">No playlists yet</p>
			<p class="text-sm text-surface-500 mb-4">
				Create a playlist to group workflows into an assessment set.
			</p>
			<button class="btn btn-primary" onclick={() => showCreate = true}>+ New Playlist</button>
		</div>
	{:else}
		<div class="space-y-3">
			{#each playlists as pl}
				<!-- ── EDIT MODE ── -->
				{#if editingId === pl.id}
					<div class="card space-y-4 border-2 border-primary-500/30 p-6">
						<div class="flex items-center justify-between">
							<h2 class="text-lg font-semibold">Edit Playlist</h2>
							<button class="btn btn-sm btn-secondary" onclick={cancelEdit}>✕ Cancel</button>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<label class="label">
								<span>Name</span>
								<input class="input" type="text" bind:value={editName} />
							</label>
							<label class="label">
								<span>Slug</span>
								<input class="input" type="text" value={pl.slug} disabled title="Slug cannot be changed" />
							</label>
						</div>
						<label class="label">
							<span>Description</span>
							<textarea class="textarea" rows="2" bind:value={editDescription}></textarea>
						</label>

						<div>
							<span class="text-sm font-medium">Workflows ({editWorkflowIds.length} selected)</span>
							{#if activeWorkflows.length === 0}
								<p class="mt-2 text-sm text-surface-500">No active/approved workflows available.</p>
							{:else}
								<div class="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-surface-200 p-2 dark:border-surface-700">
									{#each activeWorkflows as wf}
										<label class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-surface-50 dark:hover:bg-surface-800/50">
											<input type="checkbox" class="checkbox" checked={editWorkflowIds.includes(wf.id)} onchange={() => toggleEditWorkflow(wf.id)} />
											<div>
												<p class="text-sm font-medium">{wf.name}</p>
												<p class="text-xs text-surface-500">{wf.category} · {wf.execution_mode}</p>
											</div>
										</label>
									{/each}
								</div>
							{/if}
						</div>

						<div class="flex justify-end gap-2">
							<button class="btn btn-secondary" onclick={cancelEdit}>Cancel</button>
							<button class="btn btn-primary" disabled={saving || !editName.trim()} onclick={saveEdit}>
								{saving ? 'Saving...' : 'Save Changes'}
							</button>
						</div>
					</div>

				<!-- ── DISPLAY MODE ── -->
				{:else}
					<div class="card overflow-hidden {pl.is_active ? '' : 'opacity-60'}">
						<!-- Header -->
						<button class="flex w-full items-center justify-between p-4 text-left" onclick={() => toggleDetail(pl.id)}>
							<div class="flex items-center gap-3">
								<div>
									<div class="flex items-center gap-2">
										<h3 class="font-semibold">{pl.name}</h3>
										{#if !pl.is_active}
											<span class="badge bg-surface-200 text-surface-500 dark:bg-surface-700">Inactive</span>
										{/if}
									</div>
									<p class="text-sm text-surface-500">{pl.description || 'No description'}</p>
									<p class="mt-1 text-xs text-surface-400">
										{pl.slug} · {pl.scoring_mode}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-3">
								<span class="text-surface-400">{expandedId === pl.id ? '▼' : '▶'}</span>
							</div>
						</button>

						<!-- Expanded detail -->
						{#if expandedId === pl.id}
							<div class="border-t border-surface-200 p-5 dark:border-surface-700">
								{#if loadingDetail}
									<LoadingSkeleton />
								{:else if expandedPlaylist}
									<!-- Workflows in this playlist -->
									{#if (expandedPlaylist.workflows ?? []).length > 0}
										<p class="mb-3 text-xs font-semibold uppercase text-surface-500">
											Workflows ({expandedPlaylist.workflows?.length ?? 0})
										</p>
										<div class="space-y-2">
											{#each expandedPlaylist.workflows as wf, i}
												<div class="flex items-center gap-3 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
													<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-bold text-primary-600 dark:text-primary-400">
														{i + 1}
													</span>
													<div class="min-w-0 flex-1">
														<p class="text-sm font-medium">{wf.name}</p>
														{#if wf.description}
															<p class="text-xs text-surface-500 line-clamp-1">{wf.description}</p>
														{/if}
													</div>
													<div class="flex items-center gap-2">
														<span class="badge {wf.execution_mode === 'vmware_tools' ? 'bg-warning-500/10 text-warning-600' : 'bg-primary-500/10 text-primary-600'}">
															{wf.execution_mode}
														</span>
														<span class="badge bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300">
															{wf.category}
														</span>
														<StatusBadge status={wf.status} />
													</div>
												</div>
											{/each}
										</div>
									{:else}
										<p class="text-sm text-surface-500">No workflows in this playlist. Click Edit to add workflows.</p>
									{/if}

									<!-- Actions -->
									<div class="mt-4 flex items-center gap-2 border-t border-surface-100 pt-4 dark:border-surface-700">
										<button class="btn btn-sm btn-primary" onclick={() => enterEditMode(pl)}>Edit</button>
										<button
											class="btn btn-sm btn-ghost"
											onclick={() => toggleActive(pl)}
										>
											{pl.is_active ? 'Deactivate' : 'Activate'}
										</button>
										<button
											class="btn btn-sm btn-ghost text-red-500 hover:text-red-700"
											onclick={() => deletePlaylist(pl)}
										>
											Delete
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
