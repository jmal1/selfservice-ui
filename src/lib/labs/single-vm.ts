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

export function podBackLink(networkMode: string | undefined): { href: string; label: string } {
	if (isSharedPod(networkMode)) return { href: '/single-vm', label: 'Back to Single VM' };
	return { href: '/', label: 'Back to My Labs' };
}

export function quickAction(): { href: string; label: string } {
	return { href: newEnvironmentHref, label: newEnvironmentLabel };
}
