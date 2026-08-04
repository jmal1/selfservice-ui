<script lang="ts">
	import { adminGetBlueprintVMPlaylistsResolved, adminDeleteBlueprintVMPlaylistsOverride } from '$lib/api/client';
	import type { BlueprintVMPlaylistsResolvedResponse } from '$lib/api/client';

	interface Props {
		blueprintId: string;
	}

	let { blueprintId }: Props = $props();

	let resolvedPlaylists = $state<BlueprintVMPlaylistsResolvedResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let expanded = $state(false);
	let reverting = $state<number | null>(null);

	async function loadPlaylists() {
		loading = true;
		error = null;
		try {
			resolvedPlaylists = await adminGetBlueprintVMPlaylistsResolved(blueprintId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load playlists';
		} finally {
			loading = false;
		}
	}

	async function revertToTemplate(vmSlot: number) {
		reverting = vmSlot;
		try {
			await adminDeleteBlueprintVMPlaylistsOverride(blueprintId, vmSlot);
			// Reload playlists after revert
			await loadPlaylists();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to revert override';
		} finally {
			reverting = null;
		}
	}

	function toggleExpanded() {
		expanded = !expanded;
		if (expanded && !resolvedPlaylists && !loading) {
			loadPlaylists();
		}
	}
</script>

<div class="border-t border-surface-200 dark:border-surface-800">
	<button
		type="button"
		class="w-full px-5 py-3 text-left hover:bg-surface-100 dark:hover:bg-surface-900 flex items-center justify-between"
		onclick={toggleExpanded}
	>
		<span class="text-sm font-medium text-surface-900 dark:text-surface-100">
			Assigned Playlists
		</span>
		<span class="text-surface-500">
			{#if expanded}↓{:else}→{/if}
		</span>
	</button>

	{#if expanded}
		<div class="px-5 py-3 bg-surface-50 dark:bg-surface-950 border-t border-surface-200 dark:border-surface-800">
			{#if loading}
				<p class="text-sm text-surface-500">Loading playlists...</p>
			{:else if error}
				<p class="text-sm text-error-500">{error}</p>
			{:else if !resolvedPlaylists || resolvedPlaylists.vm_playlists.length === 0}
				<p class="text-sm text-surface-500">No VMs with playlists assigned</p>
			{:else}
				<div class="space-y-3">
					{#each resolvedPlaylists.vm_playlists as vmSlot (vmSlot.vm_slot)}
						<div class="border-l-4 border-primary-500 pl-3">
							<p class="text-xs font-semibold text-surface-500 mb-2">VM Slot {vmSlot.vm_slot}</p>
							{#if vmSlot.playlists.length === 0}
								<p class="text-xs text-surface-500">No playlists assigned</p>
							{:else}
								<div class="space-y-1">
									{#each vmSlot.playlists as pl (pl.playlist_id)}
										<div class="flex items-center gap-2 text-xs">
											<span
												class="inline-block px-2 py-0.5 rounded text-xs font-semibold"
												class:bg-blue-100={pl.source === 'blueprint_override'}
												class:text-blue-900={pl.source === 'blueprint_override'}
												class:dark:bg-blue-900={pl.source === 'blueprint_override'}
												class:dark:text-blue-100={pl.source === 'blueprint_override'}
												class:bg-emerald-100={pl.source === 'template_default'}
												class:text-emerald-900={pl.source === 'template_default'}
												class:dark:bg-emerald-900={pl.source === 'template_default'}
												class:dark:text-emerald-100={pl.source === 'template_default'}
											>
												{pl.source === 'blueprint_override' ? 'Override' : 'Template'}
											</span>
											<span class="text-surface-900 dark:text-surface-100 font-medium">{pl.name}</span>
											<span class="text-surface-500 text-xs">({pl.slug})</span>
										</div>
									{/each}
									{#if vmSlot.playlists.some(pl => pl.source === 'blueprint_override')}
										<button
											type="button"
											disabled={reverting === vmSlot.vm_slot}
											onclick={() => revertToTemplate(vmSlot.vm_slot)}
											class="mt-1 text-xs px-2 py-1 rounded bg-surface-200 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{reverting === vmSlot.vm_slot ? 'Reverting...' : 'Revert to Template'}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
