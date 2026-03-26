<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { page } from '$app/state';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();

	const isLoginPage = $derived(page.url.pathname.startsWith('/login'));
	const isConsolePage = $derived(page.url.pathname.startsWith('/console'));
	const showSidebar = $derived(authStore.isAuthenticated && !isLoginPage && !isConsolePage);

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: 'dashboard' },
		{ href: '/pods', label: 'My Labs', icon: 'pods' },
		{ href: '/templates', label: 'Templates', icon: 'templates' }
	];

	const adminItems = [
		{ href: '/admin', label: 'Overview', icon: 'dashboard' },
		{ href: '/admin/users', label: 'Users', icon: 'users' },
		{ href: '/admin/templates', label: 'Templates', icon: 'templates' },
		{ href: '/admin/blueprints', label: 'Blueprints', icon: 'templates' },
		{ href: '/admin/actions', label: 'Actions', icon: 'audit' },
		{ href: '/admin/workflows', label: 'Workflows', icon: 'audit' },
		{ href: '/admin/playlists', label: 'Playlists', icon: 'audit' },
		{ href: '/admin/runs', label: 'Runs', icon: 'jobs' },
		{ href: '/admin/vlans', label: 'VLAN Pool', icon: 'vlans' },
		{ href: '/admin/jobs', label: 'Jobs', icon: 'jobs' },
		{ href: '/admin/audit', label: 'Audit Log', icon: 'audit' }
	];

	function isActive(href: string): boolean {
		if (href === '/' || href === '/admin') return page.url.pathname === href;
		return page.url.pathname.startsWith(href);
	}

	function handleLogout() {
		authStore.logout();
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

<div class="relative flex h-screen overflow-hidden bg-surface-50-950">
	<!-- Animated background gradients (fire + blue blobs) -->
	<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
		<div class="bg-blob absolute -left-[20%] -top-[20%] h-[700px] w-[700px] rounded-full bg-primary-500/8 blur-[120px]"></div>
		<div class="bg-blob-delayed absolute -bottom-[15%] -right-[15%] h-[600px] w-[600px] rounded-full bg-secondary-500/6 blur-[100px]"></div>
		<div class="bg-blob-delayed absolute left-[40%] top-[60%] h-[400px] w-[400px] rounded-full bg-tertiary-500/5 blur-[100px]"></div>
	</div>

	{#if showSidebar}
	<!-- Sidebar -->
	<aside class="glass fixed inset-y-0 left-0 z-30 flex w-64 flex-col">
		<!-- Logo -->
		<div class="flex items-center border-b border-surface-200-800/30 px-5 py-6">
			{#if themeStore.isDark}
				<img src="/crucible-logo.svg" alt="Crucible" class="h-10" />
			{:else}
				<img src="/crucible-logo-light.svg" alt="Crucible" class="h-10" />
			{/if}
		</div>

		<!-- Quick action -->
		<div class="px-3 pt-4 pb-2">
			<a
				href="/deploy"
				class="glow-primary flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary-500 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-600"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
				Deploy VM
			</a>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 space-y-1 overflow-y-auto px-3 py-2">
			{#each navItems as item}
				<a
					href={item.href}
					class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all
						{isActive(item.href)
						? 'bg-primary-500/15 text-primary-400'
						: 'text-surface-400 hover:bg-surface-200-800/50 hover:text-surface-900-100'}"
				>
					{#if isActive(item.href)}
						<span class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary-500"></span>
					{/if}
					{@render navIcon(item.icon)}
					<span>{item.label}</span>
				</a>
			{/each}

			{#if authStore.isAdmin}
				<div class="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-400">
					Admin
				</div>
				{#each adminItems as item}
					<a
						href={item.href}
						class="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all
							{isActive(item.href)
							? 'bg-primary-500/15 text-primary-400'
							: 'text-surface-400 hover:bg-surface-200-800/50 hover:text-surface-900-100'}"
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
		<div class="border-t border-surface-200-800/30 px-4 py-3">
			<button
				onclick={() => themeStore.toggle()}
				class="mb-3 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-surface-400 transition-all hover:bg-surface-200-800/50 hover:text-surface-900-100"
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
						<p class="truncate text-sm font-medium text-surface-900-100">
							{authStore.user.display_name}
						</p>
						<p class="truncate text-xs text-surface-400">{authStore.user.role}</p>
					</div>
					<button
						onclick={handleLogout}
						class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-surface-200-800 hover:text-surface-900-100"
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
	<main class="{showSidebar ? 'ml-64' : ''} flex-1 overflow-y-auto p-6">
		{@render children()}
	</main>

	<Toast />
</div>
