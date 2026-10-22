// Template descriptions are instructor-written Markdown shown to students,
// so the picker renders them through the same sanitizer as briefings.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';

import TemplatePicker from './TemplatePicker.svelte';
import type { Template } from '$lib/types';

function picker(description: string) {
	const template = {
		id: 't-1',
		name: 'Kali',
		os_type: 'linux',
		description,
		is_active: true,
		default_vcpus: 2,
		default_ram_mb: 4096,
		default_disk_gb: 40
	} as Template;
	return render(TemplatePicker, { props: { templates: [template], selections: {}, onchange: () => {} } });
}

describe('TemplatePicker description', () => {
	it('renders Markdown', () => {
		const { container } = picker('**Attack box** with [docs](https://example.test/kali)');
		const desc = container.querySelector('.template-description')!;
		expect(desc.querySelector('strong')?.textContent).toBe('Attack box');
		expect(desc.querySelector('a')?.getAttribute('target')).toBe('_blank');
	});

	it('strips script, handlers and javascript: links', () => {
		const { container } = picker('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[x](javascript:alert(3))');
		const desc = container.querySelector('.template-description')!;
		expect(desc.querySelector('script')).toBeNull();
		expect(desc.innerHTML).not.toMatch(/onerror/i);
		for (const a of desc.querySelectorAll('a')) {
			expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
		}
	});
});
