import { redirect } from '@sveltejs/kit';

export function requireAuth(isAuthenticated: boolean, url: URL) {
	if (!isAuthenticated) {
		throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}
}
