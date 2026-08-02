<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { adminGetHealth, type HealthResponse, type HealthDepStatus } from '$lib/api/client';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let health = $state<HealthResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastFetched = $state<Date | null>(null);
	let fetching = $state(false);

	async function loadHealth() {
		if (fetching) return;
		fetching = true;
		try {
			health = await adminGetHealth();
			error = null;
			lastFetched = new Date();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load health';
		} finally {
			loading = false;
			fetching = false;
		}
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		loadHealth();

		// 30s auto-refresh, paused when the tab is hidden so backgrounded
		// admin tabs don't hammer the health endpoint indefinitely. Matches
		// the pattern used by /admin/jobs and /admin (15s) but slower since
		// platform-wide health is less time-sensitive than job state.
		const interval = setInterval(() => {
			if (!document.hidden) loadHealth();
		}, 30000);

		return () => clearInterval(interval);
	});

	function statusLabel(s: HealthDepStatus): string {
		switch (s) {
			case 'ok':
				return 'Healthy';
			case 'degraded':
				return 'Degraded';
			case 'down':
				return 'Down';
			case 'not_configured':
				return 'Not Configured';
		}
	}

	function statusBgClasses(s: HealthDepStatus): string {
		switch (s) {
			case 'ok':
				return 'border-success-500/40 bg-success-500/10 text-success-500';
			case 'degraded':
				return 'border-warning-500/40 bg-warning-500/10 text-warning-500';
			case 'down':
				return 'border-error-500/40 bg-error-500/10 text-error-500';
			case 'not_configured':
				return 'border-surface-300 bg-surface-200/40 text-surface-600 dark:border-surface-700 dark:bg-surface-800/40 dark:text-surface-300';
		}
	}

	function depFriendlyName(name: string): string {
		switch (name) {
			case 'db':
				return 'Database (Postgres)';
			case 'nats':
				return 'NATS Broker';
			case 'vcenter':
				return 'vCenter (cached probe)';
			case 'opnsense':
				return 'OPNsense Firewall';
			case 'engine':
				return 'Crucible Engine';
			default:
				return name;
		}
	}

	function formatTime(iso: string): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return iso;
		return d.toLocaleTimeString();
	}

	function timeAgo(d: Date | null): string {
		if (!d) return '—';
		const secs = Math.round((Date.now() - d.getTime()) / 1000);
		if (secs < 5) return 'just now';
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.round(secs / 60);
		return `${mins}m ago`;
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Platform Health</h1>
			<p class="mt-1 text-sm text-surface-600 dark:text-surface-400">
				Live status of all Crucible backend dependencies. Auto-refreshes every 30 seconds.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs text-surface-500">
				{#if fetching}
					Refreshing…
				{:else}
					Updated {timeAgo(lastFetched)}
				{/if}
			</span>
			<button
				class="rounded-lg border border-surface-300 dark:border-surface-700 bg-surface-100 dark:bg-surface-900 px-3 py-1.5 text-sm hover:bg-surface-200 dark:hover:bg-surface-800 disabled:opacity-50"
				onclick={loadHealth}
				disabled={fetching}
			>
				Refresh
			</button>
		</div>
	</div>

	{#if !authStore.isInstructor}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			You do not have admin access.
		</div>
	{:else if error && !health}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			Failed to load health: {error}
		</div>
	{:else if loading}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(5) as _, i (i)}
				<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900 p-5">
					<LoadingSkeleton width="6rem" height="0.75rem" />
					<div class="mt-3"><LoadingSkeleton width="4rem" height="1.5rem" /></div>
					<div class="mt-2"><LoadingSkeleton width="100%" height="0.75rem" /></div>
				</div>
			{/each}
		</div>
	{:else if health}
		<!-- Rollup banner -->
		<div class="rounded-2xl border px-5 py-4 {statusBgClasses(health.status)}">
			<div class="flex items-center gap-3">
				<span class="text-2xl" aria-hidden="true">
					{#if health.status === 'ok'}✓{:else if health.status === 'degraded'}⚠{:else if health.status === 'down'}✗{:else}—{/if}
				</span>
				<div>
					<div class="text-lg font-semibold">Overall: {statusLabel(health.status)}</div>
					<div class="text-sm opacity-80">
						{#if health.status === 'ok'}
							All probed dependencies are healthy.
						{:else if health.status === 'degraded'}
							One or more dependencies are degraded. Platform may be partially impaired.
						{:else if health.status === 'down'}
							One or more critical dependencies are down. Investigate immediately.
						{:else}
							No dependencies are configured for health probing.
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Per-dependency cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each health.deps as dep (dep.name)}
				<div class="rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900 p-5">
					<div class="flex items-start justify-between gap-2">
						<div class="text-sm font-medium text-surface-700 dark:text-surface-300">
							{depFriendlyName(dep.name)}
						</div>
						<span
							class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {statusBgClasses(dep.status)}"
						>
							{statusLabel(dep.status)}
						</span>
					</div>
					<div class="mt-3 flex items-baseline gap-4">
						<div>
							<div class="text-xs text-surface-500">Latency</div>
							<div class="text-lg font-semibold text-surface-900 dark:text-surface-100">
								{dep.latency_ms}<span class="text-xs font-normal text-surface-500">ms</span>
							</div>
						</div>
						<div>
							<div class="text-xs text-surface-500">Last check</div>
							<div class="text-sm text-surface-700 dark:text-surface-300">
								{formatTime(dep.last_check)}
							</div>
						</div>
					</div>
					{#if dep.detail}
						<div class="mt-3 break-all rounded-lg bg-surface-200/40 dark:bg-surface-800/40 px-3 py-2 text-xs text-surface-600 dark:text-surface-400">
							{dep.detail}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if error}
			<div class="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-warning-500">
				Last refresh failed ({error}). Showing previous data.
			</div>
		{/if}
	{/if}
</div>
