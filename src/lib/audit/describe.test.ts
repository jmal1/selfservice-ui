import { describe, expect, it } from 'vitest';
import { describeAudit } from './describe';

describe('describeAudit', () => {
	it('names a deleted pod', () => {
		expect(describeAudit('pod.delete', { pod_name: 'week-3-lab' })).toBe('Deleted pod “week-3-lab”');
	});

	it('says a pod was cancelled before it was provisioned', () => {
		expect(describeAudit('pod.delete', { mode: 'cancelled', pod_name: 'week-3-lab' })).toBe(
			'Cancelled pod “week-3-lab”'
		);
	});

	it('renders a raw HTTP row from its method, path, and status', () => {
		expect(describeAudit('api.request', { method: 'POST', path: '/api/v1/pods', status: 201 })).toBe(
			'POST /api/v1/pods → 201'
		);
	});

	it('keeps an unknown action and the first useful detail', () => {
		expect(describeAudit('template.publish', { name: 'Ubuntu' })).toBe('template.publish · Ubuntu');
	});

	it('falls back to the action when nothing else is known', () => {
		expect(describeAudit('auth.login', {})).toBe('Signed in');
		expect(describeAudit('pod.create', {})).toBe('Created a pod');
	});
});
