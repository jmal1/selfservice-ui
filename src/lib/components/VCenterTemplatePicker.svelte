<script lang="ts">
	import { onMount } from 'svelte';
	import {
		adminListVCenterTemplatesFolder,
		type VCenterFolderVM
	} from '$lib/api/client';

	let {
		value = $bindable<string>(''),
		disabled = false
	}: {
		value?: string;
		disabled?: boolean;
	} = $props();

	let vms = $state<VCenterFolderVM[]>([]);
	let folderPath = $state<string>('');
	let cached = $state<boolean>(false);
	let cacheAge = $state<number>(0);
	let loading = $state<boolean>(false);
	let error = $state<string | null>(null);
	let searchQuery = $state<string>('');
	let mode = $state<'picker' | 'manual'>('picker');

	onMount(() => {
		void load(false);
	});

	async function load(forceRefresh: boolean) {
		loading = true;
		error = null;
		try {
			const resp = await adminListVCenterTemplatesFolder(forceRefresh);
			vms = resp.vms;
			folderPath = resp.folder_path;
			cached = resp.cached;
			cacheAge = resp.cache_age_seconds;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			error = msg;
			mode = 'manual';
		} finally {
			loading = false;
		}
	}

	let filtered = $derived(
		vms.filter((vm) =>
			searchQuery.trim() === ''
				? true
				: vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					vm.guest_full_name.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	function select(vm: VCenterFolderVM) {
		value = vm.name;
	}

	function snapshotBadge(vm: VCenterFolderVM): string {
		if (vm.has_initial_snapshot) return `✓ ${vm.snapshot_count} snap`;
		return '⚠ no snapshot';
	}

	function osIcon(osType: string): string {
		if (osType === 'linux') return '🐧';
		if (osType === 'windows') return '🪟';
		return '💻';
	}

	const inputClass =
		'mt-1 w-full rounded border border-surface-300-700 bg-surface-50-950 px-3 py-2 text-sm';
</script>

<div class="space-y-2">
	{#if mode === 'manual'}
		<div class="space-y-1">
			<input
				type="text"
				bind:value
				class={inputClass}
				placeholder="Type the exact vCenter VM name…"
				{disabled}
			/>
			<button
				type="button"
				class="text-xs text-primary-500 underline hover:no-underline"
				onclick={() => {
					mode = 'picker';
					if (vms.length === 0) void load(false);
				}}>← back to browser</button
			>
		</div>
	{:else}
		<div class="rounded border border-surface-300-700 bg-surface-50-950 p-2">
			<div class="mb-2 flex items-center gap-2">
				<input
					type="search"
					bind:value={searchQuery}
					placeholder="Search by VM name or guest OS…"
					class="flex-1 rounded border border-surface-300-700 bg-surface-100-900 px-2 py-1 text-sm"
					{disabled}
				/>
				<button
					type="button"
					class="rounded bg-surface-200-800 px-2 py-1 text-xs hover:bg-surface-300-700"
					onclick={() => void load(true)}
					disabled={loading}
					title="Bypass cache and re-query vCenter"
				>
					{loading ? '⟳' : 'Refresh'}
				</button>
			</div>

			{#if error}
				<div
					class="rounded border border-error-400 bg-error-50-950 p-2 text-xs text-error-700-300"
				>
					Couldn't load vCenter folder ({error}). You can still type the name manually.
					<button
						type="button"
						class="ml-2 underline"
						onclick={() => (mode = 'manual')}>type manually</button
					>
				</div>
			{:else if loading && vms.length === 0}
				<div class="py-4 text-center text-xs text-surface-500">Loading vCenter folder…</div>
			{:else if filtered.length === 0}
				<div class="py-4 text-center text-xs text-surface-500">
					{vms.length === 0
						? `No VMs found in ${folderPath}`
						: `No VMs match "${searchQuery}"`}
				</div>
			{:else}
				<div class="max-h-64 overflow-y-auto">
					<table class="w-full text-left text-xs">
						<thead class="sticky top-0 bg-surface-100-900">
							<tr class="text-surface-500">
								<th class="py-1">Name</th>
								<th class="py-1">OS</th>
								<th class="py-1">CPU/RAM</th>
								<th class="py-1">Snap</th>
								<th class="py-1">Status</th>
								<th class="py-1"></th>
							</tr>
						</thead>
						<tbody>
							{#each filtered as vm (vm.moref)}
								{@const selected = value === vm.name}
								{@const registered = !!vm.registered_template_id}
								<tr
									class="border-t border-surface-200-800 {selected
										? 'bg-primary-100-900'
										: ''} hover:bg-surface-100-900"
								>
									<td class="py-1 pr-2 font-mono">{vm.name}</td>
									<td class="py-1 pr-2" title={vm.guest_full_name}>
										{osIcon(vm.os_type)} {vm.os_type}
									</td>
									<td class="py-1 pr-2">
										{vm.num_cpu}c / {Math.round(vm.memory_mb / 1024)}G
									</td>
									<td
										class="py-1 pr-2"
										class:text-warning-500={!vm.has_initial_snapshot}
										title={vm.has_initial_snapshot
											? 'Linked clones supported'
											: 'No snapshot — full clone only'}
									>
										{snapshotBadge(vm)}
									</td>
									<td class="py-1 pr-2">
										{#if registered}
											<span
												class="rounded bg-success-100-900 px-1 text-success-700-300"
												title={`Registered as: ${vm.registered_template_name}`}
												>registered</span
											>
										{:else}
											<span class="text-surface-500">available</span>
										{/if}
									</td>
									<td class="py-1">
										<button
											type="button"
											class="rounded bg-primary-500 px-2 py-0.5 text-white hover:bg-primary-600 disabled:opacity-50"
											onclick={() => select(vm)}
											disabled={disabled || (registered && !selected)}
											title={registered && !selected
												? 'Already registered to another template'
												: 'Use this VM'}
										>
											{selected ? '✓' : 'Pick'}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<div class="mt-2 flex items-center justify-between text-xs text-surface-500">
				<span>
					{value
						? `Selected: ${value}`
						: 'Pick a VM above (or type manually)'}
				</span>
				<span>
					{#if cached}
						cached {cacheAge}s · {folderPath}
					{:else if folderPath}
						{folderPath}
					{/if}
					· <button
						type="button"
						class="underline hover:no-underline"
						onclick={() => (mode = 'manual')}>type manually</button
					>
				</span>
			</div>
		</div>
	{/if}
</div>
