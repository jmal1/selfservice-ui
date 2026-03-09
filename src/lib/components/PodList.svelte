<script lang="ts">
	import type { Pod } from '$lib/types';
	import { deletePod, extendPod, startVM, stopVM, restartVM, deleteVM } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import LoadingSkeleton from './LoadingSkeleton.svelte';

	let { pods, loading = false, showOwner = false, onrefresh }: { pods: Pod[]; loading?: boolean; showOwner?: boolean; onrefresh?: () => void } = $props();

	let collapsed = $state<Record<string, boolean>>({});
	let actionLoading = $state<Record<string, boolean>>({});
	let confirmDeletePod = $state<string | null>(null);
	let confirmDeleteVM = $state<string | null>(null);

	$effect(() => {
		if (pods.length > 0 && Object.keys(collapsed).length === 0) {
			const init: Record<string, boolean> = {};
			pods.forEach((pod, i) => {
				init[pod.id] = i >= 2;
			});
			collapsed = init;
		}
	});

	function togglePod(podId: string) {
		collapsed = { ...collapsed, [podId]: !collapsed[podId] };
	}

	function totalVcpus(pod: Pod): number {
		return (pod.vms ?? []).reduce((sum, vm) => sum + vm.vcpus, 0);
	}

	function totalRamGb(pod: Pod): number {
		return Math.round((pod.vms ?? []).reduce((sum, vm) => sum + vm.ram_mb, 0) / 1024);
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

	async function handleDeletePod(podId: string) {
		if (confirmDeletePod !== podId) {
			confirmDeletePod = podId;
			return;
		}
		confirmDeletePod = null;
		await handleAction(`delete-pod-${podId}`, () => deletePod(podId));
	}

	function cancelDeletePod() {
		confirmDeletePod = null;
	}

	async function handleStartVM(podId: string, vmId: string) {
		await handleAction(`start-${vmId}`, () => startVM(podId, vmId));
	}

	async function handleStopVM(podId: string, vmId: string) {
		await handleAction(`stop-${vmId}`, () => stopVM(podId, vmId));
	}

	async function handleRestartVM(podId: string, vmId: string) {
		await handleAction(`restart-${vmId}`, () => restartVM(podId, vmId));
	}

	async function handleDeleteVM(podId: string, vmId: string) {
		if (confirmDeleteVM !== vmId) {
			confirmDeleteVM = vmId;
			return;
		}
		confirmDeleteVM = null;
		await handleAction(`delete-${vmId}`, () => deleteVM(podId, vmId));
	}

	function cancelDelete() {
		confirmDeletePod = null;
		confirmDeleteVM = null;
	}

	function formatExpiry(expiresAt: string | null): { text: string; urgency: 'green' | 'yellow' | 'red' | 'critical' } | null {
		if (!expiresAt) return null;
		const now = Date.now();
		const expiry = new Date(expiresAt).getTime();
		const diff = expiry - now;
		if (diff <= 0) return { text: 'Expired', urgency: 'critical' };
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;
		let text: string;
		if (days > 0) text = `${days}d ${remainingHours}h`;
		else if (hours > 0) text = `${hours}h`;
		else text = `${Math.floor(diff / (1000 * 60))}m`;
		let urgency: 'green' | 'yellow' | 'red' | 'critical';
		if (hours > 48) urgency = 'green';
		else if (hours > 24) urgency = 'yellow';
		else if (hours > 1) urgency = 'red';
		else urgency = 'critical';
		return { text, urgency };
	}

	async function handleExtend(podId: string, podName: string) {
		const days = authStore.isAdmin ? 30 : 7;
		if (!confirm(`Extend "${podName}"? This will add ${days} more days.`)) return;
		try {
			const result = await extendPod(podId);
			toastStore.success(`Extended "${podName}" by ${result.extended_by_days} days`);
			onrefresh?.();
		} catch (e) {
			toastStore.error(`Failed to extend: ${e instanceof Error ? e.message : 'Unknown error'}`);
		}
	}
</script>

<div class="glass overflow-hidden rounded-2xl">
	<!-- Header -->
	<div class="grid items-center gap-2 border-b border-surface-200-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500"
		class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_110px]={showOwner}
		class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_110px]={!showOwner}
	>
		<span>Environment</span>
		{#if showOwner}<span>Owner</span>{/if}
		<span>Status</span>
		<span>VMs</span>
		<span>Resources</span>
		<span>VLAN</span>
		<span class="text-right">Actions</span>
	</div>

	{#if loading}
		{#each Array(3) as _}
			<div class="grid items-center gap-2 border-b border-surface-200-800 px-5 py-4"
				class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_110px]={showOwner}
				class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_110px]={!showOwner}
			>
				<LoadingSkeleton width="8rem" height="1rem" />
				<LoadingSkeleton width="5rem" height="1.25rem" rounded="rounded-full" />
				<LoadingSkeleton width="3rem" height="1rem" />
				<LoadingSkeleton width="6rem" height="1rem" />
				<LoadingSkeleton width="4rem" height="1.25rem" rounded="rounded-md" />
				<LoadingSkeleton width="4rem" height="1rem" />
			</div>
		{/each}
	{:else if pods.length === 0}
		<div class="px-5 py-12 text-center text-surface-500">
			<p class="text-lg font-medium">No lab environments yet</p>
			<p class="mt-1 text-sm">Deploy your first VM to get started.</p>
		</div>
	{:else}
		{#each pods as pod (pod.id)}
			<!-- Pod row -->
			<div
				class="grid cursor-pointer items-center gap-2 border-b border-surface-200-800 px-5 py-3 transition-colors hover:bg-surface-200-800/30"
				class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_110px]={showOwner}
				class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_110px]={!showOwner}
				onclick={() => togglePod(pod.id)}
				role="row"
				tabindex="0"
				onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePod(pod.id); } }}
			>
				<div class="flex items-center gap-2">
					<svg
						class="h-4 w-4 shrink-0 text-surface-500 transition-transform duration-200"
						class:rotate-90={!collapsed[pod.id]}
						fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
					<span class="font-medium text-surface-900-100">{pod.name}</span>
				</div>
				{#if showOwner}
					<span class="text-sm text-surface-600-400">{pod.owner?.display_name ?? pod.owner_id}</span>
				{/if}
				<div class="flex items-center gap-1.5 flex-wrap">
					<StatusBadge status={pod.status} />
					{#if formatExpiry(pod.expires_at)}
						{@const exp = formatExpiry(pod.expires_at)!}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
							{exp.urgency === 'green' ? 'bg-green-500/20 text-green-400' : ''}
							{exp.urgency === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' : ''}
							{exp.urgency === 'red' ? 'bg-red-500/20 text-red-400' : ''}
							{exp.urgency === 'critical' ? 'bg-red-500/30 text-red-300 animate-pulse' : ''}"
							title="Expires: {new Date(pod.expires_at).toLocaleString()}">
							⏱ {exp.text}
						</span>
					{/if}
					{#if pod.blueprint_id}
						<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-surface-500" title="Deployed from blueprint">📋</span>
					{/if}
				</div>
				<span class="text-sm text-surface-600-400">{(pod.vms ?? []).length} VM{(pod.vms ?? []).length !== 1 ? 's' : ''}</span>
				<span class="text-sm text-surface-600-400">{totalVcpus(pod)} vCPU · {totalRamGb(pod)} GB</span>
				<div>
					<span class="rounded-md bg-primary-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary-400">
						VLAN {pod.vlan_id}
					</span>
				</div>
				<div class="flex items-center justify-end gap-1">
					<button
						onclick={(e: MouseEvent) => { e.stopPropagation(); handleExtend(pod.id, pod.name); }}
						class="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
						title="Extend pod lifetime"
					>
						Extend
					</button>
					<a
						href="/pods/{pod.id}"
						class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-surface-200-800 hover:text-surface-900-100"
						aria-label="View pod details"
						onclick={(e: MouseEvent) => e.stopPropagation()}
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
						</svg>
					</a>
					{#if confirmDeletePod === pod.id}
						<button
							class="inline-flex h-8 items-center justify-center rounded-lg bg-error-500 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-error-600"
							onclick={(e: MouseEvent) => { e.stopPropagation(); handleDeletePod(pod.id); }}
							disabled={actionLoading[`delete-pod-${pod.id}`]}
						>
							{actionLoading[`delete-pod-${pod.id}`] ? 'Deleting…' : 'Confirm'}
						</button>
						<button
							class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-surface-200-800"
							aria-label="Cancel delete"
							onclick={(e: MouseEvent) => { e.stopPropagation(); cancelDeletePod(); }}
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{:else}
						<button
							class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:border-error-500/50 hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50"
							aria-label="Delete pod"
							disabled={actionLoading[`delete-pod-${pod.id}`]}
							onclick={(e: MouseEvent) => { e.stopPropagation(); handleDeletePod(pod.id); }}
						>
							{#if actionLoading[`delete-pod-${pod.id}`]}
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
							{:else}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<!-- VM sub-rows -->
			<div
				class="overflow-hidden transition-all duration-300 ease-in-out"
				style="max-height: {collapsed[pod.id] ? '0px' : `${(pod.vms ?? []).length * 60 + 20}px`};"
			>
				{#each pod.vms ?? [] as vm (vm.id)}
					<div
						class="grid items-center gap-2 border-b border-surface-200-800/50 bg-surface-50-950/50 py-2.5 pl-12 pr-5"
						class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_110px]={showOwner}
						class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_110px]={!showOwner}
						role="row"
					>
						<div>
							<span class="text-sm font-medium text-surface-900-100">{vm.display_name || vm.vcenter_vm_name}</span>
							<span class="ml-2 font-mono text-xs text-surface-500">{vm.vcenter_vm_name}</span>
						</div>
						{#if showOwner}<span></span>{/if}
						<div>
							<StatusBadge status={vm.status} />
						</div>
						<span class="text-sm text-surface-600-400">{vm.template?.name ?? 'Unknown'}</span>
						<span class="font-mono text-sm text-surface-600-400">{vm.ip_address || '—'}</span>
						<span class="text-sm text-surface-600-400">{vm.vcpus} vCPU · {Math.round(vm.ram_mb / 1024)} GB</span>
						<div class="flex items-center justify-end gap-1">
							{#if vm.status === 'powered_off'}
								<button
									class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-success-500/10 hover:text-success-500 disabled:opacity-50"
									aria-label="Start VM"
									disabled={!!actionLoading[`start-${vm.id}`]}
									onclick={() => handleStartVM(pod.id, vm.id)}
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
									onclick={() => handleStopVM(pod.id, vm.id)}
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
									onclick={() => handleRestartVM(pod.id, vm.id)}
								>
									{#if actionLoading[`restart-${vm.id}`]}
										<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
									{:else}
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
									{/if}
								</button>
							{/if}
							{#if confirmDeleteVM === vm.id}
							<button
								class="inline-flex h-8 items-center justify-center rounded-lg bg-error-500 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-error-600"
								onclick={() => handleDeleteVM(pod.id, vm.id)}
								disabled={!!actionLoading[`delete-${vm.id}`]}
							>
								{actionLoading[`delete-${vm.id}`] ? 'Deleting…' : 'Confirm'}
							</button>
							<button
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-surface-200-800"
								aria-label="Cancel delete"
								onclick={() => cancelDelete()}
							>
								<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{:else}
							<button
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:border-error-500/50 hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50"
								aria-label="Delete VM"
								disabled={!!actionLoading[`delete-${vm.id}`]}
								onclick={() => handleDeleteVM(pod.id, vm.id)}
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
				{/each}
			</div>
		{/each}
	{/if}
</div>
