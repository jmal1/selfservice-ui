<script lang="ts">
	import { onMount } from 'svelte';
	import { friendlyError, safeErrorText } from '$lib/errors/friendly';
	import { getPods, getMyJobs } from '$lib/api/client';
	import { wsStore } from '$lib/stores/websocket.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { provisioningStore } from '$lib/stores/provisioning.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { isolatedLabsDeniedMessage, labsPageDenied, showDeploy } from '$lib/labs/access';
	import type { Pod, Job, WSPodStatusEvent, WSVMStatusEvent } from '$lib/types';
	import PodList from '$lib/components/PodList.svelte';

	let pods = $state<Pod[]>([]);
	let jobs = $state<Job[]>([]);
	let loadingPods = $state(true);
	let error = $state<string | null>(null);
	let prevJobStatuses = $state<Map<string, string>>(new Map());

	const warnedPods = new Set<string>();

	const jobTypeLabels: Record<string, string> = {
		pod_create: 'Pod created',
		pod_destroy: 'Pod destroyed',
		vm_add: 'VM added',
		vm_destroy: 'VM destroyed',
		vm_start: 'VM started',
		vm_stop: 'VM stopped',
		vm_restart: 'VM restarted',
		vm_reset: 'VM reset',
		vm_snapshot: 'Snapshot created',
		vm_revert: 'Snapshot restored',
		vm_snapshot_delete: 'Snapshot deleted',
	};

	const activeJobs = $derived(
		jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed')
	);

	function checkJobTransitions(newJobs: Job[]) {
		for (const job of newJobs) {
			const prev = prevJobStatuses.get(job.id);
			if (!prev) continue;
			if (prev === job.status) continue;

			const label = jobTypeLabels[job.type] ?? job.type.replace(/_/g, ' ');
			const vmName = (job.payload?.vm_name as string) || '';
			const detail = vmName ? `${vmName}` : undefined;

			if (job.status === 'completed' && prev !== 'completed') {
				toastStore.success(label, detail);
			} else if (job.status === 'failed' && prev !== 'failed') {
				const errorMsg = safeErrorText(job.result) ?? detail;
				toastStore.error(`${label} failed`, errorMsg);
			}
		}
		prevJobStatuses = new Map(newJobs.map(j => [j.id, j.status]));
	}

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
							vms: (p.vms ?? []).map((vm) =>
								vm.id === e.vm_id
									? { ...vm, status: e.status, ip_address: e.ip_address ?? vm.ip_address }
									: vm
							)
						}
					: p
			);
		});

		const interval = setInterval(() => {
			if (!document.hidden) loadData();
		}, 10000);

		return () => {
			clearInterval(interval);
			unsubPod();
			unsubVM();
		};
	});

	async function loadData() {
		try {
			pods = await getPods();

			for (const pod of pods) {
				if (!pod.expires_at || (pod.status !== 'active' && pod.status !== 'provisioning')) continue;
				const hoursLeft = (new Date(pod.expires_at).getTime() - Date.now()) / (1000 * 60 * 60);
				if (hoursLeft > 0 && hoursLeft < 24 && !warnedPods.has(pod.id)) {
					warnedPods.add(pod.id);
					const hours = Math.floor(hoursLeft);
					toastStore.warning(`"${pod.name}" expires in ${hours}h — extend it to keep your work`);
				}
			}
		} catch (e) {
			error = friendlyError(e, 'Failed to load pods');
		} finally {
			loadingPods = false;
		}
		try {
			const newJobs = await getMyJobs();
			checkJobTransitions(newJobs);
			jobs = newJobs;
		} catch {
			jobs = [];
		}
	}
</script>

<div class="mx-auto max-w-7xl space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-100">My Labs</h1>
			<p class="mt-1 text-sm text-surface-500">Your lab environments</p>
		</div>
		{#if showDeploy(authStore.user) && provisioningStore.canProvision}
			<a
				href="/deploy"
				class="inline-flex items-center gap-2 rounded-[10px] bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-600"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Deploy VM
			</a>
		{:else if showDeploy(authStore.user)}
			<span
				class="inline-flex cursor-not-allowed items-center gap-2 rounded-[10px] bg-surface-300 px-5 py-2.5 text-sm font-semibold text-surface-500 dark:bg-surface-800"
				role="link"
				aria-disabled="true"
				title={provisioningStore.message}
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Deploy VM
			</span>
		{/if}
	</div>

	{#if error}
		<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			{error}
		</div>
	{/if}

	{#if activeJobs.length > 0}
		<a
			href="/operations"
			class="block rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-sm text-primary-600 dark:text-primary-400"
		>
			{activeJobs.length} operation{activeJobs.length === 1 ? '' : 's'} in progress — view Current Operations
		</a>
	{/if}

	{#if labsPageDenied(authStore.user, pods, loadingPods)}
		<div class="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-100/50 px-4 py-3 text-sm text-surface-600 dark:text-surface-300">
			{isolatedLabsDeniedMessage}
		</div>
	{:else}
		<PodList {pods} loading={loadingPods} onrefresh={loadData} />
	{/if}
</div>
