import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Fixture from './__fixtures__/ThrowingBoundaryFixture.svelte';
import { getClientErrorCount, __resetClientErrorCount } from '$lib/errors/reportClientError';

// Regression test for the Blueprints outage class of bug: a render-time throw
// must be contained to the boundary's subtree (showing a fallback) instead of
// white-screening the whole app. Sabotage check: remove <svelte:boundary> from
// ErrorBoundary.svelte and the "contains a throw" case fails because render()
// itself throws.

describe('ErrorBoundary', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		__resetClientErrorCount();
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('renders children normally when they do not throw', () => {
		render(Fixture, { props: { shouldThrow: false } });
		expect(screen.queryByTestId('child-ok')).not.toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(getClientErrorCount()).toBe(0);
	});

	it('contains a render-time throw and shows the fallback instead of crashing', () => {
		render(Fixture, { props: { shouldThrow: true } });

		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('Something went wrong');

		// The crashed child must not be in the DOM.
		expect(screen.queryByTestId('child-ok')).toBeNull();

		// The error was routed through the central reporting sink with the
		// correct source and message.
		expect(getClientErrorCount()).toBe(1);
		expect(errorSpy).toHaveBeenCalledWith(
			'[crucible:client-error]',
			expect.objectContaining({ source: 'render-boundary', message: 'fixture boom' })
		);
	});
});
