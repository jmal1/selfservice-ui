<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminSearchAuditLog, adminListSessions } from '$lib/api/client';
	import type { AuditEntry, AuditLogPage, ActiveSession } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let page = $state<AuditLogPage | null>(null);
	let sessions = $state<ActiveSession[]>([]);
	let loading = $state(true);
	let sessionsLoading = $state(true);
	let error = $state<string | null>(null);

	// Filters
	let actionFilter = $state('');
	let sinceFilter = $state('');
	let currentPage = $state(1);
	const perPage = 30;

	// Quick filter presets
	const quickFilters = [
		{ label: 'All', value: '' },
		{ label: 'Auth', value: 'auth.' },
		{ label: 'Pod Ops', value: 'pod.' },
		{ label: 'VM Ops', value: 'vm.' },
		{ label: 'Console', value: 'console.' },
		{ label: 'API Requests', value: 'api.request' }
	];

	async function loadAuditLog() {
		try {
			const params: Record<string, string | number> = { page: currentPage, per_page: perPage };
			if (actionFilter) params.action = actionFilter;
			if (sinceFilter) params.since = new Date(sinceFilter).toISOString();
			page = await adminSearchAuditLog(params);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load audit log';
		} finally {
			loading = false;
		}
	}

	async function loadSessions() {
		try {
			sessions = await adminListSessions();
		} catch {
			// non-critical
		} finally {
			sessionsLoading = false;
		}
	}

	function applyFilter(action: string) {
		actionFilter = action;
		currentPage = 1;
		loading = true;
		loadAuditLog();
	}

	function goToPage(p: number) {
		currentPage = p;
		loading = true;
		loadAuditLog();
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadAuditLog();
		loadSessions();

		const interval = setInterval(() => {
			if (!document.hidden) {
				loadAuditLog();
				loadSessions();
			}
		}, 15000);

		return () => clearInterval(interval);
	});

	function formatTime(iso: string): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString();
	}

	function relativeTime(iso: string): string {
		if (!iso) return '—';
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ${mins % 60}m ago`;
	}

	const totalPages = $derived(page ? Math.ceil(page.total / perPage) : 0);
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-surface-900-100">Audit Log</h1>
		<span class="text-sm text-surface-500">
			{#if page}{page.total.toLocaleString()} total entries{/if}
		</span>
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
		<!-- Active Sessions Card -->
		<div class="rounded-2xl border border-surface-200-800 bg-surface-100-900/50 p-5 backdrop-blur-xl">
			<div class="mb-3 flex items-center gap-2">
				<span class="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
				<h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500">Active Sessions</h2>
			</div>
			{#if sessionsLoading}
				<div class="flex gap-4">
					{#each Array(3) as _}
						<div class="flex-1"><LoadingSkeleton width="100%" /></div>
					{/each}
				</div>
			{:else if sessions.length === 0}
				<p class="text-sm text-surface-500">No active sessions</p>
			{:else}
				<div class="flex flex-wrap gap-3">
					{#each sessions as session (session.id)}
						<div class="flex items-center gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 px-4 py-2.5">
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/15 text-xs font-bold text-primary-500">
								{(session.display_name ?? session.username).charAt(0).toUpperCase()}
							</div>
							<div>
								<div class="text-sm font-medium text-surface-900-100">{session.display_name ?? session.username}</div>
								<div class="text-xs text-surface-500">Active {relativeTime(session.last_activity)}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3">
			{#each quickFilters as qf}
				<button
					onclick={() => applyFilter(qf.value)}
					class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {actionFilter === qf.value
						? 'bg-primary-500 text-white'
						: 'bg-surface-200-800/50 text-surface-600-400 hover:bg-surface-200-800'}"
				>
					{qf.label}
				</button>
			{/each}
			<div class="ml-auto">
				<input
					type="date"
					bind:value={sinceFilter}
					onchange={() => { currentPage = 1; loading = true; loadAuditLog(); }}
					class="rounded-lg border border-surface-200-800 bg-surface-50-950 px-3 py-1.5 text-xs text-surface-900-100 focus:border-primary-500 focus:outline-none"
				/>
			</div>
		</div>

		<!-- Audit Table -->
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
						{:else if !page || page.entries.length === 0}
							<tr>
								<td colspan="5" class="px-5 py-12 text-center text-surface-500">
									No audit entries found.
								</td>
							</tr>
						{:else}
							{#each page.entries as entry (entry.id)}
								<tr class="border-b border-surface-200-800 transition-colors hover:bg-surface-200-800/30">
									<td class="px-5 py-3 text-xs text-surface-600-400">{formatTime(entry.created_at)}</td>
									<td class="px-5 py-3 text-surface-600-400">
										{#if entry.user_display_name}
											<span class="text-sm font-medium">{entry.user_display_name}</span>
											{#if entry.user_email}
												<span class="block text-xs text-surface-500">{entry.user_email}</span>
											{/if}
										{:else}
											<span class="font-mono text-xs">{entry.user_id}</span>
										{/if}
									</td>
									<td class="px-5 py-3">
										<span class="inline-block rounded-md bg-surface-200-800/50 px-2 py-0.5 font-mono text-xs font-medium text-surface-900-100">
											{entry.action}
										</span>
									</td>
									<td class="px-5 py-3 text-surface-600-400">
										<span class="text-xs">{entry.resource_type}</span>
										{#if entry.resource_id}
											<span class="font-mono text-xs text-surface-500">/{entry.resource_id.slice(0, 8)}</span>
										{/if}
									</td>
									<td class="px-5 py-3 font-mono text-xs text-surface-600-400">{entry.ip_address}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="flex items-center justify-between border-t border-surface-200-800 px-5 py-3">
					<span class="text-xs text-surface-500">
						Page {currentPage} of {totalPages}
					</span>
					<div class="flex gap-1">
						<button
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage <= 1}
							class="rounded-lg px-3 py-1 text-xs font-medium text-surface-600-400 hover:bg-surface-200-800 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							← Prev
						</button>
						{#each Array(Math.min(totalPages, 7)) as _, i}
							{@const p = totalPages <= 7 ? i + 1 : (currentPage <= 4 ? i + 1 : (currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i))}
							{#if p >= 1 && p <= totalPages}
								<button
									onclick={() => goToPage(p)}
									class="rounded-lg px-3 py-1 text-xs font-medium transition-colors {p === currentPage
										? 'bg-primary-500 text-white'
										: 'text-surface-600-400 hover:bg-surface-200-800'}"
								>
									{p}
								</button>
							{/if}
						{/each}
						<button
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage >= totalPages}
							class="rounded-lg px-3 py-1 text-xs font-medium text-surface-600-400 hover:bg-surface-200-800 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							Next →
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
