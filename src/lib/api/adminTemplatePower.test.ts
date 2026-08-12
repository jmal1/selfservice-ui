import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The client imports $app/navigation for the 401 redirect path; stub it so the
// module loads under jsdom.
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { adminTemplatePower } from './client';

describe('adminTemplatePower', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('POSTs the action to the power endpoint', async () => {
		fetchSpy.mockResolvedValue(
			new Response('', { status: 202, statusText: 'Accepted' })
		);

		await adminTemplatePower('tpl-1', 'start');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(String(url)).toContain('/api/v1/admin/templates/tpl-1/power');
		expect(opts.method).toBe('POST');
		expect(JSON.parse(opts.body as string)).toEqual({ action: 'start' });
	});

	it('resolves without throwing on a bodyless 200', async () => {
		fetchSpy.mockResolvedValue(new Response('', { status: 200, statusText: 'OK' }));
		await expect(adminTemplatePower('tpl-9', 'reset')).resolves.toBeUndefined();
	});

	it('throws ApiError on a failed response', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ reason: 'nope' }), {
				status: 409,
				statusText: 'Conflict'
			})
		);
		await expect(adminTemplatePower('tpl-1', 'stop')).rejects.toMatchObject({ status: 409 });
	});
});
