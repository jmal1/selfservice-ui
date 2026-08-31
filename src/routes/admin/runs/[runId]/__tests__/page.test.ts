import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RunDetailPage from '../+page.svelte';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('$app/state', () => ({
	page: {
		params: {
			runId: 'run-123'
		}
	},
	updated: { current: false }
}));

vi.mock('$lib/api/client', () => ({
	adminGetRun: runMock
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

describe('admin run detail page', () => {
	beforeEach(() => {
		runMock.mockReset();
	});

	it('shows the loading state and renders fetch failures', async () => {
		const pending = deferred<unknown>();
		runMock.mockReturnValue(pending.promise);

		render(RunDetailPage);

		expect(screen.getByText('Run Details')).not.toBeNull();
		expect(document.querySelector('.animate-pulse')).not.toBeNull();
		expect(runMock).toHaveBeenCalledWith('run-123');

		pending.reject(new Error('run unavailable'));

		await waitFor(() => expect(screen.getByText(/run unavailable/i)).not.toBeNull());
	});
});
