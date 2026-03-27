<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getTemplates, getResourceUsage, createPod, getPods, addVM, getBlueprints, deployBlueprint } from '$lib/api/client';
	import type { Template, ResourceUsage, Pod, Blueprint } from '$lib/types';
	import { toastStore } from '$lib/stores/toast.svelte';
	import WizardStepper from '$lib/components/WizardStepper.svelte';
	import TemplatePicker from '$lib/components/TemplatePicker.svelte';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	// Destination: 'new' = new environment, or a pod ID for existing
	let destination = $state<'new' | string>('new');
	let pods = $state<Pod[]>([]);
	const activePods = $derived(pods.filter((p) => p.status === 'active' || p.status === 'provisioning'));
	const targetPod = $derived(destination !== 'new' ? activePods.find((p) => p.id === destination) : null);
	const isExisting = $derived(destination !== 'new' && targetPod != null);

	// Blueprint state
	let blueprints = $state<Blueprint[]>([]);
	let selectedBlueprint = $state<Blueprint | null>(null);
	let deployMode = $state<'blueprint' | 'custom' | null>(null);

	const steps = $derived(
		isExisting
			? ['Destination', 'Templates', 'Resources', 'Review']
			: deployMode === 'blueprint'
				? ['Destination', 'Mode', 'Blueprint', 'Name', 'Review']
				: deployMode === 'custom'
					? ['Destination', 'Mode', 'Name', 'Templates', 'Resources', 'Review']
					: ['Destination', 'Mode', 'Name', 'Templates', 'Resources', 'Review']
	);

	let step = $state(1);
	let podName = $state('');
	let templates = $state<Template[]>([]);
	let selections = $state<Record<string, number>>({});
	let vmConfigs = $state<{ template_id: string; name: string; vcpus: number; ram_mb: number; disk_gb: number }[]>([]);
	let usage = $state<ResourceUsage | null>(null);
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Map step number to logical step name
	const stepName = $derived(steps[step - 1]);

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
			const [tpl, usg, allPods, bps] = await Promise.all([
				getTemplates(),
				getResourceUsage(),
				getPods(),
				getBlueprints()
			]);
			templates = tpl;
			usage = usg;
			pods = allPods;
			blueprints = bps.filter(b => b.is_active);

			// If ?pod=ID is in URL, pre-select that pod
			const preselect = page.url.searchParams.get('pod');
			if (preselect) {
				const match = allPods.find((p) => p.id === preselect && (p.status === 'active' || p.status === 'provisioning'));
				if (match) {
					destination = preselect;
					step = 2; // Skip destination step
				}
			}
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
		if (stepName === 'Destination') return destination === 'new' || targetPod != null;
		if (stepName === 'Mode') return deployMode != null;
		if (stepName === 'Blueprint') return selectedBlueprint != null;
		if (stepName === 'Name') return podName.trim().length > 0;
		if (stepName === 'Templates') return selectedTemplates.length > 0;
		if (stepName === 'Resources') return vmConfigs.length > 0;
		return true;
	}

	function nextStep() {
		if (!canNext()) return;
		// When going from Destination to Mode for existing pods, skip Mode entirely
		if (stepName === 'Destination' && isExisting) {
			step = Math.min(step + 1, steps.length);
			return;
		}
		if (stepName === 'Templates') buildVmConfigs();
		step = Math.min(step + 1, steps.length);
	}

	function prevStep() {
		const prev = Math.max(step - 1, 1);
		// If going back to Mode step or before, reset deployMode
		if (steps[prev - 1] === 'Destination') {
			deployMode = null;
			selectedBlueprint = null;
		}
		step = prev;
	}

	async function handleSubmit() {
		submitting = true;
		error = null;
		try {
			if (deployMode === 'blueprint' && selectedBlueprint) {
				await deployBlueprint(selectedBlueprint.id, podName.trim());
				toastStore.success(`Deploying "${podName}" from blueprint "${selectedBlueprint.name}"`);
				await goto('/');
			} else if (isExisting && targetPod) {
				for (const c of vmConfigs) {
					await addVM(targetPod.id, {
						template_id: c.template_id,
						display_name: c.name.trim(),
						vcpus: c.vcpus,
						ram_mb: c.ram_mb,
						disk_gb: c.disk_gb
					});
				}
				await goto(`/pods/${targetPod.id}`);
			} else {
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
				await goto('/');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to deploy';
			submitting = false;
		}
	}

	function templateName(id: string): string {
		return templates.find((t) => t.id === id)?.name ?? 'Unknown';
	}
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="flex items-center gap-3">
		<a href="/" class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100" aria-label="Back">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">Deploy VMs</h1>
			<p class="text-sm text-surface-500">{isExisting ? `Adding to ${targetPod?.name}` : 'Set up an isolated network with your VMs'}</p>
		</div>
	</div>

	<WizardStepper {steps} current={step} />

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
		{:else if stepName === 'Destination'}
			<!-- Step: Destination -->
			<div class="mx-auto max-w-lg space-y-3">
				<p class="text-sm text-surface-500">Where should these VMs be deployed?</p>
				<!-- New environment option -->
				<button
					class="flex w-full items-center gap-4 rounded-xl border-2 px-5 py-4 text-left transition-all {destination === 'new' ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}"
					onclick={() => (destination = 'new')}
				>
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {destination === 'new' ? 'bg-primary-500/15 text-primary-500' : 'bg-surface-200 dark:bg-surface-800 text-surface-500'}">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
					</div>
					<div>
						<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">New Environment</span>
						<p class="text-xs text-surface-500">Create a fresh isolated network</p>
					</div>
				</button>
				<!-- Existing pods -->
				{#each activePods as pod (pod.id)}
					<button
						class="flex w-full items-center gap-4 rounded-xl border-2 px-5 py-4 text-left transition-all {destination === pod.id ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}"
						onclick={() => (destination = pod.id)}
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {destination === pod.id ? 'bg-primary-500/15 text-primary-500' : 'bg-surface-200 dark:bg-surface-800 text-surface-500'}">
							<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
							</svg>
						</div>
						<div class="flex-1">
							<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">{pod.name}</span>
							<p class="text-xs text-surface-500">{(pod.vms ?? []).length} VM{(pod.vms ?? []).length !== 1 ? 's' : ''} · {pod.status}</p>
						</div>
						<span class="inline-block h-2 w-2 rounded-full {pod.status === 'active' ? 'bg-success-500' : 'bg-surface-500'}"></span>
					</button>
				{/each}
				{#if activePods.length === 0}
					<p class="pt-2 text-center text-xs text-surface-500">No existing environments — create a new one above</p>
				{/if}
			</div>
		{:else if stepName === 'Mode'}
			<!-- Step: Choose blueprint vs custom -->
			<div class="mx-auto max-w-lg space-y-3">
				<p class="text-sm text-surface-500">How would you like to set up your environment?</p>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<button
						onclick={() => { deployMode = 'blueprint'; }}
						class="p-6 rounded-xl border-2 text-left transition-all {deployMode === 'blueprint' ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}"
					>
						<div class="text-2xl mb-2">📋</div>
						<h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Deploy Blueprint</h3>
						<p class="text-xs text-surface-500 mt-1">Choose from pre-configured lab environments</p>
						{#if blueprints.length > 0}
							<p class="text-xs text-surface-400 mt-2">{blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''} available</p>
						{:else}
							<p class="text-xs text-surface-500 mt-2">No blueprints available</p>
						{/if}
					</button>
					<button
						onclick={() => { deployMode = 'custom'; }}
						class="p-6 rounded-xl border-2 text-left transition-all {deployMode === 'custom' ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}"
					>
						<div class="text-2xl mb-2">🔧</div>
						<h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Custom Environment</h3>
						<p class="text-xs text-surface-500 mt-1">Select individual VMs and configure resources</p>
					</button>
				</div>
			</div>
		{:else if stepName === 'Blueprint'}
			<!-- Step: Blueprint Selection -->
			<div class="space-y-4">
				<p class="text-sm text-surface-500">Select a blueprint to deploy.</p>
				{#if blueprints.length === 0}
					<div class="rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-8 text-center text-sm text-surface-500">
						No blueprints available. Ask an admin to create one.
					</div>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each blueprints as bp (bp.id)}
							<button
								onclick={() => (selectedBlueprint = bp)}
								class="p-4 rounded-xl border-2 text-left transition-all {selectedBlueprint?.id === bp.id ? 'border-primary-500 bg-primary-500/5' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}"
							>
								<h3 class="font-semibold text-surface-900 dark:text-surface-100">{bp.name}</h3>
								{#if bp.description}
									<p class="text-sm text-surface-400 mt-1">{bp.description}</p>
								{/if}
								<div class="flex gap-3 mt-2 text-xs text-surface-500">
									<span>{bp.vms.reduce((a, v) => a + v.quantity, 0)} VMs</span>
									<span>·</span>
									<span>{bp.allow_vm_additions ? 'VM additions allowed' : 'Locked'}</span>
								</div>
								{#if bp.vms.length > 0}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each bp.vms as vm}
											<span class="px-2 py-0.5 bg-surface-200 dark:bg-surface-800 rounded text-xs text-surface-300">
												{vm.display_name || templateName(vm.template_id)}{vm.quantity > 1 ? ` ×${vm.quantity}` : ''}
											</span>
										{/each}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else if stepName === 'Name'}
			<!-- Step: Name -->
			<div class="mx-auto max-w-md space-y-4">
				<label for="pod-name" class="block text-sm font-medium text-surface-900 dark:text-surface-100">Environment Name</label>
				<input
					id="pod-name"
					type="text"
					bind:value={podName}
					placeholder="security-lab"
					class="w-full rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-4 py-3 text-surface-900 dark:text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
				<p class="text-xs text-surface-500">Choose a descriptive name for your lab environment. This will be visible in your dashboard.</p>
			</div>
		{:else if stepName === 'Templates'}
			<!-- Step: Templates -->
			<div class="space-y-4">
				<p class="text-sm text-surface-500">Select operating systems and how many of each you need.</p>
				<TemplatePicker {templates} {selections} onchange={(s) => (selections = s)} />
			</div>
		{:else if stepName === 'Resources'}
			<!-- Step: Resource Config -->
			<div class="space-y-4">
				{#if usage}
					<div class="flex flex-wrap gap-4 rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-3 text-sm">
						<span class="text-surface-500">
							vCPU: <strong class="text-surface-900 dark:text-surface-100">{(usage.used_vcpus + totalNewVcpus)}</strong> / {usage.max_vcpus}
						</span>
						<span class="text-surface-500">
							RAM: <strong class="text-surface-900 dark:text-surface-100">{Math.round((usage.used_ram_mb + totalNewRamMb) / 1024)} GB</strong> / {Math.round(usage.max_ram_mb / 1024)} GB
						</span>
						{#if !isExisting}
							<span class="text-surface-500">
								Pods: <strong class="text-surface-900 dark:text-surface-100">{usage.active_pods + 1}</strong> / {usage.max_pods}
							</span>
						{/if}
					</div>
				{/if}

				{#each vmConfigs as cfg, i (i)}
					<div class="rounded-xl border border-surface-200 dark:border-surface-800 p-4">
						<div class="mb-3 flex items-center gap-2 text-xs text-surface-500">
							<span class="rounded-md bg-surface-200 dark:bg-surface-800 px-2 py-0.5">{templates.find(t => t.id === cfg.template_id)?.name ?? cfg.template_id}</span>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
							<div>
								<label for="vmname-{i}" class="mb-1 block text-xs text-surface-500">VM Name</label>
								<input
									id="vmname-{i}"
									type="text"
									bind:value={vmConfigs[i].name}
									placeholder="My VM"
									class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
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
									class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
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
									class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
							<div>
								<label for="disk-{i}" class="mb-1 block text-xs text-surface-500">Disk (GB)</label>
								<input
									id="disk-{i}"
									type="number"
									min="10"
									bind:value={vmConfigs[i].disk_gb}
									class="w-full rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none"
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else if stepName === 'Review'}
			<!-- Step: Review -->
			<div class="space-y-4">
				<div class="rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-3">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">{isExisting ? 'Adding to' : 'Environment Name'}</span>
					<p class="mt-1 text-lg font-bold text-surface-900 dark:text-surface-100">{isExisting ? targetPod?.name : podName}</p>
				</div>

				{#if deployMode === 'blueprint' && selectedBlueprint}
					<!-- Blueprint review -->
					<div class="rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-3">
						<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">Blueprint</span>
						<p class="mt-1 text-sm font-semibold text-surface-900 dark:text-surface-100">{selectedBlueprint.name}</p>
						{#if selectedBlueprint.description}
							<p class="text-xs text-surface-400 mt-1">{selectedBlueprint.description}</p>
						{/if}
					</div>

					<div>
						<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">
							VMs ({selectedBlueprint.vms.reduce((a, v) => a + v.quantity, 0)})
						</span>
						<div class="mt-2 space-y-2">
							{#each [...selectedBlueprint.vms].sort((a, b) => a.boot_order - b.boot_order) as vm}
								<div class="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-800 px-4 py-2.5">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium text-surface-900 dark:text-surface-100">
											{vm.display_name || templateName(vm.template_id)}
											{vm.quantity > 1 ? ` ×${vm.quantity}` : ''}
										</span>
										<span class="text-xs bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 rounded text-surface-400">
											Boot: {vm.boot_order}
										</span>
									</div>
									<span class="text-sm text-surface-500">
										{vm.vcpus ?? templates.find(t => t.id === vm.template_id)?.default_vcpus ?? '?'} vCPU ·
										{Math.round((vm.ram_mb ?? templates.find(t => t.id === vm.template_id)?.default_ram_mb ?? 0) / 1024)} GB ·
										{vm.disk_gb ?? templates.find(t => t.id === vm.template_id)?.default_disk_gb ?? '?'} GB
									</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="flex items-center gap-2">
						<span class="rounded-full px-2 py-0.5 text-xs font-medium {selectedBlueprint.allow_vm_additions ? 'bg-emerald-500/10 text-emerald-500' : 'bg-surface-200 dark:bg-surface-800 text-surface-500'}">
							{selectedBlueprint.allow_vm_additions ? '🔓 VM additions allowed' : '🔒 VM additions locked'}
						</span>
					</div>
				{:else}
					<!-- Custom review -->
					<div>
						<span class="text-xs font-semibold uppercase tracking-wider text-surface-500">VMs ({totalNewVMs})</span>
						<div class="mt-2 space-y-2">
							{#each vmConfigs as cfg}
								<div class="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-800 px-4 py-2.5">
									<span class="text-sm font-medium text-surface-900 dark:text-surface-100">{cfg.name}</span>
									<span class="text-sm text-surface-500">{cfg.vcpus} vCPU · {Math.round(cfg.ram_mb / 1024)} GB · {cfg.disk_gb} GB</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="flex gap-6 rounded-xl bg-surface-200/50 dark:bg-surface-800/50 px-4 py-3 text-sm">
						<span class="text-surface-500">Total vCPU: <strong class="text-surface-900 dark:text-surface-100">{totalNewVcpus}</strong></span>
						<span class="text-surface-500">Total RAM: <strong class="text-surface-900 dark:text-surface-100">{Math.round(totalNewRamMb / 1024)} GB</strong></span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Navigation buttons -->
	<div class="flex items-center justify-between">
		<button
			class="rounded-xl border border-surface-200 dark:border-surface-800 px-5 py-2.5 text-sm font-medium text-surface-600 dark:text-surface-400 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800 disabled:invisible"
			disabled={step === 1}
			onclick={prevStep}
		>
			Back
		</button>

		{#if step < steps.length}
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
						Deploying…
					</span>
				{:else}
					{isExisting ? 'Add VMs' : deployMode === 'blueprint' ? 'Deploy Blueprint' : 'Deploy Environment'}
				{/if}
			</button>
		{/if}
	</div>
</div>
