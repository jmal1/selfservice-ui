// Briefings are instructor-written and student-read, so the renderer is
// the XSS boundary. Every hostile input below must come out inert.

import { describe, expect, it } from 'vitest';
import { renderBriefing } from './markdown';

function dom(md: string): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = renderBriefing(md);
	return el;
}

describe('renderBriefing', () => {
	it('renders markdown, callouts and fenced code', () => {
		const el = dom('# Lab\n\n> [!tip]\n> Start here\n\n```bash\nnmap -sV 10.0.0.5\n```');
		expect(el.querySelector('h1')?.textContent).toBe('Lab');
		expect(el.querySelector('.markdown-alert-tip')).not.toBeNull();
		expect(el.querySelector('pre code')?.textContent).toContain('nmap -sV 10.0.0.5');
	});

	it('strips script tags and inline event handlers', () => {
		const el = dom('<script>alert(1)</script>\n\n<img src="https://x.test/a.png" onerror="alert(2)">\n\n<div onclick="alert(3)">x</div>');
		expect(el.querySelector('script')).toBeNull();
		expect(el.innerHTML).not.toMatch(/onerror|onclick|alert\(/);
	});

	it('drops javascript: links', () => {
		const el = dom('[click](javascript:alert(1)) and <a href="JaVaScRiPt:alert(2)">x</a>');
		for (const a of el.querySelectorAll('a')) {
			expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
		}
	});

	it('drops images that are not https or briefing assets', () => {
		const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
		const el = dom(
			`![a](${svg})\n\n![b](http://insecure.test/b.png)\n\n![c](https://cdn.test/c.png)\n\n![d](/api/v1/briefing-assets/${'a'.repeat(64)})`
		);
		const srcs = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src'));
		expect(srcs).toEqual(['https://cdn.test/c.png', `/api/v1/briefing-assets/${'a'.repeat(64)}`]);
	});

	it('opens external links in a new tab without opener or referrer', () => {
		const el = dom('[docs](https://example.com) and [section](#setup)');
		const [ext, anchor] = el.querySelectorAll('a');
		expect(ext.getAttribute('target')).toBe('_blank');
		expect(ext.getAttribute('rel')).toBe('noopener noreferrer');
		expect(anchor.hasAttribute('target')).toBe(false);
	});

	it('does not rewrite relative links the way the wiki does', () => {
		expect(dom('[x](workflows.md)').querySelector('a')?.getAttribute('href')).toBe('workflows.md');
	});
});
