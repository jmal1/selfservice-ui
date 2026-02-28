<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import {
		adminGetVLANPool,
		adminAddVLAN,
		adminUpdateVLAN,
		adminRemoveVLAN
	} from '$lib/api/client';
	import type { VLANPoolEntry } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let vlans = $state<VLANPoolEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);
	let successMsg = $state<string | null>(null);

	// Add form
	let showAdd = $state(false);
	let addTag = $state(100);
	let addSubnet = $state('');
	let addScope = $state('all');

	// Batch add
	let showBatchAdd = $state(false);
	let batchFrom = $state(100);
	let batchTo = $state(120);
	let batchScope = $state('all');

	// Edit state
	let editingId = $state<number | null>(null);
	let editScope = $state('all');

	// Delete confirmation
	let deletingId = $state<number | null>(null);

	// Filters
	let filterScope = $state('all-scopes');
	let filterStatus = $state('all-status');

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadVLANs();

		const interval = setInterval(() => {
			if (!document.hidden) loadVLANs();
		}, 15000);

		return () => clearInterval(interval);
	});

	async function loadVLANs() {
		try {
			vlans = await adminGetVLANPool();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load VLAN pool';
		} finally {
			loading = false;
		}
	}

	function flash(msg: string) {
		successMsg = msg;
		setTimeout(() => (successMsg = null), 3000);
	}

	// Computed: auto-generate subnet from VLAN tag
	$effect(() => {
		const octet = addTag - 100;
		if (octet >= 0 && octet <= 255) {
			addSubnet = `10.100.${octet}.0/24`;
		}
	});

	async function submitAdd() {
		saving = true;
		error = null;
		try {
			const entry = await adminAddVLAN({
				vlan_tag: addTag,
				subnet: addSubnet,
				host_scope: addScope
			});
			vlans = [...vlans, entry].sort((a, b) => a.vlan_tag - b.vlan_tag);
			showAdd = false;
			flash(`VLAN ${entry.vlan_tag} added`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add VLAN';
		} finally {
			saving = false;
		}
	}

	async function submitBatchAdd() {
		if (batchFrom > batchTo) {
			error = 'Start must be ≤ end';
			return;
		}
		saving = true;
		error = null;
		let added = 0;
		let skipped = 0;
		try {
			for (let tag = batchFrom; tag <= batchTo; tag++) {
				const exists = vlans.some((v) => v.vlan_tag === tag);
				if (exists) {
					skipped++;
					continue;
				}
				const octet = tag - 100;
				const subnet = `10.100.${octet}.0/24`;
				try {
					const entry = await adminAddVLAN({
						vlan_tag: tag,
						subnet,
						host_scope: batchScope
					});
					vlans = [...vlans, entry];
					added++;
				} catch {
					skipped++;
				}
			}
			vlans = vlans.sort((a, b) => a.vlan_tag - b.vlan_tag);
			showBatchAdd = false;
			flash(`Added ${added} VLANs` + (skipped ? `, ${skipped} skipped (already exist)` : ''));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Batch add failed';
		} finally {
			saving = false;
		}
	}

	function startEdit(v: VLANPoolEntry) {
		editingId = v.id;
		editScope = v.host_scope;
	}

	async function saveEdit(id: number) {
		saving = true;
		error = null;
		try {
			const updated = await adminUpdateVLAN(id, { host_scope: editScope });
			vlans = vlans.map((v) => (v.id === id ? updated : v));
			editingId = null;
			flash(`VLAN ${updated.vlan_tag} scope updated to "${updated.host_scope}"`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update VLAN';
		} finally {
			saving = false;
		}
	}

	async function confirmDelete(id: number) {
		saving = true;
		error = null;
		const entry = vlans.find((v) => v.id === id);
		try {
			await adminRemoveVLAN(id);
			vlans = vlans.filter((v) => v.id !== id);
			deletingId = null;
			flash(`VLAN ${entry?.vlan_tag ?? id} removed`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to remove VLAN';
		} finally {
			saving = false;
		}
	}

	const filteredVlans = $derived(
		vlans.filter((v) => {
			if (filterScope !== 'all-scopes' && v.host_scope !== filterScope) return false;
			if (filterStatus === 'available' && v.pod_id) return false;
			if (filterStatus === 'allocated' && !v.pod_id) return false;
			return true;
		})
	);

	const stats = $derived({
		total: vlans.length,
		available: vlans.filter((v) => !v.pod_id).length,
		allocated: vlans.filter((v) => v.pod_id).length,
		allScope: vlans.filter((v) => v.host_scope === 'all').length,
		switch1Scope: vlans.filter((v) => v.host_scope === 'switch1').length
	});

	const inputClass =
		'w-full rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none';
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900-100">VLAN Pool</h1>
		{#if authStore.isAdmin}
			<div class="flex gap-2">
				<button
					class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-semibold text-surface-900-100 hover:bg-surface-200-800"
					onclick={() => { showBatchAdd = !showBatchAdd; showAdd = false; }}
				>
					Batch Add
				</button>
				<button
					class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
					onclick={() => { showAdd = !showAdd; showBatchAdd = false; }}
				>
					+ Add VLAN
				</button>
			</div>
		{/if}
	</div>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else}
		<!-- Stats -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-xl border border-surface-200-800 bg-surface-100-900/50 px-4 py-3 backdrop-blur-xl">
				<div class="text-xs font-medium text-surface-500">Total VLANs</div>
				<div class="text-2xl font-bold text-surface-900-100">{stats.total}</div>
			</div>
			<div class="rounded-xl border border-surface-200-800 bg-surface-100-900/50 px-4 py-3 backdrop-blur-xl">
				<div class="text-xs font-medium text-surface-500">Available</div>
				<div class="text-2xl font-bold text-success-500">{stats.available}</div>
			</div>
			<div class="rounded-xl border border-surface-200-800 bg-surface-100-900/50 px-4 py-3 backdrop-blur-xl">
				<div class="text-xs font-medium text-surface-500">Allocated</div>
				<div class="text-2xl font-bold text-warning-500">{stats.allocated}</div>
			</div>
			<div class="rounded-xl border border-surface-200-800 bg-surface-100-900/50 px-4 py-3 backdrop-blur-xl">
				<div class="text-xs font-medium text-surface-500">All Hosts / Switch1 Only</div>
				<div class="text-2xl font-bold text-surface-900-100">
					{stats.allScope} <span class="text-sm font-normal text-surface-500">/</span> {stats.switch1Scope}
				</div>
			</div>
		</div>

		{#if error}
			<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
				{error}
				<button class="ml-2 underline" onclick={() => (error = null)}>dismiss</button>
			</div>
		{/if}

		{#if successMsg}
			<div class="rounded-xl border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-500">
				{successMsg}
			</div>
		{/if}

		<!-- Add single VLAN form -->
		{#if showAdd}
			<div class="rounded-2xl border border-primary-500/30 bg-surface-100-900/50 p-5 backdrop-blur-xl">
				<h2 class="mb-4 text-lg font-semibold text-surface-900-100">Add VLAN</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">VLAN Tag</span>
						<input type="number" min="1" max="4094" bind:value={addTag} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Subnet</span>
						<input type="text" bind:value={addSubnet} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Host Scope</span>
						<select bind:value={addScope} class={inputClass}>
							<option value="all">All Hosts (both switches)</option>
							<option value="switch1">Switch 1 Only (esxi1/esxi2)</option>
						</select>
					</label>
				</div>
				<div class="mt-4 flex gap-2">
					<button
						class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
						disabled={saving || addTag < 1}
						onclick={submitAdd}
					>
						{saving ? 'Adding…' : 'Add VLAN'}
					</button>
					<button
						class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200-800"
						onclick={() => (showAdd = false)}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Batch add form -->
		{#if showBatchAdd}
			<div class="rounded-2xl border border-primary-500/30 bg-surface-100-900/50 p-5 backdrop-blur-xl">
				<h2 class="mb-4 text-lg font-semibold text-surface-900-100">Batch Add VLANs</h2>
				<p class="mb-3 text-sm text-surface-500">
					Add a range of VLANs with auto-generated subnets (10.100.{'{tag-100}'}.0/24). Existing VLANs in the range will be skipped.
				</p>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">From VLAN Tag</span>
						<input type="number" min="1" max="4094" bind:value={batchFrom} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">To VLAN Tag</span>
						<input type="number" min="1" max="4094" bind:value={batchTo} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Host Scope</span>
						<select bind:value={batchScope} class={inputClass}>
							<option value="all">All Hosts (both switches)</option>
							<option value="switch1">Switch 1 Only (esxi1/esxi2)</option>
						</select>
					</label>
				</div>
				<div class="mt-4 flex gap-2">
					<button
						class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
						disabled={saving || batchFrom > batchTo}
						onclick={submitBatchAdd}
					>
						{saving ? 'Adding…' : `Add ${Math.max(0, batchTo - batchFrom + 1)} VLANs`}
					</button>
					<button
						class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200-800"
						onclick={() => (showBatchAdd = false)}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<!-- Filters -->
		<div class="flex gap-3">
			<select bind:value={filterScope} class="rounded border border-surface-200-800 bg-surface-50-950 px-3 py-1.5 text-sm text-surface-900-100">
				<option value="all-scopes">All Scopes</option>
				<option value="all">All Hosts</option>
				<option value="switch1">Switch 1 Only</option>
			</select>
			<select bind:value={filterStatus} class="rounded border border-surface-200-800 bg-surface-50-950 px-3 py-1.5 text-sm text-surface-900-100">
				<option value="all-status">All Status</option>
				<option value="available">Available</option>
				<option value="allocated">Allocated</option>
			</select>
			<span class="self-center text-xs text-surface-500">{filteredVlans.length} of {vlans.length}</span>
		</div>

		<!-- VLAN table -->
		<div class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th class="px-5 py-3">VLAN Tag</th>
							<th class="px-5 py-3">Subnet</th>
							<th class="px-5 py-3">Host Scope</th>
							<th class="px-5 py-3">Status</th>
							<th class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(6) as _}
								<tr class="border-b border-surface-200-800">
									{#each Array(5) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if filteredVlans.length === 0}
							<tr>
								<td colspan="5" class="px-5 py-12 text-center text-surface-500">No VLANs match filters.</td>
							</tr>
						{:else}
							{#each filteredVlans as v (v.id)}
								{#if editingId === v.id}
									<tr class="border-b border-primary-500/20 bg-primary-500/5">
										<td class="px-5 py-3 font-mono text-surface-900-100">{v.vlan_tag}</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{v.subnet}</td>
										<td class="px-5 py-3">
											<select bind:value={editScope} class="rounded border border-surface-200-800 bg-surface-50-950 px-2 py-1 text-sm text-surface-900-100">
												<option value="all">All Hosts</option>
												<option value="switch1">Switch 1 Only</option>
											</select>
										</td>
										<td class="px-5 py-3">
											{#if v.pod_id}
												<span class="rounded-full bg-warning-500/10 px-2 py-0.5 text-xs font-medium text-warning-500">Allocated</span>
											{:else}
												<span class="rounded-full bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-500">Available</span>
											{/if}
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-1">
												<button
													class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
													disabled={saving}
													onclick={() => saveEdit(v.id)}
												>
													{saving ? 'Saving…' : 'Save'}
												</button>
												<button
													class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-200-800"
													onclick={() => (editingId = null)}
												>
													Cancel
												</button>
											</div>
										</td>
									</tr>
								{:else if deletingId === v.id}
									<tr class="border-b border-error-500/20 bg-error-500/5">
										<td colspan="5" class="px-5 py-3">
											<div class="flex items-center justify-between">
												<span class="text-sm text-surface-900-100">
													Remove VLAN <strong>{v.vlan_tag}</strong> ({v.subnet})?
													{#if v.pod_id}
														<span class="ml-2 text-xs text-error-500">⚠ Currently allocated — cannot remove.</span>
													{/if}
												</span>
												<div class="flex gap-1">
													{#if !v.pod_id}
														<button
															class="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 disabled:opacity-50"
															disabled={saving}
															onclick={() => confirmDelete(v.id)}
														>
															{saving ? 'Removing…' : 'Confirm Remove'}
														</button>
													{/if}
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
									<tr class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30">
										<td class="px-5 py-3 font-mono font-medium text-surface-900-100">{v.vlan_tag}</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{v.subnet}</td>
										<td class="px-5 py-3">
											<span class="rounded-full px-2 py-0.5 text-xs font-medium {v.host_scope === 'all'
												? 'bg-primary-500/10 text-primary-500'
												: 'bg-surface-300-700/50 text-surface-600-400'}">
												{v.host_scope === 'all' ? 'All Hosts' : 'Switch 1'}
											</span>
										</td>
										<td class="px-5 py-3">
											{#if v.pod_id}
												<span class="rounded-full bg-warning-500/10 px-2 py-0.5 text-xs font-medium text-warning-500">
													Allocated
												</span>
											{:else}
												<span class="rounded-full bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-500">
													Available
												</span>
											{/if}
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-2">
												<button
													class="text-xs text-primary-500 hover:text-primary-400"
													onclick={() => startEdit(v)}
												>
													Edit Scope
												</button>
												<button
													class="text-xs text-error-500 hover:text-error-400"
													onclick={() => (deletingId = v.id)}
												>
													Remove
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
