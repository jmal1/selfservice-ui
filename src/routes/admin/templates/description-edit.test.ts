// The admin edit row must let instructors change a template's description
// (jmal1/Crucible#76) and send it with the optimistic-concurrency stamp.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const { tmpl, adminUpdateTemplate } = vi.hoisted(() => ({
	tmpl: {
		id: 't-1',
		name: 'Kali',
		vcenter_template: 'kali-2026',
		os_type: 'linux',
		description: 'Old text',
		default_vcpus: 2,
		default_ram_mb: 4096,
		default_disk_gb: 40,
		min_vcpus: 1,
		min_ram_mb: 1024,
		is_active: true,
		updated_at: '2026-10-21T00:00:00Z'
	},
	adminUpdateTemplate: vi.fn()
}));

vi.mock('$lib/stores/auth.svelte', () => ({ authStore: { isInstructor: true } }));
vi.mock('$lib/api/client', () => ({
	adminListTemplates: vi.fn().mockResolvedValue([tmpl]),
	adminUpdateTemplate: (...a: unknown[]) => adminUpdateTemplate(...a),
	adminCreateTemplate: vi.fn(),
	adminDeleteTemplate: vi.fn(),
	adminListPlaylists: vi.fn().mockResolvedValue([]),
	adminGetTemplatePlaylists: vi.fn().mockResolvedValue([]),
	adminSetTemplatePlaylists: vi.fn(),
	ApiError: class ApiError extends Error {}
}));

import Page from './+page.svelte';

describe('admin template description edit', () => {
	it('edits the description and saves it with expected_updated_at', async () => {
		adminUpdateTemplate.mockResolvedValue({ ...tmpl, description: '## New' });
		render(Page);
		await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

		const field = screen.getByDisplayValue('Old text');
		await fireEvent.input(field, { target: { value: '## New' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await vi.waitFor(() => expect(adminUpdateTemplate).toHaveBeenCalled());
		const [id, body] = adminUpdateTemplate.mock.calls[0];
		expect(id).toBe('t-1');
		expect(body).toMatchObject({ description: '## New', expected_updated_at: tmpl.updated_at });
	});
});
