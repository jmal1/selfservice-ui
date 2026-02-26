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

	get role(): string | null {
		return this.user?.role ?? null;
	}

	login(user: User, token: string) {
		this.user = user;
		this.token = token;
	}

	logout() {
		this.user = null;
		this.token = null;
		if (typeof window !== 'undefined') {
			window.location.href = '/login';
		}
	}

	setToken(token: string) {
		this.token = token;
	}

	setUser(user: User) {
		this.user = user;
	}
}

export const authStore = new AuthStore();
