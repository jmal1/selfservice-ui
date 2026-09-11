import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { ProvisioningStore } from '$lib/stores/provisioning.svelte';
import ProvisioningBanner from './ProvisioningBanner.svelte';

describe('ProvisioningBanner', () => {
	it('stays hidden when provisioning is enabled', async () => {
		const store = new ProvisioningStore(async () => ({
			enabled: true,
			message: 'Provisioning is available.'
		}));
		await store.load();

		render(ProvisioningBanner, { props: { store } });

		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('announces maintenance, preserves the server message, and offers a refresh action', async () => {
		const fetchStatus = vi
			.fn()
			.mockResolvedValueOnce({
				enabled: false,
				message: 'Provisioning is temporarily unavailable for maintenance.'
			})
			.mockResolvedValueOnce({
				enabled: true,
				message: 'Provisioning is available.'
			});
		const store = new ProvisioningStore(fetchStatus);
		await store.load();

		render(ProvisioningBanner, { props: { store } });

		const alert = screen.getByRole('alert', { name: 'New deployments are paused' });
		expect(alert.textContent).toContain('Provisioning is temporarily unavailable for maintenance.');
		expect(alert.textContent).toContain('You can still view, control, and delete existing labs');

		await fireEvent.click(
			screen.getByRole('button', { name: 'Check provisioning availability again' })
		);

		expect(fetchStatus).toHaveBeenCalledTimes(2);
	});

	it('does not mount a loading banner while a known enabled state revalidates', async () => {
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
		render(ProvisioningBanner, { props: { store } });

		const refresh = store.load({ force: true });
		await tick();
		expect(store.refreshing).toBe(true);
		expect(screen.queryByText('Checking provisioning availability…')).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();

		resolveRefresh?.({
			enabled: false,
			message: 'Provisioning has just been paused.'
		});
		await refresh;

		const alert = await screen.findByRole('alert', { name: 'New deployments are paused' });
		expect(alert.textContent).toContain('Provisioning has just been paused.');
	});
});
