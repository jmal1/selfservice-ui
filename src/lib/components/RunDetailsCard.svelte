<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { Run } from '$lib/types';
	import type { Snippet } from 'svelte';
	import {
		formatDuration,
		formatRunActor,
		formatRunPlaylist,
		formatRunPod,
		formatRunScore,
		formatRunTargetVm,
		formatTimestamp,
		statusIcon
	} from '$lib/utils/run';

	let { run, children }: { run: Run; children?: Snippet } = $props();

	let expandedWorkflow = $state('');
	const actor = $derived(formatRunActor(run));
	const pod = $derived(formatRunPod(run));
	const playlist = $derived(formatRunPlaylist(run));
	const targetVm = $derived(formatRunTargetVm(run));
	const score = $derived(formatRunScore(run));
</script>

<div class="space-y-6">
	<div class="card p-4">
		<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Status</p>
				<StatusBadge status={run.status} />
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Score</p>
				<p class="font-mono">{score}</p>
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Workflows</p>
				<p class="font-mono">
					<span class="text-success-500">{run.passed_workflows}</span> /
					<span class="text-error-500">{run.failed_workflows}</span> /
					{run.total_workflows}
				</p>
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Who</p>
				<p class="text-sm" class:text-surface-500={actor === '(unknown)'}>{actor}</p>
			</div>
		</div>

		<div class="mt-3 grid gap-4 border-t border-surface-300/40 pt-3 dark:border-surface-600/40 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Pod</p>
				{#if pod.label === '(deleted)'}
					<p class="text-sm text-surface-500">{pod.label}</p>
				{:else}
					<p class="text-sm">
						{pod.label}
						{#if pod.deleted}
							<span class="text-surface-500"> (deleted)</span>
						{/if}
					</p>
				{/if}
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Target VM</p>
				{#if targetVm.recorded}
					<p class="text-sm">
						{targetVm.name}
						{#if targetVm.ip}
							<span class="text-surface-500"> ({targetVm.ip})</span>
						{/if}
					</p>
				{:else}
					<p class="text-sm text-surface-500">(not recorded)</p>
				{/if}
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Playlist</p>
				{#if playlist.label === '(deleted)'}
					<p class="text-sm text-surface-500">{playlist.label}</p>
				{:else}
					<p class="text-sm">{playlist.label}</p>
				{/if}
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Started</p>
				<p class="text-sm">{formatTimestamp(run.started_at, 'Pending')}</p>
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Completed</p>
				<p class="text-sm">{formatTimestamp(run.completed_at)}</p>
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Created</p>
				<p class="text-sm">{formatTimestamp(run.created_at)}</p>
			</div>
			<div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Updated</p>
				<p class="text-sm">{formatTimestamp(run.updated_at)}</p>
			</div>
		</div>

		{#if run.error_message}
			<div class="mt-3 rounded bg-error-500/10 p-2 text-sm text-error-500">{run.error_message}</div>
		{/if}
	</div>

	{@render children?.()}

	{#if run.results?.length}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Workflow Results</h2>
			{#each run.results as result}
				<div class="card overflow-hidden">
					<button
						type="button"
						class="flex w-full items-center justify-between gap-4 p-4 text-left"
						onclick={() => expandedWorkflow = expandedWorkflow === result.id ? '' : result.id}
						aria-expanded={expandedWorkflow === result.id}
					>
						<div class="flex items-center gap-3">
							<span class="text-xl">{statusIcon(result.status)}</span>
							<div>
								<p class="font-medium">{result.workflow_name}</p>
								{#if result.student_message}
									<p class="text-sm text-surface-600 dark:text-surface-400">{result.student_message}</p>
								{/if}
								{#if targetVm.recorded}
									<p class="text-xs text-surface-500">
										Target VM: {targetVm.name}{#if targetVm.ip} ({targetVm.ip}){/if}
									</p>
								{:else}
									<p class="text-xs text-surface-500">Target VM: (not recorded)</p>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-4">
							<span class="text-sm text-surface-600 dark:text-surface-400">{formatDuration(result.duration_ms)}</span>
							<span class="text-surface-400">{expandedWorkflow === result.id ? '▼' : '▶'}</span>
						</div>
					</button>

					{#if expandedWorkflow === result.id && result.action_results}
						<div class="border-t border-surface-500/20 px-4 pb-4">
							<table class="table mt-2">
								<thead>
									<tr>
										<th>Action</th>
										<th>Status</th>
										<th>Duration</th>
										<th>Message</th>
									</tr>
								</thead>
								<tbody>
									{#each result.action_results as action}
										<tr>
											<td class="font-mono text-sm">{action.action}</td>
											<td>{statusIcon(action.status)} {action.status}</td>
											<td class="text-sm">{formatDuration(action.duration_ms)}</td>
											<td class="text-sm text-surface-600 dark:text-surface-400">{action.message || '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/each}
		</section>
	{/if}
</div>
