import { describe, it, expect } from 'vitest';
import {
	resolveConsoleHelpers,
	type ConsoleHelperContext
} from './helpers';

function baseCtx(overrides: Partial<ConsoleHelperContext> = {}): ConsoleHelperContext {
	return {
		username: 'student',
		password: 's3cret',
		credentialsPending: false,
		vlanId: 102,
		subnet: '10.100.2.0/24',
		ipAddress: '',
		assignIp: true,
		skipGeneralize: false,
		templateKind: 'clone_with_customize',
		osType: 'linux',
		...overrides
	};
}

describe('resolveConsoleHelpers', () => {
	it('always includes a credentials section when username/password present', () => {
		const sections = resolveConsoleHelpers(baseCtx());
		const creds = sections.find((s) => s.id === 'credentials');
		expect(creds).toBeTruthy();
		expect(creds?.fields?.map((f) => f.id)).toEqual(['username', 'password']);
		expect(sections.find((s) => s.id === 'network')).toBeUndefined();
	});

	it('shows pending credentials body when empty and pending', () => {
		const sections = resolveConsoleHelpers(
			baseCtx({ username: '', password: '', credentialsPending: true })
		);
		const creds = sections.find((s) => s.id === 'credentials');
		expect(creds?.body).toMatch(/running/i);
		expect(creds?.fields).toBeUndefined();
	});

	it('includes network when skipGeneralize is true', () => {
		const sections = resolveConsoleHelpers(baseCtx({ skipGeneralize: true }));
		const network = sections.find((s) => s.id === 'network');
		expect(network).toBeTruthy();
		expect(network?.fields?.find((f) => f.id === 'vlan')?.value).toBe('102');
		expect(network?.fields?.find((f) => f.id === 'subnet')?.value).toBe('10.100.2.0/24');
		expect(network?.fields?.find((f) => f.id === 'observed-ip')).toBeUndefined();
	});

	it('includes network when assignIp is false', () => {
		const sections = resolveConsoleHelpers(baseCtx({ assignIp: false }));
		expect(sections.find((s) => s.id === 'network')).toBeTruthy();
	});

	it('adds observed IP when present on a network helper VM', () => {
		const sections = resolveConsoleHelpers(
			baseCtx({ skipGeneralize: true, ipAddress: '10.100.2.17' })
		);
		const network = sections.find((s) => s.id === 'network');
		expect(network?.fields?.find((f) => f.id === 'observed-ip')?.value).toBe('10.100.2.17');
	});

	it('omits network for generalized assign_ip templates', () => {
		const sections = resolveConsoleHelpers(
			baseCtx({ skipGeneralize: false, assignIp: true, ipAddress: '10.100.2.9' })
		);
		expect(sections.find((s) => s.id === 'network')).toBeUndefined();
	});
});
