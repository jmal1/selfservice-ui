import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const getPodBriefing = vi.fn();
vi.mock('$lib/api/client', () => ({ getPodBriefing: (id: string) => getPodBriefing(id) }));

import BriefingCard from './BriefingCard.svelte';

const published = [{ scope: 'template', title: 'Kali', body_md: '# Start here', revision: 2, updated_at: '' }];

afterEach(() => {
	vi.restoreAllMocks();
	getPodBriefing.mockReset();
});

describe('BriefingCard', () => {
	it('renders nothing when no briefing is published', async () => {
		getPodBriefing.mockResolvedValue([]);
		const { container } = render(BriefingCard, { props: { podId: 'p-1' } });
		await vi.waitFor(() => expect(getPodBriefing).toHaveBeenCalledWith('p-1'));
		expect(container.querySelector('section')).toBeNull();
	});

	it('renders nothing when the request fails', async () => {
		getPodBriefing.mockRejectedValue(new Error('403'));
		const { container } = render(BriefingCard, { props: { podId: 'p-1' } });
		await vi.waitFor(() => expect(getPodBriefing).toHaveBeenCalled());
		expect(container.querySelector('section')).toBeNull();
	});

	it('shows the briefing with a new-tab link and a popup fallback hint', async () => {
		getPodBriefing.mockResolvedValue(published);
		render(BriefingCard, { props: { podId: 'p-1' } });
		expect(await screen.findByRole('heading', { name: 'Start here' })).toBeTruthy();
		const tab = screen.getByRole('link', { name: 'Open in new tab' });
		expect(tab.getAttribute('href')).toBe('/briefing/p-1');
		expect(tab.getAttribute('target')).toBe('_blank');

		vi.spyOn(window, 'open').mockReturnValue(null);
		await fireEvent.click(screen.getByRole('button', { name: 'Open in new window' }));
		expect(screen.getByRole('status').textContent).toContain('blocked the popup');
	});
});
