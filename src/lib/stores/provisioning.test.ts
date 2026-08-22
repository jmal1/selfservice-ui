import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api/client';
import {
	PROVISIONING_MAINTENANCE_FALLBACK,
	PROVISIONING_STATUS_UNAVAILABLE,
	ProvisioningStore,
	ProvisioningUnavailableError
} from './provisioning.svelte';

describe('ProvisioningStore', () => {
	it('enables provisioning only after a valid enabled response', async () => {
		const store = new ProvisioningStore(async () => ({
			enabled: true,
			message: 'Provisioning is available.'
		}));

		expect(store.canProvision).toBe(false);
		await store.load();

		expect(store.availability).toBe('enabled');
		expect(store.canProvision).toBe(true);
	});

	it('uses the server maintenance message when provisioning is disabled', async () => {
		const store = new ProvisioningStore(async () => ({
			enabled: false,
			message: 'Provisioning is temporarily unavailable for maintenance.'
		}));

		await store.load();

		expect(store.availability).toBe('disabled');
		expect(store.canProvision).toBe(false);
		expect(store.message).toBe('Provisioning is temporarily unavailable for maintenance.');
	});

	it('fails safe and deduplicates requests when status is unavailable', async () => {
		let rejectRequest: ((reason?: unknown) => void) | undefined;
		const fetchStatus = vi.fn(
			() =>
				new Promise<never>((_resolve, reject) => {
					rejectRequest = reject;
				})
		);
		const store = new ProvisioningStore(fetchStatus);

		const first = store.load();
		const second = store.load();
		expect(fetchStatus).toHaveBeenCalledTimes(1);
		rejectRequest?.(new TypeError('network unavailable'));
		await Promise.all([first, second]);

		expect(store.availability).toBe('unavailable');
		expect(store.canProvision).toBe(false);
		expect(store.message).toBe(PROVISIONING_STATUS_UNAVAILABLE);
		await store.load();
		expect(fetchStatus).toHaveBeenCalledTimes(1);
	});

	it.each(['create pod', 'deploy blueprint', 'add VM'])(
		'blocks the %s mutation when availability is not confirmed',
		async () => {
			const mutation = vi.fn(async () => 'queued');
			const store = new ProvisioningStore(async () => {
				throw new TypeError('network unavailable');
			});
			await store.load();

			await expect(store.runMutation(mutation)).rejects.toEqual(
				new ProvisioningUnavailableError(PROVISIONING_STATUS_UNAVAILABLE)
			);
			expect(mutation).not.toHaveBeenCalled();
		}
	);

	it.each(['create pod', 'deploy blueprint', 'add VM'])(
		'keeps the %s surface disabled when a stale status refresh resolves after a 503',
		async () => {
			let resolveRefresh: ((status: { enabled: boolean; message: string }) => void) | undefined;
			const fetchStatus = vi
				.fn()
				.mockResolvedValueOnce({
					enabled: true,
					message: 'Provisioning is available.'
				})
				.mockImplementationOnce(
					() =>
						new Promise<{ enabled: boolean; message: string }>((resolve) => {
							resolveRefresh = resolve;
						})
				);
			const store = new ProvisioningStore(fetchStatus);
			await store.load();
			const refresh = store.load({ force: true });
			const error = new ApiError(503, 'Service Unavailable', {
				error: 'Provisioning is temporarily unavailable for maintenance.',
				request_id: 'request-123'
			});

			await expect(store.runMutation(async () => Promise.reject(error))).rejects.toBe(error);

			expect(store.availability).toBe('disabled');
			expect(store.canProvision).toBe(false);
			expect(store.message).toBe(PROVISIONING_MAINTENANCE_FALLBACK);

			resolveRefresh?.({
				enabled: true,
				message: 'Provisioning is available.'
			});
			await refresh;

			expect(store.availability).toBe('disabled');
			expect(store.canProvision).toBe(false);
		}
	);
});
