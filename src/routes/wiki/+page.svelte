<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { friendlyError } from '$lib/errors/friendly';
	import { page } from '$app/state';
	import { authStore } from '$lib/stores/auth.svelte';
	import {
		wikiGetIndex,
		wikiGetPage,
		wikiZipURL,
		wikiPageDownloadURL,
		type WikiIndex,
		type WikiManifestEntry
	} from '$lib/api/client';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import {
		renderMarkdown,
		renderSourceFile,
		extractToc,
		languageForPath,
		iconForPath,
		type TocEntry
	} from '$lib/wiki/markdown';
	import './../../lib/wiki/wiki-prose.css';

	let index = $state<WikiIndex | null>(null);
	let loadingIndex = $state(true);
	let indexError = $state<string | null>(null);

	let currentPath = $state<string>('');
	let pageBody = $state<string>('');
	let loadingPage = $state(false);
	let pageError = $state<string | null>(null);

	let sidebarFilter = $state('');
	let activeHeadingId = $state<string>('');

	// Content render — either markdown via marked+hljs+callouts, or a
	// single-file syntax-highlighted source code block. Both paths run
	// through DOMPurify inside the markdown module so `{@html}` here is
	// safe.
	const rendered = $derived.by(() => {
		if (!pageBody) return '';
		const ext = currentPath.split('.').pop()?.toLowerCase() ?? '';
		if (ext === 'md') return renderMarkdown(pageBody, currentPath);
		return renderSourceFile(pageBody, languageForPath(currentPath));
	});

	// TOC is extracted from the rendered HTML so we don't have to walk
	// the markdown AST a second time. Empty for source-file pages.
	const toc = $derived<TocEntry[]>(rendered ? extractToc(rendered) : []);

	// Sidebar categorisation: map a bundle-relative path to a friendly
	// category label so the sidebar reads "Instructor Guide" instead of
	// "docs/" and so source-code entries are clearly separated. Keep
	// in sync with how the bundler seeds files in selfservice-api's
	// Makefile (WIKI_SEEDS) — adding a new top-level folder requires a
	// matching entry here, otherwise files fall into "Other".
	const CATEGORY_ORDER = [
		'Instructor Guide',
		'AI Authoring Prompts',
		'Source Reference',
		'Deployment Reference',
		'Other'
	] as const;
	function categoryFor(path: string): string {
		if (path.startsWith('docs/instructor/')) return 'Instructor Guide';
		if (path.startsWith('docs/ai-prompts/') || path.startsWith('docs/ai/'))
			return 'AI Authoring Prompts';
		if (path.startsWith('internal/')) return 'Source Reference';
		if (path.startsWith('deploy/')) return 'Deployment Reference';
		return 'Other';
	}

	// Group sidebar files into Start-here + per-category buckets. Filter
	// matches against the path AND the friendly title so typing
	// "Workflow" finds the corresponding page even though the filename
	// is just "workflows.md".
	const groupedFiles = $derived.by(() => {
		const empty = {
			seeds: [] as WikiManifestEntry[],
			groups: [] as { label: string; files: WikiManifestEntry[] }[]
		};
		if (!index) return empty;
		const filter = sidebarFilter.trim().toLowerCase();
		const matches = (f: WikiManifestEntry) =>
			!filter ||
			f.path.toLowerCase().includes(filter) ||
			(f.title ?? '').toLowerCase().includes(filter);

		const seeds: WikiManifestEntry[] = [];
		const byCategory = new Map<string, WikiManifestEntry[]>();
		for (const f of index.files) {
			if (!matches(f)) continue;
			if (f.from_seed) {
				seeds.push(f);
				continue;
			}
			const cat = categoryFor(f.path);
			const arr = byCategory.get(cat) ?? [];
			arr.push(f);
			byCategory.set(cat, arr);
		}
		// Sort each category by title (with path tiebreaker) so users
		// see human names in alphabetical order rather than the
		// path-sorted ordering that grouped subdirectories oddly.
		for (const arr of byCategory.values()) {
			arr.sort(
				(a, b) =>
					(a.title ?? a.path).localeCompare(b.title ?? b.path) ||
					a.path.localeCompare(b.path)
			);
		}
		const groups = CATEGORY_ORDER.filter((label) => byCategory.has(label)).map((label) => ({
			label,
			files: byCategory.get(label)!
		}));
		return { seeds, groups };
	});

	// Breadcrumb segments for the top of the main pane. Splits the
	// current path on `/` and renders each segment as a chip.
	const breadcrumbs = $derived(currentPath ? currentPath.split('/') : []);

	async function loadIndex() {
		try {
			index = await wikiGetIndex();
			indexError = null;
		} catch (e) {
			indexError = friendlyError(e, 'Failed to load wiki index');
		} finally {
			loadingIndex = false;
		}
	}

	async function loadPage(path: string) {
		if (!path) return;
		currentPath = path;
		loadingPage = true;
		pageError = null;
		try {
			pageBody = await wikiGetPage(path);
		} catch (e) {
			pageError = friendlyError(e, 'Failed to load page');
			pageBody = '';
		} finally {
			loadingPage = false;
		}
		// Wait for the DOM update then enhance the rendered article
		// (add copy buttons, language badges, jump to anchor if present
		// in the URL).
		await tick();
		enhanceCodeBlocks();
		applyAnchorFromUrl();
		setupScrollSpy();
	}

	function selectPage(path: string, anchor?: string) {
		// Bookmarkable URL: ?file=path&#heading-id
		const url = new URL(window.location.href);
		url.searchParams.set('file', path);
		if (anchor) url.hash = anchor;
		else url.hash = '';
		history.replaceState({}, '', url.toString());
		if (path === currentPath && anchor) {
			// Same page, just jump to anchor
			document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}
		loadPage(path);
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(2)} MB`;
	}

	// After render: walk every <pre> inside the article and inject a
	// "Copy" button + language badge. Keeps the markdown module free of
	// DOM mutation responsibilities.
	function enhanceCodeBlocks() {
		const article = document.getElementById('wiki-article');
		if (!article) return;
		for (const pre of article.querySelectorAll('pre')) {
			if (pre.querySelector('.wiki-copy-btn')) continue; // idempotent
			const code = pre.querySelector('code');
			const cls = code?.className ?? '';
			const langMatch = cls.match(/language-([\w-]+)/);
			if (langMatch && langMatch[1] !== 'plaintext') {
				pre.setAttribute('data-lang', langMatch[1]);
			}
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'wiki-copy-btn';
			btn.textContent = 'Copy';
			btn.addEventListener('click', async (ev) => {
				ev.stopPropagation();
				const text = code?.textContent ?? '';
				try {
					await navigator.clipboard.writeText(text);
					btn.textContent = 'Copied!';
					setTimeout(() => (btn.textContent = 'Copy'), 1500);
				} catch {
					btn.textContent = 'Failed';
					setTimeout(() => (btn.textContent = 'Copy'), 1500);
				}
			});
			pre.appendChild(btn);
		}
	}

	function applyAnchorFromUrl() {
		const hash = window.location.hash.replace(/^#/, '');
		if (!hash) return;
		const el = document.getElementById(hash);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// Track which TOC entry is currently in view by watching scroll
	// position. IntersectionObserver gives near-zero overhead vs a
	// scroll listener. Re-runs whenever the page (and its set of
	// headings) changes.
	let scrollObserver: IntersectionObserver | null = null;
	function setupScrollSpy() {
		scrollObserver?.disconnect();
		const article = document.getElementById('wiki-article');
		if (!article) return;
		const headings = Array.from(article.querySelectorAll('h2, h3')) as HTMLElement[];
		if (headings.length === 0) {
			activeHeadingId = '';
			return;
		}
		scrollObserver = new IntersectionObserver(
			(entries) => {
				// Pick the first heading currently intersecting the
				// "active" band near the top of the viewport.
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible.length > 0) {
					activeHeadingId = visible[0].target.id;
				}
			},
			{ rootMargin: '-15% 0% -70% 0%', threshold: 0 }
		);
		for (const h of headings) scrollObserver.observe(h);
	}

	function scrollToToc(id: string) {
		const url = new URL(window.location.href);
		url.hash = id;
		history.replaceState({}, '', url.toString());
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		(async () => {
			await loadIndex();
			const fromUrl = page.url.searchParams.get('file');
			if (fromUrl && index?.files.some((f) => f.path === fromUrl)) {
				selectPage(fromUrl);
			} else if (index?.seeds.length) {
				selectPage(index.seeds[0]);
			}
		})();
		// Document-level click interception for rewritten ?file= links
		// so they SPA-navigate instead of hitting the network.
		const handler = (ev: MouseEvent) => {
			const target = (ev.target as HTMLElement | null)?.closest('a');
			if (!target) return;
			const href = target.getAttribute('href');
			if (!href) return;
			if (href.startsWith('?file=')) {
				ev.preventDefault();
				const q = href.slice('?file='.length);
				const [filePart, anchor] = q.split('#');
				selectPage(decodeURIComponent(filePart), anchor);
			} else if (href.startsWith('#')) {
				// Plain in-page anchor — update URL but let smooth scroll
				// happen via JS so the offset matches scroll-margin-top.
				ev.preventDefault();
				scrollToToc(href.slice(1));
			}
		};
		document.addEventListener('click', handler);
		return () => {
			document.removeEventListener('click', handler);
			scrollObserver?.disconnect();
		};
	});
</script>

<div class="mx-auto flex max-w-[100rem] gap-6">
	{#if !authStore.isInstructor}
		<div
			class="w-full rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
		>
			Wiki is restricted to instructors and admins.
		</div>
	{:else}
		<!-- ── LEFT SIDEBAR: file tree + search ──────────────────────── -->
		<aside class="w-72 shrink-0 space-y-4">
			<div>
				<h2 class="text-lg font-bold text-surface-900 dark:text-surface-100">Instructor Wiki</h2>
				<p class="mt-1 text-xs text-surface-500">
					Workflow, action, and runner reference. Sourced from the selfservice-api repo.
				</p>
			</div>

			<a
				href={wikiZipURL()}
				class="block rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-center text-sm font-medium text-primary-500 hover:bg-primary-500/20"
			>
				⬇ Download Bundle (.zip)
			</a>

			<input
				type="search"
				bind:value={sidebarFilter}
				placeholder="Filter files…"
				class="input text-sm"
				aria-label="Filter wiki files"
			/>

			{#if loadingIndex}
				<div class="space-y-2">
					{#each Array(5) as _, i (i)}
						<LoadingSkeleton width="100%" height="1rem" />
					{/each}
				</div>
			{:else if indexError}
				<div
					class="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-500"
				>
					{indexError}
				</div>
			{:else if index}
				{#if groupedFiles.seeds.length > 0}
					<div>
						<div
							class="mb-1 text-xs font-semibold uppercase tracking-wide text-surface-500"
						>
							Start here
						</div>
						<ul class="space-y-0.5">
							{#each groupedFiles.seeds as f (f.path)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm hover:bg-surface-200/50 dark:hover:bg-surface-800 {currentPath ===
										f.path
											? 'bg-primary-500/15 text-primary-500'
											: 'text-surface-700 dark:text-surface-300'}"
										onclick={() => selectPage(f.path)}
										title={f.path}
									>
										<span class="text-sm">{iconForPath(f.path)}</span>
										<span class="truncate">{f.title ?? f.path}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#each groupedFiles.groups as group (group.label)}
					<div>
						<div
							class="mb-1 text-xs font-semibold uppercase tracking-wide text-surface-500"
						>
							{group.label}
						</div>
						<ul class="space-y-0.5">
							{#each group.files as f (f.path)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-xs hover:bg-surface-200/50 dark:hover:bg-surface-800 {currentPath ===
										f.path
											? 'bg-primary-500/15 text-primary-500'
											: 'text-surface-600 dark:text-surface-400'}"
										onclick={() => selectPage(f.path)}
										title={f.path}
									>
										<span class="text-xs">{iconForPath(f.path)}</span>
										<span class="truncate">{f.title ?? f.path}</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}

				{#if groupedFiles.seeds.length === 0 && groupedFiles.groups.length === 0}
					<div class="px-2 py-3 text-xs italic text-surface-500">No files match "{sidebarFilter}".</div>
				{/if}

				<div
					class="border-t border-surface-200 dark:border-surface-800 pt-3 text-xs text-surface-500"
				>
					{index.files.length} files · {formatBytes(index.total_bytes)}
				</div>
			{/if}
		</aside>

		<!-- ── MAIN CONTENT ─────────────────────────────────────────── -->
		<main class="min-w-0 flex-1">
			{#if currentPath}
				<!-- Breadcrumbs + actions -->
				<div
					class="mb-4 flex items-center justify-between gap-3 border-b border-surface-200 pb-3 dark:border-surface-800"
				>
					<nav class="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb">
						{#each breadcrumbs as seg, i (i)}
							{#if i > 0}
								<span class="text-surface-400">/</span>
							{/if}
							<span
								class="truncate {i === breadcrumbs.length - 1
									? 'font-medium text-surface-900 dark:text-surface-100'
									: 'text-surface-500'}"
								title={seg}
							>
								{seg}
							</span>
						{/each}
					</nav>
					<a
						href={wikiPageDownloadURL(currentPath)}
						class="shrink-0 rounded-lg border border-surface-300 bg-surface-100 px-3 py-1.5 text-sm hover:bg-surface-200 dark:border-surface-700 dark:bg-surface-900 dark:hover:bg-surface-800"
					>
						⬇ Download
					</a>
				</div>

				{#if loadingPage}
					<LoadingSkeleton width="100%" height="20rem" />
				{:else if pageError}
					<div
						class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500"
					>
						{pageError}
					</div>
				{:else}
					<article id="wiki-article" class="wiki-prose">
						{@html rendered}
					</article>
				{/if}
			{:else if !loadingIndex && !indexError}
				<div
					class="rounded-xl border border-surface-200 bg-surface-100 p-8 text-center text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900"
				>
					Select a doc from the sidebar to begin.
				</div>
			{/if}
		</main>

		<!-- ── RIGHT SIDEBAR: Table of Contents ────────────────────── -->
		{#if toc.length > 0}
			<aside class="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
				<div class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
					On this page
				</div>
				<ul class="space-y-0.5 border-l border-surface-200 dark:border-surface-800">
					{#each toc as entry (entry.id)}
						<li>
							<button
								type="button"
								onclick={() => scrollToToc(entry.id)}
								class="block w-full truncate border-l-2 py-1 pr-2 text-left text-xs transition-colors {entry.level ===
								3
									? 'pl-6'
									: 'pl-3'} {activeHeadingId === entry.id
									? 'border-primary-500 text-primary-500'
									: 'border-transparent text-surface-500 hover:border-surface-300 hover:text-surface-800 dark:hover:border-surface-600 dark:hover:text-surface-100'}"
								title={entry.text}
							>
								{entry.text}
							</button>
						</li>
					{/each}
				</ul>
			</aside>
		{/if}
	{/if}
</div>
