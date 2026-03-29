<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import {
		adminGetBlueprints,
		adminCreateBlueprint,
		adminUpdateBlueprint,
		adminDeleteBlueprint,
		getTemplates
	} from '$lib/api/client';
	import type { CreateBlueprintRequest } from '$lib/api/client';
	import type { Blueprint, BlueprintVM, Template } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let blueprints = $state<Blueprint[]>([]);
	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	// Edit state
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editAllowVMAdditions = $state(false);
	let editIsActive = $state(true);
	let editVMs = $state<Array<{
		template_id: string;
		display_name: string;
		vcpus: string;
		ram_mb: string;
		disk_gb: string;
		boot_order: number;
		quantity: number;
	}>>([]);

	// Create state
	let showCreate = $state(false);
	let createName = $state('');
	let createDescription = $state('');
	let createAllowVMAdditions = $state(false);
	let createIsActive = $state(true);
	let createVMs = $state<Array<{
		template_id: string;
		display_name: string;
		vcpus: string;
		ram_mb: string;
		disk_gb: string;
		boot_order: number;
		quantity: number;
	}>>([]);

	// Delete confirmation
	let deletingId = $state<string | null>(null);

	function emptyVM() {
		return {
			template_id: '',
			display_name: '',
			vcpus: '',
			ram_mb: '',
			disk_gb: '',
			boot_order: 0,
			quantity: 1
		};
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadData();

		const interval = setInterval(() => {
			if (!document.hidden) loadBlueprints();
		}, 15000);

		return () => clearInterval(interval);
	});

	async function loadData() {
		try {
			const [bps, tpls] = await Promise.all([adminGetBlueprints(), getTemplates()]);
			blueprints = bps;
			templates = tpls;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	async function loadBlueprints() {
		try {
			blueprints = await adminGetBlueprints();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load blueprints';
		}
	}

	function templateName(id: string): string {
		return templates.find((t) => t.id === id)?.name ?? 'Unknown';
	}

	function templateDefaults(id: string): Template | undefined {
		return templates.find((t) => t.id === id);
	}

	// Compute totals from a VM list
	function computeTotals(vms: typeof createVMs): { vcpus: number; ram_mb: number; disk_gb: number; vmCount: number } {
		let vcpus = 0, ram_mb = 0, disk_gb = 0, vmCount = 0;
		for (const vm of vms) {
			const tpl = templateDefaults(vm.template_id);
			const c = (vm.vcpus ? parseInt(vm.vcpus) : tpl?.default_vcpus ?? 0) * vm.quantity;
			const r = (vm.ram_mb ? parseInt(vm.ram_mb) : tpl?.default_ram_mb ?? 0) * vm.quantity;
			const d = (vm.disk_gb ? parseInt(vm.disk_gb) : tpl?.default_disk_gb ?? 0) * vm.quantity;
			vcpus += c;
			ram_mb += r;
			disk_gb += d;
			vmCount += vm.quantity;
		}
		return { vcpus, ram_mb, disk_gb, vmCount };
	}

	// Build boot order groups from a VM list
	function bootGroups(vms: typeof createVMs): Map<number, string[]> {
		const groups = new Map<number, string[]>();
		for (const vm of vms) {
			if (!vm.display_name && !vm.template_id) continue;
			const name = vm.display_name || templateName(vm.template_id);
			const order = vm.boot_order;
			if (!groups.has(order)) groups.set(order, []);
			groups.get(order)!.push(vm.quantity > 1 ? `${name} ×${vm.quantity}` : name);
		}
		return new Map([...groups.entries()].sort((a, b) => a[0] - b[0]));
	}

	function buildRequest(name: string, description: string, allowVMAdditions: boolean, isActive: boolean, vms: typeof createVMs): CreateBlueprintRequest {
		return {
			name,
			description,
			allow_vm_additions: allowVMAdditions,
			is_active: isActive,
			vms: vms.filter(v => v.template_id).map(v => ({
				template_id: v.template_id,
				display_name: v.display_name,
				vcpus: v.vcpus ? parseInt(v.vcpus) : undefined,
				ram_mb: v.ram_mb ? parseInt(v.ram_mb) : undefined,
				disk_gb: v.disk_gb ? parseInt(v.disk_gb) : undefined,
				boot_order: v.boot_order,
				quantity: v.quantity
			}))
		};
	}

	// --- Create ---
	function openCreate() {
		createName = '';
		createDescription = '';
		createAllowVMAdditions = false;
		createIsActive = true;
		createVMs = [emptyVM()];
		showCreate = true;
	}

	function cancelCreate() {
		showCreate = false;
	}

	async function submitCreate() {
		saving = true;
		error = null;
		try {
			const req = buildRequest(createName, createDescription, createAllowVMAdditions, createIsActive, createVMs);
			const created = await adminCreateBlueprint(req);
			blueprints = [...blueprints, created];
			showCreate = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create blueprint';
		} finally {
			saving = false;
		}
	}

	// --- Edit ---
	function startEdit(bp: Blueprint) {
		editingId = bp.id;
		editName = bp.name;
		editDescription = bp.description;
		editAllowVMAdditions = bp.allow_vm_additions;
		editIsActive = bp.is_active;
		editVMs = bp.vms.map(v => ({
			template_id: v.template_id,
			display_name: v.display_name,
			vcpus: v.vcpus ? String(v.vcpus) : '',
			ram_mb: v.ram_mb ? String(v.ram_mb) : '',
			disk_gb: v.disk_gb ? String(v.disk_gb) : '',
			boot_order: v.boot_order,
			quantity: v.quantity
		}));
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveEdit(id: string) {
		saving = true;
		error = null;
		try {
			const req = buildRequest(editName, editDescription, editAllowVMAdditions, editIsActive, editVMs);
			const updated = await adminUpdateBlueprint(id, req);
			blueprints = blueprints.map((b) => (b.id === id ? updated : b));
			editingId = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update blueprint';
		} finally {
			saving = false;
		}
	}

	// --- Toggle ---
	async function toggleActive(bp: Blueprint) {
		saving = true;
		error = null;
		try {
			const updated = await adminUpdateBlueprint(bp.id, { is_active: !bp.is_active });
			blueprints = blueprints.map((b) => (b.id === bp.id ? updated : b));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to toggle blueprint';
		} finally {
			saving = false;
		}
	}

	// --- Delete ---
	async function confirmDelete(id: string) {
		saving = true;
		error = null;
		try {
			await adminDeleteBlueprint(id);
			blueprints = blueprints.filter((b) => b.id !== id);
			deletingId = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete blueprint';
		} finally {
			saving = false;
		}
	}

	function formatBlueprintTotals(bp: Blueprint): string {
		const totals = computeTotals(bp.vms.map(v => ({
			template_id: v.template_id,
			display_name: v.display_name,
			vcpus: v.vcpus ? String(v.vcpus) : '',
			ram_mb: v.ram_mb ? String(v.ram_mb) : '',
			disk_gb: v.disk_gb ? String(v.disk_gb) : '',
			boot_order: v.boot_order,
			quantity: v.quantity
		})));
		return `${totals.vcpus} vCPU / ${Math.round(totals.ram_mb / 1024)} GB / ${totals.disk_gb} GB`;
	}

	const inputClass =
		'w-full rounded border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-2 py-1 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none';
	const inputSmClass =
		'w-20 rounded border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-2 py-1 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none';
</script>

{#snippet vmFormRow(vms: typeof createVMs, isCreate: boolean)}
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">VM Definitions</span>
			<button
				type="button"
				class="rounded-lg bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-500 hover:bg-primary-500/20"
				onclick={() => {
					if (isCreate) createVMs = [...createVMs, emptyVM()];
					else editVMs = [...editVMs, emptyVM()];
				}}
			>
				+ Add VM
			</button>
		</div>

		{#each vms as vm, i (i)}
			<div class="rounded-xl border border-surface-200 dark:border-surface-800 p-3 space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-xs text-surface-500">VM #{i + 1}</span>
					{#if vms.length > 1}
						<button
							type="button"
							class="text-xs text-error-500 hover:text-error-400"
							onclick={() => {
								if (isCreate) createVMs = createVMs.filter((_, idx) => idx !== i);
								else editVMs = editVMs.filter((_, idx) => idx !== i);
							}}
						>
							Remove
						</button>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Template</span>
						<select bind:value={vms[i].template_id} class={inputClass}>
							<option value="">Select template…</option>
							{#each templates.filter(t => t.is_active) as tpl (tpl.id)}
								<option value={tpl.id}>{tpl.name}</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Display Name</span>
						<input type="text" bind:value={vms[i].display_name} class={inputClass} placeholder="e.g. Domain Controller" />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Boot Order</span>
						<input type="number" min="0" bind:value={vms[i].boot_order} class={inputClass} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Quantity</span>
						<input type="number" min="1" bind:value={vms[i].quantity} class={inputClass} />
					</label>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-surface-500">vCPUs Override</span>
						<input type="text" inputmode="numeric" bind:value={vms[i].vcpus} class={inputClass}
							placeholder={templateDefaults(vm.template_id)?.default_vcpus?.toString() ?? 'default'} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">RAM (MB) Override</span>
						<input type="text" inputmode="numeric" bind:value={vms[i].ram_mb} class={inputClass}
							placeholder={templateDefaults(vm.template_id)?.default_ram_mb?.toString() ?? 'default'} />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Disk (GB) Override</span>
						<input type="text" inputmode="numeric" bind:value={vms[i].disk_gb} class={inputClass}
							placeholder={templateDefaults(vm.template_id)?.default_disk_gb?.toString() ?? 'default'} />
					</label>
				</div>
			</div>
		{/each}

		<!-- Totals & Boot Order Visualization -->
		{#if true}
			{@const totals = computeTotals(vms)}
			{@const groups = bootGroups(vms)}
			<div class="rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-3 space-y-2">
				<div class="flex gap-4 text-sm">
					<span class="text-surface-500">Total VMs: <strong class="text-surface-900 dark:text-surface-100">{totals.vmCount}</strong></span>
					<span class="text-surface-500">vCPUs: <strong class="text-surface-900 dark:text-surface-100">{totals.vcpus}</strong></span>
					<span class="text-surface-500">RAM: <strong class="text-surface-900 dark:text-surface-100">{Math.round(totals.ram_mb / 1024)} GB</strong></span>
					<span class="text-surface-500">Disk: <strong class="text-surface-900 dark:text-surface-100">{totals.disk_gb} GB</strong></span>
				</div>
				{#if groups.size > 0}
					<div class="flex flex-wrap items-center gap-2 text-xs text-surface-400">
						{#each [...groups.entries()] as [order, names], gi (order)}
							{#if gi > 0}
								<span class="text-surface-600">→</span>
							{/if}
							<span class="rounded bg-surface-200 dark:bg-surface-800 px-2 py-0.5">
								Boot {order}: {names.join(', ')}
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Blueprint Management</h1>
		{#if authStore.isAdmin && !showCreate}
			<button
				class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
				onclick={openCreate}
			>
				+ Create Blueprint
			</button>
		{/if}
	</div>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else}
		{#if error}
			<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
				{error}
				<button class="ml-2 underline" onclick={() => (error = null)}>dismiss</button>
			</div>
		{/if}

		<!-- Create form -->
		{#if showCreate}
			<div class="rounded-2xl border border-primary-500/30 bg-surface-100/50 dark:bg-surface-900/50 p-5 backdrop-blur-xl">
				<h2 class="mb-4 text-lg font-semibold text-surface-900 dark:text-surface-100">New Blueprint</h2>
				<div class="space-y-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<label class="block">
							<span class="text-xs font-medium text-surface-500">Name</span>
							<input type="text" bind:value={createName} class={inputClass} placeholder="e.g. Active Directory Lab" />
						</label>
						<div class="flex items-center gap-4">
							<label class="flex items-center gap-2">
								<input type="checkbox" bind:checked={createAllowVMAdditions} class="accent-primary-500" />
								<span class="text-sm text-surface-900 dark:text-surface-100">Allow VM Additions</span>
							</label>
							<label class="flex items-center gap-2">
								<input type="checkbox" bind:checked={createIsActive} class="accent-primary-500" />
								<span class="text-sm text-surface-900 dark:text-surface-100">Active</span>
							</label>
						</div>
					</div>
					<label class="block">
						<span class="text-xs font-medium text-surface-500">Description</span>
						<textarea bind:value={createDescription} class="{inputClass} min-h-[3rem]" rows="2" placeholder="Describe the lab environment…"></textarea>
					</label>

					{@render vmFormRow(createVMs, true)}

					<div class="flex gap-2">
						<button
							class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
							disabled={saving || !createName || createVMs.filter(v => v.template_id).length === 0}
							onclick={submitCreate}
						>
							{saving ? 'Creating…' : 'Create Blueprint'}
						</button>
						<button
							class="rounded-lg border border-surface-200 dark:border-surface-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
							onclick={cancelCreate}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Blueprints table -->
		<div class="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="sr-only">Environment blueprints</caption>
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th scope="col" class="px-5 py-3">Name</th>
							<th scope="col" class="px-5 py-3">VMs</th>
							<th scope="col" class="px-5 py-3">Total Resources</th>
							<th scope="col" class="px-5 py-3">VM Additions</th>
							<th scope="col" class="px-5 py-3">Active</th>
							<th scope="col" class="px-5 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(3) as _}
								<tr class="border-b border-surface-200 dark:border-surface-800">
									{#each Array(6) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if blueprints.length === 0}
							<tr>
								<td colspan="6" class="px-5 py-12 text-center text-surface-500">No blueprints found.</td>
							</tr>
						{:else}
							{#each blueprints as bp (bp.id)}
								{#if editingId === bp.id}
									<!-- Inline edit form -->
									<tr class="border-b border-primary-500/20 bg-primary-500/5">
										<td colspan="6" class="px-5 py-4">
											<div class="space-y-4">
												<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
													<label class="block">
														<span class="text-xs font-medium text-surface-500">Name</span>
														<input type="text" bind:value={editName} class={inputClass} />
													</label>
													<div class="flex items-center gap-4">
														<label class="flex items-center gap-2">
															<input type="checkbox" bind:checked={editAllowVMAdditions} class="accent-primary-500" />
															<span class="text-sm text-surface-900 dark:text-surface-100">Allow VM Additions</span>
														</label>
														<label class="flex items-center gap-2">
															<input type="checkbox" bind:checked={editIsActive} class="accent-primary-500" />
															<span class="text-sm text-surface-900 dark:text-surface-100">Active</span>
														</label>
													</div>
												</div>
												<label class="block">
													<span class="text-xs font-medium text-surface-500">Description</span>
													<textarea bind:value={editDescription} class="{inputClass} min-h-[3rem]" rows="2"></textarea>
												</label>

												{@render vmFormRow(editVMs, false)}

												<div class="flex gap-2">
													<button
														class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
														disabled={saving || !editName}
														onclick={() => saveEdit(bp.id)}
													>
														{saving ? 'Saving…' : 'Save'}
													</button>
													<button
														class="rounded-lg border border-surface-200 dark:border-surface-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
														onclick={cancelEdit}
													>
														Cancel
													</button>
												</div>
											</div>
										</td>
									</tr>
								{:else if deletingId === bp.id}
									<!-- Delete confirmation row -->
									<tr class="border-b border-error-500/20 bg-error-500/5">
										<td colspan="6" class="px-5 py-3">
											<div class="flex items-center justify-between">
												<span class="text-sm text-surface-900 dark:text-surface-100">
													Delete <strong>{bp.name}</strong>? This cannot be undone.
												</span>
												<div class="flex gap-1">
													<button
														class="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 disabled:opacity-50"
														disabled={saving}
														onclick={() => confirmDelete(bp.id)}
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
									<tr class="border-b border-surface-200 dark:border-surface-800 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800/30">
										<td class="px-5 py-3">
											<div>
												<p class="font-medium text-surface-900 dark:text-surface-100">{bp.name}</p>
												{#if bp.description}
													<p class="text-xs text-surface-500 mt-0.5">{bp.description}</p>
												{/if}
											</div>
										</td>
										<td class="px-5 py-3">
											<div class="space-y-1">
												<span class="text-sm text-surface-600 dark:text-surface-400">
													{bp.vms.reduce((a, v) => a + v.quantity, 0)} VMs
												</span>
												<div class="flex flex-wrap gap-1">
													{#each bp.vms as vm}
														<span class="rounded bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 text-xs text-surface-400">
															{vm.display_name || templateName(vm.template_id)}{vm.quantity > 1 ? ` ×${vm.quantity}` : ''}
														</span>
													{/each}
												</div>
											</div>
										</td>
										<td class="px-5 py-3 font-mono text-xs text-surface-600 dark:text-surface-400">
											{formatBlueprintTotals(bp)}
										</td>
										<td class="px-5 py-3">
											<span class="rounded-full px-2 py-0.5 text-xs font-medium {bp.allow_vm_additions ? 'bg-success-500/10 text-success-500' : 'bg-surface-200-800 text-surface-500'}">
												{bp.allow_vm_additions ? 'Allowed' : 'Locked'}
											</span>
										</td>
										<td class="px-5 py-3">
											<button
												class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {bp.is_active ? 'bg-success-500' : 'bg-surface-300 dark:bg-surface-700'}"
												onclick={() => toggleActive(bp)}
												disabled={saving}
												title={bp.is_active ? 'Active – click to deactivate' : 'Inactive – click to activate'}
											>
												<span class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform {bp.is_active ? 'translate-x-4' : 'translate-x-0.5'}"></span>
											</button>
										</td>
										<td class="px-5 py-3 text-right">
											<div class="flex items-center justify-end gap-2">
												<button
													class="text-xs text-primary-500 hover:text-primary-400"
													onclick={() => startEdit(bp)}
												>
													Edit
												</button>
												<button
													class="text-xs text-error-500 hover:text-error-400"
													onclick={() => (deletingId = bp.id)}
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
