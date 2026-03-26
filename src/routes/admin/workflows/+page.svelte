<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListWorkflows, adminSubmitWorkflow, adminApproveWorkflow, adminActivateWorkflow } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Workflow } from '$lib/types';

	let workflows: Workflow[] = $state([]);
	let loading = $state(true);

	async function loadWorkflows() {
		try {
			workflows = (await adminListWorkflows()) ?? [];
		} catch {
			toastStore.error('Failed to load workflows');
		} finally {
			loading = false;
		}
	}

	async function submit(id: string) {
		try {
			await adminSubmitWorkflow(id);
			toastStore.success('Workflow submitted for review');
			await loadWorkflows();
		} catch (e: any) { toastStore.error(e.message); }
	}

	async function approve(id: string) {
		try {
			await adminApproveWorkflow(id);
			toastStore.success('Workflow approved');
			await loadWorkflows();
		} catch (e: any) { toastStore.error(e.message); }
	}

	async function activate(id: string) {
		try {
			await adminActivateWorkflow(id);
			toastStore.success('Workflow activated');
			await loadWorkflows();
		} catch (e: any) { toastStore.error(e.message); }
	}

	onMount(() => { loadWorkflows(); });
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Workflows</h1>
	</div>

	{#if loading}
		<LoadingSkeleton />
	{:else if workflows.length === 0}
		<p class="text-surface-600-400">No workflows created yet.</p>
	{:else}
		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>Name</th>
						<th>Category</th>
						<th>Mode</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each workflows as wf}
						<tr>
							<td>
								<div>
									<p class="font-medium">{wf.name}</p>
									<p class="text-xs text-surface-600-400">{wf.slug}</p>
								</div>
							</td>
							<td>{wf.category}</td>
							<td>
								<span class="badge {wf.execution_mode === 'vmware_tools' ? 'variant-soft-warning' : 'variant-soft-primary'}">
									{wf.execution_mode}
								</span>
							</td>
							<td><StatusBadge status={wf.status} /></td>
							<td>
								<div class="flex gap-2">
									{#if wf.status === 'draft'}
										<button class="btn btn-sm variant-ghost-primary" onclick={() => submit(wf.id)}>Submit</button>
									{:else if wf.status === 'pending_review'}
										<button class="btn btn-sm variant-ghost-success" onclick={() => approve(wf.id)}>Approve</button>
									{:else if wf.status === 'approved'}
										<button class="btn btn-sm variant-filled-success" onclick={() => activate(wf.id)}>Activate</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
