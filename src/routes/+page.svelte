<script lang="ts">
	import { onMount } from 'svelte';
	import { getPods, getResourceUsage } from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import type { Pod, ResourceUsage, Job, WSPodStatusEvent, WSVMStatusEvent } from '$lib/types';
	import ResourceGauges from '$lib/components/ResourceGauges.svelte';
	import PodList from '$lib/components/PodList.svelte';
	import JobPanel from '$lib/components/JobPanel.svelte';

	let pods = $state<Pod[]>([]);
	let usage = $state<ResourceUsage | null>(null);
	let jobs = $state<Job[]>([]);
	let loadingPods = $state(true);
	let error = $state<string | null>(null);

	onMount(() => {
		loadData();

		wsStore.connect();

		const unsubPod = wsStore.on('pod.status', (event) => {
			const e = event as WSPodStatusEvent;
			pods = pods.map((p) =>
				p.id === e.pod_id ? { ...p, status: e.status, error_message: e.error_message ?? p.error_message } : p
			);
		});

		const unsubVM = wsStore.on('vm.status', (event) => {
			const e = event as WSVMStatusEvent;
			pods = pods.map((p) =>
				p.id === e.pod_id
					? {
							...p,
							vms: p.vms.map((vm) =>
								vm.id === e.vm_id
									? { ...vm, status: e.status, ip_address: e.ip_address ?? vm.ip_address }
									: vm
							)
						}
					: p
			);
		});

		return () => {
			unsubPod();
			unsubVM();
		};
	});

	async function loadData() {
		try {
			const [podsResult, usageResult] = await Promise.all([getPods(), getResourceUsage()]);
			pods = podsResult;
			usage = usageResult;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load dashboard data';
		} finally {
			loadingPods = false;
		}
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-surface-900-100">Dashboard</h1>
			<p class="mt-1 text-sm text-surface-500">Overview of your lab resources</p>
		</div>
		<a
			href="/deploy"
			class="glow-primary inline-flex items-center gap-2 rounded-[10px] bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Deploy VM
		</a>
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	<!-- Resource Gauges -->
	<ResourceGauges {usage} />

	<!-- Job Panel -->
	<JobPanel {jobs} />

	<!-- Pod List -->
	<div>
		<h2 class="mb-3 text-lg font-semibold text-surface-900-100">My Environments</h2>
		<PodList {pods} loading={loadingPods} />
	</div>
</div>
