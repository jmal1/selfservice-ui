// Regression coverage for the provisioning banner reappearing on browser
// refocus. The existing src/routes/layout.test.ts mocks `authStore` as a
// static plain object, so its `isAuthenticated` value never changes and the
// `$effect` in +layout.svelte that drives provisioningStore.load()/reset()
// never runs against real reactivity — it cannot catch a real regression in
// that effect. This file uses the REAL AuthStore/ProvisioningStore classes
// (only the network call is mocked) so the reactive behavior under test is
// the same code path that runs in production.
import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LayoutFixture from './__fixtures__/LayoutFixture.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/') },
	updated: { current: false }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/stores/theme.svelte', () => ({
	themeStore: {
		isDark: true,
		toggle: vi.fn()
	}
}));

const fetchStatus = vi.hoisted(() =>
	vi.fn(async () => ({ enabled: true, message: 'Provisioning is available.' }))
);
vi.mock('$lib/api/client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/client')>();
	return { ...actual, getProvisioningStatus: fetchStatus };
});

const LOADING_TEXT = /Checking provisioning/i;

describe('root layout provisioning banner (real stores)', () => {
	beforeEach(() => {
		fetchStatus.mockClear();
		fetchStatus.mockResolvedValue({ enabled: true, message: 'Provisioning is available.' });
	});

	it('shows the initial unknown/loading state, then clears once the first check resolves enabled', async () => {
		const { authStore } = await import('$lib/stores/auth.svelte');
		const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
		provisioningStore.reset();
		authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

		render(LayoutFixture);

		// Initial unknown state is expected and acceptable per spec.
		expect(screen.queryByText(LOADING_TEXT)).not.toBeNull();

		await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.queryByText(LOADING_TEXT)).toBeNull());
	});

	it('does NOT reshow the loading banner (no flash/layout shift) when the browser tab regains focus shortly after an enabled response', async () => {
		const { authStore } = await import('$lib/stores/auth.svelte');
		const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
		provisioningStore.reset();
		authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

		render(LayoutFixture);
		await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.queryByText(LOADING_TEXT)).toBeNull());

		fetchStatus.mockClear();
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(fetchStatus).not.toHaveBeenCalled();
		expect(screen.queryByText(LOADING_TEXT)).toBeNull();
	});

	it('does NOT reshow the loading banner even when refocus happens after the TTL has expired and a real background refresh runs', async () => {
		vi.useFakeTimers();
		try {
			const { authStore } = await import('$lib/stores/auth.svelte');
			const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
			provisioningStore.reset();
			authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

			render(LayoutFixture);
			await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
			await Promise.resolve();
			await Promise.resolve();
			expect(screen.queryByText(LOADING_TEXT)).toBeNull();

			fetchStatus.mockClear();
			await vi.advanceTimersByTimeAsync(61_000);

			window.dispatchEvent(new Event('focus'));
			document.dispatchEvent(new Event('visibilitychange'));
			await vi.advanceTimersByTimeAsync(50);

			// A real background refresh fires (stale-while-revalidate)...
			expect(fetchStatus).toHaveBeenCalledTimes(1);
			// ...but the previously-enabled banner never flashes back to loading.
			expect(screen.queryByText(LOADING_TEXT)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not re-trigger a provisioning fetch when auth state is reassigned to an equal-but-new object (auth churn), even after the TTL has expired', async () => {
		// Expire the TTL first so that, if the edge-trigger guard were
		// absent, a re-run of the $effect from this same-value auth churn
		// would actually call provisioningStore.load() past its TTL guard
		// and issue an observable extra fetch. This makes the assertion
		// below load-bearing for the edge-trigger fix (with the guard
		// removed, this test fails).
		vi.useFakeTimers();
		try {
			const { authStore } = await import('$lib/stores/auth.svelte');
			const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
			provisioningStore.reset();
			authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

			render(LayoutFixture);
			await vi.waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(1));
			await Promise.resolve();
			await Promise.resolve();
			expect(screen.queryByText(LOADING_TEXT)).toBeNull();

			await vi.advanceTimersByTimeAsync(61_000);
			fetchStatus.mockClear();

			// Simulate a background session re-validation that re-sets the
			// SAME logical, still-authenticated user (new object reference).
			authStore.setUser({ display_name: 'Student', role: 'student' } as any);
			await vi.advanceTimersByTimeAsync(50);

			expect(fetchStatus).not.toHaveBeenCalled();
			expect(screen.queryByText(LOADING_TEXT)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('still shows the genuine disabled/unavailable state when the API reports provisioning is paused', async () => {
		fetchStatus.mockResolvedValue({ enabled: false, message: 'Maintenance in progress.' });
		const { authStore } = await import('$lib/stores/auth.svelte');
		const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
		provisioningStore.reset();
		authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

		render(LayoutFixture);
		await waitFor(() => expect(screen.queryByText(/New deployments are paused/i)).not.toBeNull());
		expect(screen.queryByText('Maintenance in progress.')).not.toBeNull();
	});

	it('resets on genuine logout (fail closed) and hides the banner along with the rest of the authenticated sidebar', async () => {
		const { authStore } = await import('$lib/stores/auth.svelte');
		const { provisioningStore } = await import('$lib/stores/provisioning.svelte');
		provisioningStore.reset();
		authStore.login({ display_name: 'Student', role: 'student' } as any, 'session');

		render(LayoutFixture);
		await waitFor(() => expect(screen.queryByText(LOADING_TEXT)).toBeNull());

		authStore.clearState();
		await waitFor(() => expect(provisioningStore.availability).toBe('loading'));
		// The banner's mount point (the authenticated sidebar layout) is
		// gone entirely once logged out, so nothing flashes on screen.
		expect(screen.queryByText(LOADING_TEXT)).toBeNull();
		expect(provisioningStore.canProvision).toBe(false);
	});
});
