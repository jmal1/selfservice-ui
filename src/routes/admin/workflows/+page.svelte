<script lang="ts">
	import { onMount } from 'svelte';
	import { adminListWorkflows, adminCreateWorkflow, adminSubmitWorkflow, adminApproveWorkflow, adminActivateWorkflow } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Workflow } from '$lib/types';

	let workflows: Workflow[] = $state([]);
	let loading = $state(true);
	let showCreate = $state(false);
	let saving = $state(false);

	// Create form fields
	let newName = $state('');
	let newSlug = $state('');
	let newDescription = $state('');
	let newCategory = $state('general');
	let newMode = $state('kali_runner');
	let newScript = $state('#!/bin/bash\nsource /opt/crucible/lib/actions.sh\n\n');
	let newTimeout = $state(300);

	// Auto-generate slug from name
	function slugify(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	async function loadWorkflows() {
		try {
			workflows = (await adminListWorkflows()) ?? [];
		} catch {
			toastStore.error('Failed to load workflows');
		} finally {
			loading = false;
		}
	}

	async function createWorkflow() {
		if (!newName || !newSlug) {
			toastStore.error('Name and slug are required');
			return;
		}
		try {
			saving = true;
			await adminCreateWorkflow({
				name: newName,
				slug: newSlug,
				description: newDescription,
				category: newCategory,
				execution_mode: newMode,
				script: newScript,
				timeout_seconds: newTimeout,
				creation_mode: 'script'
			});
			toastStore.success('Workflow created');
			showCreate = false;
			newName = ''; newSlug = ''; newDescription = ''; newScript = '#!/bin/bash\nsource /opt/crucible/lib/actions.sh\n\n';
			await loadWorkflows();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create workflow');
		} finally {
			saving = false;
		}
	}

	async function submit(id: string) {
		try { await adminSubmitWorkflow(id); toastStore.success('Submitted for review'); await loadWorkflows(); }
		catch (e: any) { toastStore.error(e.message); }
	}
	async function approve(id: string) {
		try { await adminApproveWorkflow(id); toastStore.success('Approved'); await loadWorkflows(); }
		catch (e: any) { toastStore.error(e.message); }
	}
	async function activate(id: string) {
		try { await adminActivateWorkflow(id); toastStore.success('Activated'); await loadWorkflows(); }
		catch (e: any) { toastStore.error(e.message); }
	}

	onMount(() => { loadWorkflows(); });
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Workflows</h1>
		<button class="btn btn-primary" onclick={() => showCreate = !showCreate}>
			{showCreate ? '✕ Cancel' : '+ New Workflow'}
		</button>
	</div>

	<!-- Create Form -->
	{#if showCreate}
		<div class="card space-y-4 p-6">
			<h2 class="text-lg font-semibold">Create Workflow</h2>
			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span>Name</span>
					<input class="input" type="text" bind:value={newName} oninput={() => newSlug = slugify(newName)} placeholder="Git Server Functional" />
				</label>
				<label class="label">
					<span>Slug</span>
					<input class="input" type="text" bind:value={newSlug} placeholder="git-server-functional" />
				</label>
			</div>
			<label class="label">
				<span>Description</span>
				<textarea class="textarea" rows="2" bind:value={newDescription} placeholder="Validates git clone, commit, push, and pull operations"></textarea>
			</label>
			<div class="grid grid-cols-3 gap-4">
				<label class="label">
					<span>Category</span>
					<input class="input" type="text" bind:value={newCategory} placeholder="general" />
				</label>
				<label class="label">
					<span>Execution Mode</span>
					<select class="select" bind:value={newMode}>
						<option value="kali_runner">Kali Runner (network)</option>
						<option value="vmware_tools">VMware Tools (local)</option>
					</select>
				</label>
				<label class="label">
					<span>Timeout (seconds)</span>
					<input class="input" type="number" bind:value={newTimeout} min="10" max="600" />
				</label>
			</div>
			<label class="label">
				<span>Script</span>
				<textarea class="textarea font-mono text-sm" rows="12" bind:value={newScript} placeholder="#!/bin/bash"></textarea>
			</label>
			<div class="flex justify-end gap-2">
				<button class="btn btn-secondary" onclick={() => showCreate = false}>Cancel</button>
				<button class="btn btn-primary" disabled={saving || !newName || !newSlug} onclick={createWorkflow}>
					{saving ? 'Creating...' : 'Create Workflow'}
				</button>
			</div>
		</div>
	{/if}

	{#if loading}
		<LoadingSkeleton />
	{:else if workflows.length === 0 && !showCreate}
		<p class="text-surface-600-400">No workflows created yet. Click "New Workflow" to get started.</p>
	{:else if workflows.length > 0}
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
								<span class="badge {wf.execution_mode === 'vmware_tools' ? 'bg-warning-500/10 text-warning-600' : 'bg-primary-500/10 text-primary-600'}">
									{wf.execution_mode}
								</span>
							</td>
							<td><StatusBadge status={wf.status} /></td>
							<td>
								<div class="flex gap-2">
									{#if wf.status === 'draft'}
										<button class="btn btn-sm btn-ghost" onclick={() => submit(wf.id)}>Submit</button>
									{:else if wf.status === 'pending_review'}
										<button class="btn btn-sm btn-success" onclick={() => approve(wf.id)}>Approve</button>
									{:else if wf.status === 'approved'}
										<button class="btn btn-sm btn-success" onclick={() => activate(wf.id)}>Activate</button>
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
