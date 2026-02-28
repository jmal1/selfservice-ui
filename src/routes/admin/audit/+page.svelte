<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetAuditLog } from '$lib/api/client';
	import type { AuditEntry } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let entries = $state<AuditEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');

	const filtered = $derived(
		search.trim()
			? entries.filter((e) => {
					const q = search.toLowerCase();
					return (
						e.action.toLowerCase().includes(q) ||
						e.resource_type.toLowerCase().includes(q) ||
						e.user_id.toLowerCase().includes(q) ||
						e.ip_address.toLowerCase().includes(q)
					);
				})
			: entries
	);

	async function loadAuditLog() {
		try {
			entries = await adminGetAuditLog();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load audit log';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadAuditLog();

		const interval = setInterval(() => {
			if (!document.hidden) loadAuditLog();
		}, 15000);

		return () => clearInterval(interval);
	});

	function formatTime(iso: string): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900-100">Audit Log</h1>
	</div>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{:else}
		<!-- Search -->
		<div>
			<input
				type="text"
				placeholder="Search by action, resource, user, or IP…"
				bind:value={search}
				class="w-full max-w-md rounded-xl border border-surface-200-800 bg-surface-50-950 px-4 py-2.5 text-sm text-surface-900-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
			/>
		</div>

		<div class="overflow-hidden rounded-2xl border border-surface-200-800 bg-surface-100-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th class="px-5 py-3">Timestamp</th>
							<th class="px-5 py-3">User</th>
							<th class="px-5 py-3">Action</th>
							<th class="px-5 py-3">Resource</th>
							<th class="px-5 py-3">IP</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(8) as _}
								<tr class="border-b border-surface-200-800">
									{#each Array(5) as _cell}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if filtered.length === 0}
							<tr>
								<td colspan="5" class="px-5 py-12 text-center text-surface-500">
									{search ? 'No matching entries.' : 'No audit entries.'}
								</td>
							</tr>
						{:else}
							{#each filtered as entry (entry.id)}
								<tr class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30">
									<td class="px-5 py-3 text-xs text-surface-600-400">{formatTime(entry.created_at)}</td>
									<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{entry.user_id}</td>
									<td class="px-5 py-3 font-medium text-surface-900-100">{entry.action}</td>
									<td class="px-5 py-3 text-surface-600-400">
										<span class="text-xs">{entry.resource_type}</span>
										{#if entry.resource_id}
											<span class="font-mono text-xs text-surface-500">/{entry.resource_id}</span>
										{/if}
									</td>
									<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{entry.ip_address}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
