<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
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

	let index = $state<WikiIndex | null>(null);
	let loadingIndex = $state(true);
	let indexError = $state<string | null>(null);

	let currentPath = $state<string>('');
	let pageBody = $state<string>('');
	let loadingPage = $state(false);
	let pageError = $state<string | null>(null);

	// rendered is the sanitized HTML for the current page. For markdown
	// we run marked() then DOMPurify (same pattern as MarkdownField). For
	// source files we wrap in <pre><code> so highlight.js can be wired
	// in later without changing the data flow.
	const rendered = $derived.by(() => {
		if (!pageBody) return '';
		const ext = currentPath.split('.').pop()?.toLowerCase() ?? '';
		if (ext === 'md') {
			// Rewrite intra-bundle links from `[text](internal/foo.go)` to
			// `[text](?file=internal/foo.go)` so clicks navigate within
			// the wiki UI instead of leaking out to a 404. External http(s)
			// links pass through unchanged.
			const rewritten = pageBody.replace(
				/\]\(([^)#\s]+?)\)/g,
				(match, target: string) => {
					if (/^(https?:|mailto:|ftp:|#)/i.test(target)) return match;
					return `](?file=${encodeURIComponent(target)})`;
				}
			);
			const html = marked.parse(rewritten, { async: false }) as string;
			return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
		}
		// Source files: render as a single <pre><code> block. Escape HTML
		// since the bundle contains raw .go/.sql/.sh source.
		const escaped = pageBody
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		const lang = languageFor(currentPath);
		return `<pre class="rounded-lg bg-surface-200/40 dark:bg-surface-900 p-4 overflow-x-auto text-xs"><code class="language-${lang}">${escaped}</code></pre>`;
	});

	function languageFor(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() ?? '';
		switch (ext) {
			case 'go':
				return 'go';
			case 'sql':
				return 'sql';
			case 'sh':
				return 'bash';
			case 'json':
				return 'json';
			case 'yaml':
			case 'yml':
				return 'yaml';
			default:
				return 'plaintext';
		}
	}

	// groupedFiles organizes the file list into top-level folders for the
	// sidebar tree. Seeds get pulled into their own "Start here" group
	// regardless of folder so instructors land on AGENTS.md first.
	const groupedFiles = $derived.by(() => {
		if (!index) return { seeds: [], groups: new Map<string, WikiManifestEntry[]>() };
		const seeds: WikiManifestEntry[] = [];
		const groups = new Map<string, WikiManifestEntry[]>();
		for (const f of index.files) {
			if (f.from_seed) {
				seeds.push(f);
				continue;
			}
			const topLevel = f.path.split('/')[0] ?? '';
			const arr = groups.get(topLevel) ?? [];
			arr.push(f);
			groups.set(topLevel, arr);
		}
		// Sort entries inside each group for stable rendering.
		for (const arr of groups.values()) {
			arr.sort((a, b) => a.path.localeCompare(b.path));
		}
		return { seeds, groups };
	});

	async function loadIndex() {
		try {
			index = await wikiGetIndex();
			indexError = null;
		} catch (e) {
			indexError = e instanceof Error ? e.message : 'Failed to load wiki index';
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
			pageError = e instanceof Error ? e.message : 'Failed to load page';
			pageBody = '';
		} finally {
			loadingPage = false;
		}
	}

	function selectPage(path: string) {
		// Push the path into the URL so users can bookmark / share deep
		// links. Use replaceState rather than goto to avoid a full
		// SvelteKit navigation cycle for what's effectively in-page
		// tab-switching.
		const url = new URL(window.location.href);
		url.searchParams.set('file', path);
		history.replaceState({}, '', url.toString());
		loadPage(path);
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(2)} MB`;
	}

	onMount(() => {
		if (!authStore.isInstructor) return;
		// Kick off the async initial load without awaiting it (onMount
		// must stay sync to return its cleanup handler).
		(async () => {
			await loadIndex();
			const fromUrl = page.url.searchParams.get('file');
			if (fromUrl && index?.files.some((f) => f.path === fromUrl)) {
				selectPage(fromUrl);
			} else if (index?.seeds.length) {
				selectPage(index.seeds[0]);
			}
		})();
		// Intercept clicks on rewritten in-app links so they don't trigger
		// a full page reload (they're rendered as anchor tags with
		// ?file=... hrefs).
		const handler = (ev: MouseEvent) => {
			const target = (ev.target as HTMLElement | null)?.closest('a');
			if (!target) return;
			const href = target.getAttribute('href');
			if (!href || !href.startsWith('?file=')) return;
			ev.preventDefault();
			const file = decodeURIComponent(href.slice('?file='.length));
			selectPage(file);
		};
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});
</script>

<div class="mx-auto flex max-w-7xl gap-6">
	{#if !authStore.isInstructor}
		<div class="w-full rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
			Wiki is restricted to instructors and admins.
		</div>
	{:else}
		<!-- Sidebar -->
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

			{#if loadingIndex}
				<div class="space-y-2">
					{#each Array(5) as _, i (i)}
						<LoadingSkeleton width="100%" height="1rem" />
					{/each}
				</div>
			{:else if indexError}
				<div class="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-500">
					{indexError}
				</div>
			{:else if index}
				<div>
					<div class="mb-1 text-xs font-semibold uppercase tracking-wide text-surface-500">
						Start here
					</div>
					<ul class="space-y-0.5">
						{#each groupedFiles.seeds as f (f.path)}
							<li>
								<button
									type="button"
									class="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-surface-200/50 dark:hover:bg-surface-800 {currentPath === f.path ? 'bg-primary-500/15 text-primary-500' : 'text-surface-700 dark:text-surface-300'}"
									onclick={() => selectPage(f.path)}
									title={f.path}
								>
									{f.path}
								</button>
							</li>
						{/each}
					</ul>
				</div>

				{#each [...groupedFiles.groups.entries()].sort(([a], [b]) => a.localeCompare(b)) as [folder, files] (folder)}
					<div>
						<div class="mb-1 text-xs font-semibold uppercase tracking-wide text-surface-500">
							{folder}/
						</div>
						<ul class="space-y-0.5">
							{#each files as f (f.path)}
								<li>
									<button
										type="button"
										class="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-surface-200/50 dark:hover:bg-surface-800 {currentPath === f.path ? 'bg-primary-500/15 text-primary-500' : 'text-surface-600 dark:text-surface-400'}"
										onclick={() => selectPage(f.path)}
										title={f.path}
									>
										{f.path.slice(folder.length + 1)}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}

				<div class="border-t border-surface-200 dark:border-surface-800 pt-3 text-xs text-surface-500">
					{index.files.length} files · {formatBytes(index.total_bytes)}
				</div>
			{/if}
		</aside>

		<!-- Main content -->
		<main class="min-w-0 flex-1">
			{#if currentPath}
				<div class="mb-4 flex items-center justify-between gap-3">
					<div class="min-w-0">
						<div class="text-xs text-surface-500">File</div>
						<div class="truncate font-mono text-sm text-surface-900 dark:text-surface-100" title={currentPath}>
							{currentPath}
						</div>
					</div>
					<a
						href={wikiPageDownloadURL(currentPath)}
						class="shrink-0 rounded-lg border border-surface-300 dark:border-surface-700 bg-surface-100 dark:bg-surface-900 px-3 py-1.5 text-sm hover:bg-surface-200 dark:hover:bg-surface-800"
					>
						⬇ Download
					</a>
				</div>

				{#if loadingPage}
					<LoadingSkeleton width="100%" height="20rem" />
				{:else if pageError}
					<div class="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-500">
						{pageError}
					</div>
				{:else}
					<article class="prose prose-sm max-w-none dark:prose-invert">
						{@html rendered}
					</article>
				{/if}
			{:else if !loadingIndex && !indexError}
				<div class="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900 p-8 text-center text-sm text-surface-500">
					Select a doc from the sidebar to begin.
				</div>
			{/if}
		</main>
	{/if}
</div>
