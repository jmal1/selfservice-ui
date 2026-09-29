<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminSearchAuditLog, adminListSessions } from '$lib/api/client';
	import { describeAudit } from '$lib/audit/describe';
	import type { AuditEntry, AuditLogPage, ActiveSession } from '$lib/types';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	type Actor = 'human' | 'synthetic' | 'system' | 'all';
	type WhenPreset = '1h' | 'today' | '7d' | '30d' | 'custom';

	let page = $state<AuditLogPage | null>(null);
	let sessions = $state<ActiveSession[]>([]);
	let loading = $state(true);
	let sessionsLoading = $state(true);
	let error = $state<string | null>(null);

	let actor = $state<Actor>('human');
	let whenPreset = $state<WhenPreset>('7d');
	let sinceFilter = $state('');
	let untilFilter = $state('');
	let includeHttp = $state(false);
	let query = $state('');
	let appliedQuery = $state('');
	let userId = $state('');
	let userLabel = $state('');
	let selectedFamilies = $state<string[]>([]);
	let showMore = $state(false);
	let resourceType = $state('');
	let resourceId = $state('');
	let expandedId = $state<string | null>(null);
	let filtersFocused = $state(false);
	let currentPage = $state(1);
	const perPage = 30;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const actors: { id: Actor; label: string }[] = [
		{ id: 'human', label: 'People' },
		{ id: 'synthetic', label: 'Synthetic' },
		{ id: 'system', label: 'System' },
		{ id: 'all', label: 'Everyone' }
	];

	const whenOptions: { id: WhenPreset; label: string }[] = [
		{ id: '1h', label: 'Last hour' },
		{ id: 'today', label: 'Today' },
		{ id: '7d', label: 'Last 7 days' },
		{ id: '30d', label: 'Last 30 days' },
		{ id: 'custom', label: 'Custom' }
	];

	const families: { id: string; label: string; prefixes: string[] }[] = [
		{ id: 'auth', label: 'Sign-in', prefixes: ['auth.'] },
		{ id: 'pod', label: 'Pods', prefixes: ['pod.'] },
		{ id: 'vm', label: 'VMs', prefixes: ['vm.'] },
		{ id: 'console', label: 'Consoles', prefixes: ['console.', 'template.console.'] },
		{ id: 'template', label: 'Templates', prefixes: ['template.'] },
		{ id: 'blueprint', label: 'Blueprints', prefixes: ['blueprint'] },
		{ id: 'image', label: 'Images', prefixes: ['image.'] }
	];

	const actorScope: Record<Actor, string> = {
		human: 'people',
		synthetic: 'synthetic accounts',
		system: 'system',
		all: 'everyone'
	};
	const whenScope: Record<WhenPreset, string> = {
		'1h': 'last hour',
		today: 'today',
		'7d': 'last 7 days',
		'30d': 'last 30 days',
		custom: 'custom range'
	};

	function selectedPrefixes(): string[] {
		const prefixes: string[] = [];
		for (const family of families) {
			if (selectedFamilies.includes(family.id)) prefixes.push(...family.prefixes);
		}
		return prefixes;
	}

	function localDayStart(ymd: string): Date {
		const [year, month, day] = ymd.split('-').map(Number);
		return new Date(year, (month ?? 1) - 1, day ?? 1);
	}

	function timeBounds(): { since?: string; until?: string } {
		const now = new Date();
		if (whenPreset === '1h') return { since: new Date(now.getTime() - 3_600_000).toISOString() };
		if (whenPreset === 'today') {
			const start = new Date(now);
			start.setHours(0, 0, 0, 0);
			return { since: start.toISOString() };
		}
		if (whenPreset === '7d') return { since: new Date(now.getTime() - 7 * 86_400_000).toISOString() };
		if (whenPreset === '30d') return { since: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
		const bounds: { since?: string; until?: string } = {};
		if (sinceFilter) bounds.since = localDayStart(sinceFilter).toISOString();
		if (untilFilter) bounds.until = new Date(localDayStart(untilFilter).getTime() + 86_400_000 - 1).toISOString();
		return bounds;
	}

	async function loadAuditLog(quiet = false) {
		if (!quiet) loading = true;
		try {
			const bounds = timeBounds();
			page = await adminSearchAuditLog({
				page: currentPage,
				per_page: perPage,
				actor,
				action: selectedPrefixes(),
				exclude_action: includeHttp ? undefined : ['api.request'],
				q: appliedQuery || undefined,
				user_id: userId || undefined,
				resource_type: resourceType.trim() || undefined,
				resource_id: resourceId.trim() || undefined,
				since: bounds.since,
				until: bounds.until
			});
			error = null;
		} catch (e) {
			error = friendlyError(e, 'Failed to load audit log');
			page = null;
		} finally {
			loading = false;
		}
	}

	function refreshFromFilters() {
		currentPage = 1;
		expandedId = null;
		loadAuditLog();
	}

	function onQueryInput(value: string) {
		query = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			appliedQuery = query.trim();
			refreshFromFilters();
		}, 300);
	}

	function toggleFamily(id: string) {
		selectedFamilies = selectedFamilies.includes(id)
			? selectedFamilies.filter((family) => family !== id)
			: [...selectedFamilies, id];
		refreshFromFilters();
	}

	function filterToUser(id: string, label: string) {
		userId = id;
		userLabel = label;
		refreshFromFilters();
	}

	function clearUser() {
		userId = '';
		userLabel = '';
		refreshFromFilters();
	}

	function toggleExpanded(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function personLabel(entry: AuditEntry): string {
		return entry.user_display_name || entry.user_email || entry.user_id || 'System';
	}

	function detailRows(details: AuditEntry['details']): [string, string][] {
		if (!details) return [];
		return Object.entries(details).map(([key, value]) => [key, formatDetail(value)]);
	}

	function formatDetail(value: unknown): string {
		if (value == null || value === '') return '—';
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		return JSON.stringify(value);
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

	function goToPage(p: number) {
		currentPage = p;
		expandedId = null;
		loadAuditLog();
	}

	function onFilterFocusOut(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
			filtersFocused = false;
		}
	}

	onMount(() => {
		if (!authStore.isAdmin) return;
		loadAuditLog();
		loadSessions();

		const interval = setInterval(() => {
			if (!document.hidden && expandedId == null && !filtersFocused) {
				loadAuditLog(true);
				loadSessions();
			}
		}, 15000);

		return () => {
			clearTimeout(searchTimer);
			clearInterval(interval);
		};
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
	const showSyntheticHint = $derived(
		actor === 'human' &&
			selectedFamilies.length === 0 &&
			!appliedQuery &&
			!userId &&
			!resourceType.trim() &&
			!resourceId.trim()
	);
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between gap-4">
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Audit Log</h1>
		<span class="text-sm text-surface-500">
			{#if page}
				{page.total.toLocaleString()} events · {actorScope[actor]} · {whenScope[whenPreset]}
			{/if}
		</span>
	</div>

	{#if !authStore.isAdmin}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else}
		{#if error}
			<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
				{error}
			</div>
		{/if}

		<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 p-5 backdrop-blur-xl">
			<div class="mb-3 flex items-center gap-2">
				<span class="inline-block h-2 w-2 rounded-full bg-success-500 animate-pulse"></span>
				<h2 class="text-sm font-semibold uppercase tracking-wider text-surface-500">Active Sessions</h2>
			</div>
			{#if sessionsLoading}
				<div class="flex gap-4">
					{#each Array(3) as _, index (index)}
						<div class="flex-1"><LoadingSkeleton width="100%" /></div>
					{/each}
				</div>
			{:else if sessions.length === 0}
				<p class="text-sm text-surface-500">No active sessions</p>
			{:else}
				<div class="flex flex-wrap gap-3">
					{#each sessions as session (session.id)}
						<button
							type="button"
							onclick={() => filterToUser(session.user_id, session.display_name ?? session.username)}
							class="flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-4 py-2.5 text-left hover:border-primary-500"
							title="Show only this person"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/15 text-xs font-bold text-primary-500">
								{(session.display_name ?? session.username).charAt(0).toUpperCase()}
							</div>
							<div>
								<div class="text-sm font-medium text-surface-900 dark:text-surface-100">{session.display_name ?? session.username}</div>
								<div class="text-xs text-surface-500">Active {relativeTime(session.last_activity)}</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div
			class="space-y-3"
			onfocusin={() => (filtersFocused = true)}
			onfocusout={onFilterFocusOut}
		>
			<div class="flex flex-wrap items-center gap-3">
				<div class="flex flex-wrap gap-1" role="group" aria-label="Actor">
					{#each actors as item (item.id)}
						<button
							type="button"
							aria-pressed={actor === item.id}
							onclick={() => { actor = item.id; refreshFromFilters(); }}
							class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {actor === item.id
								? 'bg-primary-500 text-white'
								: 'bg-surface-200/50 dark:bg-surface-800/50 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800'}"
						>
							{item.label}
						</button>
					{/each}
				</div>
				<label class="ml-auto flex items-center gap-2 text-xs text-surface-600 dark:text-surface-400">
					<span class="sr-only">Time range</span>
					<select
						value={whenPreset}
						onchange={(event) => {
							whenPreset = event.currentTarget.value as WhenPreset;
							refreshFromFilters();
						}}
						aria-label="Time range"
						class="rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
					>
						{#each whenOptions as option (option.id)}
							<option value={option.id}>{option.label}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<input
					type="search"
					value={query}
					placeholder="Search name or event"
					aria-label="Search name or event"
					oninput={(event) => onQueryInput(event.currentTarget.value)}
					class="min-w-56 flex-1 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
				/>
				{#if userId}
					<button
						type="button"
						onclick={clearUser}
						class="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white"
					>
						{userLabel || 'This person'} ×
					</button>
				{/if}
				<label class="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-400">
					<input
						type="checkbox"
						checked={includeHttp}
						onchange={(event) => {
							includeHttp = event.currentTarget.checked;
							refreshFromFilters();
						}}
					/>
					Include raw HTTP
				</label>
			</div>

			<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Event type">
				{#each families as family (family.id)}
					<button
						type="button"
						aria-pressed={selectedFamilies.includes(family.id)}
						onclick={() => toggleFamily(family.id)}
						class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {selectedFamilies.includes(family.id)
							? 'bg-primary-500 text-white'
							: 'bg-surface-200/50 dark:bg-surface-800/50 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800'}"
					>
						{family.label}
					</button>
				{/each}
				<button
					type="button"
					aria-expanded={showMore}
					onclick={() => (showMore = !showMore)}
					class="rounded-lg px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800"
				>
					{showMore ? 'Hide resource' : 'Resource'}
				</button>
			</div>

			{#if whenPreset === 'custom' || showMore}
				<div class="flex flex-wrap items-center gap-2">
					{#if whenPreset === 'custom'}
						<input
							type="date"
							value={sinceFilter}
							aria-label="From date"
							onchange={(event) => {
								sinceFilter = event.currentTarget.value;
								refreshFromFilters();
							}}
							class="rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
						/>
						<input
							type="date"
							value={untilFilter}
							aria-label="To date"
							onchange={(event) => {
								untilFilter = event.currentTarget.value;
								refreshFromFilters();
							}}
							class="rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
						/>
					{/if}
					{#if showMore}
						<input
							type="text"
							value={resourceType}
							placeholder="Resource type"
							aria-label="Resource type"
							onchange={(event) => {
								resourceType = event.currentTarget.value;
								refreshFromFilters();
							}}
							class="rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
						/>
						<input
							type="text"
							value={resourceId}
							placeholder="Resource id"
							aria-label="Resource id"
							onchange={(event) => {
								resourceId = event.currentTarget.value;
								refreshFromFilters();
							}}
							class="min-w-56 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-1.5 font-mono text-xs text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
						/>
					{/if}
				</div>
			{/if}
		</div>

		<div class="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 dark:bg-surface-900/50 backdrop-blur-xl">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<caption class="sr-only">Audit log entries</caption>
					<thead>
						<tr class="border-b border-surface-200-800 text-xs font-semibold uppercase tracking-wider text-surface-500">
							<th scope="col" class="px-5 py-3">Timestamp</th>
							<th scope="col" class="px-5 py-3">Who</th>
							<th scope="col" class="px-5 py-3">What happened</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							{#each Array(8) as _, index (index)}
								<tr class="border-b border-surface-200 dark:border-surface-800">
									{#each Array(3) as _, cell (cell)}
										<td class="px-5 py-3"><LoadingSkeleton width="5rem" /></td>
									{/each}
								</tr>
							{/each}
						{:else if error}
							<tr>
								<td colspan="3" class="px-5 py-12 text-center text-surface-500">
									The log couldn't be loaded.
								</td>
							</tr>
						{:else if !page || page.entries.length === 0}
							<tr>
								<td colspan="3" class="px-5 py-12 text-center text-surface-500">
									<p>No matching events.</p>
									{#if showSyntheticHint}
										<button
											type="button"
											onclick={() => { actor = 'synthetic'; refreshFromFilters(); }}
											class="mt-3 rounded-lg bg-surface-200/50 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-200 dark:bg-surface-800/50 dark:text-surface-300 dark:hover:bg-surface-800"
										>
											Show synthetic activity
										</button>
									{/if}
								</td>
							</tr>
						{:else}
							{#each page.entries as entry (entry.id)}
								<tr class="border-b border-surface-200 dark:border-surface-800 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800/30">
									<td class="px-5 py-3 text-xs text-surface-600 dark:text-surface-400">
										<button
											type="button"
											aria-expanded={expandedId === String(entry.id)}
											onclick={() => toggleExpanded(String(entry.id))}
											class="text-left hover:text-primary-500"
										>
											{formatTime(entry.created_at)}
										</button>
									</td>
									<td class="px-5 py-3 text-surface-600 dark:text-surface-400">
										{#if entry.user_id}
											<button
												type="button"
												onclick={() => filterToUser(entry.user_id, personLabel(entry))}
												class="text-left text-sm font-medium text-surface-900 hover:text-primary-500 dark:text-surface-100"
												title="Show only this person"
											>
												{personLabel(entry)}
											</button>
										{:else}
											<span class="text-sm font-medium">System</span>
										{/if}
										{#if entry.user_email}
											<span class="block text-xs text-surface-500">{entry.user_email}</span>
										{/if}
									</td>
									<td class="px-5 py-3">
										<div class="text-sm text-surface-900 dark:text-surface-100">{describeAudit(entry.action, entry.details)}</div>
										<div class="font-mono text-xs text-surface-500">{entry.action}</div>
									</td>
								</tr>
								{#if expandedId === String(entry.id)}
									<tr class="border-b border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-950/40">
										<td colspan="3" class="px-5 py-3">
											{#if detailRows(entry.details).length > 0}
												<dl class="grid gap-3 sm:grid-cols-2">
													{#each detailRows(entry.details) as [key, value] (key)}
														<div>
															<dt class="text-xs font-semibold uppercase tracking-wider text-surface-500">{key}</dt>
															<dd class="mt-0.5 break-all font-mono text-xs text-surface-800 dark:text-surface-200">{value}</dd>
														</div>
													{/each}
												</dl>
											{/if}
											<p class="mt-3 break-all text-xs text-surface-500">
												{#if entry.resource_type}{entry.resource_type}{/if}
												{#if entry.resource_id}
													<span class="font-mono"> {entry.resource_id}</span>
												{/if}
												{#if entry.ip_address}
													<span> · {entry.ip_address}</span>
												{/if}
											</p>
										</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			{#if totalPages > 1}
				<div class="flex items-center justify-between border-t border-surface-200 dark:border-surface-800 px-5 py-3">
					<span class="text-xs text-surface-500">
						Page {currentPage} of {totalPages}
					</span>
					<div class="flex gap-1">
						<button
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage <= 1}
							class="rounded-lg px-3 py-1 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							← Prev
						</button>
						{#each Array(Math.min(totalPages, 7)) as _, i (i)}
							{@const p = totalPages <= 7 ? i + 1 : (currentPage <= 4 ? i + 1 : (currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i))}
							{#if p >= 1 && p <= totalPages}
								<button
									onclick={() => goToPage(p)}
									class="rounded-lg px-3 py-1 text-xs font-medium transition-colors {p === currentPage
										? 'bg-primary-500 text-white'
										: 'text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800'}"
								>
									{p}
								</button>
							{/if}
						{/each}
						<button
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage >= totalPages}
							class="rounded-lg px-3 py-1 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed"
						>
							Next →
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
