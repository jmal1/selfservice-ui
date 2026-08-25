<script lang="ts">
	import { config } from '$lib/config';

	let {
		compact = false,
		filteringActive = config.studentInternetFilteringActive
	}: {
		compact?: boolean;
		filteringActive?: boolean;
	} = $props();
</script>

{#if !filteringActive}
	<aside
		class="flex items-start gap-3 border border-warning-500/50 bg-warning-500/15 text-sm {compact ? 'px-3 py-2' : 'rounded-xl px-4 py-3'}"
		role="alert"
		aria-label="School-safe Internet filtering is not currently active"
	>
		<svg
			class="mt-0.5 h-5 w-5 shrink-0 text-warning-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 4.4l-7 12.1A2 2 0 005 19.5h14a2 2 0 001.7-3l-7-12.1a2 2 0 00-3.4 0z" />
		</svg>
		<div>
			<p class="font-semibold text-warning-700 dark:text-warning-300">
				School-safe Internet filtering is not currently active
			</p>
			<p class="mt-0.5 text-surface-700 dark:text-surface-200">
				Outbound browsing from this lab may reach unrestricted Internet content.
			</p>
		</div>
	</aside>
{/if}
