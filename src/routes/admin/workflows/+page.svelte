<script lang="ts">
	import { onMount } from 'svelte';
	import {
		adminListWorkflows,
		adminGetWorkflow,
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
	import ContextBadge from '$lib/components/ContextBadge.svelte';
	import type { Workflow, Action } from '$lib/types';

	// ── List mode state ──
	let workflows: Workflow[] = $state([]);
	let loading = $state(true);
	let expandedWfId = $state('');
	let expandedWf: Workflow | null = $state(null);
	let loadingDetail = $state(false);

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

	// Validate that all input context keys are provided by a previous action's output
	const unsatisfiedInputs = $derived.by(() => {
		const issues: Array<{ step: number; actionName: string; key: string }> = [];
		const available = new Set<string>();
		selectedActions.forEach((action, i) => {
			for (const ctx of action.input_context ?? []) {
				if (!available.has(ctx.key)) {
					issues.push({ step: i + 1, actionName: action.name, key: ctx.key });
				}
			}
			for (const ctx of action.output_context ?? []) {
				available.add(ctx.key);
			}
		});
		return issues;
	});

	const hasContextErrors = $derived(unsatisfiedInputs.length > 0);

	// ── Helpers ──
	function slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
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

	async function toggleDetail(id: string) {
		if (expandedWfId === id) {
			expandedWfId = '';
			expandedWf = null;
			return;
		}
		expandedWfId = id;
		loadingDetail = true;
		try {
			expandedWf = await adminGetWorkflow(id);
		} catch {
			toastStore.error('Failed to load workflow details');
			expandedWfId = '';
		} finally {
			loadingDetail = false;
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
				<p class="text-sm text-surface-600 dark:text-surface-400 mb-4">
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
							<tr class="cursor-pointer" onclick={() => toggleDetail(wf.id)}>
								<td>
									<div>
										<p class="font-medium">{wf.name}</p>
										<p class="text-xs text-surface-600 dark:text-surface-400">{wf.slug}</p>
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
										<button class="btn btn-sm btn-secondary" onclick={(e) => { e.stopPropagation(); toggleDetail(wf.id); }}>
											{expandedWfId === wf.id ? 'Hide' : 'View'}
										</button>
										{#if wf.status === 'draft'}
											<button class="btn btn-sm btn-ghost" onclick={(e) => { e.stopPropagation(); submit(wf.id); }}>
												Submit
											</button>
										{:else if wf.status === 'pending_review'}
											<button class="btn btn-sm btn-success" onclick={(e) => { e.stopPropagation(); approve(wf.id); }}>
												Approve
											</button>
										{:else if wf.status === 'approved'}
											<button class="btn btn-sm btn-success" onclick={(e) => { e.stopPropagation(); activate(wf.id); }}>
												Activate
											</button>
										{/if}
									</div>
								</td>
							</tr>
							{#if expandedWfId === wf.id}
								<tr>
									<td colspan="5" class="!p-0">
										<div class="border-t border-surface-200 p-5 dark:border-surface-700">
											{#if loadingDetail}
												<LoadingSkeleton />
											{:else if expandedWf}
												<div class="grid grid-cols-2 gap-6">
													<!-- Left: Info + Actions -->
													<div class="space-y-4">
														{#if expandedWf.description}
															<div>
																<p class="mb-1 text-xs font-semibold uppercase text-surface-500">Description</p>
																<p class="text-sm">{expandedWf.description}</p>
															</div>
														{/if}
														<div>
															<p class="mb-1 text-xs font-semibold uppercase text-surface-500">Timeout</p>
															<p class="text-sm">{expandedWf.timeout_seconds}s</p>
														</div>
														{#if expandedWf.actions && expandedWf.actions.length > 0}
															{@const detailContextFlow = (() => {
																const accumulated = new Set<string>();
																return expandedWf.actions.map((a) => {
																	const available = new Set(accumulated);
																	for (const ctx of a.output_context ?? []) accumulated.add(ctx.key);
																	return available;
																});
															})()}
															<div>
																<p class="mb-2 text-xs font-semibold uppercase text-surface-500">
																	Actions ({expandedWf.actions.length})
																</p>
																<div class="space-y-2">
																	{#each expandedWf.actions as action, i}
																		<a href="/admin/actions?highlight={action.id}" class="flex items-start gap-2 rounded-lg border border-surface-200 p-3 transition-colors hover:border-primary-500/50 hover:bg-primary-500/5 dark:border-surface-700 dark:hover:border-primary-500/50">
																			<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-bold text-primary-600 dark:text-primary-400">
																				{i + 1}
																			</span>
																			<div class="min-w-0 flex-1">
																				<p class="text-sm font-medium text-primary-600 dark:text-primary-400">{action.name}</p>
																				{#if action.description}
																					<p class="text-xs text-surface-500">{action.description}</p>
																				{/if}
																				{#if (action.input_context ?? []).length > 0 || (action.output_context ?? []).length > 0}
																					<div class="mt-1.5 flex flex-wrap gap-1">
																						{#each action.input_context ?? [] as ctx}
																							<ContextBadge ctxKey={ctx.key} direction="in" description={ctx.description} satisfied={detailContextFlow[i].has(ctx.key)} />
																						{/each}
																						{#each action.output_context ?? [] as ctx}
																							<ContextBadge ctxKey={ctx.key} direction="out" description={ctx.description} />
																						{/each}
																					</div>
																				{/if}
																				{#if action.student_fail_hint}
																					<p class="mt-1 text-xs text-warning-600 dark:text-warning-400">💡 {action.student_fail_hint}</p>
																				{/if}
																			</div>
																			<span class="ml-auto shrink-0 text-xs text-surface-400">→</span>
																		</a>
																	{/each}
																</div>
															</div>
														{:else}
															<p class="text-sm text-surface-500">No actions defined (script-only workflow)</p>
														{/if}
													</div>
													<!-- Right: Script -->
													<div>
														<p class="mb-2 text-xs font-semibold uppercase text-surface-500">Script</p>
														{#if expandedWf.script}
															<pre class="max-h-96 overflow-auto rounded-lg bg-surface-100 p-4 text-xs dark:bg-surface-900">{expandedWf.script}</pre>
														{:else}
															<p class="text-sm text-surface-500">No script</p>
														{/if}
													</div>
												</div>
											{/if}
										</div>
									</td>
								</tr>
							{/if}
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
						<p class="mt-2 text-xs text-surface-500">
							<strong>Kali Runner:</strong> Runs from a network-attached Kali container — use for port scans, HTTP checks, SSH tests.
							<strong>VMware Tools:</strong> Runs commands directly inside the target VM — use for file checks, service status, local config.
						</p>
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
						<div class="card p-6 text-center">
							<p class="font-medium">No actions in the library yet</p>
							<p class="mt-1 text-sm text-surface-500">Create reusable actions first, then compose them into workflows.</p>
							<a href="/admin/actions" class="btn btn-primary mt-3">Go to Action Library →</a>
						</div>
					{:else}
						<div class="flex-1 space-y-4 overflow-y-auto pr-1">
							{#each Object.entries(groupedLibraryActions) as [category, actions]}
								<div>
									<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-400">
										{category}
									</h3>
									<div class="space-y-2">
										{#each actions as action}
											<div
												class="flex items-start justify-between gap-3 rounded-lg border border-surface-200 p-3 transition-colors hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800/50"
											>
												<div class="min-w-0 flex-1">
													<p class="text-sm font-medium">{action.name}</p>
													<p class="mt-0.5 text-xs text-surface-600 dark:text-surface-400 line-clamp-2">
														{action.description}
													</p>
													{#if (action.input_context ?? []).length > 0 || (action.output_context ?? []).length > 0}
														<div class="mt-1.5 flex flex-wrap gap-1">
															{#each action.input_context ?? [] as ctx}
																<ContextBadge ctxKey={ctx.key} direction="in" description={ctx.description} />
															{/each}
															{#each action.output_context ?? [] as ctx}
																<ContextBadge ctxKey={ctx.key} direction="out" description={ctx.description} />
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
					<h2 class="mb-2 text-lg font-semibold">
						Workflow Steps
						{#if selectedActions.length > 0}
							<span class="ml-2 text-sm font-normal text-surface-600 dark:text-surface-400">
								({selectedActions.length} action{selectedActions.length !== 1 ? 's' : ''})
							</span>
						{/if}
					</h2>
					<p class="mb-4 text-xs text-surface-500">
						Actions run in order as a single bash process. Each action's output context becomes available to subsequent actions via <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">ctx_get</code>.
					</p>

					{#if selectedActions.length === 0}
						<div class="flex flex-1 flex-col items-center justify-center py-8 text-center">
							<div class="text-3xl mb-2">🔗</div>
							<p class="text-sm text-surface-600 dark:text-surface-400">
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
												<p class="mt-0.5 text-xs text-surface-600 dark:text-surface-400 line-clamp-1">
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
												<ContextBadge ctxKey={ctx.key} direction="in" description={ctx.description} satisfied={flow?.available.has(ctx.key) ?? false} />
											{/each}
											{#each action.output_context ?? [] as ctx}
												<ContextBadge ctxKey={ctx.key} direction="out" description={ctx.description} />
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
									<p class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-400">
										Accumulated Context
									</p>
									<div class="flex flex-wrap gap-1.5">
										{#each allOutputKeys as key}
											<ContextBadge ctxKey={key} direction="out" />
										{/each}
									</div>
								</div>
							{/if}

							<!-- Context validation warning -->
							{#if hasContextErrors}
								<div class="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
									<p class="text-xs font-semibold text-red-700 dark:text-red-400">⚠ Unsatisfied Context Inputs</p>
									<ul class="mt-1 space-y-0.5">
										{#each unsatisfiedInputs as issue}
											<li class="text-xs text-red-600 dark:text-red-400">
												Step {issue.step} ({issue.actionName}): <code class="rounded bg-red-100 px-1 dark:bg-red-900/40">{issue.key}</code> is not provided by any previous action
											</li>
										{/each}
									</ul>
									<p class="mt-2 text-xs text-red-500 dark:text-red-400/80">
										Workflows with unsatisfied inputs will be saved as <strong>draft</strong> and cannot be activated until resolved.
									</p>
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
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">Name</dt>
							<dd class="mt-0.5 font-medium">{wfName}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">Slug</dt>
							<dd class="mt-0.5 font-mono text-sm">{wfSlug}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">Category</dt>
							<dd class="mt-0.5">{wfCategory}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">Execution Mode</dt>
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
							<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">Timeout</dt>
							<dd class="mt-0.5">{wfTimeout}s</dd>
						</div>
						{#if wfDescription}
							<div class="col-span-full">
								<dt class="text-xs font-medium uppercase tracking-wider text-surface-600 dark:text-surface-400">
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
									<p class="text-xs text-surface-600 dark:text-surface-400">{action.description}</p>
									<div class="mt-1.5 flex flex-wrap gap-1">
										{#each action.input_context ?? [] as ctx}
											<ContextBadge ctxKey={ctx.key} direction="in" description={ctx.description} satisfied={flow?.available.has(ctx.key) ?? false} />
										{/each}
										{#each action.output_context ?? [] as ctx}
											<ContextBadge ctxKey={ctx.key} direction="out" description={ctx.description} />
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
							<span class="text-surface-600 dark:text-surface-400">
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

				<!-- Context validation warning on review -->
				{#if hasContextErrors}
					<div class="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
						<p class="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Context Validation Errors</p>
						<ul class="mt-2 space-y-1">
							{#each unsatisfiedInputs as issue}
								<li class="text-sm text-red-600 dark:text-red-400">
									<strong>Step {issue.step}</strong> ({issue.actionName}): input <code class="rounded bg-red-100 px-1 dark:bg-red-900/40">{issue.key}</code> is not output by any previous action
								</li>
							{/each}
						</ul>
						<p class="mt-2 text-xs text-red-500 dark:text-red-400/80">
							You can still save as a draft, but this workflow cannot be submitted for review until all inputs are satisfied.
						</p>
					</div>
				{/if}

				<div class="mt-4 rounded-lg bg-surface-100 p-3 text-sm dark:bg-surface-800">
					<p class="font-medium">Approval Lifecycle</p>
					<p class="mt-1 text-surface-500">
						Draft → Submit for Review → Approve (different user) → Activate. 
						Active workflows can be assigned to playlists and run against student VMs.
					</p>
				</div>

				<div class="flex items-center justify-between">
					<button class="btn btn-secondary" onclick={() => (step = 2)}>← Back</button>
					<div class="flex items-center gap-3">
						{#if hasContextErrors}
							<span class="text-xs text-warning-600 dark:text-warning-400">⚠ Will save as draft</span>
						{/if}
						<button class="btn {hasContextErrors ? 'btn-warning' : 'btn-primary'}" disabled={saving} onclick={createWorkflow}>
							{saving ? 'Creating...' : hasContextErrors ? 'Save as Draft' : 'Create Workflow'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
