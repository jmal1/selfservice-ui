<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { safeErrorText } from '$lib/errors/friendly';
	import { attentionCount, opensPanel, SUCCESS_FLASH_MS, visibleJobs } from '$lib/jobs/attention';
	import type { Job } from '$lib/types';

	let { jobs, title = 'Provisioning jobs' }: { jobs: Job[]; title?: string } = $props();

	let expanded = $state(false);
	let flashing = $state<string[]>([]);
	// Plain values on purpose: the effects must not treat these as dependencies,
	// or a refresh of the same jobs would look new and reopen a closed panel.
	let knownJobIds: string[] = [];
	let previousStatus = new Map<string, string>();
	const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const shown = $derived.by(() => visibleJobs(jobs, Date.now(), new Set(flashing)));
	const badgeCount = $derived(attentionCount(jobs, Date.now()));

	$effect(() => {
		const incoming = jobs;
		const panelOpen = expanded;
		const started: string[] = [];
		for (const job of incoming) {
			const prev = previousStatus.get(job.id);
			if (prev && prev !== 'completed' && job.status === 'completed' && panelOpen) {
				started.push(job.id);
			}
		}
		previousStatus = new Map(incoming.map((job) => [job.id, job.status]));
		for (const id of started) {
			if (flashTimers.has(id)) continue;
			const current = untrack(() => flashing);
			if (!current.includes(id)) flashing = [...current, id];
			flashTimers.set(
				id,
				setTimeout(() => {
					flashTimers.delete(id);
					flashing = untrack(() => flashing).filter((jobId) => jobId !== id);
				}, SUCCESS_FLASH_MS)
			);
		}
	});

	$effect(() => {
		const ids = shown.filter((job) => opensPanel(job.status)).map((job) => job.id);
		if (ids.some((id) => !knownJobIds.includes(id))) {
			expanded = true;
		}
		knownJobIds = [...new Set([...knownJobIds, ...ids])];
	});

	onDestroy(() => {
		for (const timer of flashTimers.values()) clearTimeout(timer);
	});

	interface StepInfo {
		label: string;
		status: 'completed' | 'running' | 'pending' | 'failed';
	}

	function getProvisioningSteps(job: Job): StepInfo[] {
		const isFailed = job.status === 'failed';
		const isCompleted = job.status === 'completed';
		const isRunning = job.status === 'in_progress' || job.status === 'claimed';

		if (job.type === 'pod_create') {
			const vmCount = (job.payload?.vms as unknown[])?.length ?? 0;
			const cloneLabel = vmCount > 0 ? `Clone ${vmCount} VM${vmCount > 1 ? 's' : ''}` : 'Clone VMs';

			// Ordered provisioning phases
			const phases = [
				'Network Setup',
				cloneLabel,
				'Power On',
				'Done'
			];

			if (isFailed) {
				// Show all phases up to "failed" marker
				return phases.map((label, i) => {
					if (i < phases.length - 1) return { label, status: 'completed' as const };
					return { label: 'Failed', status: 'failed' as const };
				});
			}

			if (isCompleted) {
				return phases.map((label) => ({ label, status: 'completed' as const }));
			}

			if (isRunning) {
				// Running — first phase is running, rest pending
				return [
					{ label: phases[0], status: 'completed' },
					{ label: phases[1], status: 'running' },
					{ label: phases[2], status: 'pending' },
					{ label: phases[3], status: 'pending' }
				];
			}

			// Pending (queued)
			return [
				{ label: 'Queued', status: 'completed' },
				...phases.slice(0, -1).map((label) => ({ label, status: 'pending' as const })),
				{ label: 'Done', status: 'pending' }
			];
		}

		if (job.type === 'pod_destroy') {
			const steps = ['Powering off VMs', 'Destroying VMs', 'Releasing VLANs', 'Cleanup'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		if (job.type === 'vm_destroy') {
			const steps = ['Powering off VM', 'Destroying VM', 'Cleanup'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		if (job.type === 'vm_add') {
			const steps = ['Cloning VM', 'Configuring network', 'Powering on'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		// Snapshot operations
		if (job.type === 'vm_snapshot') {
			const steps = ['Creating snapshot', 'Saving to vCenter', 'Done'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		if (job.type === 'vm_revert') {
			const steps = ['Reverting VM', 'Restoring state', 'Done'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		if (job.type === 'vm_snapshot_delete') {
			const steps = ['Deleting snapshot', 'Cleanup', 'Done'];
			if (isFailed) return steps.map((l, i) => ({ label: i === steps.length - 1 ? 'Failed' : l, status: i === steps.length - 1 ? 'failed' as const : 'completed' as const }));
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label: steps[0], status: 'running' }, ...steps.slice(1).map((l) => ({ label: l, status: 'pending' as const }))];
			return steps.map((l, i) => ({ label: l, status: i === 0 ? 'completed' as const : 'pending' as const }));
		}

		// Power operations
		if (job.type === 'vm_start' || job.type === 'vm_stop' || job.type === 'vm_restart' || job.type === 'vm_reset') {
			const actionLabels: Record<string, string> = {
				vm_start: 'Starting VM',
				vm_stop: 'Stopping VM',
				vm_restart: 'Restarting VM',
				vm_reset: 'Resetting VM',
			};
			const label = actionLabels[job.type] ?? 'Processing';
			const steps = [label, 'Done'];
			if (isFailed) return [{ label, status: 'completed' as const }, { label: 'Failed', status: 'failed' as const }];
			if (isCompleted) return steps.map((l) => ({ label: l, status: 'completed' as const }));
			if (isRunning) return [{ label, status: 'running' as const }, { label: 'Done', status: 'pending' as const }];
			return [{ label: 'Queued', status: 'completed' as const }, { label, status: 'pending' as const }];
		}

		// Generic fallback
		const fallback = ['Queued', 'Processing', 'Done'];
		if (isFailed) return [{ label: 'Queued', status: 'completed' }, { label: 'Processing', status: 'completed' }, { label: 'Failed', status: 'failed' }];
		if (isCompleted) return fallback.map((l) => ({ label: l, status: 'completed' as const }));
		if (isRunning) return [{ label: 'Queued', status: 'completed' }, { label: 'Processing', status: 'running' }, { label: 'Done', status: 'pending' }];
		return [{ label: 'Queued', status: 'completed' }, { label: 'Processing', status: 'pending' }, { label: 'Done', status: 'pending' }];
	}

	function jobLabel(job: Job): string {
		const labels: Record<string, string> = {
			pod_create: 'Create Pod',
			pod_destroy: 'Destroying Pod',
			vm_add: 'Adding VM',
			vm_destroy: 'Destroying VM',
			vm_start: 'Starting VM',
			vm_stop: 'Stopping VM',
			vm_restart: 'Restarting VM',
			vm_reset: 'Resetting VM',
			vm_snapshot: 'Create Snapshot',
			vm_revert: 'Restore Snapshot',
			vm_snapshot_delete: 'Delete Snapshot',
		};
		return labels[job.type] ?? job.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function jobSubtitle(job: Job): string {
		const podName = (job.payload?.pod_name as string) || '';
		const vmName = (job.payload?.vm_name as string) || '';

		if (job.type === 'pod_create') {
			const vms = (job.payload?.vms as Array<{ vm_name?: string; template_name?: string }>) ?? [];
			const templates = [...new Set(vms.map((v) => v.template_name).filter(Boolean))];
			const templateStr = templates.join(', ');
			const vmStr = vms.length > 0 ? `${vms.length} VM${vms.length > 1 ? 's' : ''}` : '';
			const parts = [podName, templateStr, vmStr].filter(Boolean);
			if (templateStr && vmStr) return podName ? `${podName} · ${templateStr} · ${vmStr}` : `${templateStr} · ${vmStr}`;
			return parts.join(' · ');
		}

		if (job.type === 'pod_destroy') {
			return podName || '';
		}

		if (job.type === 'vm_destroy') {
			return [podName, vmName].filter(Boolean).join(' · ');
		}

		if (job.type === 'vm_add') {
			const templateName = (job.payload?.template_name as string) || '';
			const displayName = (job.payload?.display_name as string) || '';
			return [podName, displayName || templateName].filter(Boolean).join(' · ');
		}

		if (job.type === 'vm_snapshot' || job.type === 'vm_revert' || job.type === 'vm_snapshot_delete') {
			const snapName = (job.payload?.snapshot_name as string) || (job.payload?.name as string) || '';
			return [vmName, snapName].filter(Boolean).join(' · ');
		}

		if (job.type === 'vm_start' || job.type === 'vm_stop' || job.type === 'vm_restart' || job.type === 'vm_reset') {
			return [podName, vmName].filter(Boolean).join(' · ');
		}

		return podName;
	}

	function jobErrorMessage(job: Job): string | null {
		if (job.status !== 'failed') return null;
		return safeErrorText(job.result);
	}
</script>

{#if shown.length > 0}
<div class="panel overflow-hidden rounded-2xl">
	<!-- Header -->
	<button
		class="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800/30"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">{title}</span>
			{#if badgeCount > 0}
				<span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1.5 text-xs font-bold text-white">
					{badgeCount}
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
		class="grid transition-[grid-template-rows] duration-300 ease-in-out"
		style="grid-template-rows: {expanded ? '1fr' : '0fr'};"
	>
		<div class="overflow-hidden">
		<div class="border-t border-surface-200-800 px-5 py-4">
				<div class="space-y-4">
					{#each shown as job (job.id)}
						<div class="space-y-2" class:job-done-flash={flashing.includes(job.id)}>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium text-surface-900 dark:text-surface-100">{jobLabel(job)}</span>
									{#if jobSubtitle(job)}
										<span class="text-xs text-surface-400">· {jobSubtitle(job)}</span>
									{/if}
								</div>
								<span class="text-xs {job.status === 'failed' ? 'text-error-500 font-medium' : job.status === 'completed' ? 'text-success-500' : 'text-surface-400'}">{job.status}</span>
							</div>
							<!-- Step progress -->
							<div class="flex items-center gap-0.5">
								{#each getProvisioningSteps(job) as step, i}
									{#if i > 0}
										<div class="h-0.5 flex-1 rounded-full transition-colors duration-300 {
											step.status === 'completed' ? 'bg-success-500' :
											step.status === 'failed' ? 'bg-error-500' :
											step.status === 'running' ? 'bg-warning-500/50' :
											'bg-surface-300 dark:bg-surface-700'
										}"></div>
									{/if}
									<div class="flex flex-col items-center gap-1">
										<div
											class="flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-300 {
												step.status === 'completed' ? 'bg-success-500' :
												step.status === 'running' ? 'bg-warning-500' :
												step.status === 'failed' ? 'bg-error-500' :
												'bg-surface-300 dark:bg-surface-700'
											}"
										>
											{#if step.status === 'completed'}
												<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
												</svg>
											{:else if step.status === 'failed'}
												<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											{:else if step.status === 'running'}
												<svg class="h-2.5 w-2.5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
													<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
													<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
												</svg>
											{/if}
										</div>
										<span class="whitespace-nowrap text-[10px] {step.status === 'failed' ? 'text-error-500 font-medium' : step.status === 'running' ? 'text-warning-500' : 'text-surface-400'}">{step.label}</span>
									</div>
								{/each}
							</div>
							<!-- Error message -->
							{#if jobErrorMessage(job)}
								<div class="mt-1 rounded-lg border border-error-500/20 bg-error-500/5 px-3 py-1.5">
									<p class="text-xs text-error-400">{jobErrorMessage(job)}</p>
								</div>
							{/if}
						</div>
					{/each}
				</div>
		</div>
		</div>
	</div>
</div>
{/if}

<style>
	.job-done-flash {
		animation: job-done-flash 0.8s ease-in-out 2;
		border-radius: 0.5rem;
	}

	@keyframes job-done-flash {
		0%,
		100% {
			background-color: transparent;
		}
		50% {
			background-color: color-mix(in srgb, var(--color-success-500, #22c55e) 28%, transparent);
		}
	}
</style>
