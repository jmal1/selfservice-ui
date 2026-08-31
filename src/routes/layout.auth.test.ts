import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
	state: { isAuthenticated: false },
	login: vi.fn()
}));

vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		get isAuthenticated() {
			return auth.state.isAuthenticated;
		},
		login: auth.login
	}
}));
vi.mock('$lib/config', () => ({
	config: { apiBaseUrl: 'https://api.example.test', mock: false }
}));
vi.mock('$lib/api/mock', () => ({
	mockApi: { getMe: vi.fn() }
}));

import { load } from './+layout';

describe('root layout authentication boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		auth.state.isAuthenticated = false;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
	});

	it('allows only the exact /ai route without a session', async () => {
		await expect(load({ url: new URL('https://ui.example.test/ai') } as never)).resolves.toEqual(
			{}
		);
		expect(fetch).toHaveBeenCalledWith('https://api.example.test/auth/me', {
			credentials: 'include'
		});
	});

	it.each(['/air', '/ai/tools', '/deploy', '/templates', '/wiki'])(
		'redirects unauthenticated access to %s',
		async (path) => {
			await expect(
				load({ url: new URL(`https://ui.example.test${path}`) } as never)
			).rejects.toMatchObject({
				status: 302,
				location: `/login?redirect=${encodeURIComponent(path)}`
			});
		}
	);

	it('restores an authenticated session from the API response', async () => {
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => ({ user: { display_name: 'Student', role: 'student' } })
		} as Response);

		await expect(
			load({ url: new URL('https://ui.example.test/templates') } as never)
		).resolves.toEqual({});
		expect(auth.login).toHaveBeenCalledWith(
			{ display_name: 'Student', role: 'student' },
			'session'
		);
	});
});
