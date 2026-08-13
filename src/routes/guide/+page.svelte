<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { friendlyError } from '$lib/errors/friendly';
	import {
		studentGuideGetIndex,
		studentGuideGetPage,
		type StudentGuideIndex,
		type WikiManifestEntry
	} from '$lib/api/client';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { renderMarkdown } from '$lib/wiki/markdown';
	import './../../lib/wiki/wiki-prose.css';

	const HUB_PATH = 'docs/student/overview.md';

	let index = $state<StudentGuideIndex | null>(null);
	let loadingIndex = $state(true);
	let indexError = $state<string | null>(null);

	let currentPath = $state('');
	let pageBody = $state('');
	let loadingPage = $state(false);
	let pageError = $state<string | null>(null);

	const guidePages = $derived<WikiManifestEntry[]>(index?.files ?? []);
	const rendered = $derived.by(() =>
		pageBody && currentPath ? renderMarkdown(pageBody, currentPath) : ''
	);

	function isGuidePage(path: string): boolean {
		return guidePages.some((file) => file.path === path);
	}

	async function loadIndex() {
		try {
			index = await studentGuideGetIndex();
			indexError = null;
		} catch (error) {
			indexError = friendlyError(error, 'Unable to load the student guide.');
		} finally {
			loadingIndex = false;
		}
	}

	async function loadPage(path: string) {
		currentPath = path;
		loadingPage = true;
		pageError = null;
		try {
			pageBody = await studentGuideGetPage(path);
		} catch (error) {
			pageBody = '';
			pageError = friendlyError(error, 'Unable to load this guide page.');
		} finally {
			loadingPage = false;
		}

		await tick();
		scrollToAnchor();
	}

	function selectPage(path: string, anchor?: string) {
		if (!isGuidePage(path)) return;

		const url = new URL(window.location.href);
		url.searchParams.set('file', path);
		url.hash = anchor ?? '';
		history.replaceState({}, '', url);

		if (path === currentPath) {
			if (anchor) scrollToAnchor(anchor);
			return;
		}

		void loadPage(path);
	}

	function scrollToAnchor(anchor = window.location.hash.replace(/^#/, '')) {
		if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function initializeGuide() {
		await loadIndex();
		if (!index) return;

		const requestedPath = page.url.searchParams.get('file');
		const defaultPath =
			guidePages.find((file) => file.path === HUB_PATH)?.path ??
			guidePages.find((file) => index?.seeds.includes(file.path))?.path ??
			guidePages[0]?.path;

		if (requestedPath && isGuidePage(requestedPath)) {
			selectPage(requestedPath);
		} else if (defaultPath) {
			selectPage(defaultPath);
		}
	}

	onMount(() => {
		void initializeGuide();

		const handleGuideLink = (event: MouseEvent) => {
			const link = (event.target as HTMLElement | null)?.closest('a');
			if (!link) return;

			const href = link.getAttribute('href');
			if (!href) return;

			if (href.startsWith('?file=')) {
				event.preventDefault();
				const [file, anchor] = href.slice('?file='.length).split('#');
				selectPage(decodeURIComponent(file), anchor);
			} else if (href.startsWith('#')) {
				event.preventDefault();
				const anchor = href.slice(1);
				const url = new URL(window.location.href);
				url.hash = anchor;
				history.replaceState({}, '', url);
				scrollToAnchor(anchor);
			}
		};

		document.addEventListener('click', handleGuideLink);
		return () => document.removeEventListener('click', handleGuideLink);
	});
</script>

<svelte:head>
	<title>Student Guide | Crucible</title>
</svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
	<aside class="w-full shrink-0 lg:w-64">
		<div class="mb-4">
			<h1 class="text-xl font-bold text-surface-900 dark:text-surface-100">Student Guide</h1>
			<p class="mt-1 text-sm text-surface-500">
				Help for working safely in your Crucible lab.
			</p>
		</div>

		<nav aria-label="Student guide pages">
			{#if loadingIndex}
				<div class="space-y-2">
					{#each Array(5) as _, i (i)}
						<LoadingSkeleton width="100%" height="1.75rem" />
					{/each}
				</div>
			{:else if indexError}
				<div
					class="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-sm text-error-500"
					role="alert"
				>
					{indexError}
				</div>
			{:else if guidePages.length > 0}
				<ul class="space-y-1">
					{#each guidePages as guidePage (guidePage.path)}
						<li>
							<button
								type="button"
								class="w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors {currentPath ===
								guidePage.path
									? 'bg-primary-500/15 text-primary-500'
									: 'text-surface-700 hover:bg-surface-200/50 dark:text-surface-300 dark:hover:bg-surface-800'}"
								aria-label={`Open ${guidePage.title}`}
								aria-pressed={currentPath === guidePage.path}
								onclick={() => selectPage(guidePage.path)}
							>
								{guidePage.title}
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="rounded-lg border border-surface-200 bg-surface-100 px-3 py-2 text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900">
					Guide pages are not available right now.
				</p>
			{/if}
		</nav>
	</aside>

	<main class="min-w-0 flex-1">
		{#if loadingIndex}
			<LoadingSkeleton width="100%" height="24rem" />
		{:else if indexError}
			<div
				class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
				role="alert"
			>
				{indexError}
			</div>
		{:else if loadingPage}
			<LoadingSkeleton width="100%" height="24rem" />
		{:else if pageError}
			<div
				class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
				role="alert"
			>
				{pageError}
			</div>
		{:else if currentPath}
			<article id="student-guide-article" class="wiki-prose">
				{@html rendered}
			</article>
		{:else}
			<div class="rounded-xl border border-surface-200 bg-surface-100 p-8 text-center text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900">
				No guide pages are available right now.
			</div>
		{/if}
	</main>
</div>
