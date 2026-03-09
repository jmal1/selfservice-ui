<script lang="ts">
	import { onMount } from 'svelte';
	import { listSnapshots, createSnapshot, revertToInitial, revertToSnapshot, deleteSnapshot } from '$lib/api/client';
	import type { VMSnapshot } from '$lib/types';

	let { podId, vmId, vmStatus }: { podId: string; vmId: string; vmStatus: string } = $props();

	let snapshots = $state<VMSnapshot[]>([]);
	let loading = $state(true);
	let actionLoading = $state<string | null>(null);
	let showCreateForm = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let errorMsg = $state<string | null>(null);
	let confirmRevert = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);

	const isStopped = $derived(vmStatus === 'powered_off' || vmStatus === 'stopped');
	const initialSnap = $derived(snapshots.find((s) => s.is_initial));
	const userSnaps = $derived(snapshots.filter((s) => !s.is_initial));
	const canCreate = $derived(userSnaps.length < 2);

	onMount(() => {
		loadSnapshots();
	});

	async function loadSnapshots() {
		loading = true;
		try {
			snapshots = await listSnapshots(podId, vmId);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load snapshots';
		} finally {
			loading = false;
		}
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		actionLoading = 'create';
		errorMsg = null;
		try {
			await createSnapshot(podId, vmId, newName.trim(), newDescription.trim());
			newName = '';
			newDescription = '';
			showCreateForm = false;
			setTimeout(() => loadSnapshots(), 3000);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to create snapshot';
		} finally {
			actionLoading = null;
		}
	}

	async function handleRevertInitial() {
		if (confirmRevert !== 'initial') {
			confirmRevert = 'initial';
			return;
		}
		actionLoading = 'revert-initial';
		errorMsg = null;
		confirmRevert = null;
		try {
			await revertToInitial(podId, vmId);
			setTimeout(() => loadSnapshots(), 3000);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to revert';
		} finally {
			actionLoading = null;
		}
	}

	async function handleRevert(snapId: string) {
		if (confirmRevert !== snapId) {
			confirmRevert = snapId;
			return;
		}
		actionLoading = `revert-${snapId}`;
		errorMsg = null;
		confirmRevert = null;
		try {
			await revertToSnapshot(podId, vmId, snapId);
			setTimeout(() => loadSnapshots(), 3000);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to revert';
		} finally {
			actionLoading = null;
		}
	}

	async function handleDelete(snapId: string) {
		if (confirmDelete !== snapId) {
			confirmDelete = snapId;
			return;
		}
		actionLoading = `delete-${snapId}`;
		errorMsg = null;
		confirmDelete = null;
		try {
			await deleteSnapshot(podId, vmId, snapId);
			snapshots = snapshots.filter((s) => s.id !== snapId);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Failed to delete snapshot';
		} finally {
			actionLoading = null;
		}
	}
</script>

