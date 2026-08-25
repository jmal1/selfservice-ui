import { render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LayoutFixture from './__fixtures__/LayoutFixture.svelte';

const load = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/') },
	updated: { current: false }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		isAuthenticated: true,
		isAdmin: false,
		isInstructor: false,
		user: { display_name: 'Student', role: 'student' },
		clearState: vi.fn()
	}
}));

vi.mock('$lib/stores/theme.svelte', () => ({
	themeStore: {
		isDark: true,
		toggle: vi.fn()
	}
}));

vi.mock('$lib/stores/provisioning.svelte', () => ({
	provisioningStore: {
		availability: 'enabled',
		canProvision: true,
		message: 'Provisioning is available.',
		load,
		reset: vi.fn()
	}
}));

describe('root layout provisioning refresh', () => {
	beforeEach(() => {
		load.mockClear();
	});

	it('coalesces focus and visibility events and leaves TTL enforcement to the store', async () => {
		render(LayoutFixture);
		await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
		load.mockClear();

		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));

		await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
		expect(load).toHaveBeenCalledWith();
	});
});
