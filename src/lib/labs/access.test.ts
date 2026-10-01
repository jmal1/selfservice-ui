import { describe, expect, it } from 'vitest';
import type { User } from '$lib/types';
import {
	accessPatch,
	isolatedLabsDeniedMessage,
	labsClosed,
	labsPageDenied,
	retainsIsolatedLab,
	sessionUser,
	showDeploy,
	showMyLabs,
	studentAccessEditable,
	templateUpdateError
} from './access';

const student = (over: Partial<User> = {}): User =>
	({ role: 'student', labs_enabled: false, labs_require_grant: true, ...over }) as User;

describe('labs access', () => {
	it('names the denial students see', () => {
		expect(isolatedLabsDeniedMessage).toContain('not enabled');
	});

	it('closes labs only for an ungranted student when the session requires a grant', () => {
		expect(labsClosed(null)).toBe(false);
		expect(labsClosed(undefined)).toBe(false);
		expect(labsClosed(student({ labs_require_grant: false }))).toBe(false);
		expect(labsClosed(student({ labs_require_grant: undefined }))).toBe(false);
		expect(labsClosed(student({ role: 'instructor', labs_enabled: false }))).toBe(false);
		expect(labsClosed(student({ role: 'admin', labs_enabled: false }))).toBe(false);
		expect(labsClosed(student({ labs_enabled: true }))).toBe(false);
		expect(labsClosed(student())).toBe(true);
		expect(labsClosed(student({ labs_enabled: undefined }))).toBe(true);
	});

	it('hides deploy with the labs gate and keeps My Labs when an isolated pod remains', () => {
		expect(showDeploy(student({ labs_require_grant: false }))).toBe(true);
		expect(showDeploy(student())).toBe(false);
		expect(showMyLabs(student({ labs_require_grant: false }), false)).toBe(true);
		expect(showMyLabs(student(), false)).toBe(false);
		expect(showMyLabs(student(), true)).toBe(true);
	});

	it('counts a missing network mode as an isolated lab and ignores destroyed or shared pods', () => {
		expect(retainsIsolatedLab([])).toBe(false);
		expect(retainsIsolatedLab([{ status: 'destroyed' }])).toBe(false);
		expect(retainsIsolatedLab([{ status: 'destroyed', network_mode: 'shared' }])).toBe(false);
		expect(retainsIsolatedLab([{ status: 'active', network_mode: 'shared' }])).toBe(false);
		expect(retainsIsolatedLab([{ status: 'active' }])).toBe(true);
		expect(retainsIsolatedLab([{ status: 'active', network_mode: 'isolated' }])).toBe(true);
	});

	it('explains a closed labs page only after the pod list has loaded', () => {
		expect(labsPageDenied(student(), [], true)).toBe(false);
		expect(labsPageDenied(student({ labs_require_grant: false }), [], false)).toBe(false);
		expect(labsPageDenied(student(), [{ status: 'active' }], false)).toBe(false);
		expect(labsPageDenied(student(), [], false)).toBe(true);
	});

	it('edits the grant only for students and rejects a limit outside 0 to 3', () => {
		expect(studentAccessEditable('student')).toBe(true);
		expect(studentAccessEditable('instructor')).toBe(false);
		expect(studentAccessEditable('admin')).toBe(false);
		expect(accessPatch(true, 1)).toEqual({ ok: true, labs_enabled: true, max_single_vms: 1 });
		expect(accessPatch(false, 0).ok).toBe(true);
		expect(accessPatch(true, 3).ok).toBe(true);
		expect(accessPatch(true, -1).ok).toBe(false);
		expect(accessPatch(true, 4).ok).toBe(false);
		expect(accessPatch(true, 1.5).ok).toBe(false);
	});

	it('copies the grant onto the session user from the auth envelope', () => {
		const nested = sessionUser({
			user: { id: 'u', role: 'student', labs_enabled: true } as User,
			limits: { max_pods: 2 } as User['limits'],
			labs_require_grant: true
		});
		expect(nested.labs_require_grant).toBe(true);
		expect(nested.labs_enabled).toBe(true);
		expect(nested.limits?.max_pods).toBe(2);

		const flat = sessionUser({ id: 'u', role: 'student' } as User);
		expect(flat.labs_require_grant).toBe(false);
		expect(flat.labs_enabled).toBe(false);
		expect(flat.limits).toBeUndefined();
	});

	it('keeps a blueprint conflict and uses the stale-edit copy for every other update failure', () => {
		expect(templateUpdateError('template "Ubuntu" is used by blueprints: Lab A')).toContain(
			'blueprints'
		);
		expect(templateUpdateError('')).toContain('another admin');
		expect(templateUpdateError('template was modified')).toContain('another admin');
	});
});
