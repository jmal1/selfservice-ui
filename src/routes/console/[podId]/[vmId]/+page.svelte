<!--
  Pod-VM console page. Thin wrapper around <WMKSConsole>; the heavy
  lifting (WMKS load, WebSocket lifecycle, paste handling) lives in
  src/lib/components/WMKSConsole.svelte and is shared with the
  template build-VM console at /admin/templates/[templateID]/console.

  This page does not bind keydown. Physical keys reach the live nwmks
  widget the same way they did at 0a2d9c80 / eeb3b843: the SDK's
  keydown.wmks bind on #console-canvas. Append ?wmksDebug=1 to the
  console URL for the key-path HUD (off by default).

  This page is responsible for:
    1. Reading podId / vmId from the route.
    2. Fetching the VM display name so the window title is meaningful.
    3. If the VM is suspended, showing a resume interstitial instead of
       opening a dead WMKS stream. Resume-on-console-open: the user clicks
       Resume, we call the /start endpoint, poll until 'running', then
       show the console — no dead terminal, no silent hang.
    4. Computing the WebSocket URL for /api/v1/pods/{podID}/vms/{vmID}/console/ws.
    5. Building ConsoleHelperContext from the pod/VM payload and rendering
       the helper overlay (credentials always; network when skip_generalize
       or assign_ip=false).
    6. Rendering <WMKSConsole> with a back link to the pod detail page.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { friendlyError } from '$lib/errors/friendly';
	import { config } from '$lib/config';
	import { getPod, resumeVM } from '$lib/api/client';
	import { pollUntilRunning } from '$lib/api/poll-vm';
	import { onMount } from 'svelte';
	import WMKSConsole from '$lib/components/WMKSConsole.svelte';
	import ConsoleHelperPanel from '$lib/components/ConsoleHelperPanel.svelte';
	import {
		resolveConsoleHelpers,
		type ConsoleHelperContext,
		type ConsoleHelperSection
	} from '$lib/console/helpers';
	import type { Pod, PodVM, TemplateKind } from '$lib/types';

	const podId = $derived(page.params.podId as string);
	const vmId = $derived(page.params.vmId as string);
	let vmName = $state('');
	let isSuspended = $state(false);
	let suspendReason = $state<string | undefined>(undefined);
	let resumeLoading = $state(false);
	let resumeError = $state<string | null>(null);
	// Once resume completes and the VM is running we flip this to show WMKS.
	let readyForConsole = $state(false);
	let helperSections = $state<ConsoleHelperSection[]>([]);

	const wsUrl = $derived.by(() => {
		const base = config.apiBaseUrl || window.location.origin;
		const wsBase = base.replace(/^http/, 'ws');
		return `${wsBase}/api/v1/pods/${podId}/vms/${vmId}/console/ws`;
	});

	const title = $derived(vmName ? `Console: ${vmName}` : 'VM Console');

	function buildHelperContext(pod: Pod, vm: PodVM): ConsoleHelperContext {
		const username = vm.generated_username || vm.default_username || '';
		const password = vm.generated_password || vm.default_password || '';
		const templateKind: TemplateKind =
			vm.template_kind ?? vm.template?.kind ?? 'clone_with_customize';
		const assignIp =
			typeof vm.assign_ip === 'boolean'
				? vm.assign_ip
				: vm.template?.assign_ip !== false;
		const skipGeneralize =
			typeof vm.skip_generalize === 'boolean'
				? vm.skip_generalize
				: !!vm.template?.skip_generalize;
		return {
			username,
			password,
			credentialsPending: vm.status !== 'running' || (!username && !password),
			vlanId: pod.vlan_id,
			subnet: pod.subnet || '',
			ipAddress: vm.ip_address || '',
			assignIp,
			skipGeneralize,
			templateKind,
			osType: vm.os_type || vm.template?.os_type || ''
		};
	}

	function applyPodState(pod: Pod) {
		const vm = pod.vms?.find((v) => v.id === vmId);
		if (!vm) {
			helperSections = [];
			return null;
		}
		vmName = vm.display_name || vm.vcenter_vm_name;
		helperSections = resolveConsoleHelpers(buildHelperContext(pod, vm));
		return vm;
	}

	onMount(() => {
		getPod(podId).then((pod) => {
			const vm = applyPodState(pod);
			if (vm) {
				if (vm.status === 'suspended') {
					isSuspended = true;
					suspendReason = vm.suspend_reason ?? undefined;
				} else {
					readyForConsole = true;
				}
			} else {
				readyForConsole = true;
			}
		}).catch(() => {
			// If the fetch fails just proceed to the console and let WMKS surface the error.
			readyForConsole = true;
		});
	});

	async function handleResume() {
		if (resumeLoading) return; // guard against double-click
		resumeLoading = true;
		resumeError = null;
		try {
			await resumeVM(podId, vmId);
			await pollUntilRunning(podId, vmId);
			try {
				const pod = await getPod(podId);
				applyPodState(pod);
			} catch {
				// Helpers refresh is best-effort; console open does not depend on it.
			}
			isSuspended = false;
			readyForConsole = true;
		} catch (e) {
			resumeError = friendlyError(e, 'Resume failed. Please try again.');
		} finally {
			resumeLoading = false;
		}
	}
</script>

{#if isSuspended && !readyForConsole}
	<!-- Resume interstitial — shown when navigating to console for a suspended VM -->
	<div class="flex min-h-screen flex-col items-center justify-center bg-surface-950 p-6">
		<div class="w-full max-w-sm rounded-2xl border border-warning-500/30 bg-surface-900 p-8 shadow-xl">
			<div class="mb-4 flex items-center gap-3">
				<span class="text-3xl">⏸</span>
				<div>
					<h1 class="text-lg font-bold text-surface-100">VM is Suspended</h1>
					<p class="text-sm text-surface-400">{vmName || 'This VM'}</p>
				</div>
			</div>

			<p class="mb-3 text-sm text-surface-300">
				This VM was automatically suspended after 6 hours of inactivity to free cluster resources.
				Resume it to open the console.
			</p>

			{#if suspendReason}
				<p class="mb-4 rounded-lg bg-surface-800 px-3 py-2 text-[11px] italic text-surface-400">
					{suspendReason}
				</p>
			{/if}

			{#if resumeError}
				<div class="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-400">
					{resumeError}
				</div>
			{/if}

			{#if resumeLoading}
				<div class="flex items-center gap-3 rounded-lg bg-surface-800 px-4 py-3">
					<svg class="h-5 w-5 animate-spin text-warning-400" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
					</svg>
					<span class="text-sm text-surface-300">Resuming VM… this may take up to 60 seconds.</span>
				</div>
			{:else}
				<button
					class="w-full rounded-lg bg-warning-500/20 px-4 py-3 text-sm font-semibold text-warning-300 transition-colors hover:bg-warning-500/30"
					onclick={handleResume}
				>
					▶ Resume VM &amp; Open Console
				</button>
			{/if}

			{#if helperSections.length > 0}
				<div class="mt-4">
					<ConsoleHelperPanel sections={helperSections} variant="inline" />
				</div>
			{/if}

			<a
				href="/pods/{podId}"
				class="mt-4 block text-center text-xs text-surface-500 hover:text-surface-300"
			>
				← Back to Pod
			</a>
		</div>
	</div>
{:else if readyForConsole}
	<WMKSConsole {wsUrl} {title} backHref="/pods/{podId}" backLabel="← Back to Pod">
		{#snippet overlay()}
			<ConsoleHelperPanel sections={helperSections} />
		{/snippet}
	</WMKSConsole>
{/if}
