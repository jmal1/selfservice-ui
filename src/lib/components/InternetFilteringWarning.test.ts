import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import InternetFilteringWarning from './InternetFilteringWarning.svelte';

describe('InternetFilteringWarning', () => {
	it('plainly announces the temporary filtering gap', () => {
		render(InternetFilteringWarning, { props: { filteringActive: false } });

		const alert = screen.getByRole('alert', {
			name: 'School-safe Internet filtering is not currently active'
		});
		expect(alert.textContent).toContain(
			'Outbound browsing from this lab may reach unrestricted Internet content.'
		);
	});

	it('is removable through the filtering state gate', () => {
		render(InternetFilteringWarning, { props: { filteringActive: true } });

		expect(screen.queryByRole('alert')).toBeNull();
	});
});
