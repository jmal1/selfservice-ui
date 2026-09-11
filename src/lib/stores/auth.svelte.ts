import type { User } from '$lib/types';

class AuthStore {
	user = $state<User | null>(null);
	token = $state<string | null>(null);

	get isAuthenticated(): boolean {
		return this.token !== null && this.user !== null;
	}

	get isAdmin(): boolean {
		return this.user?.role === 'admin';
	}

	get isInstructor(): boolean {
		// Instructor or higher. Admin satisfies instructor in the API's
		// level-based RequireRole, so mirror that here for UI gating.
		return this.user?.role === 'instructor' || this.user?.role === 'admin';
	}

	get role(): string | null {
		return this.user?.role ?? null;
	}

	login(user: User, token: string) {
		this.user = user;
		this.token = token;
	}

	// clearState nulls the in-memory user/token WITHOUT redirecting. The
	// caller owns navigation timing so it can await the backend /auth/logout
	// call (and any top-level SSO end-session navigation) before leaving the
	// page. Clearing state without a redirect avoids a race where a hard nav
	// kills the in-flight logout request.
	clearState() {
		this.user = null;
		this.token = null;
	}

	setToken(token: string) {
		this.token = token;
	}

	setUser(user: User) {
		this.user = user;
	}
}

export const authStore = new AuthStore();
