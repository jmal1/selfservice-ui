<!--
  Pod-VM console page. Thin wrapper around <WMKSConsole>; the heavy
  lifting (WMKS load, WebSocket lifecycle, paste handling) lives in
  src/lib/components/WMKSConsole.svelte and is shared with the
  template build-VM console at /admin/templates/[templateID]/console.

  This page is responsible for:
    1. Reading podId / vmId from the route.
    2. Fetching the VM display name so the window title is meaningful.
    3. Computing the WebSocket URL for /api/v1/pods/{podID}/vms/{vmID}/console/ws.
    4. Rendering <WMKSConsole> with a back link to the pod detail page.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { config } from '$lib/config';
	import { getPod } from '$lib/api/client';
	import { onMount } from 'svelte';
	import WMKSConsole from '$lib/components/WMKSConsole.svelte';

	const podId = $derived(page.params.podId as string);
	const vmId = $derived(page.params.vmId as string);
	let vmName = $state('');

	const wsUrl = $derived.by(() => {
		const base = config.apiBaseUrl || window.location.origin;
		const wsBase = base.replace(/^http/, 'ws');
		return `${wsBase}/api/v1/pods/${podId}/vms/${vmId}/console/ws`;
	});

	const title = $derived(vmName ? `Console: ${vmName}` : 'VM Console');

	onMount(() => {
		getPod(podId).then((pod) => {
			const vm = pod.vms?.find((v) => v.id === vmId);
			if (vm) vmName = vm.display_name || vm.vcenter_vm_name;
		}).catch(() => {});
	});
</script>

<WMKSConsole {wsUrl} {title} backHref="/pods/{podId}" backLabel="← Back to Pod" />
