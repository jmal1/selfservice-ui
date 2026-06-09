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
		ApiError,
		type WizardStateResponse
	} from '$lib/api/client';

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

	onMount(async () => {
		if (!authStore.isInstructor && !authStore.isAdmin) {
			toastStore.error('Forbidden', 'You need the instructor role.');
			await goto('/admin/templates');
			return;
		}
		await reload();
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
		return s === 'provisioning' || s === 'generalizing';
	}

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
		return wizard?.allowed_next_states.includes('active') ?? false;
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

	// stepNumber maps the canonical wizard state to a 1-based index over
	// the 5 visible steps (Draft / Provision / Configure / Generalize /
	// Publish). For 'error' we surface the LAST attempted step so the
	// progress strip can show a red box at the right position instead of
	// collapsing to "nothing started yet". We infer the last attempted
	// step from vcenter_vm_id: if a vCenter VM was already created, the
	// failure happened at or after step 3; otherwise it's at step 2.
	function stateToStep(state: string | undefined, hasVM: boolean): number {
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
			case 'active':
				return 5;
			case 'error':
				// Best-effort guess based on whether the worker got far
				// enough to record a staging VM moref.
				return hasVM ? 4 : 2;
			default:
				return 0;
		}
	}

	const stepNumber = $derived(
		stateToStep(wizard?.template_state, !!wizard?.vcenter_vm_id)
	);
	const isErrored = $derived(wizard?.template_state === 'error');
</script>

<svelte:head>
	<title>Template wizard — Crucible</title>
</svelte:head>

<div class="container mx-auto max-w-3xl p-6 space-y-6">
	<header class="space-y-1">
		<a href="/admin/templates" class="text-sm text-surface-500 hover:underline">
			← Back to templates
		</a>
		<h1 class="h2">Template wizard</h1>
		<p class="text-surface-500 text-sm">Template ID: <code>{templateID}</code></p>
	</header>

	{#if loading}
		<p>Loading wizard…</p>
	{:else if error}
		<aside class="card preset-tonal-error p-4">
			<p class="font-semibold">⚠️ {error}</p>
			<button class="btn preset-tonal-surface mt-2" onclick={reload}>Retry</button>
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

		<section class="card p-6 space-y-2">
			<h2 class="h4">Status</h2>
			<dl class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
				<dt class="font-semibold">Lifecycle wizard</dt>
				<dd>
					<span class="badge preset-tonal-primary">{wizard.template_state}</span>
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

				<dt class="font-semibold">Allowed next moves</dt>
				<dd>
					{#each wizard.allowed_next_states as next (next)}
						<span class="badge preset-tonal-surface mr-1">{next}</span>
					{:else}
						<em>none — terminal</em>
					{/each}
				</dd>
			</dl>
		</section>

		<!-- Step-appropriate actions -->
		{#if wizard.template_state === 'draft'}
			<section class="card p-6 space-y-3">
				<h3 class="h5">Step 2 — Provision staging VM</h3>
				<p class="text-sm text-surface-500">
					Clicking Provision enqueues a worker job that clones from your
					source ({wizard.source_type}) into the Templates folder and
					attaches a NIC on <code>{wizard.staging_network}</code>. The page
					will auto-refresh when the job completes.
				</p>
				<button
					class="btn preset-filled-primary"
					disabled={acting || !canProvision()}
					onclick={() =>
						act('Provision', () => adminProvisionTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Provision'}
				</button>
			</section>
		{/if}

		{#if wizard.template_state === 'provisioning'}
			<section class="card preset-tonal-primary p-6">
				<h3 class="h5">Provisioning in progress</h3>
				<p>
					The worker is cloning the source VM. This typically takes 5–10
					minutes depending on the source size. You can leave this page
					and come back later; the wizard remembers where you left off.
				</p>
			</section>
		{/if}

		{#if wizard.template_state === 'configuring'}
			<section class="card p-6 space-y-3">
				<h3 class="h5">Step 3 — Configure the VM</h3>
				<p class="text-sm text-surface-500">
					The staging VM is up. Open the vCenter console (or use VMware
					Remote Console) and install your software, configure user
					accounts, etc. When you're done, fill in the guest credentials
					below and click <b>Generalize</b> — Crucible will run the
					appropriate sysprep / cloud-init clean.
				</p>

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
					class="btn preset-filled-primary"
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
			</section>
		{/if}

		{#if wizard.template_state === 'generalizing'}
			<section class="card preset-tonal-primary p-6">
				<h3 class="h5">Generalizing…</h3>
				<p>
					Crucible is running the OS-specific generalize script
					(cloud-init clean on Linux, sysprep on Windows) and powering
					the VM down. This usually takes 2–5 minutes.
				</p>
			</section>
		{/if}

		{#if wizard.template_state === 'ready'}
			<section class="card preset-tonal-success p-6 space-y-3">
				<h3 class="h5">Step 5 — Ready to publish</h3>
				<p>
					The template is ready. Publish makes it visible to students;
					you can always unpublish to hide it again without losing the
					generalized image.
				</p>
				<button
					class="btn preset-filled-success"
					disabled={acting || !canPublish()}
					onclick={() => act('Publish', () => adminPublishTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Publish to students'}
				</button>
			</section>
		{/if}

		{#if wizard.template_state === 'active'}
			<section class="card preset-tonal-success p-6 space-y-3">
				<h3 class="h5">Live ✅</h3>
				<p>Students can launch pods from this template.</p>
				<button
					class="btn preset-tonal-warning"
					disabled={acting || !canUnpublish()}
					onclick={() => act('Unpublish', () => adminUnpublishTemplate(templateID))}
				>
					{acting ? 'Working…' : 'Unpublish'}
				</button>
			</section>
		{/if}

		{#if wizard.template_state === 'error'}
			<section class="card preset-tonal-error p-6 space-y-3">
				<h3 class="h5">Errored</h3>
				<p>
					The last attempt failed. Check the worker logs in
					<a href="/admin/jobs" class="underline">/admin/jobs</a> for
					details, then retry to move back to the previous attempt
					state.
				</p>
				<button
					class="btn preset-filled-warning"
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
					class="btn preset-tonal-error"
					disabled={acting}
					onclick={() => {
						if (confirm('Move this template to errored? You can retry from there.')) {
							void act('Cancel', () => adminCancelTemplate(templateID));
						}
					}}
				>
					Cancel (move to errored)
				</button>
			</section>
		{/if}
	{/if}
</div>
