<script lang="ts">
	import { onMount } from 'svelte';
	import {
		adminListWorkflows,
		adminCreateWorkflow,
		adminSubmitWorkflow,
		adminApproveWorkflow,
		adminActivateWorkflow,
		adminListActions
	} from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Workflow, Action } from '$lib/types';

	// ── List mode state ──
	let workflows: Workflow[] = $state([]);
	let loading = $state(true);

	// ── Create/edit mode state ──
	type Mode = 'list' | 'create';
	let mode: Mode = $state('list');
	let step = $state(1);
	let saving = $state(false);

	// Step 1: metadata
	let wfName = $state('');
	let wfSlug = $state('');
	let wfDescription = $state('');
	let wfCategory = $state('general');
	let wfExecMode = $state('kali_runner');
	let wfTimeout = $state(300);

	// Step 2: actions
	let libraryActions: Action[] = $state([]);
	let loadingActions = $state(false);
	let selectedActions: Action[] = $state([]);

	// Step 3: review
	let useScriptMode = $state(false);
	let customScript = $state('');

	// ── Derived ──
	const groupedLibraryActions = $derived(
		libraryActions.reduce<Record<string, Action[]>>((acc, a) => {
			const cat = a.action_category || 'uncategorized';
			(acc[cat] ??= []).push(a);
			return acc;
		}, {})
	);

	const generatedScript = $derived.by(() => {
		const lines = ['#!/bin/bash', 'source /opt/crucible/lib/actions.sh', ''];
		selectedActions.forEach((action, i) => {
			lines.push(`# Step ${i + 1}: ${action.name}`);
			const identifier = action.slug || action.action_type;
			const paramsStr = Object.entries(action.params || {})
				.map(([k, v]) => `${k}="${v}"`)
				.join(' ');
			lines.push(`run_action "${action.name}" ${identifier}${paramsStr ? ' ' + paramsStr : ''}`);
			lines.push('');
		});
		return lines.join('\n');
	});

	// Context accumulation: at each step, what context keys are available
	const contextFlow = $derived.by(() => {
		const flow: Array<{ step: number; available: Set<string>; reads: string[]; writes: string[] }> = [];
		const accumulated = new Set<string>();
		selectedActions.forEach((action, i) => {
			const reads = (action.input_context ?? []).map((c) => c.key);
			const writes = (action.output_context ?? []).map((c) => c.key);
			flow.push({
				step: i + 1,
				available: new Set(accumulated),
				reads,
				writes
			});
			writes.forEach((k) => accumulated.add(k));
		});
		return flow;
	});

	const step1Valid = $derived(wfName.trim().length > 0 && wfSlug.trim().length > 0);
	const step2Valid = $derived(selectedActions.length > 0);

	// ── Helpers ──
	function slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	function contextColor(key: string): string {
		let hash = 0;
		for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
		const colors = [
			'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
			'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
			'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
			'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
			'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
			'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
			'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
		];
		return colors[Math.abs(hash) % colors.length];
	}

	// ── API calls ──
	async function loadWorkflows() {
		try {
			workflows = (await adminListWorkflows()) ?? [];
		} catch {
			toastStore.error('Failed to load workflows');
		} finally {
			loading = false;
		}
	}

	async function loadLibraryActions() {
		loadingActions = true;
		try {
			libraryActions = ((await adminListActions()) ?? []).filter((a) => a.is_library);
		} catch {
			toastStore.error('Failed to load action library');
		} finally {
			loadingActions = false;
		}
	}

	async function submit(id: string) {
		try {
			await adminSubmitWorkflow(id);
			toastStore.success('Submitted for review');
			await loadWorkflows();
		} catch (e: any) {
			toastStore.error(e.message);
		}
	}

	async function approve(id: string) {
		try {
			await adminApproveWorkflow(id);
			toastStore.success('Approved');
			await loadWorkflows();
		} catch (e: any) {
			toastStore.error(e.message);
		}
	}

	async function activate(id: string) {
		try {
			await adminActivateWorkflow(id);
			toastStore.success('Activated');
			await loadWorkflows();
		} catch (e: any) {
			toastStore.error(e.message);
		}
	}

	// ── Create-mode helpers ──
	function enterCreateMode() {
		mode = 'create';
		step = 1;
		wfName = '';
		wfSlug = '';
		wfDescription = '';
		wfCategory = 'general';
		wfExecMode = 'kali_runner';
		wfTimeout = 300;
		selectedActions = [];
		useScriptMode = false;
		customScript = '';
		loadLibraryActions();
	}

	function cancelCreate() {
		mode = 'list';
		step = 1;
	}

	function goToStep(target: number) {
		if (target === 1) { step = 1; return; }
		if (target === 2 && step1Valid) { step = 2; return; }
		if (target === 3 && step1Valid && step2Valid) { step = 3; return; }
	}

	function addAction(action: Action) {
		selectedActions = [
			...selectedActions,
			{ ...action, execution_order: selectedActions.length + 1 }
		];
	}

	function removeAction(index: number) {
		selectedActions = selectedActions.filter((_, i) => i !== index);
	}

	function moveAction(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= selectedActions.length) return;
		const copy = [...selectedActions];
		[copy[index], copy[target]] = [copy[target], copy[index]];
		selectedActions = copy;
	}

	async function createWorkflow() {
		if (!step1Valid || !step2Valid) return;
		saving = true;
		try {
			const script = useScriptMode ? customScript : generatedScript;
			const actions = selectedActions.map((a, i) => ({
				name: a.name,
				slug: a.slug,
				description: a.description,
				action_type: a.action_type,
				action_category: a.action_category,
				params: a.params || {},
				script: a.script || '',
				input_context: a.input_context || [],
				output_context: a.output_context || [],
				execution_order: i + 1,
				timeout_seconds: a.timeout_seconds || 60,
				student_fail_hint: a.student_fail_hint || '',
				points: a.points || 0,
				penalty: a.penalty || 0,
				is_library: false
			}));
			await adminCreateWorkflow({
				name: wfName,
				slug: wfSlug,
				description: wfDescription,
				category: wfCategory,
				execution_mode: wfExecMode,
				script,
				timeout_seconds: wfTimeout,
				creation_mode: useScriptMode ? 'script' : 'visual',
				actions
			});
			toastStore.success('Workflow created');
			mode = 'list';
			await loadWorkflows();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to create workflow');
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		loadWorkflows();
	});
