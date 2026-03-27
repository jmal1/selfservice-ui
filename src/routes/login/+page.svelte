<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authStore } from '$lib/stores/auth.svelte';
	import { config } from '$lib/config';

	onMount(() => {
		if (authStore.isAuthenticated) {
			const redirectTo = page.url.searchParams.get('redirect') || '/';
			goto(redirectTo);
		}
	});

	function handleLogin() {
		const redirectParam = page.url.searchParams.get('redirect') || '/';
		window.location.href = `${config.apiBaseUrl}/auth/login?redirect=${encodeURIComponent(redirectParam)}`;
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-surface-50 dark:bg-surface-950">
	<!-- Background gradients — fire + blue -->
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
		<div class="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary-500/10 blur-3xl"></div>
		<div class="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-secondary-500/10 blur-3xl"></div>
	</div>

	<div class="w-full max-w-sm">
		<div class="rounded-2xl border border-surface-200 dark:border-surface-800/50 bg-surface-100/80 dark:bg-surface-900/80 p-8 shadow-xl backdrop-blur-xl">
			<!-- Logo — Crucible flame (design 2) -->
			<div class="mb-6 flex flex-col items-center gap-3">
				<div class="flex h-16 w-16 items-center justify-center">
					<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-16 w-16">
						<defs>
							<linearGradient id="login-flame" x1="32" y1="44" x2="32" y2="12" gradientUnits="userSpaceOnUse">
								<stop stop-color="#CC2200"/>
								<stop offset="0.4" stop-color="#FF4500"/>
								<stop offset="0.8" stop-color="#FF8C00"/>
								<stop offset="1" stop-color="#FFD700"/>
							</linearGradient>
							<linearGradient id="login-hex" x1="12" y1="6" x2="52" y2="50" gradientUnits="userSpaceOnUse">
								<stop stop-color="#E8E8E8"/>
								<stop offset="1" stop-color="#888888"/>
							</linearGradient>
						</defs>
						<rect width="64" height="64" rx="14" class="fill-surface-200 dark:fill-surface-800"/>
						<path d="M32 6 L52 17 L52 39 L32 50 L12 39 L12 17 Z"
							  fill="none" stroke="url(#login-hex)" stroke-width="2.5" stroke-linecap="round"
							  stroke-dasharray="0 28 120" stroke-dashoffset="-14"/>
						<path d="M32 44 C26 40 22 35 22 30 C22 24 26 20 29 18 C28 22 30 21 30 18 C30 14 32 12 32 12 C32 12 34 14 34 18 C34 21 36 22 35 18 C38 20 42 24 42 30 C42 35 38 40 32 44Z" fill="url(#login-flame)"/>
						<path d="M32 40 C29 38 27 35 27 32 C27 28 29 26 31 24 C30 27 32 26 32 24 C32 24 34 26 33 24 C35 26 37 28 37 32 C37 35 35 38 32 40Z" fill="#FFD700" opacity="0.7"/>
						<circle cx="32" cy="30" r="2" fill="white" opacity="0.5"/>
					</svg>
				</div>
				<div class="text-center">
					<h1 class="text-xl font-bold text-surface-900 dark:text-surface-100">Crucible</h1>
					<p class="mt-1 text-sm text-surface-500">Sign in to manage your labs</p>
				</div>
			</div>

			<!-- SSO Button -->
			<button
				onclick={handleLogin}
				class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
				</svg>
				Sign in with SSO
			</button>

			<p class="mt-4 text-center text-xs text-surface-500">
				Authenticated via Authentik
			</p>
		</div>
	</div>
</div>
