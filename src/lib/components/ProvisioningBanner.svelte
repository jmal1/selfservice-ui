<script lang="ts">
	import {
		provisioningStore,
		type ProvisioningStore
	} from '$lib/stores/provisioning.svelte';

	let { store = provisioningStore }: { store?: ProvisioningStore } = $props();
</script>

{#if store.availability !== 'enabled'}
	<aside
		class="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-warning-500/40 bg-warning-500/10 px-4 py-3 text-sm"
		role={store.availability === 'loading' ? 'status' : 'alert'}
		aria-labelledby="provisioning-maintenance-title"
		aria-live="polite"
	>
		<div class="flex min-w-0 gap-3">
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
				<p id="provisioning-maintenance-title" class="font-semibold text-surface-900 dark:text-surface-100">
					{store.availability === 'loading'
						? 'Checking provisioning availability…'
						: 'New deployments are paused'}
				</p>
				{#if store.availability !== 'loading'}
					<p class="mt-0.5 text-surface-600 dark:text-surface-300">{store.message}</p>
					<p class="mt-1 text-xs text-surface-500">
						You can still view, control, and delete existing labs and virtual machines.
					</p>
				{/if}
			</div>
		</div>
		{#if store.availability !== 'loading'}
			<button
				type="button"
				class="rounded-lg border border-warning-500/40 px-3 py-1.5 text-xs font-semibold text-warning-600 transition-colors hover:bg-warning-500/10 dark:text-warning-400"
				onclick={() => store.load({ force: true })}
				aria-label="Check provisioning availability again"
			>
				Check again
			</button>
		{/if}
	</aside>
{/if}
