<script lang="ts">
	import { page } from '$app/state';

	// Renders inside the root layout, so the sidebar/navigation stay intact when
	// a load function or navigation throws. This is the load-level counterpart to
	// the render-time <ErrorBoundary>.
	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong.');
</script>

<div
	role="alert"
	class="mx-auto my-12 max-w-xl rounded-xl border border-error-400/40 bg-error-500/5 p-8 text-center"
>
	<div
		class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-500/15 text-error-500"
	>
		<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
			/>
		</svg>
	</div>
	<p class="mb-1 text-sm font-medium text-surface-400">Error {status}</p>
	<h1 class="mb-2 text-xl font-semibold text-surface-900 dark:text-surface-100">
		Something went wrong
	</h1>
	<p class="mb-6 text-sm text-surface-500 dark:text-surface-400">{message}</p>
	<div class="flex flex-wrap items-center justify-center gap-2">
		<button
			onclick={() => location.reload()}
			class="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
		>
			Reload page
		</button>
		<a
			href="/"
			class="rounded-md border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-200 dark:border-surface-700 dark:text-surface-200 dark:hover:bg-surface-800"
		>
			Go to dashboard
		</a>
	</div>
</div>
