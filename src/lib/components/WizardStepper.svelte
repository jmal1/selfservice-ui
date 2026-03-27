<script lang="ts">
	let { steps, current }: { steps: string[]; current: number } = $props();
</script>

<nav class="flex items-center justify-center gap-2" aria-label="Wizard progress">
	{#each steps as label, i}
		{@const stepNum = i + 1}
		{@const isComplete = stepNum < current}
		{@const isCurrent = stepNum === current}

		{#if i > 0}
			<div
				class="h-0.5 w-8 rounded-full transition-colors sm:w-12 {isComplete ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-700'}"
			></div>
		{/if}

		<div class="flex items-center gap-2">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors
					{isComplete
					? 'bg-primary-500 text-white'
					: isCurrent
						? 'bg-primary-500/20 text-primary-500 ring-2 ring-primary-500'
						: 'bg-surface-200 dark:bg-surface-800 text-surface-500'}"
			>
				{#if isComplete}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{:else}
					{stepNum}
				{/if}
			</div>
			<span
				class="hidden text-sm font-medium sm:inline
					{isCurrent ? 'text-surface-900 dark:text-surface-100' : 'text-surface-500'}"
			>
				{label}
			</span>
		</div>
	{/each}
</nav>
