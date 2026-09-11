<script lang="ts">
	import type { PreflightResult } from '$lib/api/client';

	// PreflightPanel renders the results of a preflight check run as a
	// compact table. Each row shows the check ID, its outcome (green / red /
	// amber), the observed Detail, and—when failing—the suggested Fix.
	//
	// Severity semantics (mirrors the API):
	//   block — must pass before provisioning is allowed.
	//   warn  — informational; does not block the Provision button.
	//
	// This component is read-only. Callers own running the checks and
	// passing the results array in; the panel just renders.

	interface Props {
		results: PreflightResult[];
	}

	const { results }: Props = $props();

	function rowBg(r: PreflightResult): string {
		if (r.ok) return 'bg-success-500/10';
		if (r.severity === 'block') return 'bg-error-500/10';
		return 'bg-warning-500/10';
	}

	function statusLabel(r: PreflightResult): string {
		if (r.ok) return '✓';
		if (r.severity === 'block') return '✗';
		return '⚠';
	}

	function statusColor(r: PreflightResult): string {
		if (r.ok) return 'text-success-600 dark:text-success-400';
		if (r.severity === 'block') return 'text-error-600 dark:text-error-400';
		return 'text-warning-600 dark:text-warning-400';
	}
</script>

<div class="space-y-1 text-sm">
	{#each results as r (r.id)}
		<div class="rounded-md border border-surface-200 dark:border-surface-700 p-3 {rowBg(r)}">
			<div class="flex items-start gap-3">
				<span class="font-mono font-semibold w-12 shrink-0 {statusColor(r)}">
					{statusLabel(r)} {r.id}
				</span>
				<div class="flex-1 min-w-0">
					<p class="text-surface-800 dark:text-surface-200">{r.detail}</p>
					{#if !r.ok && r.fix}
						<p class="mt-1 text-xs text-surface-500 dark:text-surface-400">
							<span class="font-semibold">Fix:</span> {r.fix}
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>
