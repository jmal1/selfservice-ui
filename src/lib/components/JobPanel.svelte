<script lang="ts">
	import type { Job } from '$lib/types';

	let { jobs }: { jobs: Job[] } = $props();

	let expanded = $state(false);

	const activeJobs = $derived(jobs.filter((j) => j.status === 'running' || j.status === 'claimed' || j.status === 'pending'));

	$effect(() => {
		if (activeJobs.length > 0) {
			expanded = true;
		}
	});

	function stepStatus(job: Job): Array<{ label: string; status: 'completed' | 'running' | 'pending' | 'failed' }> {
		if (job.status === 'failed') {
			return [
				{ label: 'Queued', status: 'completed' as const },
				{ label: 'Processing', status: 'completed' as const },
				{ label: 'Failed', status: 'failed' as const }
			];
		}
		return [
			{ label: 'Queued', status: 'completed' as const },
			{ label: 'Processing', status: job.status === 'running' || job.status === 'claimed' ? 'running' as const : job.status === 'completed' ? 'completed' as const : 'pending' as const },
			{ label: 'Done', status: job.status === 'completed' ? 'completed' as const : 'pending' as const }
		];
	}

	function jobLabel(job: Job): string {
		return job.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<div class="glass overflow-hidden rounded-2xl">
	<!-- Header -->
	<button
		class="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-surface-200-800/30"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold text-surface-900-100">Active Jobs</span>
			{#if activeJobs.length > 0}
				<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1.5 text-xs font-bold text-white">
					{activeJobs.length}
				</span>
			{/if}
		</div>
		<svg
			class="h-4 w-4 text-surface-500 transition-transform duration-200"
			class:rotate-180={expanded}
			fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	<!-- Content -->
	<div
		class="overflow-hidden transition-all duration-300 ease-in-out"
		style="max-height: {expanded ? `${Math.max(jobs.length, 1) * 80 + 40}px` : '0px'};"
	>
		<div class="border-t border-surface-200-800 px-5 py-4">
			{#if jobs.length === 0}
				<div class="flex items-center gap-3 py-4 text-surface-500">
					<svg class="h-5 w-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-sm">No active jobs</span>
				</div>
			{:else}
				<div class="space-y-4">
					{#each jobs as job (job.id)}
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium text-surface-900-100">{jobLabel(job)}</span>
								<span class="text-xs {job.status === 'failed' ? 'text-error-500 font-medium' : 'text-surface-500'}">{job.status}</span>
							</div>
							<!-- Step progress -->
							<div class="flex items-center gap-1">
								{#each stepStatus(job) as step, i}
									{#if i > 0}
										<div class="h-0.5 flex-1 rounded-full {step.status === 'completed' ? 'bg-success-500' : step.status === 'failed' ? 'bg-error-500' : 'bg-surface-300-700'}"></div>
									{/if}
									<div class="flex flex-col items-center gap-1">
										<div
											class="flex h-4 w-4 items-center justify-center rounded-full {
												step.status === 'completed' ? 'bg-success-500' :
												step.status === 'running' ? 'bg-warning-500' :
												step.status === 'failed' ? 'bg-error-500' :
												'bg-surface-300-700'
											}"
											class:animate-pulse={step.status === 'running'}
										>
											{#if step.status === 'completed'}
												<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
											{:else if step.status === 'failed'}
												<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											{/if}
										</div>
										<span class="text-[10px] {step.status === 'failed' ? 'text-error-500' : 'text-surface-500'}">{step.label}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
