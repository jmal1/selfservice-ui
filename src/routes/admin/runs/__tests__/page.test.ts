import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RunsPage from '../+page.svelte';

const runsMock = vi.hoisted(() => vi.fn());
const pageStore = vi.hoisted(() => ({ store: null as any }));

vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	pageStore.store = writable({
		url: new URL(
			'https://example.test/admin/runs?triggered_by=alice&pod_owner=bob&status=failed&from=2026-08-01T00:00&to=2026-08-31T23:59'
		)
	});
	return { page: pageStore.store };
});

vi.mock('$lib/api/client', () => ({
	adminListRuns: runsMock
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

describe('admin runs list page', () => {
	beforeEach(() => {
		runsMock.mockReset();
	});

	it('forwards filter query params to the runs API and shows the loading state', async () => {
		const pending = deferred<unknown[]>();
		runsMock.mockReturnValue(pending.promise);

		render(RunsPage);

		expect(document.querySelector('.animate-pulse')).not.toBeNull();
		await waitFor(() =>
			expect(runsMock).toHaveBeenCalledWith({
				triggered_by: 'alice',
				pod_owner: 'bob',
				status: 'failed',
				from: '2026-08-01T00:00',
				to: '2026-08-31T23:59'
			})
		);

		pending.resolve([]);

		await waitFor(() =>
			expect(screen.getByText('No runs match the selected filters.')).not.toBeNull()
		);
	});

	it('renders an error banner when the runs API fails', async () => {
		const pending = deferred<unknown[]>();
		runsMock.mockReturnValue(pending.promise);

		render(RunsPage);

		expect(document.querySelector('.animate-pulse')).not.toBeNull();
		pending.reject(new Error('api offline'));

		await waitFor(() => expect(screen.getByText(/Failed to load runs/i)).not.toBeNull());
	});
});
