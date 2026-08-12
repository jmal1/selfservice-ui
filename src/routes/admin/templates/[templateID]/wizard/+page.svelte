<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		adminGetWizardState,
		adminProvisionTemplate,
		adminGeneralizeTemplate,
		adminPublishTemplate,
		adminUnpublishTemplate,
		adminCancelTemplate,
		adminRetryTemplate,
		adminGetResolvedCredentials,
		adminRunPreflight,
		adminTemplatePower,
		ApiError,
		type WizardStateResponse,
		type PreflightResult,
		type PreflightResponse,
		type TemplatePowerAction
	} from '$lib/api/client';
	import type { ResolvedCredentialsResponse } from '$lib/types';
	import VMAccessPanel from '$lib/components/VMAccessPanel.svelte';
	import PreflightPanel from '$lib/components/PreflightPanel.svelte';
	import { wizardStateToAccessInfo } from '$lib/components/vm-access-adapters';

	// Per-template wizard page.
	//
	// Polls /wizard-state every 5s and renders the appropriate action
	// buttons based on `allowed_next_states`. The server is the source
	// of truth: the UI never decides whether a transition is allowed,
	// it only knows which buttons to surface and which to dim.
	//
	// All wizard-conflict responses (409) carry the live
	// allowed_next_states in their body — we re-hydrate the local wizard
	// from the error body so the UI stays in sync even when another
	// admin races us.

	const templateID = $derived($page.params.templateID ?? '');

	let wizard = $state<WizardStateResponse | null>(null);
	let loading = $state(true);
	let acting = $state(false);
	let error = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// Inline form bits for the generalize step.
	let guestUsername = $state('');
	let guestPassword = $state('');

	// Resolved credentials from GET .../resolved-credentials.
	// null = not yet fetched; populated on mount.
	let resolvedCreds = $state<ResolvedCredentialsResponse | null>(null);
	// true when the operator explicitly wants to type credentials
	// instead of using the resolved ones.
	let credsOverrideMode = $state(false);

	// --- Preflight panel state (draft step only) ---
	let preflightResults = $state<PreflightResult[] | null>(null);
	let preflightLoading = $state(false);
	let preflightError = $state<string | null>(null);
	const preflightAnyBlockFailed = $derived(
		preflightResults != null && preflightResults.some((r) => r.severity === 'block' && !r.ok)
	);

	async function runPreflight() {
		preflightLoading = true;
		preflightError = null;
		try {
			const resp: PreflightResponse = await adminRunPreflight(templateID);
			preflightResults = resp.results;
		} catch (err) {
			preflightError = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
		} finally {
			preflightLoading = false;
		}
	}

	onMount(async () => {
		if (!authStore.isInstructor && !authStore.isAdmin) {
			toastStore.error('Forbidden', 'You need the instructor role.');
			await goto('/admin/templates');
			return;
		}
		await reload();
		await fetchResolvedCreds();
		// Poll while in a transient wizard; throttled to 5s.
		pollTimer = setInterval(() => {
			if (wizard && isTransient(wizard.template_state) && !document.hidden) {
				void reload();
			}
		}, 5000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	function isTransient(s: string): boolean {
		// Includes 'configuring' so the wizard keeps polling vCenter
		// for the build VM's IP while the instructor is doing OS setup
		// — without that poll the VMAccessPanel's IP/SSH-RDP fields
		// would freeze at whatever the page first loaded with.
		return s === 'provisioning' || s === 'configuring' || s === 'generalizing' || s === 'verifying';
	}

	// Phase H: VMAccessInfo for the staging build VM. Null in early
	// states (no vcenter_vm_id yet) so the panel doesn't render an
	// empty shell on the draft card.
	const buildVMAccess = $derived(wizard ? wizardStateToAccessInfo(wizard) : null);

	function isTerminal(_s: string): boolean {
		// No terminal states currently exist in the lifecycle (an 'active'
		// template can be unpublished back to 'ready'); kept as a hook for
		// when an archived/deleted state is added.
		return false;
	}

	async function reload() {
		if (!templateID) return;
		try {
			wizard = await adminGetWizardState(templateID);
			error = null;
		} catch (err) {
			error = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
		} finally {
			loading = false;
		}
	}

	// Power controls for the staging build VM (wizard-only). The power endpoint
	// just acks the command, so we re-fetch wizard-state a couple of times after
	// it succeeds to pick up the new build_vm_power_on once vCenter settles.
	async function handlePower(action: TemplatePowerAction) {
		const labels: Record<TemplatePowerAction, string> = {
			start: 'Start',
			stop: 'Stop',
			restart: 'Restart',
			reset: 'Reset'
		};
		const label = labels[action];
		try {
			await adminTemplatePower(templateID, action);
			toastStore.success(`${label} VM`, 'Power command sent.');
			// Poll a few times: power state doesn't flip instantly in vCenter.
			await reload();
			for (let i = 0; i < 2; i++) {
				await new Promise((r) => setTimeout(r, 1500));
				await reload();
			}
		} catch (err) {
			const reason =
				err instanceof ApiError ? (err.body?.reason as string) ?? err.message : String(err);
			toastStore.error(`${label} VM failed`, reason);
		}
	}

	async function fetchResolvedCreds() {
		if (!templateID) return;
		try {
			resolvedCreds = await adminGetResolvedCredentials(templateID);
		} catch {
			// Non-fatal: fall back to the manual prompt.
			resolvedCreds = null;
		}
	}

	// credentialsResolved is true when the server can supply a complete
	// credential pair for the generalize step without operator input.
	const credentialsResolved = $derived(
		resolvedCreds !== null && resolvedCreds.source !== 'none'
	);

	function applyConflictBody(body: unknown) {
		if (
			body &&
			typeof body === 'object' &&
			'current_state' in body &&
			'allowed_next_states' in body
		) {
			const b = body as {
				current_state: string;
				allowed_next_states: string[];
			};
			if (wizard) {
				wizard = {
					...wizard,
					template_state: b.current_state,
					allowed_next_states: b.allowed_next_states
				};
			}
		}
	}

	async function act<T>(label: string, fn: () => Promise<T>) {
		acting = true;
		try {
			await fn();
			toastStore.success(label, 'Done.');
			await reload();
		} catch (err) {
			if (err instanceof ApiError) {
				applyConflictBody(err.body);
				const reason = (err.body?.reason as string) ?? err.message;
				toastStore.error(`${label} failed`, reason);
			} else {
				toastStore.error(`${label} failed`, String(err));
			}
		} finally {
			acting = false;
		}
	}

	function canProvision(): boolean {
		return wizard?.allowed_next_states.includes('provisioning') ?? false;
	}
	function canGeneralize(): boolean {
		return wizard?.allowed_next_states.includes('generalizing') ?? false;
	}
	function canPublish(): boolean {
		// Publish now enqueues an automated smoke test (ready → verifying);
		// the verify worker promotes to active only if the clone boots.
		return wizard?.allowed_next_states.includes('verifying') ?? false;
	}
	function canUnpublish(): boolean {
		return (
			wizard?.template_state === 'active' &&
			(wizard?.allowed_next_states.includes('ready') ?? false)
		);
	}
	function canCancel(): boolean {
		return wizard?.allowed_next_states.includes('error') ?? false;
	}
	function canRetry(): boolean {
		return wizard?.template_state === 'error' && wizard.allowed_next_states.length > 0;
	}

	// stateToStep maps the canonical wizard state to a 1-based index over
	// the 5 visible steps (Draft / Provision / Configure / Generalize /
	// Publish). For 'error' we surface the LAST attempted step so the
	// progress strip can show a red box at the right position instead of
	// collapsing to "nothing started yet". The API tells us which job ran
	// most recently — that's authoritative for picking the failed step.
	//
	// template_provision  → was attempting Provision (step 2). Even if the
	//   clone succeeded and a vCenter VM exists, the rest of the provision
	//   sequence (attach NIC, etc.) may have failed BEFORE we ever flipped
	//   to `configuring`. Old heuristic ("has vm → step 4") was wrong here
	//   and falsely marked Configure as ✓.
	// template_generalize → was attempting Generalize (step 4).
	function stateToStep(
		state: string | undefined,
		hasVM: boolean,
		lastJobType: string | undefined
	): number {
		switch (state) {
			case 'draft':
				return 1;
			case 'provisioning':
				return 2;
			case 'configuring':
				return 3;
			case 'generalizing':
				return 4;
			case 'ready':
			case 'verifying':
			case 'active':
				return 5;
			case 'error':
				if (lastJobType === 'template_provision') return 2;
				if (lastJobType === 'template_generalize') return 4;
				if (lastJobType === 'template_verify') return 5;
				// No job history (shouldn't happen for state=error, but
				// be defensive): fall back to the original heuristic.
				return hasVM ? 4 : 2;
			default:
				return 0;
		}
	}

	const stepNumber = $derived(
		stateToStep(wizard?.template_state, !!wizard?.vcenter_vm_id, wizard?.last_job_type)
	);
	const isErrored = $derived(wizard?.template_state === 'error');

	function stateBadgeClass(s: string | undefined): string {
		switch (s) {
			case 'ready':
			case 'active':
				return 'bg-success-500/15 text-success-500';
			case 'draft':
				return 'bg-surface-500/15 text-surface-500 dark:text-surface-300';
			case 'provisioning':
			case 'configuring':
			case 'generalizing':
			case 'verifying':
				return 'bg-primary-500/15 text-primary-500';
			case 'error':
				return 'bg-error-500/15 text-error-500';
			default:
				return 'bg-surface-500/15 text-surface-500';
		}
	}
</script>

<svelte:head>
	<title>Template wizard — Crucible</title>
</svelte:head>

<div class="container mx-auto max-w-3xl p-6 space-y-6">
	<header class="space-y-1">
		<a href="/admin/templates" class="text-sm text-surface-500 hover:underline">
			← Back to templates
		</a>
		<h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Template wizard</h1>
		<p class="text-surface-500 text-sm">Template ID: <code>{templateID}</code></p>
		<p class="text-sm">
			<a class="anchor" href="/wiki?file=docs/instructor/templates.md" target="_blank" rel="noopener">
				📖 Step-by-step guide ↗
			</a>
		</p>
	</header>

	{#if loading}
		<p class="text-sm text-surface-500">Loading wizard…</p>
	{:else if error}
		<aside class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			<p class="font-semibold">⚠️ {error}</p>
			<button class="btn btn-secondary btn-sm mt-2" onclick={reload}>Retry</button>
		</aside>
	{:else if wizard}
		<!-- Progress strip: visually distinct so the instructor can see
		     at a glance which step is current, done, pending, or errored.
		     Uses Tailwind utility classes (not just Skeleton presets) so
		     the contrast is reliable across themes. -->
		<ol class="flex gap-2 text-xs font-medium">
			{#each ['Draft', 'Provision', 'Configure', 'Generalize', 'Publish'] as label, i (label)}
				{@const idx = i + 1}
				{@const isCurrent = !isErrored && stepNumber === idx}
				{@const isDone = stepNumber > idx}
				{@const isErrorHere = isErrored && stepNumber === idx}
				<li
					class="flex-1 rounded-md p-2 text-center border-2 transition-colors"
					class:border-primary-500={isCurrent}
					class:bg-primary-500={isCurrent}
					class:text-white={isCurrent || isDone || isErrorHere}
					class:border-success-500={isDone}
					class:bg-success-500={isDone}
					class:border-error-500={isErrorHere}
					class:bg-error-500={isErrorHere}
					class:border-surface-700={!isCurrent && !isDone && !isErrorHere}
					class:opacity-50={!isCurrent && !isDone && !isErrorHere}
				>
					<span class="mr-1">{idx}.</span>{label}
					{#if isCurrent}
						<span class="ml-1">●</span>
					{:else if isDone}
						<span class="ml-1">✓</span>
					{:else if isErrorHere}
						<span class="ml-1">✗</span>
					{/if}
				</li>
			{/each}
		</ol>

		<section class="card p-6 space-y-3">
			<h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100">Status</h2>
			<dl class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
				<dt class="font-semibold">Lifecycle wizard</dt>
				<dd>
					<span class="rounded-full px-2 py-0.5 text-xs font-medium {stateBadgeClass(wizard.template_state)}">
						{wizard.template_state}
					</span>
					{#if isTransient(wizard.template_state)}
						<span class="ml-2 text-surface-500">polling…</span>
					{/if}
				</dd>

				{#if wizard.vcenter_vm_id}
					<dt class="font-semibold">vCenter VM</dt>
					<dd><code>{wizard.vcenter_vm_id}</code></dd>
				{/if}

				{#if wizard.source_type}
					<dt class="font-semibold">Source</dt>
					<dd>{wizard.source_type} → <code>{wizard.source_ref}</code></dd>
				{/if}

				{#if wizard.staging_network}
					<dt class="font-semibold">Staging network</dt>
					<dd><code>{wizard.staging_network}</code></dd>
				{/if}
			</dl>
		</section>

		<!-- Step-appropriate actions -->
		{#if wizard.template_state === 'draft'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Step 2 — Provision staging VM</h3>
				<p class="text-sm text-surface-500">
					Clicking Provision enqueues a worker job that clones from your
					source ({wizard.source_type}) into the Templates folder and
					attaches a NIC on <code>{wizard.staging_network}</code>. The page
					will auto-refresh when the job completes.
				</p>

				<!-- Preflight panel: run checks before provisioning. -->
				<div class="space-y-2">
					<button
						class="btn btn-secondary btn-sm"
						disabled={preflightLoading}
						onclick={runPreflight}
					>
						{preflightLoading ? 'Checking…' : 'Run preflight checks'}
					</button>
					{#if preflightError}
						<p class="text-xs text-error-600 dark:text-error-400">{preflightError}</p>
					{/if}
					{#if preflightResults != null}
						{#if preflightAnyBlockFailed}
							<p class="text-sm font-semibold text-error-600 dark:text-error-400">
								⛔ One or more checks failed — fix them before provisioning.
							</p>
						{:else}
							<p class="text-sm font-semibold text-success-600 dark:text-success-400">
								✓ All blocking checks passed.
							</p>
						{/if}
						<PreflightPanel results={preflightResults} />
					{/if}
				</div>

				<button
					class="btn btn-primary"
					disabled={acting || !canProvision() || preflightAnyBlockFailed}
					onclick={() =>
						act('Provision', () => adminProvisionTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Provision'}
				</button>
				{#if preflightAnyBlockFailed}
					<p class="text-xs text-surface-500">
						Provision is disabled until all blocking preflight checks pass.
						Run the checks above to see what needs fixing.
					</p>
				{/if}
			</section>
		{/if}

		{#if wizard.template_state === 'provisioning'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-primary-500">Provisioning in progress</h3>
				<p class="text-sm text-surface-600 dark:text-surface-300">
					The worker is cloning the source VM. This typically takes 5–10
					minutes depending on the source size. You can leave this page
					and come back later; the wizard remembers where you left off.
				</p>
				{#if buildVMAccess}
					<VMAccessPanel info={buildVMAccess} />
					<p class="text-xs text-surface-500">
						The VM may not have power yet — the console will reconnect once it does.
					</p>
				{/if}
			</section>
		{/if}

		{#if wizard.template_state === 'configuring'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Step 3 — Configure the VM</h3>
				<p class="text-sm text-surface-500">
					The staging VM is up. Use the web console below to install
					software and configure user accounts — no vCenter account
					needed. SSH/RDP commands and the bootstrap credentials are
					shown below so you can get back in if the OS locks you out.
					When you're done, click
					<b>Generalize</b> — Crucible will run the appropriate sysprep
					/ cloud-init clean.
				</p>

				{#if buildVMAccess}
					<VMAccessPanel info={buildVMAccess} showPowerControls onPower={handlePower} />
				{/if}

				{#if credentialsResolved && !credsOverrideMode}
					<!-- Credentials are resolved server-side; no input needed. -->
					<p class="text-sm text-surface-600 dark:text-surface-300">
						{#if resolvedCreds?.source === 'unattend_config'}
							Using the credentials from this template's unattended install (user: <code>{resolvedCreds.username}</code>).
						{:else}
							Using this template's stored credentials (user: <code>{resolvedCreds?.username}</code>).
						{/if}
						<button
							class="ml-2 text-xs text-primary-500 hover:underline"
							onclick={() => { credsOverrideMode = true; }}
						>
							Enter different credentials
						</button>
					</p>

					<button
						class="btn btn-primary"
						disabled={acting || !canGeneralize()}
						onclick={() =>
							act('Generalize', () => adminGeneralizeTemplate(templateID))}
					>
						{acting ? 'Working…' : 'Generalize'}
					</button>
				{:else}
					<!-- No resolved credentials, or override requested: show the prompt. -->
					{#if credsOverrideMode}
						<p class="text-sm text-surface-500">
							Enter the credentials currently active in the guest.
							<button
								class="ml-2 text-xs text-primary-500 hover:underline"
								onclick={() => { credsOverrideMode = false; guestUsername = ''; guestPassword = ''; }}
							>
								Use resolved credentials instead
							</button>
						</p>
					{/if}

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<label class="label">
							<span class="text-sm">Guest username (with sudo / Administrator)</span>
							<input class="input" type="text" bind:value={guestUsername} />
						</label>
						<label class="label">
							<span class="text-sm">Guest password *</span>
							<input
								class="input"
								type="password"
								bind:value={guestPassword}
								autocomplete="new-password"
								required
							/>
						</label>
					</div>

					<button
						class="btn btn-primary"
						disabled={acting || !canGeneralize() || !guestPassword}
						onclick={() =>
							act('Generalize', () =>
								adminGeneralizeTemplate(templateID, {
									guest_username: guestUsername || undefined,
									guest_password: guestPassword
								})
							)}
					>
						{acting ? 'Working…' : 'Generalize'}
					</button>
				{/if}
			</section>
		{/if}

		{#if wizard.template_state === 'generalizing'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-primary-500">Generalizing…</h3>
				<p class="text-sm text-surface-600 dark:text-surface-300">
					Crucible is running the OS-specific generalize script
					(cloud-init clean on Linux, sysprep on Windows) and powering
					the VM down. This usually takes 2–5 minutes.
				</p>
				{#if buildVMAccess}
					<VMAccessPanel info={buildVMAccess} />
					<p class="text-xs text-surface-500">
						Useful for watching sysprep finish or debugging if it hangs.
					</p>
				{/if}
			</section>
		{/if}

		{#if wizard.template_state === 'ready'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-success-500">Step 5 — Verify &amp; publish</h3>
				<p class="text-sm text-surface-600 dark:text-surface-300">
					Publishing runs an automated <strong>smoke test</strong> first: Crucible
					clones this template's base-image, boots the clone, and waits for
					VMware Tools{#if wizard.assign_ip} and an IP address{/if} before making
					the template visible to students. This catches a bricked image
					(unbootable sysprep, no network, BitLocker left on) <em>before</em>
					any student clones it. If the smoke test fails, the template returns
					to <code>ready</code> so you can fix it and try again.
				</p>
				<button
					class="btn btn-success"
					disabled={acting || !canPublish()}
					onclick={() => act('Verify & publish', () => adminPublishTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Verify & publish to students'}
				</button>
			</section>
		{/if}

		{#if wizard.template_state === 'verifying'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-primary-500">Step 5 — Verifying…</h3>
				<p class="text-sm text-surface-600 dark:text-surface-300">
					Running the smoke test: cloning the base-image, booting the clone,
					and waiting for VMware Tools{#if wizard.assign_ip} + IP{/if}. The
					throwaway clone is destroyed automatically. This usually takes a few
					minutes — the template publishes itself on success, or returns to
					<code>ready</code> with the failure reason if the clone doesn't come up.
				</p>
				{#if wizard.last_job_status}
					<p class="text-xs text-surface-500">Smoke job: {wizard.last_job_status}</p>
				{/if}
			</section>
		{/if}

		{#if wizard.template_state === 'active'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-success-500">Live ✅</h3>
				<p class="text-sm text-surface-600 dark:text-surface-300">
					Students can launch pods from this template.
				</p>
				<button
					class="btn btn-secondary"
					disabled={acting || !canUnpublish()}
					onclick={() => act('Unpublish', () => adminUnpublishTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Unpublish'}
				</button>
			</section>
		{/if}

		{#if wizard.template_state === 'error'}
			{@const failedStepLabel =
				wizard.last_job_type === 'template_provision'
					? 'Provision'
					: wizard.last_job_type === 'template_generalize'
						? 'Generalize'
						: 'last step'}
			<section class="card p-6 space-y-3">
				<h3 class="text-base font-semibold text-error-500">
					{failedStepLabel} failed
				</h3>
				{#if wizard.last_job_error}
					<pre
						class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-xs text-error-500 whitespace-pre-wrap break-words font-mono">{wizard.last_job_error}</pre>
				{/if}
				<p class="text-sm text-surface-600 dark:text-surface-300">
					Fix the underlying cause, then retry to re-run the {failedStepLabel.toLowerCase()} step. Full job
					history is in
					<a href="/admin/jobs" class="text-primary-500 hover:underline">/admin/jobs</a>.
				</p>
				<button
					class="btn btn-primary"
					disabled={acting || !canRetry()}
					onclick={() => act('Retry', () => adminRetryTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Retry'}
				</button>
			</section>
		{/if}

		{#if !isTerminal(wizard.template_state) && canCancel()}
			<section class="card p-4">
				<button
					class="btn btn-danger"
					disabled={acting}
					onclick={() => {
						if (
							confirm(
								'Cancel this wizard run and mark the template as errored? You can retry from there.'
							)
						) {
							void act('Cancel', () => adminCancelTemplate(templateID));
						}
					}}
				>
					Cancel wizard run
				</button>
			</section>
		{/if}
	{/if}
</div>
