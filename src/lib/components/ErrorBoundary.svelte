<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { reportClientError, toErrorMessage } from '$lib/errors/reportClientError';

	/**
	 * Render-time crash boundary.
	 *
	 * Wraps its children in a Svelte 5 `<svelte:boundary>` so a throw during
	 * rendering (e.g. iterating an array field the API omitted) is contained to
	 * this subtree instead of white-screening the whole SPA. The rest of the app
	 * — the sidebar, other panels — keeps working, and the user can retry the
	 * failed section or reload.
	 *
	 * This is the structural fix for the Blueprints outage class of bug.
	 */
	let {
		children,
		label = 'this section'
	}: { children: Snippet; label?: string } = $props();

	let showDetails = $state(false);

	function currentPath(): string | undefined {
		try {
			return page.url.pathname;
		} catch {
			return undefined;
		}
	}

	function onBoundaryError(error: unknown): void {
		reportClientError({
			error,
			source: 'render-boundary',
			path: currentPath(),
			info: { label }
		});
	}
</script>

<svelte:boundary onerror={onBoundaryError}>
	{@render children()}

	{#snippet failed(error, reset)}
		<div
			role="alert"
			class="mx-auto my-8 max-w-xl rounded-xl border border-error-400/40 bg-error-500/5 p-6 text-center"
		>
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-500/15 text-error-500"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
					/>
				</svg>
			</div>
			<h2 class="mb-1 text-lg font-semibold text-surface-900 dark:text-surface-100">
				Something went wrong
			</h2>
			<p class="mb-4 text-sm text-surface-500 dark:text-surface-400">
				We hit an unexpected error while loading {label}. The rest of Crucible is still working — you
				can retry this section or reload the page.
			</p>
			<div class="flex flex-wrap items-center justify-center gap-2">
				<button
					onclick={reset}
					class="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
				>
					Try again
				</button>
				<button
					onclick={() => location.reload()}
					class="rounded-md border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-200 dark:border-surface-700 dark:text-surface-200 dark:hover:bg-surface-800"
				>
					Reload page
				</button>
			</div>
			<button
				type="button"
				onclick={() => (showDetails = !showDetails)}
				class="mt-4 text-xs text-surface-400 underline-offset-2 hover:underline"
			>
				{showDetails ? 'Hide' : 'Show'} error details
			</button>
			{#if showDetails}
				<pre
					class="mt-2 overflow-x-auto rounded-md bg-surface-200/60 p-3 text-left text-xs text-surface-600 dark:bg-surface-800/60 dark:text-surface-300">{toErrorMessage(
						error
					)}</pre>
			{/if}
		</div>
	{/snippet}
</svelte:boundary>
