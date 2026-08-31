import { describe, expect, it, vi } from 'vitest';
import { load } from '../+layout';
import { authStore } from '$lib/stores/auth.svelte';

vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		user: null
	}
}));

describe('admin layout gate', () => {
	it('redirects unauthenticated users to login with the original path', async () => {
		authStore.user = null;

		await expect(
			load({
				parent: vi.fn(async () => ({})),
				url: new URL('https://example.test/admin/health')
			} as any)
		).rejects.toMatchObject({ status: 307, location: '/login?redirect=%2Fadmin%2Fhealth' });
	});

	it('redirects student users away from admin pages', async () => {
		authStore.user = { display_name: 'Student', role: 'student' } as any;

		await expect(
			load({
				parent: vi.fn(async () => ({})),
				url: new URL('https://example.test/admin/runs')
			} as any)
		).rejects.toMatchObject({ status: 303, location: '/pods?notice=admin-required' });
	});

	it('allows instructors and admins through', async () => {
		authStore.user = { display_name: 'Instructor', role: 'instructor' } as any;
		await expect(
			load({
				parent: vi.fn(async () => ({})),
				url: new URL('https://example.test/admin/playlists')
			} as any)
		).resolves.toEqual({});
	});
});
