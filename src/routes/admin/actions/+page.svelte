<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { adminListActions, adminCreateAction, adminUpdateAction, adminDeleteAction } from '$lib/api/client';
	import { toastStore } from '$lib/stores/toast.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import type { Action, ContextParam } from '$lib/types';

	let actions: Action[] = $state([]);
	let loading = $state(true);
	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let expandedId = $state('');

	// Form fields
	let formName = $state('');
	let formSlug = $state('');
	let formDescription = $state('');
	let formCategory = $state('general');
	let formActionType = $state('command');
	let formScript = $state('');
	let formTimeout = $state(60);
	let formHint = $state('');
	let formPoints = $state<number | undefined>(undefined);
	let formPenalty = $state<number | undefined>(undefined);
	let formInputCtx = $state<ContextParam[]>([]);
	let formOutputCtx = $state<ContextParam[]>([]);
	let formPlatforms = $state<string[]>(['any']);

	interface ValidationIssue {
		level: 'error' | 'warning';
		message: string;
	}

	function validateAction(
		script: string,
		inputCtx: ContextParam[],
		outputCtx: ContextParam[],
		platforms: string[]
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		if (!script.trim()) return issues;

		const isWindows = platforms.some(p => p.startsWith('windows'));
		const isLinux = platforms.some(p => p === 'any' || p.startsWith('linux'));

		// Parse ctx_get/ctx_set usage from script
		const ctxGetMatches = [...script.matchAll(/ctx_get\s+["']([^"']+)["']/g)].map(m => m[1]);
		const ctxSetMatches = [...script.matchAll(/ctx_set\s+["']([^"']+)["']/g)].map(m => m[1]);

		const declaredInputs = new Set(inputCtx.map(p => p.key).filter(k => k));
		const declaredOutputs = new Set(outputCtx.map(p => p.key).filter(k => k));
		const usedInputs = new Set(ctxGetMatches);
		const usedOutputs = new Set(ctxSetMatches);

		for (const key of usedInputs) {
			if (!declaredInputs.has(key)) {
				issues.push({ level: 'error', message: `Undeclared input: \`${key}\` — add it to Input Context` });
			}
		}

		for (const key of usedOutputs) {
			if (!declaredOutputs.has(key)) {
				issues.push({ level: 'error', message: `Undeclared output: \`${key}\` — add it to Output Context` });
			}
		}

		for (const key of declaredInputs) {
			if (!usedInputs.has(key)) {
				issues.push({ level: 'warning', message: `Unused input: \`${key}\` is declared but never read via ctx_get` });
			}
		}

		for (const key of declaredOutputs) {
			if (!usedOutputs.has(key)) {
				issues.push({ level: 'warning', message: `Unused output: \`${key}\` is declared but never written via ctx_set` });
			}
		}

		// Bash-specific checks
		if (isLinux || !isWindows) {
			if (!script.includes('return 0') && !script.includes('return 1') && !script.includes('return $')) {
				issues.push({ level: 'warning', message: 'No return statement found — action should return 0 (pass) or 1 (fail)' });
			}
			if (script.includes('return 1') && !script.includes('LAST_ERROR')) {
				issues.push({ level: 'warning', message: 'return 1 without setting LAST_ERROR — failures should set LAST_ERROR and LAST_STUDENT_MSG' });
			}
		}

		// PowerShell-specific checks
		if (isWindows) {
			if (!script.includes('exit 0') && !script.includes('exit 1')) {
				issues.push({ level: 'warning', message: 'No exit statement found — PowerShell action should exit 0 (pass) or exit 1 (fail)' });
			}
			if (script.includes('exit 1') && !script.includes('LAST_ERROR')) {
				issues.push({ level: 'warning', message: 'exit 1 without setting $env:LAST_ERROR — failures should set error messages' });
			}
		}

		return issues;
	}

	const validationIssues = $derived(validateAction(formScript, formInputCtx, formOutputCtx, formPlatforms));
	const errorCount = $derived(validationIssues.filter(i => i.level === 'error').length);
	const warningCount = $derived(validationIssues.filter(i => i.level === 'warning').length);

	const categories = ['general', 'network', 'ssh', 'file', 'service', 'firewall', 'database', 'web'];
	const actionTypes = ['command', 'http', 'ssh', 'file_check', 'service_check', 'port_check', 'dns', 'custom'];

	const platformOptions = [
		{ value: 'any', label: 'Any (network-based)' },
		{ value: 'linux', label: 'Linux (any)' },
		{ value: 'linux:ubuntu', label: 'Ubuntu' },
		{ value: 'linux:debian', label: 'Debian' },
		{ value: 'linux:rhel', label: 'RHEL/CentOS' },
		{ value: 'windows', label: 'Windows (any)' },
		{ value: 'windows:server', label: 'Windows Server' },
	];

	const grouped = $derived(
		actions.reduce<Record<string, Action[]>>((acc, a) => {
			const cat = a.action_category || 'general';
			if (!acc[cat]) acc[cat] = [];
			acc[cat].push(a);
			return acc;
		}, {})
	);

	function slugify(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	function resetForm() {
		formName = ''; formSlug = ''; formDescription = ''; formCategory = 'general';
		formActionType = 'command'; formScript = ''; formTimeout = 60; formHint = '';
		formPoints = undefined; formPenalty = undefined;
		formInputCtx = []; formOutputCtx = [];
		formPlatforms = ['any'];
		editingId = null;
	}

	function startEdit(action: Action) {
		editingId = action.id;
		formName = action.name;
		formSlug = action.slug || '';
		formDescription = action.description;
		formCategory = action.action_category;
		formActionType = action.action_type;
		formScript = action.script;
		formTimeout = action.timeout_seconds;
		formHint = action.student_fail_hint || '';
		formPoints = action.points;
		formPenalty = action.penalty;
		formInputCtx = Array.isArray(action.input_context) ? [...action.input_context] : [];
		formOutputCtx = Array.isArray(action.output_context) ? [...action.output_context] : [];
		formPlatforms = action.supported_platforms || ['any'];
		showForm = true;
		expandedId = '';
		// Scroll to form — main content scrolls inside <main> not window
		setTimeout(() => {
			const main = document.querySelector('main');
			if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
			else window.scrollTo({ top: 0, behavior: 'smooth' });
		}, 50);
	}

	function addCtxParam(list: ContextParam[]): ContextParam[] {
		return [...list, { key: '', type: 'string', description: '' }];
	}

	function removeCtxParam(list: ContextParam[], index: number): ContextParam[] {
		return list.filter((_, i) => i !== index);
	}

	async function loadActions() {
		try {
			actions = await adminListActions();
		} catch {
			toastStore.error('Failed to load actions');
		} finally {
			loading = false;
		}
	}

	async function handleSave() {
		if (!formName || !formSlug) {
			toastStore.error('Name and slug are required');
			return;
		}
		try {
			saving = true;
			const payload = {
				name: formName,
				slug: formSlug,
				description: formDescription,
				action_type: formActionType,
				action_category: formCategory,
				script: formScript,
				input_context: formInputCtx.filter(p => p.key),
				output_context: formOutputCtx.filter(p => p.key),
				timeout_seconds: formTimeout,
				student_fail_hint: formHint || undefined,
				points: formPoints,
				penalty: formPenalty,
				supported_platforms: formPlatforms
			};

			if (editingId) {
				await adminUpdateAction(editingId, payload);
				toastStore.success('Action updated');
			} else {
				await adminCreateAction(payload);
				toastStore.success('Action created');
			}
			showForm = false;
			resetForm();
			await loadActions();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to save action');
		} finally {
			saving = false;
		}
	}

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Delete action "${name}"? This cannot be undone.`)) return;
		try {
			await adminDeleteAction(id);
			toastStore.success('Action deleted');
			await loadActions();
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to delete action');
		}
	}

	onMount(async () => {
		await loadActions();
		const highlight = page.url.searchParams.get('highlight');
		if (highlight) expandedId = highlight;
	});
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Action Library</h1>
			<p class="mt-1 text-sm text-surface-500">
				Reusable assessment actions with defined inputs and outputs. Actions are composed into workflows via the <a href="/admin/workflows" class="text-primary-500 hover:underline">Workflow Builder</a>.
			</p>
		</div>
		<button
			class="btn {showForm ? 'btn-secondary' : 'btn-primary'}"
			onclick={() => { if (showForm) { showForm = false; resetForm(); } else { resetForm(); showForm = true; } }}
		>
			{showForm ? '✕ Cancel' : '+ New Action'}
		</button>
	</div>

	<!-- Create / Edit Form -->
	{#if showForm}
		<div class="card space-y-4 p-6">
			<h2 class="text-lg font-semibold">{editingId ? 'Edit Action' : 'Create Action'}</h2>

			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span>Name</span>
					<input class="input" type="text" bind:value={formName}
						oninput={() => { if (!editingId) formSlug = slugify(formName); }}
						placeholder="e.g. HTTP GET Check" />
				</label>
				<label class="label">
					<span>Slug</span>
					<input class="input" type="text" bind:value={formSlug} placeholder="http-get-check" />
				</label>
			</div>

			<label class="label">
				<span>Description</span>
				<textarea class="textarea" rows="2" bind:value={formDescription}
					placeholder="Makes an HTTP GET request and asserts status code and body content"></textarea>
			</label>

			<div class="grid grid-cols-3 gap-4">
				<label class="label">
					<span>Category</span>
					<select class="select" bind:value={formCategory}>
						{#each categories as cat}
							<option value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
						{/each}
					</select>
				</label>
				<label class="label">
					<span>Action Type</span>
					<select class="select" bind:value={formActionType}>
						{#each actionTypes as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</label>
				<label class="label">
					<span>Timeout (seconds)</span>
					<input class="input" type="number" bind:value={formTimeout} min="5" max="600" />
				</label>
			</div>

			<div>
				<span class="text-sm font-semibold">Supported Platforms</span>
				<p class="mb-2 text-xs text-surface-500">Which OS/distros can run this action</p>
				<div class="flex flex-wrap gap-2">
					{#each platformOptions as opt}
						<label class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors
							{formPlatforms.includes(opt.value) ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'border-surface-300 dark:border-surface-600 text-surface-500'}">
							<input type="checkbox" class="hidden"
								checked={formPlatforms.includes(opt.value)}
								onchange={() => {
									if (formPlatforms.includes(opt.value)) {
										formPlatforms = formPlatforms.filter(p => p !== opt.value);
									} else {
										formPlatforms = [...formPlatforms, opt.value];
									}
								}} />
							{opt.label}
						</label>
					{/each}
				</div>
			</div>

			<label class="label">
				<span>Script</span>
				<textarea class="textarea font-mono text-sm" rows="10" bind:value={formScript}
					placeholder={'# Action function body\n# Use ctx_get/ctx_set for context, LAST_ERROR/LAST_STUDENT_MSG for failures\n\nlocal url="" expect_status=""\nwhile [[ $# -gt 0 ]]; do\n    case "$1" in\n        --url) url="$2"; shift 2;;\n        --expect-status) expect_status="$2"; shift 2;;\n        *) shift;;\n    esac\ndone'}></textarea>
				<p class="text-xs text-surface-500">
					Write the action as a bash function body. Use <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">ctx_get "key"</code> to read inputs and <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">ctx_set "key" "value"</code> to write outputs.
					Set <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">LAST_ERROR</code> and <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">LAST_STUDENT_MSG</code> before returning non-zero on failure.
				</p>
				{#if validationIssues.length > 0}
					<div class="mt-2 space-y-1.5">
						{#if errorCount > 0}
							<p class="text-xs font-semibold text-error-500">{errorCount} error{errorCount > 1 ? 's' : ''}</p>
						{/if}
						{#if warningCount > 0}
							<p class="text-xs font-semibold text-warning-500">{warningCount} warning{warningCount > 1 ? 's' : ''}</p>
						{/if}
						{#each validationIssues as issue}
							<div class="flex items-start gap-2 rounded px-2 py-1 text-xs
								{issue.level === 'error' ? 'bg-error-500/10 text-error-600 dark:text-error-400' : 'bg-warning-500/10 text-warning-600 dark:text-warning-400'}">
								<span class="mt-0.5 shrink-0">{issue.level === 'error' ? '✕' : '⚠'}</span>
								<span>{@html issue.message.replace(/`([^`]+)`/g, '<code class="rounded bg-surface-200 px-1 dark:bg-surface-700">$1</code>')}</span>
							</div>
						{/each}
					</div>
				{/if}
			</label>

			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span>Student Fail Hint</span>
					<input class="input" type="text" bind:value={formHint}
						placeholder="Shown to students when this action fails" />
				</label>
				<div class="grid grid-cols-2 gap-4">
					<label class="label">
						<span>Points</span>
						<input class="input" type="number" bind:value={formPoints} min="0" placeholder="—" />
					</label>
					<label class="label">
						<span>Penalty</span>
						<input class="input" type="number" bind:value={formPenalty} min="0" placeholder="—" />
					</label>
				</div>
			</div>

			<!-- Input Context -->
			<div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold">Input Context</span>
					<button class="btn btn-sm btn-ghost" onclick={() => formInputCtx = addCtxParam(formInputCtx)}>+ Add Input</button>
				</div>
				<p class="mb-2 text-xs text-surface-500">Parameters this action reads from context (via ctx_get)</p>
				{#if formInputCtx.length > 0}
					<div class="space-y-2">
						{#each formInputCtx as param, i}
							<div class="flex items-center gap-2">
								<input class="input" type="text" placeholder="key" bind:value={formInputCtx[i].key} />
								<select class="select" style="max-width: 8rem" bind:value={formInputCtx[i].type}>
									<option value="string">string</option>
									<option value="number">number</option>
									<option value="boolean">boolean</option>
								</select>
								<input class="input" type="text" placeholder="description" bind:value={formInputCtx[i].description} />
								<button class="btn btn-sm btn-danger" onclick={() => formInputCtx = removeCtxParam(formInputCtx, i)}>✕</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Output Context -->
			<div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold">Output Context</span>
					<button class="btn btn-sm btn-ghost" onclick={() => formOutputCtx = addCtxParam(formOutputCtx)}>+ Add Output</button>
				</div>
				<p class="mb-2 text-xs text-surface-500">Values this action writes to context (via ctx_set)</p>
				{#if formOutputCtx.length > 0}
					<div class="space-y-2">
						{#each formOutputCtx as param, i}
							<div class="flex items-center gap-2">
								<input class="input" type="text" placeholder="key" bind:value={formOutputCtx[i].key} />
								<select class="select" style="max-width: 8rem" bind:value={formOutputCtx[i].type}>
									<option value="string">string</option>
									<option value="number">number</option>
									<option value="boolean">boolean</option>
								</select>
								<input class="input" type="text" placeholder="description" bind:value={formOutputCtx[i].description} />
								<button class="btn btn-sm btn-danger" onclick={() => formOutputCtx = removeCtxParam(formOutputCtx, i)}>✕</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2">
				<button class="btn btn-secondary" onclick={() => { showForm = false; resetForm(); }}>Cancel</button>
				<button class="btn btn-primary" disabled={saving || !formName || !formSlug || errorCount > 0} onclick={handleSave}>
					{saving ? 'Saving...' : editingId ? 'Update Action' : 'Create Action'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Action List -->
	{#if loading}
		<LoadingSkeleton />
	{:else if actions.length === 0 && !showForm}
		<div class="card p-8 text-center">
			<p class="text-lg font-medium">No actions yet</p>
			<p class="mt-1 text-sm text-surface-500">Create reusable actions that can be composed into workflows.</p>
		</div>
	{:else if actions.length > 0}
		{#each Object.entries(grouped) as [category, catActions]}
			<div>
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-surface-500">{category}</h2>
				<div class="grid gap-3">
					{#each catActions as action}
						<div class="card overflow-hidden">
							<button
								class="flex w-full items-center justify-between p-4 text-left"
								onclick={() => expandedId = expandedId === action.id ? '' : action.id}
							>
								<div class="flex items-center gap-3">
									<div>
										<p class="font-semibold">{action.name}</p>
										<p class="text-sm text-surface-500">{action.description || 'No description'}</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<span class="badge bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300">{action.action_type}</span>
									{#if (action.input_context?.length ?? 0) > 0}
										<span class="text-xs text-surface-500">{action.input_context.length} in</span>
									{/if}
									{#if (action.output_context?.length ?? 0) > 0}
										<span class="text-xs text-surface-500">{action.output_context.length} out</span>
									{/if}
									<span class="text-surface-400">{expandedId === action.id ? '▼' : '▶'}</span>
								</div>
							</button>

							{#if expandedId === action.id}
								<div class="border-t border-surface-200 p-4 dark:border-surface-700">
									{#if action.script}
										<div class="mb-3">
											<p class="mb-1 text-xs font-semibold uppercase text-surface-500">Script</p>
											<pre class="overflow-x-auto rounded bg-surface-100 p-3 text-sm dark:bg-surface-900">{action.script}</pre>
										</div>
									{/if}

									{#if action.input_context?.length}
										<div class="mb-3">
											<p class="mb-1 text-xs font-semibold uppercase text-surface-500">Input Context</p>
											<div class="space-y-1">
												{#each action.input_context as p}
													<div class="flex items-center gap-2 text-sm">
														<code class="rounded bg-primary-500/10 px-1.5 py-0.5 text-primary-600 dark:text-primary-400">{p.key}</code>
														<span class="text-surface-400">({p.type})</span>
														{#if p.description}<span class="text-surface-500">— {p.description}</span>{/if}
													</div>
												{/each}
											</div>
										</div>
									{/if}

									{#if action.output_context?.length}
										<div class="mb-3">
											<p class="mb-1 text-xs font-semibold uppercase text-surface-500">Output Context</p>
											<div class="space-y-1">
												{#each action.output_context as p}
													<div class="flex items-center gap-2 text-sm">
														<code class="rounded bg-success-500/10 px-1.5 py-0.5 text-success-600 dark:text-success-400">{p.key}</code>
														<span class="text-surface-400">({p.type})</span>
														{#if p.description}<span class="text-surface-500">— {p.description}</span>{/if}
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<div class="flex items-center gap-2 text-sm text-surface-500">
										<span>Timeout: {action.timeout_seconds}s</span>
										{#if action.points}<span>· {action.points} pts</span>{/if}
										{#if action.student_fail_hint}<span>· Hint: {action.student_fail_hint}</span>{/if}
									</div>

									{#if action.supported_platforms?.length}
										<div class="mt-2 flex flex-wrap gap-1">
											{#each action.supported_platforms as platform}
												<span class="badge bg-secondary-500/10 text-secondary-600 dark:text-secondary-400">{platform}</span>
											{/each}
										</div>
									{/if}

									<div class="mt-3 flex gap-2">
										<button class="btn btn-sm btn-secondary" onclick={() => startEdit(action)}>Edit</button>
										<button class="btn btn-sm btn-danger" onclick={() => handleDelete(action.id, action.name)}>Delete</button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