<div class="rounded-xl border border-surface-200-800/50 bg-surface-50-950/50 p-4">
	<div class="mb-3 flex items-center justify-between">
		<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">Snapshots</span>
		{#if canCreate}
			<button
				onclick={() => {
					showCreateForm = !showCreateForm;
				}}
				class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
			>
				+ New Snapshot
			</button>
		{:else}
			<span class="text-xs text-warning-500">Limit reached (2/2)</span>
		{/if}
	</div>

	{#if errorMsg}
		<div class="mb-3 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-500">
			{errorMsg}
		</div>
	{/if}

	{#if showCreateForm}
		<div class="mb-3 rounded-lg border border-primary-500/20 bg-primary-500/5 p-3">
			<input
				bind:value={newName}
				placeholder="Snapshot name"
				maxlength={64}
				class="mb-2 w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-1.5 text-sm text-surface-900-100 placeholder:text-surface-500"
			/>
			<input
				bind:value={newDescription}
				placeholder="Description (optional)"
				maxlength={256}
				class="mb-2 w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-1.5 text-sm text-surface-900-100 placeholder:text-surface-500"
			/>
			<div class="flex gap-2">
				<button
					onclick={handleCreate}
					disabled={!newName.trim() || actionLoading === 'create'}
					class="rounded-lg bg-primary-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
				>
					{actionLoading === 'create' ? 'Creating…' : 'Create'}
				</button>
				<button
					onclick={() => {
						showCreateForm = false;
					}}
					class="rounded-lg border border-surface-200-800 px-3 py-1 text-xs text-surface-500"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="text-xs text-surface-500">Loading snapshots…</p>
	{:else}
		{#if initialSnap}
			<div class="mb-2 flex items-center justify-between rounded-lg bg-surface-200-800/30 px-3 py-2">
				<div>
					<span class="text-sm font-medium text-surface-900-100">🔄 Restore to Original</span>
					<span class="ml-2 text-xs text-surface-400"
						>Created {new Date(initialSnap.created_at).toLocaleDateString()}</span
					>
				</div>
				{#if confirmRevert === 'initial'}
					<div class="flex gap-1">
						<button
							onclick={handleRevertInitial}
							disabled={actionLoading === 'revert-initial'}
							class="rounded-lg bg-warning-500 px-2 py-1 text-xs font-semibold text-white"
						>
							{actionLoading === 'revert-initial' ? 'Reverting…' : 'Confirm'}
						</button>
						<button
							onclick={() => {
								confirmRevert = null;
							}}
							class="rounded-lg border border-surface-200-800 px-2 py-1 text-xs text-surface-500"
							>Cancel</button
						>
					</div>
				{:else}
					<button
						onclick={handleRevertInitial}
						disabled={!isStopped}
						class="rounded-lg border border-warning-500/30 px-2 py-1 text-xs font-medium {isStopped
							? 'text-warning-500 hover:bg-warning-500/10'
							: 'cursor-not-allowed text-surface-500'}"
						title={isStopped ? 'Revert VM to original state' : 'Power off VM first'}
					>
						Restore
					</button>
				{/if}
			</div>
		{/if}

		{#if userSnaps.length === 0}
			<p class="py-2 text-center text-xs text-surface-500">No snapshots yet</p>
		{:else}
			{#each userSnaps as snap (snap.id)}
				<div
					class="mb-1 flex items-center justify-between rounded-lg bg-surface-200-800/20 px-3 py-2"
				>
					<div>
						<span class="text-sm font-medium text-surface-900-100">📸 {snap.name}</span>
						{#if snap.description}
							<span class="ml-2 text-xs text-surface-400">{snap.description}</span>
						{/if}
						<span class="ml-2 text-xs text-surface-500"
							>{new Date(snap.created_at).toLocaleDateString()}</span
						>
					</div>
					<div class="flex gap-1">
						{#if confirmRevert === snap.id}
							<button
								onclick={() => handleRevert(snap.id)}
								disabled={actionLoading === `revert-${snap.id}`}
								class="rounded-lg bg-warning-500 px-2 py-1 text-xs font-semibold text-white"
							>
								{actionLoading === `revert-${snap.id}` ? 'Reverting…' : 'Confirm Revert'}
							</button>
							<button
								onclick={() => {
									confirmRevert = null;
								}}
								class="rounded-lg border border-surface-200-800 px-2 py-1 text-xs text-surface-500"
								>Cancel</button
							>
						{:else if confirmDelete === snap.id}
							<button
								onclick={() => handleDelete(snap.id)}
								disabled={actionLoading === `delete-${snap.id}`}
								class="rounded-lg bg-error-500 px-2 py-1 text-xs font-semibold text-white"
							>
								{actionLoading === `delete-${snap.id}` ? 'Deleting…' : 'Confirm Delete'}
							</button>
							<button
								onclick={() => {
									confirmDelete = null;
								}}
								class="rounded-lg border border-surface-200-800 px-2 py-1 text-xs text-surface-500"
								>Cancel</button
							>
						{:else}
							<button
								onclick={() => handleRevert(snap.id)}
								disabled={!isStopped}
								class="rounded-lg border border-warning-500/30 px-2 py-1 text-xs {isStopped
									? 'text-warning-500 hover:bg-warning-500/10'
									: 'cursor-not-allowed text-surface-500'}"
								title={isStopped ? 'Revert to this snapshot' : 'Power off VM first'}
							>
								Revert
							</button>
							<button
								onclick={() => handleDelete(snap.id)}
								class="rounded-lg border border-error-500/30 px-2 py-1 text-xs text-error-500 hover:bg-error-500/10"
							>
								Delete
							</button>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	{/if}
</div>
