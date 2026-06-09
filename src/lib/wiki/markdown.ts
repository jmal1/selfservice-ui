// Markdown rendering pipeline for the instructor wiki.
//
// This module builds a single configured `Marked` instance that handles
// every wiki page. The wiki UI imports renderMarkdown / extractToc and
// stays decoupled from the underlying libraries.
//
// Why a dedicated module?
//   * The renderer wires together four libraries (marked, marked-highlight,
//     marked-alert, marked-gfm-heading-id, highlight.js + DOMPurify) — that
//     setup shouldn't live in a Svelte component.
//   * The TOC extractor needs to agree with marked-gfm-heading-id about
//     how slugs are generated; co-locating keeps that contract honest.
//
// Security: every HTML string we produce gets fed through DOMPurify
// before {@html} so a malicious bundle file can't smuggle <script> tags
// or javascript: URLs in. The same pattern is used by MarkdownField.

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import markedAlert from 'marked-alert';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

// Build the Marked instance once per page-load. The configuration is
// idempotent so re-running it would be safe, but it allocates a few
// closures per call so we avoid it.
const marked = new Marked(
	gfmHeadingId(),
	markedAlert(),
	markedHighlight({
		emptyLangClass: 'hljs',
		langPrefix: 'hljs language-',
		highlight(code, lang) {
			// `marked-highlight` strips whitespace from the lang fence; we
			// fall through to plaintext when the requested language isn't
			// registered (highlight.js/lib/common ships the top ~30).
			const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
			return hljs.highlight(code, { language }).value;
		}
	})
);

// Marked options: enable gfm tables/strikethrough/etc and use the
// classic line-break behaviour (newlines stay newlines, blank lines are
// paragraph breaks). gfm: true is default but spelled out for clarity.
marked.setOptions({ gfm: true, breaks: false });

/**
 * Resolve a markdown link target against the directory of the source
 * page so that relative links (`./foo.md`, `../bar.md`, bare names)
 * become bundle-absolute paths that match what the API serves.
 *
 * Mirrors the Go bundler's resolveLink in cmd/wiki-bundler/main.go;
 * keep the two in sync — a divergence here means the rewriter would
 * route to a path the bundler didn't include, and the wiki would 404
 * on links the bundle build verified were valid.
 *
 * Inputs:
 *   - `target`: the raw link target from `[text](target)`. May include
 *     `./`, `../`, a leading `/` (treated as bundle-absolute), or just
 *     be a bare filename.
 *   - `sourcePath`: bundle-relative path of the page the link lives in,
 *     e.g. `docs/instructor/overview.md`. Used to resolve `./` and
 *     `../` segments.
 *
 * Returns the bundle-relative path with `./` and `../` segments
 * collapsed. Caller is responsible for URL-encoding before embedding.
 */
function resolveBundlePath(target: string, sourcePath: string): string {
	let candidate: string;
	if (target.startsWith('/')) {
		// Leading slash means "bundle root" — strip it and we're done.
		candidate = target.slice(1);
	} else {
		// Relative to source file's directory.
		const lastSlash = sourcePath.lastIndexOf('/');
		const dir = lastSlash >= 0 ? sourcePath.slice(0, lastSlash) : '';
		candidate = dir ? `${dir}/${target}` : target;
	}
	// Collapse `.` and `..` segments. Splitting on `/` rather than using
	// the URL constructor keeps us bundle-rooted (the URL ctor would
	// need a base host and would percent-encode along the way).
	const segments: string[] = [];
	for (const seg of candidate.split('/')) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') {
			segments.pop();
			continue;
		}
		segments.push(seg);
	}
	return segments.join('/');
}

/**
 * Rewrite intra-bundle markdown links so clicks navigate inside the
 * wiki SPA instead of trying to hit a 404 on the API. External links
 * (http://, https://, mailto:, anchors) pass through unchanged.
 *
 * Relative paths are resolved against `sourcePath` (the bundle-relative
 * path of the page being rendered) so a link from
 * `docs/instructor/overview.md` to `workflows.md` correctly becomes
 * `?file=docs%2Finstructor%2Fworkflows.md`, not `?file=workflows.md`.
 *
 * The wiki page intercepts clicks on `?file=...` anchors via a document
 * click handler and routes them to selectPage(). See +page.svelte.
 */
