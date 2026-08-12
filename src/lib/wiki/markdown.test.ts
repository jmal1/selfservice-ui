// Tests for the wiki markdown renderer's intra-bundle link resolver.
//
// These cover the contract documented in markdown.ts: relative paths
// resolve against the source page's directory, leading `/` is treated
// as bundle-root, anchor fragments are preserved, and external schemes
// pass through unchanged. The bundler's Go-side resolveLink uses the
// same logic; a divergence here would mean the UI rewrites links to
// paths the bundler never validated, which silently 404s for users.

import { describe, expect, it } from 'vitest';
import { __test, renderMarkdown } from './markdown';

const { resolveBundlePath, rewriteIntraBundleLinks, normalizeAlertSyntax } = __test;

describe('resolveBundlePath', () => {
	it('resolves bare filenames against the source directory', () => {
		// This is the bug Phase E fixes: a link from
		// docs/instructor/overview.md to workflows.md must resolve to
		// docs/instructor/workflows.md, not workflows.md (which 404s).
		expect(resolveBundlePath('workflows.md', 'docs/instructor/overview.md')).toBe(
			'docs/instructor/workflows.md'
		);
	});

	it('resolves explicit ./ as the source directory', () => {
		expect(resolveBundlePath('./workflows.md', 'docs/instructor/overview.md')).toBe(
			'docs/instructor/workflows.md'
		);
	});

	it('handles ../ by walking up one directory', () => {
		expect(resolveBundlePath('../ai/build-workflow-prompt.md', 'docs/instructor/overview.md')).toBe(
			'docs/ai/build-workflow-prompt.md'
		);
	});

	it('treats a leading / as bundle-absolute', () => {
		expect(resolveBundlePath('/AGENTS.md', 'docs/instructor/overview.md')).toBe('AGENTS.md');
	});

	it('returns the same path when source is at bundle root', () => {
		expect(resolveBundlePath('docs/instructor/overview.md', 'AGENTS.md')).toBe(
			'docs/instructor/overview.md'
		);
	});

	it('collapses multiple ../ segments', () => {
		expect(resolveBundlePath('../../AGENTS.md', 'docs/instructor/overview.md')).toBe('AGENTS.md');
	});
});

describe('rewriteIntraBundleLinks', () => {
	it('rewrites relative md links to ?file= against the source dir', () => {
		const input = 'See [Workflows](workflows.md) for more.';
		const out = rewriteIntraBundleLinks(input, 'docs/instructor/overview.md');
		expect(out).toContain('](?file=docs%2Finstructor%2Fworkflows.md)');
	});

	it('preserves trailing #anchor fragments', () => {
		const input = 'See [Quotas](workflows.md#quotas) for the cap.';
		const out = rewriteIntraBundleLinks(input, 'docs/instructor/overview.md');
		expect(out).toContain('](?file=docs%2Finstructor%2Fworkflows.md#quotas)');
	});

	it('leaves external http(s) links unchanged', () => {
		const input = 'See [GitHub](https://github.com/foo/bar) and [Mail](mailto:x@y.z).';
		const out = rewriteIntraBundleLinks(input, 'docs/instructor/overview.md');
		expect(out).toBe(input);
	});

	it('leaves pure anchor (#heading) links unchanged', () => {
		const input = 'Jump to [the section](#workflows).';
		const out = rewriteIntraBundleLinks(input, 'docs/instructor/overview.md');
		expect(out).toBe(input);
	});

	it('rewrites links to source files in other directories', () => {
		const input = 'See [the runner](../../internal/runner/executor.go).';
		const out = rewriteIntraBundleLinks(input, 'docs/instructor/runner-environment.md');
		expect(out).toContain('](?file=internal%2Frunner%2Fexecutor.go)');
	});
});

describe('normalizeAlertSyntax', () => {
	it('uppercases lowercase Obsidian-style callouts so marked-alert matches', () => {
		const input = '> [!note]\n> Body text.';
		expect(normalizeAlertSyntax(input)).toBe('> [!NOTE]\n> Body text.');
	});

	it('handles all five GFM alert types in any case', () => {
		for (const kind of ['note', 'tip', 'important', 'warning', 'caution']) {
			const mixedCase = `${kind[0].toUpperCase()}${kind.slice(1)}`;
			const input = `> [!${mixedCase}]\n> Body.`;
			expect(normalizeAlertSyntax(input)).toContain(`[!${kind.toUpperCase()}]`);
		}
	});

	it('leaves already-uppercase callouts unchanged', () => {
		const input = '> [!WARNING]\n> Body.';
		expect(normalizeAlertSyntax(input)).toBe(input);
	});

	it('normalises mixed-case callouts', () => {
		expect(normalizeAlertSyntax('> [!Tip]\n> Body.')).toBe('> [!TIP]\n> Body.');
	});

	it('maps legacy danger aliases to CAUTION', () => {
		expect(normalizeAlertSyntax('> [!danger]\n> Body.')).toContain('[!CAUTION]');
		expect(normalizeAlertSyntax('> [!DaNgEr]\n> Body.')).toContain('[!CAUTION]');
	});

	it('leaves unknown tokens and literal code unchanged', () => {
		const input = [
			'> [!foo]',
			'> Unknown token.',
			'See `[!note]` for the literal syntax we use.',
			'```markdown',
			'> [!danger]',
			'```',
			'    > [!warning]'
		].join('\n');
		expect(normalizeAlertSyntax(input)).toBe(input);
	});

	it('only matches at line start so an indented blockquote inside a list also works', () => {
		// GFM allows blockquotes inside list items with leading
		// whitespace; our regex permits leading \s* so those still match.
		const input = '- item\n  > [!warning]\n  > body';
		expect(normalizeAlertSyntax(input)).toContain('[!WARNING]');
	});
});

describe('renderMarkdown', () => {
	it('renders legacy danger callouts as caution alerts', () => {
		const html = renderMarkdown('> [!DaNgEr]\n> Treat this as destructive.', 'docs/getting-started.md');

		expect(html).toContain('markdown-alert-caution');
		expect(html).not.toContain('[!DANGER]');
	});
});
