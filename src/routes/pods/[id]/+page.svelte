<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getPod,
		deletePod,
		startVM,
		stopVM,
		restartVM,
		deleteVM,
		getTemplates
	} from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import type { Pod, Template, WSPodStatusEvent, WSVMStatusEvent } from '$lib/types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import VMAccessPanel from '$lib/components/VMAccessPanel.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	const podId = $derived(page.params.id as string);

	let pod = $state<Pod | null>(null);
	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let actionLoading = $state<Record<string, boolean>>({});
	let confirmDelete = $state<string | null>(null);
	let expandedVMs = $state<Record<string, boolean>>({});

	onMount(() => {
		loadData();
		wsStore.connect();

		const unsubPod = wsStore.on('pod.status', (event) => {
			const e = event as WSPodStatusEvent;
			if (pod && pod.id === e.pod_id) {
				pod = { ...pod, status: e.status, error_message: e.error_message ?? pod.error_message };
			}
		});

		const unsubVM = wsStore.on('vm.status', (event) => {
			const e = event as WSVMStatusEvent;
			if (pod && pod.id === e.pod_id) {
				pod = {
					...pod,
					vms: (pod.vms ?? []).map((vm) =>
						vm.id === e.vm_id
							? { ...vm, status: e.status, ip_address: e.ip_address ?? vm.ip_address }
							: vm
					)
				};
			}
		});

		// Poll for updates since WebSocket is not yet implemented on the backend
		const interval = setInterval(() => {
			if (!document.hidden) refreshPod();
		}, 5000);

		return () => {
			clearInterval(interval);
			unsubPod();
			unsubVM();
		};
	});

	async function refreshPod() {
		try {
			pod = await getPod(podId);
		} catch {
			// Silently ignore refresh errors
		}
	}

	async function loadData() {
		try {
			pod = await getPod(podId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load pod';
		} finally {
			loading = false;
		}
		// Templates may fail (e.g., 500) — don't block pod display
		try {
			templates = await getTemplates();
		} catch {
			templates = [];
		}
	}

	async function handleAction(key: string, action: () => Promise<void>) {
		actionLoading = { ...actionLoading, [key]: true };
		try {
			await action();
		} catch (e) {
			console.error('Action failed:', e);
		} finally {
			actionLoading = { ...actionLoading, [key]: false };
		}
	}

	async function handleDeletePod() {
		if (confirmDelete !== 'pod') {
			confirmDelete = 'pod';
			return;
		}
		await handleAction('delete-pod', async () => {
			await deletePod(podId);
			await goto('/');
		});
	}

	async function handleDeleteVM(vmId: string) {
		if (confirmDelete !== vmId) {
			confirmDelete = vmId;
			return;
		}
		confirmDelete = null;
		await handleAction(`delete-${vmId}`, async () => {
			await deleteVM(podId, vmId);
			if (pod) {
				pod = { ...pod, vms: (pod.vms ?? []).filter((vm) => vm.id !== vmId) };
			}
		});
	}

	function cancelConfirm() {
		confirmDelete = null;
	}

	function toggleVMAccess(vmId: string) {
		expandedVMs = { ...expandedVMs, [vmId]: !expandedVMs[vmId] };
	}

	function templateName(templateId: string): string {
		return templates.find((t) => t.id === templateId)?.name ?? 'Unknown';
	}
</script>

<div class="mx-auto max-w-5xl space-y-6">
	{#if loading}
		<LoadingSkeleton height="2rem" width="12rem" />
		<LoadingSkeleton height="8rem" />
		<LoadingSkeleton height="16rem" />
	{:else if error && !pod}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
		<a href="/" class="text-sm text-primary-500 hover:text-primary-400">← Back to Dashboard</a>
	{:else if pod}
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<a href="/" class="text-surface-500 hover:text-surface-900-100" aria-label="Back to dashboard">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
				</a>
				<div>
					<h1 class="text-2xl font-bold text-surface-900-100">{pod.name}</h1>
					<div class="mt-1 flex items-center gap-3 text-sm text-surface-500">
						<span class="rounded-md bg-primary-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary-400">
							VLAN {pod.vlan_id}
						</span>
						{#if pod.subnet}
							<span class="font-mono text-xs">{pod.subnet}</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<StatusBadge status={pod.status} />
				{#if confirmDelete === 'pod'}
					<button
						class="rounded-xl bg-error-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-error-600"
						onclick={handleDeletePod}
						disabled={!!actionLoading['delete-pod']}
					>
						{actionLoading['delete-pod'] ? 'Deleting…' : 'Confirm Delete'}
					</button>
					<button
						class="rounded-xl border border-surface-200-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200-800"
						onclick={cancelConfirm}
					>
						Cancel
					</button>
				{:else}
					<button
						class="rounded-xl border border-error-500/30 px-4 py-2 text-sm font-medium text-error-500 transition-colors hover:bg-error-500/10"
						onclick={handleDeletePod}
					>
						Delete Pod
					</button>
				{/if}
			</div>
		</div>

		{#if error}
			<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
				{error}
			</div>
		{/if}

		{#if pod.error_message}
			<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
				{pod.error_message}
			</div>
		{/if}

		<!-- VM List -->
		<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl">
			<div class="flex items-center justify-between border-b border-surface-200-800 px-5 py-3">
				<h2 class="text-sm font-semibold text-surface-900-100">
					Virtual Machines ({(pod.vms ?? []).length})
				</h2>
				<a
					href="/pods/new?pod={podId}"
					class="inline-flex items-center gap-1.5 rounded-lg bg-primary-500/10 px-3 py-1.5 text-xs font-semibold text-primary-500 transition-colors hover:bg-primary-500/20"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					Add VM
				</a>
			</div>

			{#if (pod.vms ?? []).length === 0}
				<div class="px-5 py-12 text-center text-surface-500">
					<p class="text-sm">No VMs in this pod yet.</p>
				</div>
			{:else}
				{#each pod.vms ?? [] as vm (vm.id)}
					<div class="border-b border-surface-200-800 last:border-b-0">
						<!-- VM row -->
						<div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-3 px-5 py-3">
							<div>
								<p class="text-sm font-medium text-surface-900-100">{vm.display_name || vm.vcenter_vm_name}</p>
								<p class="font-mono text-xs text-surface-500">{vm.vcenter_vm_name} · {vm.template_name || vm.template?.name || templateName(vm.template_id)}</p>
							</div>
							<div>
								<StatusBadge status={vm.status} />
							</div>
							<div class="font-mono text-sm text-surface-600-400">{vm.ip_address || '—'}</div>
							<div class="text-sm text-surface-600-400">
								{vm.vcpus} vCPU · {Math.round(vm.ram_mb / 1024)} GB · {vm.disk_gb} GB
							</div>
							<div>
								{#if vm.ip_address}
									<button
										class="text-xs text-primary-500 hover:text-primary-400"
										onclick={() => toggleVMAccess(vm.id)}
									>
										{expandedVMs[vm.id] ? 'Hide' : 'Access'}
									</button>
								{/if}
							</div>
							<div class="flex items-center gap-1">
								{#if vm.status === 'powered_off'}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-success-500/10 hover:text-success-500 disabled:opacity-50"
										aria-label="Start VM"
										disabled={!!actionLoading[`start-${vm.id}`]}
										onclick={() => handleAction(`start-${vm.id}`, () => startVM(podId, vm.id))}
									>
										{#if actionLoading[`start-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
										{/if}
									</button>
								{:else if vm.status === 'powered_on'}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-warning-500/10 hover:text-warning-500 disabled:opacity-50"
										aria-label="Stop VM"
										disabled={!!actionLoading[`stop-${vm.id}`]}
										onclick={() => handleAction(`stop-${vm.id}`, () => stopVM(podId, vm.id))}
									>
										{#if actionLoading[`stop-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg>
										{/if}
									</button>
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-primary-500/10 hover:text-primary-500 disabled:opacity-50"
										aria-label="Restart VM"
										disabled={!!actionLoading[`restart-${vm.id}`]}
										onclick={() => handleAction(`restart-${vm.id}`, () => restartVM(podId, vm.id))}
									>
										{#if actionLoading[`restart-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
										{/if}
									</button>
								{/if}

								{#if confirmDelete === vm.id}
									<button
										class="rounded-lg bg-error-500 px-2 py-1 text-xs font-semibold text-white"
										onclick={() => handleDeleteVM(vm.id)}
									>Confirm</button>
									<button
										class="rounded-lg border border-surface-200-800 px-2 py-1 text-xs text-surface-500"
										onclick={cancelConfirm}
									>Cancel</button>
								{:else}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:border-error-500/50 hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50"
										aria-label="Delete VM"
										disabled={!!actionLoading[`delete-${vm.id}`]}
										onclick={() => handleDeleteVM(vm.id)}
									>
										{#if actionLoading[`delete-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										{/if}
									</button>
								{/if}
							</div>
						</div>

						<!-- VM Access Panel (expandable) -->
						{#if expandedVMs[vm.id]}
							<div class="border-t border-surface-200-800/50 bg-surface-50-950/30 px-5 py-3">
								<VMAccessPanel {vm} />
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>
