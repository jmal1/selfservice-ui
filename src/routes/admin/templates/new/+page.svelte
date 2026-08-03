<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		adminCreateTemplateDraft,
		adminListVCenterTemplatesFolder,
		adminListImages,
		adminListVCenterISOs,
		getTemplates,
		ApiError,
		type CreateTemplateDraftRequest,
		type VCenterFolderVM
	} from '$lib/api/client';
	import type { Template, ImageUpload, VCenterDatastoreFile } from '$lib/types';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { handleWizardEnter } from '$lib/utils/wizardEnter';

	// Step 1 of the T4 template wizard.
	//
	// Collects metadata + source for a new template, POSTs to
	// /api/v1/admin/templates/draft, then redirects to the per-template
	// wizard page where the instructor walks through Provision →
	// Configure → Generalize → Publish.
	//
	// Instructor-accessible (lab-instructors group via RoleInstructor).

	let req = $state<CreateTemplateDraftRequest>({
		name: '',
		os_type: 'linux',
		source_type: 'clone_template',
		source_ref: '',
		staging_network: 'PG-VM-Lab',
		vcpus: 2,
		ram_mb: 4096,
		disk_gb: 40,
		description: '',
		icon_url: '',
		default_username: '',
		default_password: '',
		unattend_mode: 'manual',
		unattend_config: {}
	});

	let existingTemplates = $state<Template[]>([]);
	let vcenterVMs = $state<VCenterFolderVM[]>([]);
	let importedISOs = $state<ImageUpload[]>([]);
	let vcenterISOs = $state<VCenterDatastoreFile[]>([]);
	let loadingSources = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Unattend config fields (bound separately, merged into req.unattend_config on submit)
	let unattendHostname = $state('');
	let unattendUsername = $state('');
	let unattendPassword = $state('');
	let unattendLocale = $state('');
	let unattendTimeZone = $state('');
	let unattendAptProxy = $state('');
	let unattendExtraPkgs = $state(''); // comma-separated in the UI

	onMount(async () => {
		if (!authStore.isInstructor && !authStore.isAdmin) {
			toastStore.error('Forbidden', 'You need the instructor role.');
			await goto('/admin/templates');
			return;
		}
		try {
			const [tpls, folder, imgs, vcISOs] = await Promise.all([
				getTemplates(),
				adminListVCenterTemplatesFolder().catch(() => ({ vms: [] as VCenterFolderVM[] })),
				adminListImages().catch(() => [] as ImageUpload[]),
				adminListVCenterISOs().catch(() => ({ files: [] as VCenterDatastoreFile[], datastore: '', cached: false, cache_age_seconds: 0 }))
			]);
			existingTemplates = tpls;
			vcenterVMs = folder.vms ?? [];
			importedISOs = (imgs ?? []).filter((img) => img.kind === 'iso' && img.status === 'imported');
			vcenterISOs = vcISOs.files ?? [];
		} catch (err) {
			console.error('load source data', err);
			toastStore.error('Could not load source options', String(err));
		} finally {
			loadingSources = false;
		}
	});

	function valid(): boolean {
		if (!req.name.trim()) {
			error = 'Name is required';
			return false;
		}
		if (!req.source_ref) {
			error = 'Pick a source';
			return false;
		}
		if ((req.vcpus ?? 0) < 1 || (req.ram_mb ?? 0) < 512 || (req.disk_gb ?? 0) < 10) {
			error = 'Hardware values too small (min 1 vCPU / 512 MB RAM / 10 GB disk)';
			return false;
		}
		error = null;
		return true;
	}

	async function submit() {
		if (!valid()) return;
		submitting = true;
		try {
			// For ISO installs, merge the unattend_config fields before sending
			if (req.source_type === 'iso') {
				const cfg: Record<string, unknown> = {};
				if (unattendHostname) cfg.hostname = unattendHostname;
				if (unattendUsername) cfg.username = unattendUsername;
				if (unattendPassword) cfg.password = unattendPassword;
				if (unattendLocale) cfg.locale = unattendLocale;
				if (unattendTimeZone) cfg.time_zone = unattendTimeZone;
				if (unattendAptProxy) cfg.apt_proxy = unattendAptProxy;
				if (unattendExtraPkgs.trim()) {
					cfg.extra_pkgs = unattendExtraPkgs
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
				}
				req.unattend_config = Object.keys(cfg).length > 0 ? cfg : {};
			} else {
				// Clear ISO-only fields for non-ISO installs
				req.unattend_mode = undefined;
				req.unattend_config = undefined;
			}

			const tmpl = await adminCreateTemplateDraft(req);
			toastStore.success('Draft created', `${tmpl.name} is now in draft state.`);
			await goto(`/admin/templates/${tmpl.id}/wizard`);
		} catch (err) {
			if (err instanceof ApiError) {
				error = (err.body?.error as string) ?? err.message;
			} else {
				error = String(err);
			}
			toastStore.error('Could not create draft', error ?? 'unknown error');
		} finally {
			submitting = false;
		}
	}

	function cancel() {
		goto('/admin/templates');
	}