</script>

<!-- ━━━ LIST MODE ━━━ -->
{#if mode === 'list'}
	<div class="mx-auto max-w-6xl space-y-6 p-6">
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold">Workflows</h1>
			<button class="btn btn-primary" onclick={enterCreateMode}>+ New Workflow</button>
		</div>

		{#if loading}
			<LoadingSkeleton />
		{:else if workflows.length === 0}
			<div class="card p-12 text-center">
				<div class="text-4xl mb-3">📋</div>
				<p class="text-lg font-medium mb-1">No workflows yet</p>
				<p class="text-sm text-surface-600-400 mb-4">
					Create your first workflow to define automated assessment steps.
				</p>
				<button class="btn btn-primary" onclick={enterCreateMode}>+ New Workflow</button>
			</div>
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
									<span
										class="badge {wf.execution_mode === 'vmware_tools'
											? 'bg-warning-500/10 text-warning-600'
											: 'bg-primary-500/10 text-primary-600'}"
									>
										{wf.execution_mode}
									</span>
								</td>
								<td><StatusBadge status={wf.status} /></td>
								<td>
									<div class="flex gap-2">
										{#if wf.status === 'draft'}
											<button class="btn btn-sm btn-ghost" onclick={() => submit(wf.id)}>
												Submit
											</button>
										{:else if wf.status === 'pending_review'}
											<button class="btn btn-sm btn-success" onclick={() => approve(wf.id)}>
												Approve
											</button>
										{:else if wf.status === 'approved'}
											<button class="btn btn-sm btn-success" onclick={() => activate(wf.id)}>
												Activate
											</button>
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

<!-- ━━━ CREATE MODE ━━━ -->
{:else}
	<div class="mx-auto max-w-6xl space-y-6 p-6">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold">New Workflow</h1>
			<button class="btn btn-secondary" onclick={cancelCreate}>✕ Cancel</button>
		</div>

		<!-- Step Indicator -->
		<nav class="flex items-center gap-2 text-sm font-medium">
			{#each [{ n: 1, label: 'Metadata' }, { n: 2, label: 'Actions' }, { n: 3, label: 'Review' }] as s}
				{@const isActive = step === s.n}
				{@const isComplete = step > s.n}
				{@const isClickable =
					s.n === 1 || (s.n === 2 && step1Valid) || (s.n === 3 && step1Valid && step2Valid)}
				{#if s.n > 1}
					<div
						class="h-px flex-1 {isComplete
							? 'bg-primary-500'
							: 'bg-surface-200 dark:bg-surface-700'}"
					></div>
				{/if}
				<button
					class="flex items-center gap-2 rounded-full px-4 py-2 transition-colors
						{isActive
						? 'bg-primary-500 text-white'
						: isComplete
							? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
							: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'}"
					disabled={!isClickable}
					onclick={() => goToStep(s.n)}
				>
					<span
						class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold
							{isActive
							? 'bg-white/20'
							: isComplete
								? 'bg-primary-500 text-white'
								: 'bg-surface-200 dark:bg-surface-700'}"
					>
						{#if isComplete}✓{:else}{s.n}{/if}
					</span>
					{s.label}
				</button>
			{/each}
		</nav>

		<!-- ── STEP 1: Metadata ── -->
		{#if step === 1}
			<div class="card space-y-5 p-6">
				<h2 class="text-lg font-semibold">Workflow Details</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="label">
						<span>Name <span class="text-red-500">*</span></span>
						<input
							class="input"
							type="text"
							bind:value={wfName}
							oninput={() => (wfSlug = slugify(wfName))}
							placeholder="Git Server Functional"
						/>
					</label>
					<label class="label">
						<span>Slug <span class="text-red-500">*</span></span>
						<input
							class="input"
							type="text"
							bind:value={wfSlug}
							placeholder="git-server-functional"
						/>
					</label>
				</div>
				<label class="label">
					<span>Description</span>
					<textarea
						class="textarea"
						rows="3"
						bind:value={wfDescription}
						placeholder="Validates git clone, commit, push, and pull operations"
					></textarea>
				</label>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<label class="label">
						<span>Category</span>
						<input class="input" type="text" bind:value={wfCategory} placeholder="general" />
					</label>
					<label class="label">
						<span>Execution Mode</span>
						<select class="select" bind:value={wfExecMode}>
							<option value="kali_runner">Kali Runner (network)</option>
							<option value="vmware_tools">VMware Tools (local)</option>
						</select>
					</label>
					<label class="label">
						<span>Timeout (seconds)</span>
						<input class="input" type="number" bind:value={wfTimeout} min="10" max="3600" />
					</label>
				</div>
				<div class="flex justify-end">
					<button class="btn btn-primary" disabled={!step1Valid} onclick={() => (step = 2)}>
						Next →
					</button>
				</div>
			</div>

		<!-- ── STEP 2: Compose Actions ── -->
		{:else if step === 2}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Left panel: Available Actions -->
				<div class="card flex max-h-[70vh] flex-col overflow-hidden p-5">
					<h2 class="mb-4 text-lg font-semibold">Available Actions</h2>
					{#if loadingActions}
						<LoadingSkeleton />
					{:else if libraryActions.length === 0}
						<div class="flex flex-1 flex-col items-center justify-center py-8 text-center">
							<div class="text-3xl mb-2">📦</div>
							<p class="text-sm text-surface-600-400 mb-3">
								No library actions found.
							</p>
							<a href="/admin/actions" class="btn btn-sm btn-primary">Go to Actions →</a>
						</div>
					{:else}
						<div class="flex-1 space-y-4 overflow-y-auto pr-1">
							{#each Object.entries(groupedLibraryActions) as [category, actions]}
								<div>
									<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-600-400">
										{category}
									</h3>
									<div class="space-y-2">
										{#each actions as action}
											<div
												class="flex items-start justify-between gap-3 rounded-lg border border-surface-200 p-3 transition-colors hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800/50"
											>
												<div class="min-w-0 flex-1">
													<p class="text-sm font-medium">{action.name}</p>
													<p class="mt-0.5 text-xs text-surface-600-400 line-clamp-2">
														{action.description}
													</p>
													{#if (action.output_context ?? []).length > 0}
														<div class="mt-1.5 flex flex-wrap gap-1">
															{#each action.output_context as ctx}
																<span
																	class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {contextColor(ctx.key)}"
																	title="Outputs: {ctx.description}"
																>
																	↑ {ctx.key}
																</span>
															{/each}
														</div>
													{/if}
												</div>
												<button
													class="btn btn-sm btn-ghost shrink-0"
													onclick={() => addAction(action)}
													title="Add to workflow"
												>
													+ Add
												</button>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Right panel: Workflow Steps -->
				<div class="card flex max-h-[70vh] flex-col overflow-hidden p-5">
					<h2 class="mb-4 text-lg font-semibold">
						Workflow Steps
						{#if selectedActions.length > 0}
							<span class="ml-2 text-sm font-normal text-surface-600-400">
								({selectedActions.length} action{selectedActions.length !== 1 ? 's' : ''})
							</span>
						{/if}
					</h2>

					{#if selectedActions.length === 0}
						<div class="flex flex-1 flex-col items-center justify-center py-8 text-center">
							<div class="text-3xl mb-2">🔗</div>
							<p class="text-sm text-surface-600-400">
								Add actions from the left panel to build your workflow.
							</p>
						</div>
					{:else}
						<div class="flex-1 space-y-3 overflow-y-auto pr-1">
							{#each selectedActions as action, i}
								{@const flow = contextFlow[i]}
								<div class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
									<div class="flex items-start justify-between gap-2">
										<div class="flex items-start gap-3">
											<span
												class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
											>
												{i + 1}
											</span>
											<div class="min-w-0">
												<p class="text-sm font-medium">{action.name}</p>
												<p class="mt-0.5 text-xs text-surface-600-400 line-clamp-1">
													{action.description}
												</p>
											</div>
										</div>
										<div class="flex shrink-0 items-center gap-1">
											<button
												class="rounded p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 disabled:opacity-30 dark:hover:bg-surface-700"
												disabled={i === 0}
												onclick={() => moveAction(i, -1)}
												title="Move up"
											>
												↑
											</button>
											<button
												class="rounded p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-700 disabled:opacity-30 dark:hover:bg-surface-700"
												disabled={i === selectedActions.length - 1}
												onclick={() => moveAction(i, 1)}
												title="Move down"
											>
												↓
											</button>
											<button
												class="rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
												onclick={() => removeAction(i)}
												title="Remove"
											>
												✕
											</button>
										</div>
									</div>

									<!-- Context tags -->
									{#if (action.input_context ?? []).length > 0 || (action.output_context ?? []).length > 0}
										<div class="mt-2 flex flex-wrap gap-1.5 border-t border-surface-100 pt-2 dark:border-surface-700">
											{#each action.input_context ?? [] as ctx}
												{@const isSatisfied = flow?.available.has(ctx.key)}
												<span
													class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {isSatisfied
														? contextColor(ctx.key)
														: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}"
													title="Reads: {ctx.description}{isSatisfied ? '' : ' ⚠ not yet provided'}"
												>
													↓ {ctx.key}
												</span>
											{/each}
											{#each action.output_context ?? [] as ctx}
												<span
													class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {contextColor(ctx.key)}"
													title="Writes: {ctx.description}"
												>
													↑ {ctx.key}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>

						<!-- Context accumulation summary -->
						{#if selectedActions.length > 0}
							{@const allOutputKeys = [
								...new Set(selectedActions.flatMap((a) => (a.output_context ?? []).map((c) => c.key)))
							]}
							{#if allOutputKeys.length > 0}
								<div class="mt-4 border-t border-surface-100 pt-3 dark:border-surface-700">
									<p class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-surface-600-400">
										Accumulated Context
									</p>
									<div class="flex flex-wrap gap-1.5">
										{#each allOutputKeys as key}
											<span
												class="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium {contextColor(key)}"
											>
												{key}
											</span>
										{/each}
									</div>
								</div>
							{/if}
						{/if}
					{/if}
				</div>
			</div>

			<div class="flex justify-between">
				<button class="btn btn-secondary" onclick={() => (step = 1)}>← Back</button>
				<button class="btn btn-primary" disabled={!step2Valid} onclick={() => (step = 3)}>
					Next →
				</button>
			</div>

		<!-- ── STEP 3: Review ── -->
		{:else if step === 3}
			<div class="space-y-6">
				<!-- Workflow summary -->
				<div class="card p-6">
					<h2 class="mb-4 text-lg font-semibold">Workflow Summary</h2>
					<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">Name</dt>
							<dd class="mt-0.5 font-medium">{wfName}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">Slug</dt>
							<dd class="mt-0.5 font-mono text-sm">{wfSlug}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">Category</dt>
							<dd class="mt-0.5">{wfCategory}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">Execution Mode</dt>
							<dd class="mt-0.5">
								<span
									class="badge {wfExecMode === 'vmware_tools'
										? 'bg-warning-500/10 text-warning-600'
										: 'bg-primary-500/10 text-primary-600'}"
								>
									{wfExecMode}
								</span>
							</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">Timeout</dt>
							<dd class="mt-0.5">{wfTimeout}s</dd>
						</div>
						{#if wfDescription}
							<div class="col-span-full">
								<dt class="text-xs font-medium uppercase tracking-wider text-surface-600-400">
									Description
								</dt>
								<dd class="mt-0.5">{wfDescription}</dd>
							</div>
						{/if}
					</dl>
				</div>

				<!-- Actions & context flow -->
				<div class="card p-6">
					<h2 class="mb-4 text-lg font-semibold">
						Actions ({selectedActions.length} step{selectedActions.length !== 1 ? 's' : ''})
					</h2>
					<div class="space-y-3">
						{#each selectedActions as action, i}
							{@const flow = contextFlow[i]}
							<div class="flex items-start gap-3">
								<div class="flex flex-col items-center">
									<span
										class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
									>
										{i + 1}
									</span>
									{#if i < selectedActions.length - 1}
										<div class="mt-1 h-6 w-px bg-surface-200 dark:bg-surface-700"></div>
									{/if}
								</div>
								<div class="min-w-0 flex-1 pb-1">
									<p class="text-sm font-medium">{action.name}</p>
									<p class="text-xs text-surface-600-400">{action.description}</p>
									<div class="mt-1.5 flex flex-wrap gap-1">
										{#each action.input_context ?? [] as ctx}
											{@const satisfied = flow?.available.has(ctx.key)}
											<span
												class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {satisfied
													? contextColor(ctx.key)
													: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}"
											>
												↓ {ctx.key}
											</span>
										{/each}
										{#each action.output_context ?? [] as ctx}
											<span
												class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {contextColor(ctx.key)}"
											>
												↑ {ctx.key}
											</span>
										{/each}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Script preview -->
				<div class="card p-6">
					<div class="mb-4 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Script</h2>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<span class="text-surface-600-400">
								{useScriptMode ? 'Edit directly' : 'Visual mode'}
							</span>
							<button
								class="relative h-5 w-9 rounded-full transition-colors {useScriptMode
									? 'bg-primary-500'
									: 'bg-surface-300 dark:bg-surface-600'}"
								onclick={() => {
									if (!useScriptMode) customScript = generatedScript;
									useScriptMode = !useScriptMode;
								}}
								type="button"
								role="switch"
								aria-checked={useScriptMode}
							>
								<span
									class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {useScriptMode
										? 'translate-x-4'
										: ''}"
								></span>
							</button>
						</label>
					</div>
					{#if useScriptMode}
						<textarea
							class="textarea font-mono text-sm"
							rows="16"
							bind:value={customScript}
						></textarea>
					{:else}
						<pre
							class="max-h-80 overflow-auto rounded-lg bg-surface-100 p-4 font-mono text-sm dark:bg-surface-900"
						>{generatedScript}</pre>
					{/if}
				</div>

				<div class="flex justify-between">
					<button class="btn btn-secondary" onclick={() => (step = 2)}>← Back</button>
					<button class="btn btn-primary" disabled={saving} onclick={createWorkflow}>
						{saving ? 'Creating...' : 'Create Workflow'}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
