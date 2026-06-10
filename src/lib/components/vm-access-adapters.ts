// Phase H call-site adapter: converts a PodVM (the live student-pod
// state shape) into the generic VMAccessInfo shape consumed by
// VMAccessPanel. The wizard page builds its own VMAccessInfo from
// the wizard state response — keeping both in this same module makes
// it obvious that any new field on VMAccessInfo needs both call-site
// adapters updated.

import type { PodVM } from '$lib/types';
import type { VMAccessInfo } from '$lib/types/vm-access';
import type { WizardStateResponse } from '$lib/api/client';

export function podVMToAccessInfo(vm: PodVM): VMAccessInfo {
	return {
		osType: vm.os_type || vm.template?.os_type || '',
		ipAddress: vm.ip_address || '',
		vcenterVmId: vm.vcenter_vm_id,
		vcenterVmName: vm.vcenter_vm_name || '',
		// Prefer generated (per-pod) credentials over template defaults so
		// the student sees the actual creds they were assigned, not the
		// pre-customization defaults baked into the template.
		displayUsername: vm.generated_username || vm.default_username || '',
		displayPassword: vm.generated_password || vm.default_password || '',
		isPoweredOn: vm.status === 'running',
		consoleHref: `/console/${vm.pod_id}/${vm.id}`,
		templateKind: vm.template?.kind ?? 'clone_with_customize',
		noIpExpected: vm.template?.assign_ip === false,
	};
}

/**
 * Build a VMAccessInfo from a wizard-state response for the template
 * build VM. Returns `null` when there isn't a VM to access yet (no
 * vcenter_vm_id) so the wizard page can render nothing in early
 * states without the panel showing an empty shell.
 */
export function wizardStateToAccessInfo(
	state: WizardStateResponse
): VMAccessInfo | null {
	if (!state.vcenter_vm_id) return null;
	return {
		osType: state.os_type || '',
		ipAddress: state.build_vm_ip || '',
		vcenterVmId: state.vcenter_vm_id,
		vcenterVmName: state.build_vm_name || '',
		// Build VM has no per-pod customization — defaults are the truth.
		displayUsername: state.default_username || '',
		displayPassword: state.default_password || '',
		// VMware Tools running is a stronger signal than just powered-on
		// because the WMKS proxy requires the guest to be actually booted
		// to be useful; a powered-on VM stuck at the BIOS isn't worth
		// opening the Console button for. We still gate on PowerOn first
		// in case Tools never installs (some OS install ISOs).
		isPoweredOn: !!state.build_vm_power_on,
		consoleHref: `/admin/templates/${state.template_id}/console`,
		templateKind: state.template_kind ?? 'clone_with_customize',
		noIpExpected: state.assign_ip === false,
	};
}
