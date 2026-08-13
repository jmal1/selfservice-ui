import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
	getIndex: vi.fn(),
	getPage: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(window.location.href);
		}
	}
}));

vi.mock('$lib/api/client', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/api/client')>();
	return {
		...original,
		studentGuideGetIndex: client.getIndex,
		studentGuideGetPage: client.getPage
	};
});

import GuidePage from '../../routes/guide/+page.svelte';

const pages = [
	{
		path: 'docs/student/overview.md',
		title: 'Welcome to Crucible',
		size: 100,
		sha256: 'overview',
		is_markdown: true,
		from_seed: true
	},
	{
		path: 'docs/student/labs.md',
		title: 'Managing your lab',
		size: 100,
		sha256: 'labs',
		is_markdown: true,
		from_seed: false
	},
	{
		path: 'docs/student/snapshots.md',
		title: 'Using snapshots',
		size: 100,
		sha256: 'snapshots',
		is_markdown: true,
		from_seed: false
	}
];

describe('Student Guide page', () => {
	beforeEach(() => {
		window.history.replaceState({}, '', '/guide?file=docs/student/labs.md');
		client.getIndex.mockResolvedValue({
			seeds: ['docs/student/overview.md'],
			files: pages,
			total_bytes: 300
		});
		client.getPage.mockImplementation(
			async (path: string) => `# ${pages.find((page) => page.path === path)?.title}`
		);
	});

	it('renders manifest titles and opens the bookmarked guide page', async () => {
		render(GuidePage);

		expect(await screen.findByRole('heading', { name: 'Student Guide' })).not.toBeNull();
		expect(await screen.findByRole('heading', { name: 'Managing your lab' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Open Using snapshots' })).not.toBeNull();
		expect(client.getPage).toHaveBeenCalledWith('docs/student/labs.md');
	});

	it('updates the bookmark query when a guide page is selected', async () => {
		render(GuidePage);

		await screen.findByRole('button', { name: 'Open Using snapshots' });
		await fireEvent.click(screen.getByRole('button', { name: 'Open Using snapshots' }));

		await waitFor(() => expect(client.getPage).toHaveBeenCalledWith('docs/student/snapshots.md'));
		expect(window.location.search).toBe('?file=docs%2Fstudent%2Fsnapshots.md');
	});
});
