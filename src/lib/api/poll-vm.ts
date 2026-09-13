import { getPod } from '$lib/api/client';

/** Poll pod until the given VM reaches `running`, or throw on error/timeout. */
export async function pollUntilRunning(
	podId: string,
	vmId: string,
	maxAttempts = 24,
	intervalMs = 2500
): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise<void>((r) => setTimeout(r, intervalMs));
		try {
			const pod = await getPod(podId);
			const vm = pod.vms?.find((v) => v.id === vmId);
			if (vm?.status === 'running') return;
			if (vm?.status === 'error') throw new Error('VM entered error state while resuming');
		} catch (e) {
			if (e instanceof Error && e.message.includes('error state')) throw e;
		}
	}
	throw new Error('VM did not return to running within 60 s. Please check the pod status page.');
}

/** Poll until the VM row is gone or status is `deleted`. */
export async function pollUntilDeleted(
	podId: string,
	vmId: string,
	maxAttempts = 24,
	intervalMs = 2500
): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		await new Promise<void>((r) => setTimeout(r, intervalMs));
		try {
			const pod = await getPod(podId);
			const vm = pod.vms?.find((v) => v.id === vmId);
			if (!vm || vm.status === 'deleted') return;
			if (vm.status === 'error') throw new Error('VM entered error state while deleting');
		} catch (e) {
			if (e instanceof Error && e.message.includes('error state')) throw e;
		}
	}
	throw new Error('VM was not deleted within 60 s. Please check the pod status page.');
}
