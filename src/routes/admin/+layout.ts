import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { authStore } from '$lib/stores/auth.svelte';

// Phase 6: client-side gate for /admin/* routes.
//
// The API is the real security boundary — every admin endpoint is gated by
// RequireRole(admin) middleware, and the synthetic check
// `admin_route_protected_*` continuously verifies that. This layout load
// adds UX hygiene: a student-role user (typo'd a URL, bookmarked an old
// link) gets bounced to /pods instead of seeing an empty admin shell with
// a permission error banner.
//
// We default-allow if the role string is missing or unrecognized so a
// future role addition does not silently lock instructors out of pages
// they were able to use before. The API will still 403 them in that case.
//
// SSR is disabled on the root layout (+layout.ts), so this runs entirely
// in the browser and authStore.user is guaranteed to be hydrated by the
// time we get here (the root layout's load fetches /auth/me first).
export const load: LayoutLoad = async ({ parent, url }) => {
	await parent();

	const user = authStore.user;
	if (!user) {
		throw redirect(307, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}

	const role = user.role;
	const known = role === 'admin' || role === 'instructor' || role === 'student';
	if (known && role !== 'admin' && role !== 'instructor') {
		throw redirect(303, '/pods?notice=admin-required');
	}

	return {};
};
