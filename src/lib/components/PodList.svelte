<script lang="ts">
	import type { Pod } from '$lib/types';
	import { extendPod } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatAttribution } from '$lib/utils/run';
	import StatusBadge from './StatusBadge.svelte';
	import LoadingSkeleton from './LoadingSkeleton.svelte';

	let { pods, loading = false, showOwner = false, onrefresh }: { pods: Pod[]; loading?: boolean; showOwner?: boolean; onrefresh?: () => void } = $props();

	let collapsed = $state<Record<string, boolean>>({});

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

	function expiryUrgent(pod: Pod): boolean {
		const exp = formatExpiry(pod.expires_at);
		return exp?.urgency === 'red' || exp?.urgency === 'critical';
	}

	async function handleExtend(podId: string, podName: string, pod: Pod) {
		const remaining = pod.extensions_remaining;
		if (remaining !== undefined && remaining <= 0) {
			toastStore.error(`Extension limit reached (2/2) for "${podName}"`);
			return;
		}
		const days = pod.extend_days;
		const confirmMsg =
			days != null
				? `Extend "${podName}"? This will add ${days} more days.`
				: `Extend "${podName}"?`;
		if (!confirm(confirmMsg)) return;
		try {
			const result = await extendPod(podId);
			toastStore.success(`Extended "${podName}" by ${result.extended_by_days} days`);
			onrefresh?.();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			if (/extensions_exhausted|extension limit/i.test(msg)) {
				toastStore.error(`Extension limit reached for "${podName}"`);
				onrefresh?.();
				return;
			}
			toastStore.error(`Failed to extend: ${msg}`);
		}
	}
</script>

