<script lang="ts">
	import type { VMAccessInfo } from '$lib/types/vm-access';
	import { copyToClipboard } from '$lib/utils/clipboard';

	let { info }: { info: VMAccessInfo } = $props();

	let copiedField = $state<string | null>(null);
	let showPassword = $state(false);

	const osType = $derived((info.osType || '').toLowerCase());
	const isLinux = $derived(osType.includes('linux') || osType.includes('ubuntu') || osType.includes('centos') || osType.includes('debian'));
	const isWindows = $derived(osType.includes('windows'));

	const displayUsername = $derived(info.displayUsername);
	const displayPassword = $derived(info.displayPassword);
	const hasCredentials = $derived(!!displayUsername || !!displayPassword);
	const hasVCenter = $derived(!!info.vcenterVmId);
	const isPoweredOn = $derived(info.isPoweredOn);

	// Template kind drives the credential-source hint. When the template was
	// registered with kind=registered_existing_vm or clone_no_customize, the
	// student shouldn't be surprised that the password is shared across pods
	// (no per-pod customization is run). When assign_ip=false they also need
	// to know why no IP is being shown — the guest manages its own network.
	const templateKind = $derived(info.templateKind);
	const isStaticCreds = $derived(
		templateKind === 'registered_existing_vm' || templateKind === 'clone_no_customize'
	);
	const noIpExpected = $derived(info.noIpExpected);
	const consoleHref = $derived(info.consoleHref);

	async function handleCopy(text: string, field: string) {
		const ok = await copyToClipboard(text);
		if (ok) {
			copiedField = field;
			setTimeout(() => (copiedField = null), 2000);
		}
	}

	function openConsole() {
		if (!consoleHref) return;
		window.open(consoleHref, '_blank');
	}

	function downloadRdp() {
		if (!info.ipAddress) return;
		const content = `full address:s:${info.ipAddress}\r\nusername:s:\\${displayUsername || 'Student'}\r\ndesktopwidth:i:1920\r\ndesktopheight:i:1080\r\nprompt for credentials:i:1\r\nadministrative session:i:1\r\nsmart sizing:i:1`;
		const blob = new Blob([content], { type: 'application/x-rdp' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${info.vcenterVmName || 'vm'}.rdp`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<!-- The panel renders whenever we have networking info OR a vCenter VM
	 (so registered-existing-VM templates that manage their own networking
	 still get the console/credentials view even without an IP). -->
{#if info.ipAddress || hasVCenter}
	<div class="rounded-xl border border-surface-200 dark:border-surface-800/50 bg-surface-50 dark:bg-surface-950/50 p-4">
		{#if info.ipAddress}
			{#if isLinux}
				<!-- SSH: primary command -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">SSH</span>
					<code class="flex-1 rounded-lg bg-surface-200 dark:bg-surface-800 px-3 py-1.5 font-mono text-sm text-surface-900 dark:text-surface-100">
						ssh {displayUsername || 'user'}@{info.ipAddress}
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(`ssh ${displayUsername || 'user'}@${info.ipAddress}`, 'ssh')}
					>
						{copiedField === 'ssh' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
			{:else if isWindows}
				<!-- RDP: primary command -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">RDP</span>
					<code class="flex-1 rounded-lg bg-surface-200 dark:bg-surface-800 px-3 py-1.5 font-mono text-sm text-surface-900 dark:text-surface-100">
						mstsc /w:1920 /h:1080 /v:{info.ipAddress}
						<span class="text-surface-400 ml-2">(user: <strong class="text-surface-300">\{displayUsername || 'Student'}</strong>)</span>
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(`mstsc /w:1920 /h:1080 /v:${info.ipAddress}`, 'rdp')}
					>
						{copiedField === 'rdp' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
			{:else}
				<!-- Generic: just IP -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">IP</span>
					<code class="flex-1 rounded-lg bg-surface-200 dark:bg-surface-800 px-3 py-1.5 font-mono text-sm text-surface-900 dark:text-surface-100">
						{info.ipAddress}
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(info.ipAddress, 'ip')}
					>
						{copiedField === 'ip' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
			{/if}
		{/if}

		<!-- Credentials + extra actions row -->
		<div class="flex items-center gap-4">
			{#if hasCredentials}
				<div class="flex items-center gap-3 text-xs text-surface-400">
					{#if displayUsername}
						<span>User: <code class="rounded bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 font-mono text-surface-900 dark:text-surface-100">{displayUsername}</code></span>
					{/if}
					{#if displayPassword}
						<span>Pass:
							<code class="rounded bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 font-mono text-surface-900 dark:text-surface-100">{showPassword ? displayPassword : '••••••••'}</code>
							<button
								class="ml-0.5 text-surface-400 hover:text-surface-300"
								onclick={() => (showPassword = !showPassword)}
							>{showPassword ? 'Hide' : 'Show'}</button>
							<button
								class="ml-0.5 text-primary-500 hover:text-primary-400"
								onclick={() => handleCopy(displayPassword, 'password')}
							>{copiedField === 'password' ? '✓' : 'Copy'}</button>
						</span>
					{/if}
				</div>
			{:else if isStaticCreds}
				<!-- T3.4: registered-existing-VM / clone-no-customize templates may
				     have no defaults configured. Tell the student why instead of
				     leaving the credentials block silently empty. -->
				<div class="text-xs italic text-surface-400">
					Credentials are managed inside the VM (no per-pod customization is run for this template).
				</div>
			{/if}
			<div class="ml-auto flex gap-2">
				{#if hasVCenter && consoleHref}
					<button
						class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1 text-xs transition-colors {isPoweredOn ? 'text-primary-400 hover:bg-primary-500/10' : 'text-surface-500 cursor-not-allowed'}"
						onclick={openConsole}
						disabled={!isPoweredOn}
						title={isPoweredOn ? 'Open VM console in new tab' : 'VM must be powered on'}
					>
						🖥 Console
					</button>
				{/if}
				{#if isWindows && info.ipAddress}
					<button
						class="rounded-lg border border-surface-200 dark:border-surface-800 px-3 py-1 text-xs text-surface-400 transition-colors hover:text-surface-300"
						onclick={downloadRdp}
					>
						Download .rdp
					</button>
				{/if}
			</div>
		</div>

		{#if isStaticCreds && hasCredentials}
			<!-- T3.4: shared-credentials hint. These creds are baked into the
			     template image; every pod from this template sees the same
			     username/password. The instructor knew this when registering
			     the template, but the student does not. -->
			<div class="mt-2 text-[11px] italic text-surface-500">
				These credentials are shared across all pods from this template — change them after first login if you need per-user isolation.
			</div>
		{/if}

		{#if noIpExpected && !info.ipAddress}
			<!-- T3.4: assign_ip=false hint. The provisioner intentionally skipped
			     WaitForIP so the VM may not surface an IP via VMware Tools. -->
			<div class="mt-2 text-[11px] italic text-surface-500">
				This template manages its own network. Use the VM console to find or configure the IP address.
			</div>
		{/if}
	</div>
{/if}
