<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListPlaylists, adminDeletePlaylist } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Playlist } from '$lib/types';

	let playlists: Playlist[] = $state([]);
	let loading = $state(true);

	async function loadPlaylists() {
		try {
			playlists = (await adminListPlaylists()) ?? [];
		} catch {
			toastStore.error('Failed to load playlists');
		} finally {
			loading = false;
		}
	}

	async function deletePlaylist(id: string, name: string) {
		if (!confirm(`Delete playlist "${name}"?`)) return;
		try {
			await adminDeletePlaylist(id);
			toastStore.success('Playlist deleted');
			await loadPlaylists();
		} catch (e: any) { toastStore.error(e.message); }
	}

	onMount(() => { loadPlaylists(); });
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Playlists</h1>
	</div>

	{#if loading}
		<LoadingSkeleton />
	{:else if playlists.length === 0}
		<p class="text-surface-600-400">No playlists created yet.</p>
	{:else}
		<div class="grid gap-4">
			{#each playlists as pl}
				<div class="card variant-ghost-surface p-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-semibold">{pl.name}</h3>
							<p class="text-sm text-surface-600-400">{pl.description || 'No description'}</p>
							<p class="mt-1 text-xs text-surface-500">
								{pl.slug} · {pl.scoring_mode} · {pl.is_active ? 'Active' : 'Inactive'}
							</p>
						</div>
						<div class="flex gap-2">
							<button
								class="btn btn-sm variant-ghost-error"
								onclick={() => deletePlaylist(pl.id, pl.name)}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