function rewriteIntraBundleLinks(md: string, sourcePath: string): string {
	return md.replace(/\]\(([^)#\s]+?)(#[^)]*)?\)/g, (match, target: string, anchor?: string) => {
		if (/^(https?:|mailto:|ftp:|#)/i.test(target)) return match;
		const resolved = resolveBundlePath(target, sourcePath);
		const file = encodeURIComponent(resolved);
		// Preserve trailing #anchor so deep-links to headings still work
		// after the SPA navigation reloads the page body.
		return anchor ? `](?file=${file}${anchor})` : `](?file=${file})`;
	});
}

/**
 * Render a markdown source string to sanitized HTML, ready for
 * `{@html}`. The result includes:
 *   * GitHub-flavoured-markdown extras (tables, strikethrough, task lists)
 *   * `> [!note]` / `[!tip]` / `[!warning]` / `[!danger]` callouts
 *   * Auto-generated heading IDs for TOC + deep-linking
 *   * Syntax-highlighted code blocks (hljs)
 *   * Rewritten intra-bundle links (`](workflows.md)` from
 *     `docs/instructor/overview.md` -> `](?file=docs%2Finstructor%2Fworkflows.md)`)
 *
 * `sourcePath` is the bundle-relative path of the page being rendered;
 * supplying it is mandatory so relative links resolve correctly.
 */
export function renderMarkdown(source: string, sourcePath: string): string {
	if (!source) return '';
	const rewritten = rewriteIntraBundleLinks(source, sourcePath);
	const html = marked.parse(rewritten, { async: false }) as string;
	// `USE_PROFILES: { html: true }` is the default-safe profile that
	// permits common formatting tags, links, images, and tables but
	// strips <script>, on* attributes, javascript: URLs, etc.
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		// `id` on headings is added by marked-gfm-heading-id; keep it so
		// in-page anchor links work. dompurify allows `id` by default
		// but we spell it out for safety against future profile changes.
		ADD_ATTR: ['id']
	});
}

// Exported solely so the bundler-link contract has a unit test. Not
// intended for general use; callers should prefer renderMarkdown.
export const __test = { resolveBundlePath, rewriteIntraBundleLinks };

/**
 * Render a raw source file (.go/.sql/.sh/etc.) as a single syntax-
 * highlighted code block. Used for non-markdown entries in the bundle.
 *
 * The DOMPurify pass at the end strips any escapes hljs emitted that
 * could theoretically break out — in practice hljs always emits safe
 * spans, but we sanitize anyway to keep the trust boundary explicit.
 */
export function renderSourceFile(source: string, languageHint: string): string {
	const language = hljs.getLanguage(languageHint) ? languageHint : 'plaintext';
	const highlighted = hljs.highlight(source, { language }).value;
	const html = `<pre class="wiki-code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
	return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Heading entry surfaced in the right-hand Table of Contents pane. */
export interface TocEntry {
	id: string;
	text: string;
	/** 2 for H2, 3 for H3. We don't surface H1 (the page title is shown
	 *  separately) or H4+ (clutters the TOC). */
	level: 2 | 3;
}

/**
 * Walk rendered HTML and pull out H2/H3 headings to build a table of
 * contents. Uses DOMParser rather than regex so we get correct text
 * extraction even when headings contain inline `<code>` or links.
 *
 * The DOMParser operates on a detached document so the headings are
 * never attached to the live DOM — no script execution risk.
 */
export function extractToc(html: string): TocEntry[] {
	if (!html) return [];
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const out: TocEntry[] = [];
	for (const el of doc.querySelectorAll('h2, h3')) {
		const id = el.id;
		if (!id) continue;
		const text = (el.textContent ?? '').trim();
		if (!text) continue;
		out.push({ id, text, level: el.tagName === 'H2' ? 2 : 3 });
	}
	return out;
}

/**
 * Map a file path to a highlight.js language identifier. Falls back to
 * 'plaintext' for unknown extensions.
 */
export function languageForPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	switch (ext) {
		case 'go':
			return 'go';
		case 'sql':
			return 'sql';
		case 'sh':
		case 'bash':
			return 'bash';
		case 'json':
			return 'json';
		case 'yaml':
		case 'yml':
			return 'yaml';
		case 'ts':
		case 'tsx':
			return 'typescript';
		case 'js':
		case 'jsx':
			return 'javascript';
		case 'py':
			return 'python';
		case 'rs':
			return 'rust';
		case 'md':
			return 'markdown';
		default:
			return 'plaintext';
	}
}

/** File-type glyph for the sidebar tree. Plain unicode so it inherits
 *  the surrounding text colour and is theme-agnostic. */
export function iconForPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	switch (ext) {
		case 'md':
			return '📘';
		case 'go':
			return '🟢';
		case 'sql':
			return '🗄️';
		case 'sh':
		case 'bash':
			return '🔧';
		case 'json':
		case 'yaml':
		case 'yml':
			return '⚙️';
		case 'ts':
		case 'tsx':
		case 'js':
		case 'jsx':
			return '📜';
		default:
			return '📄';
	}
}
