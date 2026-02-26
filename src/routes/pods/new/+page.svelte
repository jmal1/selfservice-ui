<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getTemplates, getResourceUsage, createPod } from '$lib/api/client';
	import type { Template, ResourceUsage } from '$lib/types';
	import WizardStepper from '$lib/components/WizardStepper.svelte';
	import TemplatePicker from '$lib/components/TemplatePicker.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	const STEPS = ['Name', 'Templates', 'Resources', 'Review'];

	let step = $state(1);
	let podName = $state('');
	let templates = $state<Template[]>([]);
	let selections = $state<Record<string, number>>({});
	let vmConfigs = $state<{ template_id: string; name: string; vcpus: number; ram_mb: number; disk_gb: number }[]>([]);
	let usage = $state<ResourceUsage | null>(null);
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const selectedTemplates = $derived(
		Object.entries(selections)
			.filter(([, qty]) => qty > 0)
			.map(([id, qty]) => ({
				template: templates.find((t) => t.id === id)!,
				quantity: qty
			}))
			.filter((s) => s.template)
	);

	const totalNewVcpus = $derived(vmConfigs.reduce((s, c) => s + c.vcpus, 0));
	const totalNewRamMb = $derived(vmConfigs.reduce((s, c) => s + c.ram_mb, 0));
	const totalNewVMs = $derived(vmConfigs.length);

	onMount(async () => {
		try {
			const [tpl, usg] = await Promise.all([getTemplates(), getResourceUsage()]);
			templates = tpl;
			usage = usg;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	});

	function buildVmConfigs() {
		vmConfigs = selectedTemplates.flatMap(({ template, quantity }) =>
			Array.from({ length: quantity }, (_, i) => ({
				template_id: template.id,
				name: `${template.name}${quantity > 1 ? ` #${i + 1}` : ''}`,
				vcpus: template.default_vcpus,
				ram_mb: template.default_ram_mb,
				disk_gb: template.default_disk_gb
			}))
		);
	}

	function canNext(): boolean {
		if (step === 1) return podName.trim().length > 0;
		if (step === 2) return selectedTemplates.length > 0;
		if (step === 3) return vmConfigs.length > 0;
		return true;
	}

	function nextStep() {
		if (!canNext()) return;
		if (step === 2) buildVmConfigs();
		step = Math.min(step + 1, STEPS.length);
	}

	function prevStep() {
		step = Math.max(step - 1, 1);
	}

	async function handleSubmit() {
		submitting = true;
		error = null;
		try {
			await createPod({
				name: podName.trim(),
				vms: vmConfigs.map((c) => ({
					template_id: c.template_id,
					display_name: c.name.trim(),
					vcpus: c.vcpus,
					ram_mb: c.ram_mb,
					disk_gb: c.disk_gb
				}))
			});
			// API returns job_id, not a pod — navigate to dashboard to watch progress
			await goto('/');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create pod';
			submitting = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center gap-3">
		<a href="/deploy" class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 transition-colors hover:bg-surface-200-800 hover:text-surface-900-100" aria-label="Back">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-surface-900-100">New Lab Environment</h1>
			<p class="text-sm text-surface-500">Set up an isolated network with your VMs</p>
		</div>
	</div>

	<WizardStepper steps={STEPS} current={step} />

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	<div class="glass rounded-2xl p-6">
		{#if loading}
			<div class="space-y-4">
				<LoadingSkeleton height="2rem" />
				<LoadingSkeleton height="6rem" />
			</div>
		{:else if step === 1}
			<!-- Step 1: Name -->
			<div class="mx-auto max-w-md space-y-4">
				<label for="pod-name" class="block text-sm font-medium text-surface-900-100">Environment Name</label>
				<input
					id="pod-name"
					type="text"
					bind:value={podName}
					placeholder="security-lab"
					class="w-full rounded-xl border border-surface-200-800 bg-surface-50-950 px-4 py-3 text-surface-900-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
				<p class="text-xs text-surface-500">Choose a descriptive name for your lab environment. This will be visible in your dashboard.</p>
			</div>
		{:else if step === 2}
			<!-- Step 2: Templates -->
			<div class="space-y-4">
				<p class="text-sm text-surface-500">Select operating systems and how many of each you need.</p>
				<TemplatePicker {templates} {selections} onchange={(s) => (selections = s)} />
			</div>
		{:else if step === 3}
			<!-- Step 3: Resource Config -->
			<div class="space-y-4">
				{#if usage}
					<div class="flex flex-wrap gap-4 rounded-xl bg-surface-200-800/50 px-4 py-3 text-sm">
						<span class="text-surface-500">
							vCPU: <strong class="text-surface-900-100">{(usage.used_vcpus + totalNewVcpus)}</strong> / {usage.max_vcpus}
						</span>
						<span class="text-surface-500">
							RAM: <strong class="text-surface-900-100">{Math.round((usage.used_ram_mb + totalNewRamMb) / 1024)} GB</strong> / {Math.round(usage.max_ram_mb / 1024)} GB
						</span>
						<span class="text-surface-500">
							Pods: <strong class="text-surface-900-100">{usage.active_pods + 1}</strong> / {usage.max_pods}
						</span>
					</div>
				{/if}

				{#each vmConfigs as cfg, i (i)}
					<div class="rounded-xl border border-surface-200-800 p-4">
						<div class="mb-3 flex items-center gap-2 text-xs text-surface-500">
							<span class="rounded-md bg-surface-200-800 px-2 py-0.5">{templates.find(t => t.id === cfg.template_id)?.name ?? cfg.template_id}</span>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
							<div>
								<label for="vmname-{i}" class="mb-1 block text-xs text-surface-500">VM Name</label>
								<input
									id="vmname-{i}"
									type="text"
									bind:value={vmConfigs[i].name}
									placeholder="My VM"
									class="w-full rounded-lg border border-surface-200-800 bg-surface-50-950 px-3 py-2 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
							<div>
								<label for="vcpu-{i}" class="mb-1 block text-xs text-surface-500">vCPUs</label>
								<input
									id="vcpu-{i}"
									type="number"
									min="1"
									max="16"
									bind:value={vmConfigs[i].vcpus}
									class="w-full rounded-lg border border-surface-200-800 bg-surface-50-950 px-3 py-2 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
							<div>
								<label for="ram-{i}" class="mb-1 block text-xs text-surface-500">RAM (MB)</label>
								<input
									id="ram-{i}"
									type="number"
									min="512"
									step="512"
									bind:value={vmConfigs[i].ram_mb}
									class="w-full rounded-lg border border-surface-200-800 bg-surface-50-950 px-3 py-2 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
							<div>
								<label for="disk-{i}" class="mb-1 block text-xs text-surface-500">Disk (GB)</label>
								<input
									id="disk-{i}"
									type="number"
									min="10"
									bind:value={vmConfigs[i].disk_gb}
									class="w-full rounded-lg border border-surface-200-800 bg-surface-50-950 px-3 py-2 text-sm text-surface-900-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else if step === 4}
			<!-- Step 4: Review -->
			<div class="space-y-4">
				<div class="rounded-xl bg-surface-200-800/50 px-4 py-3">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Environment Name</span>
					<p class="mt-1 text-lg font-bold text-surface-900-100">{podName}</p>
				</div>

				<div>
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">VMs ({totalNewVMs})</span>
					<div class="mt-2 space-y-2">
						{#each vmConfigs as cfg}
							<div class="flex items-center justify-between rounded-lg border border-surface-200-800 px-4 py-2.5">
								<span class="text-sm font-medium text-surface-900-100">{cfg.name}</span>
								<span class="text-sm text-surface-500">{cfg.vcpus} vCPU · {Math.round(cfg.ram_mb / 1024)} GB · {cfg.disk_gb} GB</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="flex gap-6 rounded-xl bg-surface-200-800/50 px-4 py-3 text-sm">
					<span class="text-surface-500">Total vCPU: <strong class="text-surface-900-100">{totalNewVcpus}</strong></span>
					<span class="text-surface-500">Total RAM: <strong class="text-surface-900-100">{Math.round(totalNewRamMb / 1024)} GB</strong></span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Navigation buttons -->
	<div class="flex items-center justify-between">
		<button
			class="rounded-xl border border-surface-200-800 px-5 py-2.5 text-sm font-medium text-surface-600-400 transition-colors hover:bg-surface-200-800 disabled:invisible"
			disabled={step === 1}
			onclick={prevStep}
		>
			Back
		</button>

		{#if step < STEPS.length}
			<button
				class="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
				disabled={!canNext()}
				onclick={nextStep}
			>
				Next
			</button>
		{:else}
			<button
				class="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
				disabled={submitting}
				onclick={handleSubmit}
			>
				{#if submitting}
					<span class="inline-flex items-center gap-2">
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
						Creating…
					</span>
				{:else}
					Deploy Environment
				{/if}
			</button>
		{/if}
	</div>
</div>