</script>

<svelte:head>
	<title>New Template — Crucible</title>
</svelte:head>

<svelte:window
	onkeydown={(e) =>
		handleWizardEnter(e, {
			canAdvance: () => true,
			isLastStep: () => true,
			advance: () => {},
			submit,
			busy: () => submitting
		})}
/>

<div class="container mx-auto max-w-3xl p-6 space-y-6">
	<header class="space-y-1">
		<a href="/admin/templates" class="text-sm text-surface-500 hover:underline">
			← Back to templates
		</a>
		<h1 class="h2">New template — draft</h1>
		<p class="text-surface-600 dark:text-surface-300">
			Step 1 of 5. After saving the draft you'll move through Provision →
			Configure → Generalize → Publish on the next page.
		</p>
	</header>

	{#if error}
		<aside class="card preset-tonal-error p-4">
			<p class="font-semibold">⚠️ {error}</p>
		</aside>
	{/if}

	<section class="card p-6 space-y-4">
		<h2 class="h4">Identity</h2>

		<label class="label">
			<span class="text-sm">Template name *</span>
			<input
				class="input"
				type="text"
				placeholder="Ubuntu 24.04 LTS — Lab Edition"
				bind:value={req.name}
				maxlength="128"
				required
			/>
		</label>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<label class="label">
				<span class="text-sm">OS family *</span>
				<select class="select" bind:value={req.os_type}>
					<option value="linux">Linux</option>
					<option value="windows">Windows</option>
				</select>
			</label>

			<label class="label">
				<span class="text-sm">Staging network</span>
				<input
					class="input"
					type="text"
					bind:value={req.staging_network}
					placeholder="PG-VM-Lab"
				/>
			</label>
		</div>

		<label class="label">
			<span class="text-sm">Description (markdown)</span>
			<textarea
				class="textarea"
				rows="3"
				placeholder="What does this template provide? Tools? Pre-installed packages?"
				bind:value={req.description}
			></textarea>
		</label>

		<label class="label">
			<span class="text-sm">Icon URL</span>
			<input class="input" type="url" bind:value={req.icon_url} placeholder="https://..." />
		</label>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h4">Source</h2>
		<p class="text-sm text-surface-500">
			What do you want the wizard to clone from?
		</p>

		<label class="label">
			<span class="text-sm">Source type *</span>
			<select class="select" bind:value={req.source_type}>
				<option value="clone_template">Clone an existing Crucible template</option>
				<option value="clone_vcenter">Clone an existing vCenter VM</option>
				<option value="iso">ISO install</option>
			</select>
		</label>

		{#if loadingSources}
			<p class="text-surface-500">Loading sources…</p>
		{:else if req.source_type === 'clone_template'}
			<label class="label">
				<span class="text-sm">Source template *</span>
				<select class="select" bind:value={req.source_ref}>
					<option value="">— pick a template —</option>
					{#each existingTemplates as t (t.id)}
						<option value={t.id}>{t.name} ({t.os_type})</option>
					{/each}
				</select>
			</label>
		{:else if req.source_type === 'clone_vcenter'}
			<label class="label">
				<span class="text-sm">Source vCenter VM (moref) *</span>
				<select class="select" bind:value={req.source_ref}>
					<option value="">— pick a VM —</option>
					{#each vcenterVMs as vm (vm.moref)}
						<option value={vm.moref}>
							{vm.name} — {vm.guest_full_name || vm.os_type}
						</option>
					{/each}
				</select>
			</label>
		{:else if req.source_type === 'iso'}
				<label class="label">
					<span class="text-sm">ISO source *</span>
					<select class="select" bind:value={req.source_ref}>
						<option value="">— pick an ISO —</option>
						{#if importedISOs.length > 0}
							<optgroup label="Uploaded & imported ISOs">
								{#each importedISOs as img (img.id)}
									<option value={img.datastore_path}>{img.filename}</option>
								{/each}
							</optgroup>
						{/if}
						{#if vcenterISOs.length > 0}
							<optgroup label="ISOs already on vCenter datastore">
								{#each vcenterISOs as iso (iso.path)}
									<option value={iso.path}>{iso.name}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
					<p class="text-xs text-surface-500 mt-1">
						Don't see your ISO?
						<a href="/admin/images" class="anchor">Upload it on the Images page</a>
						and wait for the import to complete.
					</p>
				</label>

				<div class="space-y-3 border border-surface-200 dark:border-surface-700 rounded p-4 mt-2">
					<h3 class="text-sm font-semibold">Unattended install</h3>

					<label class="label">
						<span class="text-sm">Install mode</span>
						<select class="select" bind:value={req.unattend_mode}>
							<option value="manual">Manual (use the VM console)</option>
							<option value="cloudinit_cidata">Cloud-init (CIDATA)</option>
							<option value="debian_preseed">Debian preseed</option>
							<option value="windows_autounattend">Windows Autounattend</option>
						</select>
					</label>

					{#if req.unattend_mode !== 'manual'}
						<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
							<label class="label">
								<span class="text-sm">Hostname</span>
								<input class="input" type="text" bind:value={unattendHostname} placeholder="crucible-vm" />
							</label>
							<label class="label">
								<span class="text-sm">Username</span>
								<input class="input" type="text" bind:value={unattendUsername} placeholder="student" />
							</label>
							<label class="label">
								<span class="text-sm">Password</span>
								<input class="input" type="password" bind:value={unattendPassword} autocomplete="new-password" />
							</label>
							<label class="label">
								<span class="text-sm">Locale</span>
								<input class="input" type="text" bind:value={unattendLocale} placeholder="en_US.UTF-8" />
							</label>
							<label class="label">
								<span class="text-sm">Time zone</span>
								<input class="input" type="text" bind:value={unattendTimeZone} placeholder="America/New_York" />
							</label>
							<label class="label">
								<span class="text-sm">APT proxy</span>
								<input class="input" type="text" bind:value={unattendAptProxy} placeholder="http://10.10.30.20:3142" />
							</label>
						</div>
						<label class="label">
							<span class="text-sm">Extra packages (comma-separated)</span>
							<input class="input" type="text" bind:value={unattendExtraPkgs} placeholder="curl, git, vim" />
						</label>
					{/if}
				</div>

				<aside class="card preset-tonal-surface p-3 text-sm text-surface-600 dark:text-surface-300">
					💡 An imported OVA appears automatically in the "Clone an existing vCenter VM" picker —
					no separate source type needed for OVAs.
				</aside>
		{/if}
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h4">Hardware</h2>
		<p class="text-sm text-surface-500">
			Initial sizing for the staging VM. Students can override CPU/RAM
			later (limited by the per-pod quota).
		</p>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<label class="label">
				<span class="text-sm">vCPUs *</span>
				<input class="input" type="number" min="1" max="16" bind:value={req.vcpus} />
			</label>
			<label class="label">
				<span class="text-sm">RAM (MB) *</span>
				<input
					class="input"
					type="number"
					min="512"
					max="65536"
					step="512"
					bind:value={req.ram_mb}
				/>
			</label>
			<label class="label">
				<span class="text-sm">Disk (GB) *</span>
				<input class="input" type="number" min="10" max="500" bind:value={req.disk_gb} />
			</label>
		</div>
	</section>

	<section class="card p-6 space-y-4">
		<h2 class="h4">Guest credentials</h2>
		<p class="text-sm text-surface-500">
			Used by the wizard to push the generalize script via VMware Tools.
			Students will see these on the pod-detail page after launch.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<label class="label">
				<span class="text-sm">Default username</span>
				<input class="input" type="text" bind:value={req.default_username} placeholder="ubuntu" />
			</label>
			<label class="label">
				<span class="text-sm">Default password</span>
				<input
					class="input"
					type="password"
					bind:value={req.default_password}
					placeholder="set during configure step"
					autocomplete="new-password"
				/>
			</label>
		</div>
	</section>

	<footer class="flex justify-end gap-3">
		<button type="button" class="btn preset-tonal-surface" onclick={cancel} disabled={submitting}>
			Cancel
		</button>
		<button type="button" class="btn preset-filled-primary" onclick={submit} disabled={submitting}>
			{submitting ? 'Creating…' : 'Create draft & continue'}
		</button>
	</footer>
</div>
