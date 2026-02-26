import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { authStore } from '$lib/stores/auth.svelte';
import { config } from '$lib/config';
import { mockApi } from '$lib/api/mock';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
	if (authStore.isAuthenticated) return {};

	// Mock mode: auto-login with fake user, skip SSO entirely
	if (config.mock) {
		const user = await mockApi.getMe();
		authStore.login(user, 'mock-token');
		return {};
	}

	const isLoginPage = url.pathname.startsWith('/login');

	try {
		const res = await fetch(`${config.apiBaseUrl}/auth/me`, {
			credentials: 'include'
		});

		if (res.ok) {
			const data = await res.json();
			const user = data.user ?? data;
			const token = data.token ?? '';
			authStore.login(user, token);
			return {};
		}
	} catch {
		// Network error — treat as unauthenticated
	}

	if (!isLoginPage) {
		throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}

	return {};
};
