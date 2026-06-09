// Tests for the wiki markdown renderer's intra-bundle link resolver.
//
// These cover the contract documented in markdown.ts: relative paths
// resolve against the source page's directory, leading `/` is treated
// as bundle-root, anchor fragments are preserved, and external schemes
// pass through unchanged. The bundler's Go-side resolveLink uses the
// same logic; a divergence here would mean the UI rewrites links to
// paths the bundler never validated, which silently 404s for users.

import { describe, expect, it } from 'vitest';
import { __test } from './markdown';

const { resolveBundlePath, rewriteIntraBundleLinks } = __test;

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
