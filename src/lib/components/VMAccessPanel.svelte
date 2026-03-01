<script lang="ts">
	import type { PodVM } from '$lib/types';
	import { copyToClipboard } from '$lib/utils/clipboard';

	let { vm }: { vm: PodVM } = $props();

	let copiedField = $state<string | null>(null);
	let showPassword = $state(false);

	const osType = $derived((vm.os_type || vm.template?.os_type || '').toLowerCase());
	const isLinux = $derived(osType.includes('linux') || osType.includes('ubuntu') || osType.includes('centos') || osType.includes('debian'));
	const isWindows = $derived(osType.includes('windows'));

	// Prefer generated (per-VM) credentials, fall back to template defaults
	const displayUsername = $derived(vm.generated_username || vm.default_username);
	const displayPassword = $derived(vm.generated_password || vm.default_password);
	const hasCredentials = $derived(!!displayUsername || !!displayPassword);
	const hasVCenter = $derived(!!vm.vcenter_vm_id);
	const isPoweredOn = $derived(vm.status === 'powered_on' || vm.status === 'running');

	async function handleCopy(text: string, field: string) {
		const ok = await copyToClipboard(text);
		if (ok) {
			copiedField = field;
			setTimeout(() => (copiedField = null), 2000);
		}
	}

	function openConsole() {
		window.open(`/console/${vm.pod_id}/${vm.id}`, '_blank');
	}

	function downloadRdp() {
		if (!vm.ip_address) return;
		const content = `full address:s:${vm.ip_address}\r\nprompt for credentials:i:1\r\nadministrative session:i:1`;
		const blob = new Blob([content], { type: 'application/x-rdp' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${vm.vcenter_vm_name}.rdp`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if vm.ip_address || hasVCenter}
	<div class="rounded-xl border border-surface-200-800/50 bg-surface-50-950/50 p-4">
		{#if vm.ip_address}
			{#if isLinux}
				<!-- SSH: primary command -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">SSH</span>
					<code class="flex-1 rounded-lg bg-surface-200-800 px-3 py-1.5 font-mono text-sm text-surface-900-100">
						ssh {displayUsername || 'user'}@{vm.ip_address}
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(`ssh ${displayUsername || 'user'}@${vm.ip_address}`, 'ssh')}
					>
						{copiedField === 'ssh' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
			{:else if isWindows}
				<!-- RDP: primary command -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">RDP</span>
					<code class="flex-1 rounded-lg bg-surface-200-800 px-3 py-1.5 font-mono text-sm text-surface-900-100">
						mstsc /v:{vm.ip_address}
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(`mstsc /v:${vm.ip_address}`, 'rdp')}
					>
						{copiedField === 'rdp' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
			{:else}
				<!-- Generic: just IP -->
				<div class="mb-3 flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-surface-400">IP</span>
					<code class="flex-1 rounded-lg bg-surface-200-800 px-3 py-1.5 font-mono text-sm text-surface-900-100">
						{vm.ip_address}
					</code>
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={() => handleCopy(vm.ip_address, 'ip')}
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
						<span>User: <code class="rounded bg-surface-200-800 px-1.5 py-0.5 font-mono text-surface-900-100">{displayUsername}</code></span>
					{/if}
					{#if displayPassword}
						<span>Pass:
							<code class="rounded bg-surface-200-800 px-1.5 py-0.5 font-mono text-surface-900-100">{showPassword ? displayPassword : '••••••••'}</code>
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
			{/if}
			<div class="ml-auto flex gap-2">
				{#if hasVCenter}
					<button
						class="rounded-lg border border-surface-200-800 px-3 py-1 text-xs transition-colors {isPoweredOn ? 'text-primary-400 hover:bg-primary-500/10' : 'text-surface-500 cursor-not-allowed'}"
						onclick={openConsole}
						disabled={!isPoweredOn}
						title={isPoweredOn ? 'Open VM console in new tab' : 'VM must be powered on'}
					>
						🖥 Console
					</button>
				{/if}
				{#if isWindows && vm.ip_address}
					<button
						class="rounded-lg border border-surface-200-800 px-3 py-1 text-xs text-surface-400 transition-colors hover:text-surface-300"
						onclick={downloadRdp}
					>
						Download .rdp
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
