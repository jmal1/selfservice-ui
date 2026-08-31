import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConsolePage from '../+page.svelte';

const ticketMock = vi.hoisted(() => vi.fn());

vi.mock('$app/state', () => ({
	page: {
		params: {
			templateID: 'template-123'
		}
	},
	updated: { current: false }
}));

vi.mock('$lib/api/client', () => ({
	getTemplateConsoleTicket: ticketMock
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

describe('admin template console page', () => {
	beforeEach(() => {
		ticketMock.mockReset();
	});

	it('shows loading and renders the wizard back link when ticket fetch fails', async () => {
		const pending = deferred<never>();
		ticketMock.mockReturnValue(pending.promise);

		render(ConsolePage);

		expect(screen.getByText('Loading console…')).not.toBeNull();

		pending.reject(new Error('ticket unavailable'));

		await waitFor(() => expect(screen.getByText('Cannot open console')).not.toBeNull());
		const link = screen.getByRole('link', { name: '← Back to wizard' });
		expect(link.getAttribute('href')).toBe('/admin/templates/template-123/wizard');
		expect(screen.getByText('ticket unavailable')).not.toBeNull();
	});
});
