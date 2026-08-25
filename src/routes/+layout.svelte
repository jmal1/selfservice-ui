<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { provisioningStore } from '$lib/stores/provisioning.svelte';
	import { config } from '$lib/config';
	import { goto } from '$app/navigation';
	import { page, updated } from '$app/state';
	import Toast from '$lib/components/Toast.svelte';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import ProvisioningBanner from '$lib/components/ProvisioningBanner.svelte';

	let { children } = $props();

	const isLoginPage = $derived(page.url.pathname.startsWith('/login'));
	// Full-screen VM consoles: the pod console (/console/[podId]/[vmId]) and
	// the template build console (/admin/templates/[templateID]/console). Both
	// render <WMKSConsole> as a fixed inset-0 layer, so the sidebar must be
	// hidden or it overlaps the left edge of the console.
	const isConsolePage = $derived(
		page.url.pathname.startsWith('/console') || page.url.pathname.endsWith('/console')
	);
	const showSidebar = $derived(authStore.isAuthenticated && !isLoginPage && !isConsolePage);

	let mobileMenuOpen = $state(false);

	// Edge-trigger this effect: `$effect` re-runs on every write to the
	// `token`/`user` $state fields it reads through `isAuthenticated`, even
	// when the resulting boolean doesn't actually change (e.g. a session
	// re-validation that re-sets an equal user object). A plain (non-reactive)
	// closure variable lets us only call load()/reset() on a genuine
	// authenticated <-> unauthenticated transition, so incidental auth-state
	// churn can never re-trigger a provisioning fetch or reset the banner to
	// its loading state.
	let wasAuthenticated: boolean | undefined;
	$effect(() => {
		const isAuthenticated = authStore.isAuthenticated;
		if (isAuthenticated === wasAuthenticated) return;
		wasAuthenticated = isAuthenticated;

		if (isAuthenticated) {
			void provisioningStore.load();
		} else {
			provisioningStore.reset();
		}
	});

	onMount(() => {
		let refreshScheduled = false;
		let destroyed = false;
		const refreshProvisioningStatus = () => {
			if (
				refreshScheduled ||
				!authStore.isAuthenticated ||
				document.visibilityState !== 'visible'
			) return;

			refreshScheduled = true;
			queueMicrotask(() => {
				refreshScheduled = false;
				if (!destroyed && authStore.isAuthenticated && document.visibilityState === 'visible') {
					void provisioningStore.load();
				}
			});
		};

		window.addEventListener('focus', refreshProvisioningStatus);
		document.addEventListener('visibilitychange', refreshProvisioningStatus);
		return () => {
			destroyed = true;
			window.removeEventListener('focus', refreshProvisioningStatus);
			document.removeEventListener('visibilitychange', refreshProvisioningStatus);
		};
	});

	// Close mobile menu on navigation
	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: 'dashboard' },
		{ href: '/pods', label: 'My Labs', icon: 'pods' },
		{ href: '/templates', label: 'Templates', icon: 'templates' },
		{ href: '/guide', label: 'Student Guide', icon: 'guide' }
	];

	const instructorItems = [
		{ href: '/wiki', label: 'Wiki', icon: 'audit' }
	];

	const adminItems = [
		{ href: '/admin', label: 'Overview', icon: 'dashboard', minRole: 'instructor' },
		{ href: '/admin/users', label: 'Users', icon: 'users', minRole: 'instructor' },
		{ href: '/admin/templates', label: 'Templates', icon: 'templates', minRole: 'instructor' },
		{ href: '/admin/images', label: 'Images', icon: 'templates', minRole: 'instructor' },
		{ href: '/admin/blueprints', label: 'Blueprints', icon: 'templates', minRole: 'instructor' },
		{ href: '/admin/actions', label: 'Actions', icon: 'audit', minRole: 'instructor' },
		{ href: '/admin/workflows', label: 'Workflows', icon: 'audit', minRole: 'instructor' },
		{ href: '/admin/playlists', label: 'Playlists', icon: 'audit', minRole: 'instructor' },
		{ href: '/admin/runs', label: 'Runs', icon: 'jobs', minRole: 'instructor' },
		{ href: '/admin/vlans', label: 'VLAN Pool', icon: 'vlans', minRole: 'instructor' },
		{ href: '/admin/jobs', label: 'Jobs', icon: 'jobs', minRole: 'instructor' },
		{ href: '/admin/health', label: 'Health', icon: 'dashboard', minRole: 'instructor' },
		// Admin-only: instructors were intentionally not granted the audit log.
		{ href: '/admin/audit', label: 'Audit Log', icon: 'audit', minRole: 'admin' }
	];

	// Filter the admin nav by the viewer's role. Instructors see the full
	// admin surface except the admin-only entries (Audit Log); admins see all.
	const visibleAdminItems = $derived(
		adminItems.filter((item) => item.minRole !== 'admin' || authStore.isAdmin)
	);

	function isActive(href: string): boolean {
		if (href === '/' || href === '/admin') return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}

	async function handleLogout() {
		let logoutUrl: string | null = null;
		try {
			const res = await fetch(`${config.apiBaseUrl}/auth/logout`, {
				method: 'POST',
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json().catch(() => null);
				if (data && typeof data.logout_url === 'string') {
					logoutUrl = data.logout_url;
				}
			}
		} catch {
			// Network error — fall through and clear local state anyway.
		}

		// Clear in-memory auth state before navigating so the login page's
		// guard sees an unauthenticated user.
		authStore.clearState();

		if (logoutUrl) {
			// A top-level browser navigation is required for Authentik to clear
			// its SSO cookie; a fetch alone won't terminate the SSO session.
			// Authentik ends the session then 302s back to /login.
			window.location.assign(logoutUrl);
		} else {
			await goto('/login');
		}
	}

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
</script>

{#snippet navIcon(icon: string)}
	{#if icon === 'dashboard'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
	{:else if icon === 'pods'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
	{:else if icon === 'templates'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
	{:else if icon === 'users'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
	{:else if icon === 'jobs'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
	{:else if icon === 'vlans'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16M8 7v10M16 7v10" /></svg>
	{:else if icon === 'audit'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
	{:else if icon === 'guide'}
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 014 16.5v-11zM4 16.5A2.5 2.5 0 016.5 14H20M8 7h8m-8 3h6" /></svg>
	{/if}
{/snippet}

<!-- Crucible logo snippet (design 2: hex ring + flame) -->
{#snippet crucibleLogo(size: string)}
	<svg class="{size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<linearGradient id="nav-flame" x1="32" y1="44" x2="32" y2="12" gradientUnits="userSpaceOnUse">
				<stop stop-color="#CC2200"/>
				<stop offset="0.4" stop-color="#FF4500"/>
				<stop offset="0.8" stop-color="#FF8C00"/>
				<stop offset="1" stop-color="#FFD700"/>
			</linearGradient>
			<linearGradient id="nav-hex" x1="12" y1="6" x2="52" y2="50" gradientUnits="userSpaceOnUse">
				<stop stop-color="#E8E8E8"/>
				<stop offset="1" stop-color="#888888"/>
			</linearGradient>
		</defs>
		<rect width="64" height="64" rx="12" fill="#12121f"/>
		<path d="M32 6 L52 17 L52 39 L32 50 L12 39 L12 17 Z"
			  fill="none" stroke="url(#nav-hex)" stroke-width="3" stroke-linecap="round"
			  stroke-dasharray="0 28 120" stroke-dashoffset="-14"/>
		<path d="M32 44 C26 40 22 35 22 30 C22 24 26 20 29 18 C28 22 30 21 30 18 C30 14 32 12 32 12 C32 12 34 14 34 18 C34 21 36 22 35 18 C38 20 42 24 42 30 C42 35 38 40 32 44Z" fill="url(#nav-flame)"/>
		<path d="M32 40 C29 38 27 35 27 32 C27 28 29 26 31 24 C30 27 32 26 32 24 C32 24 34 26 33 24 C35 26 37 28 37 32 C37 35 35 38 32 40Z" fill="#FFD700" opacity="0.7"/>
		<circle cx="32" cy="30" r="2" fill="white" opacity="0.5"/>
	</svg>
{/snippet}

<div class="relative flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
	<!-- Animated background gradients (fire + blue blobs) -->
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
		<div class="bg-blob absolute -left-[20%] -top-[20%] h-[700px] w-[700px] rounded-full bg-primary-500/3 blur-[120px]"></div>
		<div class="bg-blob-delayed absolute -bottom-[15%] -right-[15%] h-[600px] w-[600px] rounded-full bg-secondary-500/2 blur-[100px]"></div>
		<div class="bg-blob-delayed absolute left-[40%] top-[60%] h-[400px] w-[400px] rounded-full bg-tertiary-500/2 blur-[100px]"></div>
	</div>

	{#if showSidebar}
	<!-- Mobile top bar -->
	<header class="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-surface-200-800/30 bg-surface-100-900/80 px-4 backdrop-blur-xl md:hidden">
		<button
			onclick={toggleMobileMenu}
			class="flex h-10 w-10 items-center justify-center rounded-lg text-surface-500 transition-colors hover:bg-surface-200-800"
			aria-label="Toggle navigation menu"
		>
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				{#if mobileMenuOpen}
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				{:else}
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
				{/if}
			</svg>
		</button>
		<span class="text-sm font-bold text-surface-900-100">Crucible</span>
		<div class="w-10"></div>
	</header>

	<!-- Mobile overlay -->
	{#if mobileMenuOpen}
		<button
			class="fixed inset-0 z-40 bg-black/50 md:hidden"
			onclick={() => (mobileMenuOpen = false)}
			aria-label="Close menu"
		></button>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface-100-900/80 backdrop-blur-xl border-r border-surface-200-800/30 transition-transform duration-300 md:translate-x-0 {mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}">
		<!-- Logo -->
		<div class="flex items-center border-b border-surface-200/30 dark:border-surface-800/30 px-5 py-6">
			{#if themeStore.isDark}
				<img src="/crucible-logo.svg" alt="Crucible" class="h-10" />
			{:else}
				<img src="/crucible-logo-light.svg" alt="Crucible" class="h-10" />
			{/if}
		</div>

		<!-- Quick action -->
		<div class="px-3 pt-4 pb-2">
			{#if provisioningStore.canProvision}
				<a
					href="/deploy"
					class="flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-600"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
					Deploy VM
				</a>
			{:else}
				<span
					class="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[10px] bg-surface-300 px-3 py-2.5 text-sm font-semibold text-surface-500 dark:bg-surface-800"
					role="link"
					aria-disabled="true"
					title={provisioningStore.message}
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
					Deploy VM
				</span>
			{/if}
		</div>

		<!-- Navigation -->
		<nav class="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main navigation">
			{#each navItems as item}
				<a
					href={item.href}
					class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors
						{isActive(item.href)
						? 'bg-primary-500/15 text-primary-400'
						: 'text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-surface-100'}"
				>
					{#if isActive(item.href)}
						<span class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary-500"></span>
					{/if}
					{@render navIcon(item.icon)}
					<span>{item.label}</span>
				</a>
			{/each}

			{#if authStore.isInstructor}
				<div class="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-400">
					Instructor
				</div>
				{#each instructorItems as item}
					<a
						href={item.href}
						class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors
							{isActive(item.href)
							? 'bg-primary-500/15 text-primary-400'
							: 'text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-surface-100'}"
					>
						{#if isActive(item.href)}
							<span class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary-500"></span>
						{/if}
						{@render navIcon(item.icon)}
						<span>{item.label}</span>
					</a>
				{/each}
			{/if}

			{#if authStore.isInstructor}
				<div class="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-400">
					Admin
				</div>
				{#each visibleAdminItems as item}
					<a
						href={item.href}
						class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors
							{isActive(item.href)
							? 'bg-primary-500/15 text-primary-400'
							: 'text-surface-400 hover:bg-surface-200/50 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-surface-100'}"
					>
						{#if isActive(item.href)}
							<span class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary-500"></span>
						{/if}
						{@render navIcon(item.icon)}
						<span>{item.label}</span>
					</a>
				{/each}
			{/if}
		</nav>

		<!-- Footer: Theme toggle + User -->
		<div class="border-t border-surface-200/30 dark:border-surface-800/30 px-4 py-3">
			<button
				onclick={() => themeStore.toggle()}
				class="mb-3 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-surface-400 transition-colors hover:bg-surface-200-800/50 hover:text-surface-900-100"
			>
				{#if themeStore.isDark}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
				{:else}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
				{/if}
				<span>{themeStore.isDark ? 'Light Mode' : 'Dark Mode'}</span>
			</button>

			{#if authStore.user}
				<div class="flex items-center gap-3">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white"
					>
						{authStore.user.display_name.charAt(0).toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">
							{authStore.user.display_name}
						</p>
						<p class="truncate text-xs text-surface-400">{authStore.user.role}</p>
					</div>
					<button
						onclick={handleLogout}
						class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-surface-200 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100"
						aria-label="Sign out"
						title="Sign out"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</aside>
	{/if}

	<!-- Main content -->
	<main id="main-content" class="{showSidebar ? 'md:ml-64' : ''} {showSidebar ? 'mt-14 md:mt-0' : ''} flex-1 overflow-y-auto p-4 md:p-6">
		{#if showSidebar}
			<ProvisioningBanner />
		{/if}
		{#if updated.current}
			<!--
				A newer build was deployed while this tab was open. Serving stale
				JS is what made the template wizard's "ISO install" branch appear
				stuck. Reloading loads the fresh bundle. Non-destructive: the user
				chooses when to reload so in-progress form input isn't lost.
			-->
			<aside
				class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-400/40 bg-primary-500/10 px-4 py-3 text-sm"
				role="status"
			>
				<span class="font-medium text-surface-900 dark:text-surface-100">
					A new version of Crucible is available.
				</span>
				<button
					onclick={() => location.reload()}
					class="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
				>
					Reload now
				</button>
			</aside>
		{/if}
		<!--
			Render-time crash boundary. A throw while rendering a page (e.g. the
			Blueprints outage: iterating an array the API omitted) is contained
			here so only the main content shows a fallback while the sidebar and
			the rest of the app keep working. Keyed on the pathname so navigating
			to another route mounts a fresh boundary and clears any prior crash.
		-->
		{#key page.url.pathname}
			<ErrorBoundary label="this page">
				{@render children()}
			</ErrorBoundary>
		{/key}
	</main>

	<Toast />
</div>
