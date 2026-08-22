import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import {
	ApiError,
	addVM,
	createPod,
	deployBlueprint,
	getProvisioningStatus
} from './client';

describe('provisioning API', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('loads the exact provisioning status contract', async () => {
		const status = {
			enabled: false,
			message: 'Provisioning is temporarily unavailable for maintenance.'
		};
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(status)));

		await expect(getProvisioningStatus()).resolves.toEqual(status);
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/provisioning/status'),
			expect.objectContaining({ credentials: 'include' })
		);
	});

	it.each([
		undefined,
		null,
		{},
		{ enabled: 'false', message: 'maintenance' },
		{ enabled: false },
		{ enabled: false, message: 503 }
	])('rejects malformed status payloads without enabling provisioning', async (payload) => {
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(payload)));

		await expect(getProvisioningStatus()).rejects.toThrow('Invalid provisioning status response');
	});

	it.each([
		[
			'create pod',
			() => createPod({ name: 'lab', vms: [] }),
			'/api/v1/pods'
		],
		[
			'deploy blueprint',
			() => deployBlueprint('blueprint-1', 'lab'),
			'/api/v1/blueprints/blueprint-1/deploy'
		],
		[
			'add VM',
			() => addVM('pod-1', { template_id: 'template-1', display_name: 'vm' }),
			'/api/v1/pods/pod-1/vms'
		]
	])('preserves authoritative maintenance errors for %s', async (_name, mutate, path) => {
		const body = {
			error: 'Provisioning is temporarily unavailable for maintenance.',
			request_id: 'request-123'
		};
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify(body), {
				status: 503,
				statusText: 'Service Unavailable',
				headers: { 'Retry-After': '300' }
			})
		);

		await expect(mutate()).rejects.toMatchObject({
			status: 503,
			body
		} satisfies Partial<ApiError>);
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining(path),
			expect.objectContaining({ method: 'POST', credentials: 'include' })
		);
	});
});
