import { describe, expect, it } from 'vitest';
import { formatRunActionCall, getActionCallableIdentifier } from './actionInvocation';

describe('getActionCallableIdentifier', () => {
	it('converts a library action slug to the runner callable', () => {
		expect(
			getActionCallableIdentifier({
				slug: 'demo-http-service-reachable',
				action_type: 'inline'
			})
		).toBe('demo_http_service_reachable');
	});

	it('converts every hyphen in a slug', () => {
		expect(
			getActionCallableIdentifier({
				slug: 'check-multi-part-service-name',
				action_type: 'inline'
			})
		).toBe('check_multi_part_service_name');
	});

	it('leaves already-safe slugs unchanged', () => {
		expect(
			getActionCallableIdentifier({
				slug: 'demo_http_service_reachable',
				action_type: 'inline'
			})
		).toBe('demo_http_service_reachable');
	});

	it('preserves action type fallback for inline actions without a slug', () => {
		expect(
			getActionCallableIdentifier({
				action_type: 'inline'
			})
		).toBe('inline');
	});
});

describe('formatRunActionCall', () => {
	it('retains the display label and parameters while using the runner callable', () => {
		expect(
			formatRunActionCall(
				{
					name: 'DEMO - HTTP Service Reachable',
					slug: 'demo-http-service-reachable',
					action_type: 'inline'
				},
				[
					['port', 8080],
					['protocol', 'https']
				]
			)
		).toBe(
			'run_action "DEMO - HTTP Service Reachable" demo_http_service_reachable port="8080" protocol="https"'
		);
	});
});
