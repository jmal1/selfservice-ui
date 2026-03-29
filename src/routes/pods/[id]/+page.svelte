<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getPod,
		deletePod,
		extendPod,
		startVM,
		stopVM,
		restartVM,
		resetVM,
		deleteVM,
		getTemplates,
		getMyJobs
	} from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import type { Pod, Template, Job, WSPodStatusEvent, WSVMStatusEvent } from '$lib/types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import VMAccessPanel from '$lib/components/VMAccessPanel.svelte';
	import SnapshotPanel from '$lib/components/SnapshotPanel.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	const podId = $derived(page.params.id as string);

	let pod = $state<Pod | null>(null);
	let templates = $state<Template[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let actionLoading = $state<Record<string, boolean>>({});
	let confirmDelete = $state<string | null>(null);
	let expandedVMs = $state<Record<string, boolean>>({});
	let prevJobStatuses = $state<Map<string, string>>(new Map());
	let extendLoading = $state(false);

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

	async function handleExtendPod() {
		if (!pod) return;
		const days = authStore.isAdmin ? 30 : 7;
		if (!confirm(`Extend "${pod.name}"? This will add ${days} more days.`)) return;
		extendLoading = true;
		try {
			const result = await extendPod(pod.id);
			pod.expires_at = result.expires_at;
			toastStore.success(`Extended by ${result.extended_by_days} days`);
		} catch (e) {
			toastStore.error(`Failed to extend: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			extendLoading = false;
		}
	}

	const jobTypeLabels: Record<string, string> = {
		vm_start: 'VM started',
		vm_stop: 'VM stopped',
		vm_restart: 'VM restarted',
		vm_reset: 'VM reset',
		vm_snapshot: 'Snapshot created',
		vm_revert: 'Snapshot restored',
		vm_snapshot_delete: 'Snapshot deleted',
		vm_destroy: 'VM destroyed',
	};

	function checkJobTransitions(newJobs: Job[]) {
		for (const job of newJobs) {
			const prev = prevJobStatuses.get(job.id);
			if (!prev) continue;
			if (prev === job.status) continue;

			const label = jobTypeLabels[job.type] ?? job.type.replace(/_/g, ' ');
			const vmName = (job.payload?.vm_name as string) || '';
			const detail = vmName || undefined;

			if (job.status === 'completed' && prev !== 'completed') {
				toastStore.success(label, detail);
			} else if (job.status === 'failed' && prev !== 'failed') {
				const errorMsg = (job.result as Record<string, unknown>)?.error;
				toastStore.error(`${label} failed`, errorMsg ? String(errorMsg) : detail);
			}
		}
		prevJobStatuses = new Map(newJobs.map(j => [j.id, j.status]));
	}

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
		try {
			const newJobs = await getMyJobs();
			checkJobTransitions(newJobs);
		} catch {
			// Silently ignore job polling errors
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
				<a href="/" class="text-surface-500 hover:text-surface-900 dark:hover:text-surface-100" aria-label="Back to dashboard">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
				</a>
				<div>
					<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">{pod.name}</h1>
					<div class="mt-1 flex items-center gap-3 text-sm text-surface-400">
						<span class="rounded-md bg-primary-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary-400">
							VLAN {pod.vlan_id}
						</span>
						{#if pod.subnet}
							<span class="font-mono text-xs">{pod.subnet}</span>
						{/if}
						{#if pod.blueprint_id}
							<span class="text-xs bg-tertiary-500/20 text-tertiary-400 px-2 py-0.5 rounded-full">
								📋 Blueprint
							</span>
						{/if}
						{#if pod.allow_vm_additions === false}
							<span class="text-xs bg-warning-500/20 text-warning-400 px-2 py-0.5 rounded-full" title="VM additions are locked for this environment">
								🔒 Locked
							</span>
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
						class="rounded-xl border border-surface-200 dark:border-surface-800 px-4 py-2 text-sm text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800"
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

		<!-- Expiration -->
		{#if pod.expires_at}
			{@const exp = formatExpiry(pod.expires_at)}
			<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl px-5 py-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">Expiration</span>
						{#if exp}
							<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium
								{exp.urgency === 'green' ? 'bg-success-500/20 text-success-500' : ''}
								{exp.urgency === 'yellow' ? 'bg-warning-500/20 text-warning-500' : ''}
								{exp.urgency === 'red' ? 'bg-error-500/20 text-error-500' : ''}
								{exp.urgency === 'critical' ? 'bg-error-500/30 text-error-400 animate-pulse' : ''}">
								⏱ {exp.text} remaining
							</span>
						{/if}
					</div>
					<div class="flex items-center gap-3">
						<span class="text-xs text-surface-400">
							{new Date(pod.expires_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
						</span>
						{#if pod.status === 'active'}
							<button
								onclick={handleExtendPod}
								disabled={extendLoading}
								class="inline-flex items-center gap-1.5 rounded-lg bg-secondary-500/10 px-3 py-1.5 text-xs font-semibold text-secondary-400 transition-colors hover:bg-secondary-500/20 disabled:opacity-50"
							>
								{#if extendLoading}
									<svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
								{/if}
								Extend {authStore.isAdmin ? '30' : '7'} days
							</button>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl px-5 py-4">
				<div class="flex items-center gap-3">
					<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">Expiration</span>
					<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-200/50 dark:bg-surface-800/50 text-surface-400">
						No expiration
					</span>
				</div>
			</div>
		{/if}

		<!-- Assessments -->
		<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl px-5 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">Assessments</span>
					<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-400">
						Testing
					</span>
				</div>
				<a
					href="/pods/{podId}/testing"
					class="inline-flex items-center gap-1.5 rounded-lg bg-primary-500/10 px-3 py-1.5 text-xs font-semibold text-primary-500 transition-colors hover:bg-primary-500/20"
				>
					Run Assessments →
				</a>
			</div>
		</div>

		<!-- VM List -->
		<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl">
			<div class="flex items-center justify-between border-b border-surface-200 dark:border-surface-800 px-5 py-3">
				<h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">
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
					<div class="border-b border-surface-200 dark:border-surface-800 last:border-b-0">
						<!-- VM row -->
						<div class="px-4 py-3 md:px-5">
							<!-- Mobile VM layout -->
							<div class="md:hidden space-y-2">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-surface-900-100">
											{vm.display_name || vm.vcenter_vm_name}
											{#if vm.boot_order != null && vm.boot_order > 0}
												<span class="ml-1 text-xs bg-surface-200-800 px-1.5 py-0.5 rounded text-surface-400">Boot: {vm.boot_order}</span>
											{/if}
										</p>
										<p class="font-mono text-xs text-surface-400">{vm.template_name || vm.template?.name || templateName(vm.template_id)}</p>
									</div>
									<StatusBadge status={vm.status} />
								</div>
								<div class="flex flex-wrap items-center gap-2 text-xs text-surface-500">
									<span class="font-mono">{vm.ip_address || '—'}</span>
									<span>·</span>
									<span>{vm.vcpus} vCPU · {Math.round(vm.ram_mb / 1024)} GB · {vm.disk_gb} GB</span>
								</div>
								<div class="flex items-center gap-1 flex-wrap">
									{#if vm.ip_address}
										<button
											class="touch-target text-xs text-primary-500 hover:text-primary-400 px-2 py-1"
											onclick={() => toggleVMAccess(vm.id)}
										>
											{expandedVMs[vm.id] ? 'Hide' : 'Access'}
										</button>
									{/if}
									{#if vm.status === 'powered_off' || vm.status === 'stopped'}
										<button
											class="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-success-500/10 hover:text-success-500 disabled:opacity-50"
											aria-label="Start VM"
											title="Start VM"
											disabled={!!actionLoading[`start-${vm.id}`]}
											onclick={() => handleAction(`start-${vm.id}`, () => startVM(podId, vm.id))}
										>
											{#if actionLoading[`start-${vm.id}`]}
												<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
											{:else}
												<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
											{/if}
										</button>
									{:else if vm.status === 'powered_on' || vm.status === 'running'}
										<button class="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-warning-500/10 hover:text-warning-500 disabled:opacity-50" aria-label="Stop VM" title="Stop VM" disabled={!!actionLoading[`stop-${vm.id}`]} onclick={() => handleAction(`stop-${vm.id}`, () => stopVM(podId, vm.id))}>
											{#if actionLoading[`stop-${vm.id}`]}<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{:else}<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg>{/if}
										</button>
										<button class="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-primary-500/10 hover:text-primary-500 disabled:opacity-50" aria-label="Restart VM" title="Graceful restart" disabled={!!actionLoading[`restart-${vm.id}`]} onclick={() => handleAction(`restart-${vm.id}`, () => restartVM(podId, vm.id))}>
											{#if actionLoading[`restart-${vm.id}`]}<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{:else}<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{/if}
										</button>
										<button class="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50" aria-label="Force Reset VM" title="Hard power cycle" disabled={!!actionLoading[`reset-${vm.id}`]} onclick={() => handleAction(`reset-${vm.id}`, () => resetVM(podId, vm.id))}>
											{#if actionLoading[`reset-${vm.id}`]}<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{:else}<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>{/if}
										</button>
									{/if}

									{#if confirmDelete === vm.id}
										<button class="rounded-lg bg-error-500 px-2 py-1 text-xs font-semibold text-white" onclick={() => handleDeleteVM(vm.id)}>Confirm</button>
										<button class="rounded-lg border border-surface-200-800 px-2 py-1 text-xs text-surface-500" onclick={cancelConfirm}>Cancel</button>
									{:else}
										<button class="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200-800 text-surface-500 transition-colors hover:border-error-500/50 hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50" aria-label="Delete VM" title="Delete VM" disabled={!!actionLoading[`delete-${vm.id}`]} onclick={() => handleDeleteVM(vm.id)}>
											{#if actionLoading[`delete-${vm.id}`]}<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{:else}<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>{/if}
										</button>
									{/if}
								</div>
							</div>
							<!-- Desktop VM layout -->
							<div class="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-3">
							<div>
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">
									{vm.display_name || vm.vcenter_vm_name}
									{#if vm.boot_order != null && vm.boot_order > 0}
										<span class="ml-1 text-xs bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 rounded text-surface-400" title="Boot order">
											Boot: {vm.boot_order}
										</span>
									{/if}
								</p>
								<p class="font-mono text-xs text-surface-400">{vm.vcenter_vm_name} · {vm.template_name || vm.template?.name || templateName(vm.template_id)}</p>
							</div>
							<div>
								<StatusBadge status={vm.status} />
							</div>
							<div class="font-mono text-sm text-surface-600 dark:text-surface-400">{vm.ip_address || '—'}</div>
							<div class="text-sm text-surface-600 dark:text-surface-400">
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
								{#if vm.status === 'powered_off' || vm.status === 'stopped'}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-800 text-surface-500 transition-colors hover:bg-success-500/10 hover:text-success-500 disabled:opacity-50"
										aria-label="Start VM"
										title="Start VM"
										disabled={!!actionLoading[`start-${vm.id}`]}
										onclick={() => handleAction(`start-${vm.id}`, () => startVM(podId, vm.id))}
									>
										{#if actionLoading[`start-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
										{/if}
									</button>
								{:else if vm.status === 'powered_on' || vm.status === 'running'}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-800 text-surface-500 transition-colors hover:bg-warning-500/10 hover:text-warning-500 disabled:opacity-50"
										aria-label="Stop VM"
										title="Stop VM"
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
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-800 text-surface-500 transition-colors hover:bg-primary-500/10 hover:text-primary-500 disabled:opacity-50"
										aria-label="Restart VM"
										title="Graceful restart"
										disabled={!!actionLoading[`restart-${vm.id}`]}
										onclick={() => handleAction(`restart-${vm.id}`, () => restartVM(podId, vm.id))}
									>
										{#if actionLoading[`restart-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
										{/if}
									</button>
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-800 text-surface-500 transition-colors hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50"
										aria-label="Force Reset VM"
										title="Hard power cycle — use if VM is unresponsive"
										disabled={!!actionLoading[`reset-${vm.id}`]}
										onclick={() => handleAction(`reset-${vm.id}`, () => resetVM(podId, vm.id))}
									>
										{#if actionLoading[`reset-${vm.id}`]}
											<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
										{:else}
											<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
										{/if}
									</button>
								{/if}

								{#if confirmDelete === vm.id}
									<button
										class="rounded-lg bg-error-500 px-2 py-1 text-xs font-semibold text-white"
										onclick={() => handleDeleteVM(vm.id)}
									>Confirm</button>
									<button
										class="rounded-lg border border-surface-200 dark:border-surface-800 px-2 py-1 text-xs text-surface-500"
										onclick={cancelConfirm}
									>Cancel</button>
								{:else}
									<button
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-800 text-surface-500 transition-colors hover:border-error-500/50 hover:bg-error-500/10 hover:text-error-500 disabled:opacity-50"
										aria-label="Delete VM"
										title="Delete VM"
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
						</div>

						<!-- VM Access Panel (expandable) -->
						{#if expandedVMs[vm.id]}
							<div class="border-t border-surface-200 dark:border-surface-800/50 bg-surface-50 dark:bg-surface-950/30 px-5 py-3">
								<VMAccessPanel {vm} />
							</div>
						{/if}

						<!-- Snapshot Panel (always visible per VM) -->
						<div class="border-t border-surface-200 dark:border-surface-800/50 bg-surface-50 dark:bg-surface-950/20 px-5 py-3">
							<SnapshotPanel podId={podId} vmId={vm.id} vmStatus={vm.status} />
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>
