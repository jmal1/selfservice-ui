<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListPlaylists, adminCreatePlaylist, adminDeletePlaylist, adminListWorkflows } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Playlist, Workflow } from '$lib/types';

	let playlists: Playlist[] = $state([]);
	let workflows: Workflow[] = $state([]);
	let loading = $state(true);
	let showCreate = $state(false);
	let saving = $state(false);

	let newName = $state('');
	let newSlug = $state('');
	let newDescription = $state('');
	let selectedWorkflowIds = $state<string[]>([]);

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

	function toggleWorkflow(id: string) {
		if (selectedWorkflowIds.includes(id)) {
			selectedWorkflowIds = selectedWorkflowIds.filter(w => w !== id);
		} else {
			selectedWorkflowIds = [...selectedWorkflowIds, id];
		}
	}

	async function createPlaylist() {
		if (!newName || !newSlug) { toastStore.error('Name and slug are required'); return; }
		try {
			saving = true;
			await adminCreatePlaylist({
				name: newName,
				slug: newSlug,
				description: newDescription,
				workflow_ids: selectedWorkflowIds
			});
			toastStore.success('Playlist created');
			showCreate = false;
			newName = ''; newSlug = ''; newDescription = ''; selectedWorkflowIds = [];
			await loadData();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create playlist');
		} finally {
			saving = false;
		}
	}

	async function deletePlaylist(id: string, name: string) {
		if (!confirm(`Delete playlist "${name}"?`)) return;
		try {
			await adminDeletePlaylist(id);
			toastStore.success('Playlist deleted');
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
				Playlists group workflows into assessment sets. Assign playlists to VM templates — students see them on their pod testing page.
			</p>
		</div>
		<button class="btn {showCreate ? 'btn-secondary' : 'btn-primary'}" onclick={() => showCreate = !showCreate}>
			{showCreate ? '✕ Cancel' : '+ New Playlist'}
		</button>
	</div>

	{#if showCreate}
		<div class="card space-y-4 p-6">
			<h2 class="text-lg font-semibold">Create Playlist</h2>
			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span>Name</span>
					<input class="input" type="text" bind:value={newName} oninput={() => newSlug = slugify(newName)} placeholder="Windows Hardening Basics" />
				</label>
				<label class="label">
					<span>Slug</span>
					<input class="input" type="text" bind:value={newSlug} placeholder="windows-hardening-basics" />
				</label>
			</div>
			<label class="label">
				<span>Description</span>
				<textarea class="textarea" rows="2" bind:value={newDescription} placeholder="Basic Windows hardening assessment"></textarea>
			</label>

			<!-- Workflow selector -->
			<div>
				<span class="text-sm font-medium">Workflows ({selectedWorkflowIds.length} selected)</span>
				{#if workflows.length === 0}
					<p class="mt-2 text-sm text-surface-600-400">No workflows available. Create workflows first.</p>
				{:else}
					<div class="mt-2 max-h-60 space-y-1 overflow-y-auto rounded border border-surface-400 p-2 dark:border-surface-600">
						{#each workflows.filter(w => w.status === 'active' || w.status === 'approved') as wf}
							<label class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-surface-500/20">
								<input type="checkbox" class="checkbox" checked={selectedWorkflowIds.includes(wf.id)} onchange={() => toggleWorkflow(wf.id)} />
								<div>
									<p class="text-sm font-medium">{wf.name}</p>
									<p class="text-xs text-surface-600-400">{wf.execution_mode} · {wf.category}</p>
								</div>
							</label>
						{/each}
						{#if workflows.filter(w => w.status === 'active' || w.status === 'approved').length === 0}
							<p class="p-2 text-sm text-surface-600-400">No active/approved workflows. Submit and approve workflows first.</p>
						{/if}
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

	{#if loading}
		<LoadingSkeleton />
	{:else if playlists.length === 0 && !showCreate}
		<p class="text-surface-600-400">No playlists created yet. Click "New Playlist" to get started.</p>
	{:else if playlists.length > 0}
		<div class="grid gap-4">
			{#each playlists as pl}
				<div class="card p-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-semibold">{pl.name}</h3>
							<p class="text-sm text-surface-600-400">{pl.description || 'No description'}</p>
							<p class="mt-1 text-xs text-surface-500">
								{pl.slug} · {pl.scoring_mode} · {pl.is_active ? 'Active' : 'Inactive'}
							</p>
						</div>
						<button
							class="btn btn-sm btn-danger"
							onclick={() => deletePlaylist(pl.id, pl.name)}
						>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