<div class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50">
	<div class="hidden md:grid items-center gap-2 border-b border-surface-200-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500"
		class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_140px]={showOwner}
		class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_140px]={!showOwner}
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
			<div class="grid items-center gap-2 border-b border-surface-200 dark:border-surface-800 px-5 py-4"
				class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_140px]={showOwner}
				class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_140px]={!showOwner}
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
		{#each pods as pod, podIndex (pod.id)}
			<div
				class="cursor-pointer px-4 py-3 transition-colors hover:bg-surface-200-800/30 md:px-5 {podIndex > 0 ? 'border-t-2 border-surface-300-700' : ''}"
				onclick={() => togglePod(pod.id)}
				role="row"
				tabindex="0"
				onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePod(pod.id); } }}
			>
				<div class="md:hidden">
					<div class="flex items-center justify-between">
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
						<StatusBadge status={pod.status} />
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs text-surface-500">
						{#if showOwner}
							<span>{formatAttribution(pod.owner?.display_name, pod.owner?.username)}</span>
							<span>·</span>
						{/if}
						<span>{(pod.vms ?? []).length} VM{(pod.vms ?? []).length !== 1 ? 's' : ''}</span>
						<span>·</span>
						<span>{totalVcpus(pod)} vCPU · {totalRamGb(pod)} GB</span>
						<span>·</span>
						<span class="rounded-md bg-primary-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary-400">VLAN {pod.vlan_id}</span>
						{#if formatExpiry(pod.expires_at)}
							{@const exp = formatExpiry(pod.expires_at)!}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
								{exp.urgency === 'green' ? 'bg-success-500/20 text-success-500' : ''}
								{exp.urgency === 'yellow' ? 'bg-warning-500/20 text-warning-500' : ''}
								{exp.urgency === 'red' ? 'bg-error-500/20 text-error-500' : ''}
								{exp.urgency === 'critical' ? 'bg-error-500/30 text-error-400 animate-pulse' : ''}">
								⏱ {exp.text}
							</span>
						{/if}
					</div>
					<div class="mt-2 flex items-center justify-end gap-2 pl-6">
						{#if expiryUrgent(pod)}
							<button
								onclick={(e: MouseEvent) => { e.stopPropagation(); handleExtend(pod.id, pod.name, pod); }}
								disabled={pod.extensions_remaining === 0}
								class="touch-target px-2 py-1 text-xs rounded bg-secondary-500/20 text-secondary-400 hover:bg-secondary-500/30 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
								title={pod.extensions_remaining === 0 ? 'Extension limit reached (2/2)' : 'Extend pod lifetime'}
							>
								{#if pod.extend_days != null && pod.extensions_remaining != null}
									Extend +{pod.extend_days}d ({pod.extensions_remaining} left)
								{:else if pod.extend_days != null}
									Extend +{pod.extend_days}d
								{:else}
									Extend
								{/if}
							</button>
						{/if}
						<a
							href="/pods/{pod.id}"
							class="touch-target inline-flex items-center rounded-lg bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600"
							aria-label="Open {pod.name}"
							onclick={(e: MouseEvent) => e.stopPropagation()}
						>
							Open
						</a>
					</div>
				</div>
				<div class="hidden md:grid items-center gap-2"
					class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_140px]={showOwner}
					class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_140px]={!showOwner}
				>
				<div class="flex items-center gap-2">
					<svg
						class="h-4 w-4 shrink-0 text-surface-500 transition-transform duration-200"
						class:rotate-90={!collapsed[pod.id]}
						fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
					<span class="font-medium text-surface-900 dark:text-surface-100">{pod.name}</span>
				</div>
				{#if showOwner}
					<span class="text-sm text-surface-600 dark:text-surface-400">{formatAttribution(pod.owner?.display_name, pod.owner?.username)}</span>
				{/if}
				<div class="flex items-center gap-1.5 flex-wrap">
					<StatusBadge status={pod.status} />
					{#if formatExpiry(pod.expires_at)}
						{@const exp = formatExpiry(pod.expires_at)!}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
							{exp.urgency === 'green' ? 'bg-success-500/20 text-success-500' : ''}
							{exp.urgency === 'yellow' ? 'bg-warning-500/20 text-warning-500' : ''}
							{exp.urgency === 'red' ? 'bg-error-500/20 text-error-500' : ''}
							{exp.urgency === 'critical' ? 'bg-error-500/30 text-error-400 animate-pulse' : ''}"
							title="Expires: {new Date(pod.expires_at).toLocaleString()}">
							⏱ {exp.text}
						</span>
					{/if}
					{#if pod.blueprint_id}
						<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-surface-500" title="Deployed from blueprint">📋</span>
					{/if}
				</div>
				<span class="text-sm text-surface-600 dark:text-surface-400">{(pod.vms ?? []).length} VM{(pod.vms ?? []).length !== 1 ? 's' : ''}</span>
				<span class="text-sm text-surface-600 dark:text-surface-400">{totalVcpus(pod)} vCPU · {totalRamGb(pod)} GB</span>
				<div>
					<span class="rounded-md bg-primary-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary-400">
						VLAN {pod.vlan_id}
					</span>
				</div>
				<div class="flex items-center justify-end gap-2">
					{#if expiryUrgent(pod)}
						<button
							onclick={(e: MouseEvent) => { e.stopPropagation(); handleExtend(pod.id, pod.name, pod); }}
							disabled={pod.extensions_remaining === 0}
							class="px-2 py-0.5 text-xs rounded bg-secondary-500/20 text-secondary-400 hover:bg-secondary-500/30 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
							title={pod.extensions_remaining === 0 ? 'Extension limit reached (2/2)' : 'Extend pod lifetime'}
						>
							{#if pod.extend_days != null && pod.extensions_remaining != null}
								Extend +{pod.extend_days}d ({pod.extensions_remaining} left)
							{:else if pod.extend_days != null}
								Extend +{pod.extend_days}d
							{:else}
								Extend
							{/if}
						</button>
					{/if}
					<a
						href="/pods/{pod.id}"
						class="inline-flex items-center rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-600"
						aria-label="Open {pod.name}"
						onclick={(e: MouseEvent) => e.stopPropagation()}
					>
						Open
					</a>
				</div>
				</div>
			</div>

			<div
				class="grid transition-[grid-template-rows] duration-300 ease-in-out"
				style="grid-template-rows: {collapsed[pod.id] ? '0fr' : '1fr'};"
			>
				<div class="overflow-hidden">
				{#each pod.vms ?? [] as vm (vm.id)}
					<div
						class="grid items-center gap-2 border-b border-surface-200 last:border-b-0 dark:border-surface-800/50 bg-surface-50 dark:bg-surface-950/50 py-2.5 pl-12 pr-5"
						class:grid-cols-[2.2fr_1fr_1fr_1.2fr_1fr_0.8fr_140px]={showOwner}
						class:grid-cols-[2.2fr_1fr_1.2fr_1fr_0.8fr_140px]={!showOwner}
						role="row"
					>
						<div>
							<span class="text-sm font-medium text-surface-900 dark:text-surface-100">{vm.display_name || vm.vcenter_vm_name}</span>
							<span class="ml-2 font-mono text-xs text-surface-500">{vm.vcenter_vm_name}</span>
						</div>
						{#if showOwner}<span></span>{/if}
						<div>
							<StatusBadge status={vm.status} />
						</div>
						<span class="text-sm text-surface-600 dark:text-surface-400">{vm.template?.name ?? 'Unknown'}</span>
						<span class="font-mono text-sm text-surface-600 dark:text-surface-400">{vm.ip_address || '—'}</span>
						<span class="text-sm text-surface-600 dark:text-surface-400">{vm.vcpus} vCPU · {Math.round(vm.ram_mb / 1024)} GB</span>
						<div></div>
					</div>
				{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
