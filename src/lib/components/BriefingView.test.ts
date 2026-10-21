import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import BriefingView from './BriefingView.svelte';
import type { BriefingSection } from '$lib/api/client';

const section = (over: Partial<BriefingSection>): BriefingSection => ({
	scope: 'template',
	title: 'Kali',
	body_md: '# Kali',
	revision: 1,
	updated_at: '2026-10-21T00:00:00Z',
	...over
});

describe('BriefingView', () => {
	it('renders a single section without tabs', () => {
		render(BriefingView, { props: { sections: [section({ body_md: '# Only one' })] } });
		expect(screen.queryByRole('tablist')).toBeNull();
		expect(screen.getByRole('heading', { name: 'Only one' })).toBeTruthy();
	});

	it('shows Lab first, then one tab per template, and switches sections', async () => {
		render(BriefingView, {
			props: {
				sections: [
					section({ scope: 'blueprint', title: 'Red team', body_md: '# Lab rules' }),
					section({ title: 'Kali', body_md: '# Kali notes', vm_names: ['Kali', 'Kali-2'] })
				]
			}
		});
		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Lab', 'Kali']);
		expect(screen.getByRole('heading', { name: 'Lab rules' })).toBeTruthy();
		await fireEvent.click(tabs[1]);
		expect(screen.getByRole('heading', { name: 'Kali notes' })).toBeTruthy();
		expect(screen.getByText('For: Kali, Kali-2')).toBeTruthy();
	});

	it('adds a Copy button to fenced code blocks', () => {
		render(BriefingView, { props: { sections: [section({ body_md: '```bash\nnmap -sV 10.0.0.5\n```' })] } });
		expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeTruthy();
	});
});
