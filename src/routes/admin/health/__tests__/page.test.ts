import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HealthPage from '../+page.svelte';

const authState = vi.hoisted(() => ({
	isInstructor: false
}));

const adminGetHealth = vi.hoisted(() => vi.fn());

vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: authState
}));

vi.mock('$lib/api/client', () => ({
	adminGetHealth
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('admin health page', () => {
	beforeEach(() => {
		authState.isInstructor = false;
		adminGetHealth.mockReset();
	});

	it('shows the access banner and does not fetch when the viewer is not an instructor', () => {
		render(HealthPage);

		expect(screen.getByText('You do not have admin access.')).not.toBeNull();
		expect(adminGetHealth).not.toHaveBeenCalled();
	});

	it('shows loading skeletons and then surfaces fetch failures', async () => {
		authState.isInstructor = true;
		const health = deferred<unknown>();
		adminGetHealth.mockReturnValue(health.promise);

		render(HealthPage);

		await waitFor(() => expect(adminGetHealth).toHaveBeenCalledTimes(1));
		expect(screen.queryByText(/Failed to load health:/i)).toBeNull();

		health.reject(new Error('backend down'));

		await waitFor(() => {
			const banner = screen.getByText(/Failed to load health:/i);
			expect(banner.textContent).toContain('Failed to load health');
		});
	});
});
