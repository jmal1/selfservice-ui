<script lang="ts">
	import { goto } from '$app/navigation';
		import { onMount } from 'svelte';
		import {
			adminCreateTemplateDraft,
			adminListVCenterTemplatesFolder,
			adminListVCenterISOs,
			adminListGuestOSCatalog,
			getTemplates,
			ApiError,
			type CreateTemplateDraftRequest,
			type GuestOSOption,
			type VCenterFolderVM
		} from '$lib/api/client';
		import type { Template, MergedISOEntry } from '$lib/types';
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
		vcpus: 2,
		ram_mb: 4096,
		disk_gb: 40,
		description: '',
		icon_url: '',
		default_username: '',
		default_password: '',
		guest_id: '',
		unattend_mode: 'manual',
		unattend_config: {}
	});

	let existingTemplates = $state<Template[]>([]);
	let vcenterVMs = $state<VCenterFolderVM[]>([]);
	let mergedISOs = $state<MergedISOEntry[]>([]);
	// When the ISO fetch fails (auth/vCenter/timeout) we must NOT silently show
	// "No ISOs available yet" — that misleads the instructor into uploading an
	// ISO that already exists. Capture the failure so the ISO branch can show a
	// distinct "Couldn't load ISOs — <reason>" panel with a Retry button.
	let isoLoadError = $state<string | null>(null);
	let refreshingISOs = $state(false);
	let loadingSources = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	// Guest OS catalog powers the ISO "Guest OS" dropdown. The list comes from
	// the API (GET /admin/templates/guest-os-catalog) so it stays in one place;
	// if the call fails we fall back to a short built-in list of the OSes the
	// os-recipes guide covers, so the wizard is never unusable. The sentinel
	// OTHER value reveals a free-text box for typing an uncommon/future
	// "<name>Guest" id by hand.
	const OTHER = '__other__';
	const guestOSFallback: GuestOSOption[] = [
		{ label: 'Ubuntu / Linux Mint (64-bit)', guest_id: 'ubuntu64Guest', os_type: 'linux', group: 'Ubuntu family' },
		{ label: 'Debian 12 / Kali (64-bit)', guest_id: 'debian12_64Guest', os_type: 'linux', group: 'Debian family' },
		{ label: 'Debian 13 (64-bit)', guest_id: 'debian13_64Guest', os_type: 'linux', group: 'Debian family' },
		{ label: 'Other Linux (64-bit)', guest_id: 'otherLinux64Guest', os_type: 'linux', group: 'Other' },
		{ label: 'Windows 10 (64-bit)', guest_id: 'windows9_64Guest', os_type: 'windows', group: 'Windows client' },
		{ label: 'Windows 11 (64-bit)', guest_id: 'windows11_64Guest', os_type: 'windows', group: 'Windows client' },
		{ label: 'Windows Server 2016', guest_id: 'windows9Server64Guest', os_type: 'windows', group: 'Windows Server' },
		{ label: 'Windows Server 2019', guest_id: 'windows2019srv_64Guest', os_type: 'windows', group: 'Windows Server' },
		{ label: 'Windows Server 2022', guest_id: 'windows2019srvNext_64Guest', os_type: 'windows', group: 'Windows Server' },
		{ label: 'Windows Server 2025', guest_id: 'windows2022srvNext_64Guest', os_type: 'windows', group: 'Windows Server' }
	];
	let guestOSCatalog = $state<GuestOSOption[]>(guestOSFallback);
	// The dropdown selection: a guest_id from the catalog, '' (nothing picked),
	// or OTHER (type it by hand). guest_id in req is the source of truth sent to
	// the API; guestChoice just drives the UI.
	let guestChoice = $state('');

	// Group the catalog for <optgroup> rendering, preserving first-seen order.
	let guestOSGroups = $derived.by(() => {
		const groups: { name: string; options: GuestOSOption[] }[] = [];
		for (const o of guestOSCatalog) {
			const name = o.group || 'Other';
			let g = groups.find((x) => x.name === name);
			if (!g) {
				g = { name, options: [] };
				groups.push(g);
			}
			g.options.push(o);
		}
		return groups;
	});

	function onGuestChoice() {
		if (guestChoice === OTHER) {
			// Keep whatever the user has typed; don't clobber os_type.
			return;
		}
		req.guest_id = guestChoice;
		const opt = guestOSCatalog.find((o) => o.guest_id === guestChoice);
		if (opt) req.os_type = opt.os_type;
	}

	// Re-fetch the ISO list on demand (force a fresh vCenter scan, bypassing the
	// server cache) — used by the Retry button after a load error and the
	// "Refresh ISOs" button after an instructor uploads/imports a new ISO.
	async function reloadISOs() {
		refreshingISOs = true;
		isoLoadError = null;
		try {
			const r = await adminListVCenterISOs(true);
			mergedISOs = r.isos ?? [];
		} catch (e) {
			isoLoadError = e instanceof ApiError ? `${e.status} ${e.message}` : String(e);
		} finally {
			refreshingISOs = false;
		}
	}

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
			const [tpls, folder, vcISOs, catalog] = await Promise.all([
				getTemplates(),
				adminListVCenterTemplatesFolder().catch(() => ({ vms: [] as VCenterFolderVM[] })),
				adminListVCenterISOs().catch((e) => {
					isoLoadError = e instanceof ApiError ? `${e.status} ${e.message}` : String(e);
					return { isos: [] as MergedISOEntry[], datastore: '', cached: false, cache_age_seconds: 0 };
				}),
				adminListGuestOSCatalog().catch(() => ({ options: guestOSFallback }))
			]);
			existingTemplates = tpls;
			vcenterVMs = folder.vms ?? [];
			mergedISOs = vcISOs.isos ?? [];
			if (catalog.options && catalog.options.length > 0) {
				guestOSCatalog = catalog.options;
			}
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
		if (req.source_type === 'iso' && !(req.guest_id ?? '').trim()) {
			error = 'Pick a Guest OS (or choose "Other (advanced)" and type a guest OS ID) for an ISO build';
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
				req.guest_id = undefined;
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

	<aside class="card preset-tonal-primary p-4 space-y-1">
		<p class="font-semibold">📖 New to building templates? Read this first.</p>
		<p class="text-sm">
			The guide tells you <strong>exactly what to type in every field</strong>,
			including the standard build login
			<code>Student</code> / <code>Changeme123!</code>. Not sure where to start?
			Paste the AI prompt into an assistant and it'll walk you through it.
		</p>
		<p class="text-sm flex flex-wrap gap-x-4 gap-y-1">
			<a class="anchor" href="/wiki?file=docs/instructor/templates.md" target="_blank" rel="noopener">
				Step-by-step guide ↗
			</a>
			<a class="anchor" href="/wiki?file=docs/ai-prompts/create-a-template.md" target="_blank" rel="noopener">
				AI prompt: "Help me create a template" ↗
			</a>
		</p>
	</aside>

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
				<input class="input" type="text" value="PG-VM-Lab" readonly disabled />
				<span class="text-xs text-surface-500">
					Fixed. Every build VM is placed on the isolated <code>PG-VM-Lab</code>
					(VLAN 30) network so a half-built image can never touch your real
					network. This is a security control and can't be changed here.
				</span>
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
			<span class="text-xs text-surface-500 mt-1 block">
				Easiest is <strong>Clone an existing Crucible template</strong> — start
				from something that already works. Pick <strong>ISO install</strong> only
				if you're installing an OS from scratch.
			</span>
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
						{#if refreshingISOs}
							<p class="text-sm text-surface-500">Loading ISOs…</p>
						{:else if isoLoadError}
							<!-- Distinct error state: the fetch failed, so we do NOT
							     claim there are no ISOs. Show why + let them retry. -->
							<aside class="card preset-tonal-error p-3 text-sm space-y-2">
								<p class="font-semibold">⚠️ Couldn't load ISOs</p>
								<p>{isoLoadError}</p>
								<button type="button" class="btn btn-sm preset-filled-primary" onclick={reloadISOs}>
									Retry
								</button>
							</aside>
						{:else if mergedISOs.length === 0}
							<!-- Empty state: guide the instructor to upload an ISO first -->
							<aside class="card preset-tonal-warning p-3 text-sm space-y-2">
								<p class="font-semibold">⚠️ No ISOs available yet</p>
								<p>
									Upload an ISO on the
									<a href="/admin/images" class="anchor font-semibold">Images page</a>
									and wait for the import to finish. The import starts automatically after the upload completes.
								</p>
								<button type="button" class="btn btn-sm preset-tonal" onclick={reloadISOs}>
									Refresh ISOs
								</button>
							</aside>
						{:else}
							<select class="select" bind:value={req.source_ref}>
								<option value="">— pick an ISO —</option>
								{#each mergedISOs as iso (iso.image_id ?? iso.path ?? iso.name)}
									<option value={iso.path ?? ''} disabled={iso.disabled}>
										{#if iso.disabled}
											{iso.status === 'error'
												? `⚠ ${iso.name} — Import failed: ${iso.error_message ?? 'unknown error'}`
												: `⏳ ${iso.name} — Importing…`}
										{:else}
											{iso.source === 'uploaded' ? '↑ ' : ''}{iso.name}
										{/if}
									</option>
								{/each}
							</select>
							<div class="flex items-center gap-3 mt-1">
								<p class="text-xs text-surface-500">
									Entries labelled ⏳ are still importing and will become available shortly.
									<a href="/admin/images" class="anchor">Manage images →</a>
								</p>
								<button type="button" class="btn btn-sm preset-tonal ml-auto" onclick={reloadISOs}>
									Refresh ISOs
								</button>
							</div>
						{/if}
					</label>

				<label class="label">
					<span class="text-sm">Guest OS *</span>
					<select class="select" bind:value={guestChoice} onchange={onGuestChoice}>
						<option value="">— pick the OS you're installing —</option>
						{#each guestOSGroups as g (g.name)}
							<optgroup label={g.name}>
								{#each g.options as o (o.guest_id + '::' + o.label)}
									<option value={o.guest_id}>{o.label} ({o.guest_id})</option>
								{/each}
							</optgroup>
						{/each}
						<option value={OTHER}>Other (advanced) — type a guest OS ID…</option>
					</select>
					<span class="text-xs text-surface-500 mt-1 block">
						Tells VMware which OS you're installing. Pick the entry that matches
						your ISO. The recipe for your OS in the
						<a href="/wiki?file=docs/instructor/os-recipes.md" class="anchor">OS recipes guide</a>
						lists the exact code to confirm. Choosing an OS also sets the
						<strong>OS family</strong> above.
					</span>
					{#if guestChoice === OTHER}
						<input
							class="input mt-2"
							type="text"
							bind:value={req.guest_id}
							placeholder="e.g. fedora64Guest"
							autocomplete="off"
							spellcheck="false"
						/>
						<span class="text-xs text-surface-500 mt-1 block">
							Type any vSphere guest OS ID — it must look like
							<code>&lt;name&gt;Guest</code> (e.g. <code>fedora64Guest</code>,
							<code>rockylinux_64Guest</code>). Also set the correct
							<strong>OS family</strong> above yourself.
						</span>
					{/if}
				</label>

				<div class="space-y-3 border border-surface-200 dark:border-surface-700 rounded p-4 mt-2">
					<h3 class="text-sm font-semibold">Unattended install</h3>
					<p class="text-xs text-surface-500">
						Pick the mode that matches your ISO, then type the username and
						password. Anything you leave blank uses a sensible default.
						<strong>Ubuntu Server →</strong> <code>cloudinit_cidata</code>;
						<strong>Kali/Debian →</strong> <code>debian_preseed</code>;
						<strong>Windows →</strong> <code>windows_autounattend</code>.
						Not sure? Use <code>manual</code> and install it yourself in the console.
					</p>

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
								<span class="text-xs text-surface-500 mt-1 block">Optional. Leave blank for a generic name.</span>
							</label>
							<label class="label">
								<span class="text-sm">Username</span>
								<input class="input" type="text" bind:value={unattendUsername} placeholder="student" />
								<span class="text-xs text-surface-500 mt-1 block">
									Type <code>student</code> (Linux) or <code>Student</code> (Windows).
									Linux <strong>must</strong> be <code>student</code>.
								</span>
							</label>
							<label class="label">
								<span class="text-sm">Password</span>
								<input class="input" type="password" bind:value={unattendPassword} autocomplete="new-password" />
								<span class="text-xs text-surface-500 mt-1 block">
									Use the standard build password <code>Changeme123!</code>. Don't leave this blank.
								</span>
							</label>
							<label class="label">
								<span class="text-sm">Locale</span>
								<input class="input" type="text" bind:value={unattendLocale} placeholder="en_US.UTF-8" />
								<span class="text-xs text-surface-500 mt-1 block">Optional. Blank = en_US.UTF-8.</span>
							</label>
							<label class="label">
								<span class="text-sm">Time zone</span>
								<input class="input" type="text" bind:value={unattendTimeZone} placeholder="America/New_York" />
								<span class="text-xs text-surface-500 mt-1 block">Optional. Blank = America/New_York.</span>
							</label>
							<label class="label">
								<span class="text-sm">APT proxy</span>
								<input class="input" type="text" bind:value={unattendAptProxy} placeholder="http://10.10.30.20:3142" />
								<span class="text-xs text-surface-500 mt-1 block">
									Linux only, optional. Add <code>http://10.10.30.20:3142</code> for faster package downloads.
								</span>
							</label>
						</div>
						<label class="label">
							<span class="text-sm">Extra packages (comma-separated)</span>
							<input class="input" type="text" bind:value={unattendExtraPkgs} placeholder="curl, git, vim" />
							<span class="text-xs text-surface-500 mt-1 block">Optional. Tools to pre-install, e.g. <code>curl, git, vim</code>.</span>
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
			The login the wizard uses to clean the VM during Generalize. Students
			will see their own <strong>randomly-generated</strong> password on the
			pod page after launch — this is <strong>not</strong> that password.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<label class="label">
				<span class="text-sm">Default username</span>
				<input class="input" type="text" bind:value={req.default_username} placeholder="student" />
				<span class="text-xs text-surface-500 mt-1 block">
					Linux must be <code>student</code>; Windows use <code>Student</code>.
					Leave blank when cloning — it's copied from the source.
				</span>
			</label>
			<label class="label">
				<span class="text-sm">Default password</span>
				<input
					class="input"
					type="password"
					bind:value={req.default_password}
					placeholder="Changeme123!"
					autocomplete="new-password"
				/>
				<span class="text-xs text-surface-500 mt-1 block">
					Standard build password is <code>Changeme123!</code>. Leave blank when cloning.
				</span>
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
