import { describe, expect, it } from 'vitest';
import {
	eligibleSingleVMTemplates,
	emptySingleVMMessage,
	isolatedPods,
	isSharedPod,
	labEligibleTemplates,
	activeNavHref,
	podBackLink,
	podScopedId,
	quickAction,
	newEnvironmentHref,
	newEnvironmentLabel,
	showAddVM
} from './single-vm';

const templates = [
	{ id: 'normal', name: 'Ubuntu', is_active: true, template_state: 'active', visibility: 'public' },
	{ id: 'only', name: 'Windows', is_active: true, template_state: 'active', single_vm_only: true },
	{ id: 'draft', name: 'Draft', is_active: true, template_state: 'draft' },
	{ id: 'off', name: 'Off', is_active: false, template_state: 'active' },
	{ id: 'internal', name: 'Internal', is_active: true, template_state: 'active', is_internal: true },
	{ id: 'staff', name: 'Staff', is_active: true, template_state: 'active', visibility: 'instructor_only' },
	{ id: 'legacy', name: 'Legacy', is_active: true }
];

describe('single vm picker', () => {
	it('lists every eligible template, including Single VM only', () => {
		expect(emptySingleVMMessage).toContain('don’t have a VM');
		expect(newEnvironmentLabel).toBe('New environment');
		expect(newEnvironmentHref).toBe('/single-vm/new');
		const student = eligibleSingleVMTemplates(templates, 'student').map((t) => t.id);
		expect(student).toEqual(['normal', 'only', 'legacy']);
		const instructor = eligibleSingleVMTemplates(templates, 'instructor').map((t) => t.id);
		expect(instructor).toContain('staff');
		expect(eligibleSingleVMTemplates(templates, null).map((t) => t.id)).toContain('staff');
	});

	it('keeps Single VM only templates out of lab and blueprint pickers', () => {
		expect(labEligibleTemplates(templates).map((t) => t.id)).not.toContain('only');
		expect(labEligibleTemplates(templates).map((t) => t.id)).toContain('normal');
	});

	it('hides Add VM on a shared pod and points back at Single VM', () => {
		expect(isSharedPod('shared')).toBe(true);
		expect(isSharedPod('isolated')).toBe(false);
		expect(isSharedPod(undefined)).toBe(false);
		expect(showAddVM('shared')).toBe(false);
		expect(showAddVM(undefined)).toBe(true);
		expect(podBackLink('shared')).toEqual({ href: '/single-vm', label: 'Back to Single VM' });
		expect(podBackLink('isolated').href).toBe('/');
		expect(isolatedPods([{ network_mode: 'shared' }, { network_mode: 'isolated' }, {}])).toHaveLength(2);
	});

	it('uses New environment as the sidebar action', () => {
		expect(quickAction()).toEqual({ href: '/single-vm/new', label: 'New environment' });
	});

	it('keeps a shared pod on Single VM and an isolated pod on My Labs', () => {
		const shared = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
		expect(podScopedId('/single-vm')).toBeNull();
		expect(podScopedId('/pods')).toBeNull();
		expect(podScopedId('/pods/new')).toBeNull();
		expect(podScopedId(`/pods/${shared}`)).toBe(shared);
		expect(podScopedId(`/pods/${shared}/testing`)).toBe(shared);
		expect(podScopedId(`/console/${shared}/vm-1`)).toBe(shared);

		expect(activeNavHref('/single-vm', undefined)).toBe('/single-vm');
		expect(activeNavHref('/single-vm/new', undefined)).toBe('/single-vm');
		expect(activeNavHref('/', 'shared')).toBe('/');
		expect(activeNavHref('/pods', 'shared')).toBe('/');
		expect(activeNavHref('/pods/new', 'shared')).toBe('/');
		expect(activeNavHref(`/pods/${shared}`, 'shared')).toBe('/single-vm');
		expect(activeNavHref(`/pods/${shared}/testing/runs`, 'shared')).toBe('/single-vm');
		expect(activeNavHref(`/console/${shared}/vm-1`, 'shared')).toBe('/single-vm');
		expect(activeNavHref(`/pods/${shared}`, 'isolated')).toBe('/');
		expect(activeNavHref(`/pods/${shared}`, undefined)).toBe('/');
		expect(activeNavHref('/operations', 'shared')).toBeNull();
	});
});
