<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toastStore, type Toast } from '$lib/stores/toast.svelte';

	const typeStyles: Record<string, { border: string; icon: string; bg: string }> = {
		success: {
			border: 'border-success-500/50',
			icon: 'text-success-500',
			bg: 'bg-success-500/10'
		},
		error: { border: 'border-error-500/50', icon: 'text-error-500', bg: 'bg-error-500/10' },
		info: {
			border: 'border-primary-500/50',
			icon: 'text-primary-500',
			bg: 'bg-primary-500/10'
		},
		warning: {
			border: 'border-warning-500/50',
			icon: 'text-warning-500',
			bg: 'bg-warning-500/10'
		}
	};
</script>

{#if toastStore.toasts.length > 0}
	<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2" style="max-width: 400px;">
		{#each toastStore.toasts as toast (toast.id)}
			{@const styles = typeStyles[toast.type] ?? typeStyles.info}
			<div
				class="flex items-start gap-3 rounded-xl border {styles.border} {styles.bg} bg-surface-100 dark:bg-surface-900 px-4 py-3 shadow-lg backdrop-blur-xl"
				transition:fly={{ x: 100, duration: 300 }}
				role="alert"
			>
				<!-- Icon -->
				<div class="mt-0.5 flex-shrink-0 {styles.icon}">
					{#if toast.type === 'success'}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{:else if toast.type === 'error'}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{:else if toast.type === 'warning'}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					{:else}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					{/if}
				</div>
				<!-- Content -->
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{toast.title}</p>
					{#if toast.message}
						<p class="mt-0.5 text-xs text-surface-500">{toast.message}</p>
					{/if}
				</div>
				<!-- Close button -->
				<button
					class="flex-shrink-0 text-surface-400 transition-colors hover:text-surface-900 dark:hover:text-surface-100"
					onclick={() => toastStore.removeToast(toast.id)}
					aria-label="Dismiss"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
