<script lang="ts">
	import type { PodVM } from '$lib/types';
	import { copyToClipboard } from '$lib/utils/clipboard';

	let { vm }: { vm: PodVM } = $props();

	let copiedField = $state<string | null>(null);

	const osType = $derived((vm.template?.os_type ?? '').toLowerCase());
	const isLinux = $derived(osType.includes('linux') || osType.includes('ubuntu') || osType.includes('centos') || osType.includes('debian'));
	const isWindows = $derived(osType.includes('windows'));

	async function handleCopy(text: string, field: string) {
		const ok = await copyToClipboard(text);
		if (ok) {
			copiedField = field;
			setTimeout(() => (copiedField = null), 2000);
		}
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

{#if vm.ip_address}
	<div class="rounded-xl border border-surface-200-800/50 bg-surface-50-950/50 p-4">
		<h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Access</h4>

		<!-- IP Address -->
		<div class="mb-3 flex items-center gap-2">
			<span class="text-xs text-surface-500">IP:</span>
			<code class="rounded bg-surface-200-800 px-2 py-0.5 font-mono text-sm text-surface-900-100">{vm.ip_address}</code>
			<button
				class="text-xs text-primary-500 hover:text-primary-400"
				onclick={() => handleCopy(vm.ip_address, 'ip')}
			>
				{copiedField === 'ip' ? '✓ Copied' : 'Copy'}
			</button>
		</div>

		{#if isLinux}
			<!-- SSH -->
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<code class="flex-1 rounded bg-surface-200-800 px-2 py-1 font-mono text-xs text-surface-900-100">
						ssh user@{vm.ip_address}
					</code>
					<button
						class="text-xs text-primary-500 hover:text-primary-400"
						onclick={() => handleCopy(`ssh user@${vm.ip_address}`, 'ssh')}
					>
						{copiedField === 'ssh' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
				<div class="flex gap-2">
					<button
						class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 opacity-50"
						disabled
						title="Coming soon"
					>
						Console
					</button>
					<button
						class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 opacity-50"
						disabled
						title="Coming soon"
					>
						Web Shell
					</button>
				</div>
			</div>
		{:else if isWindows}
			<!-- RDP -->
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<code class="flex-1 rounded bg-surface-200-800 px-2 py-1 font-mono text-xs text-surface-900-100">
						mstsc /v:{vm.ip_address}
					</code>
					<button
						class="text-xs text-primary-500 hover:text-primary-400"
						onclick={() => handleCopy(`mstsc /v:${vm.ip_address}`, 'rdp')}
					>
						{copiedField === 'rdp' ? '✓ Copied' : 'Copy'}
					</button>
				</div>
				<div class="flex gap-2">
					<button
						class="rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-500 transition-colors hover:bg-primary-500/20"
						onclick={downloadRdp}
					>
						Download .rdp
					</button>
					<button
						class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 opacity-50"
						disabled
						title="Coming soon"
					>
						Console
					</button>
				</div>
			</div>
		{:else}
			<!-- Generic -->
			<div class="flex gap-2">
				<button
					class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-xs text-surface-500 opacity-50"
					disabled
					title="Coming soon"
				>
					Console
				</button>
			</div>
		{/if}
	</div>
{/if}
