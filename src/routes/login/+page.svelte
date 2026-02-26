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

<div class="flex min-h-screen items-center justify-center bg-surface-50-950">
	<!-- Background gradients -->
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
		<div class="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary-500/10 blur-3xl"></div>
		<div class="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-secondary-500/10 blur-3xl"></div>
	</div>

	<div class="w-full max-w-sm">
		<div class="rounded-2xl border border-surface-200-800/50 bg-surface-100-900/80 p-8 shadow-xl backdrop-blur-xl">
			<!-- Logo -->
			<div class="mb-6 flex flex-col items-center gap-3">
				<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500">
					<svg class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
					</svg>
				</div>
				<div class="text-center">
					<h1 class="text-xl font-bold text-surface-900-100">Self-Service Portal</h1>
					<p class="mt-1 text-sm text-surface-500">Sign in to manage your pods</p>
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
