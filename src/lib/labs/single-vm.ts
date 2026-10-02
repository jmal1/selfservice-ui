export const emptySingleVMMessage = 'You don’t have a VM yet.';
export const newEnvironmentLabel = 'New environment';
export const newEnvironmentHref = '/single-vm/new';

export interface PickerTemplate {
	id: string;
	name: string;
	is_active?: boolean;
	template_state?: string;
	is_internal?: boolean;
	visibility?: string;
	single_vm_only?: boolean;
}

export function eligibleSingleVMTemplates<T extends PickerTemplate>(
	templates: T[],
	role: string | null | undefined
): T[] {
	return templates.filter((template) => {
		if (template.is_active === false) return false;
		if (template.template_state && template.template_state !== 'active') return false;
		if (template.is_internal) return false;
		if (role === 'student' && template.visibility === 'instructor_only') return false;
		return true;
	});
}

export function labEligibleTemplates<T extends PickerTemplate>(templates: T[]): T[] {
	return templates.filter((template) => template.single_vm_only !== true);
}

export function isSharedPod(networkMode: string | undefined): boolean {
	return networkMode === 'shared';
}

export function isolatedPods<T extends { network_mode?: string }>(pods: T[]): T[] {
	return pods.filter((pod) => !isSharedPod(pod.network_mode));
}

export function showAddVM(networkMode: string | undefined): boolean {
	return !isSharedPod(networkMode);
}

export function podBackLink(networkMode: string | undefined): { href: '/' | '/single-vm'; label: string } {
	if (isSharedPod(networkMode)) return { href: '/single-vm', label: 'Back to Single VM' };
	return { href: '/', label: 'Back to My Labs' };
}

// Pod detail, its assessment pages, and the VM console share /pods/{id} and
// /console/{podId}. Those stay in whichever dashboard owns the pod. /pods/new
// and the labs list stay on My Labs.
export function podScopedId(pathname: string): string | null {
	const pods = pathname.match(/^\/pods\/([^/]+)/);
	if (pods && pods[1] !== 'new') return pods[1];
	const consolePath = pathname.match(/^\/console\/([^/]+)/);
	if (consolePath) return consolePath[1];
	return null;
}

export function activeNavHref(pathname: string, networkMode: string | undefined): '/' | '/single-vm' | null {
	if (pathname === '/single-vm' || pathname.startsWith('/single-vm/')) return '/single-vm';
	if (pathname === '/' || pathname === '/pods' || pathname === '/pods/new' || pathname.startsWith('/pods/new/')) return '/';
	if (podScopedId(pathname)) return podBackLink(networkMode).href;
	return null;
}

export function quickAction(): { href: string; label: string } {
	return { href: newEnvironmentHref, label: newEnvironmentLabel };
}
