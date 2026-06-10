// Phase H: shared shape for the VMAccessPanel component. Both the
// student pod page and the template-build wizard build one of these
// from their own state and pass it in, so the panel itself stays
// stateless and reusable.
//
// IMPORTANT: keep the call-site adapters (e.g. podVMToAccessInfo
// in src/routes/pods/[id]/+page.svelte, and the wizard page) honest —
// they're the only place the shape conversion happens. If you add a
// field here, both adapters need to learn how to fill it.

import type { TemplateKind } from './index';

export interface VMAccessInfo {
	/** OS string used to pick SSH vs RDP. Case-insensitive substring
	 *  match: "linux"/"ubuntu"/"centos"/"debian" → SSH, "windows" → RDP,
	 *  anything else → generic IP-only view. */
	osType: string;

	/** Guest IP. Empty string while VMware Tools hasn't reported one or
	 *  when the template has assign_ip=false. */
	ipAddress: string;

	/** vCenter VM moref (vm-NNNN). When present, the panel surfaces the
	 *  Console button (gated by consoleHref + isPoweredOn). */
	vcenterVmId?: string;

	/** Friendly VM name used as the .rdp download filename. Falls back
	 *  to a generic stem if empty. */
	vcenterVmName: string;

	/** Username shown in the SSH/RDP command and credentials row. May
	 *  be empty when the template has no defaults and no per-VM
	 *  credentials have been generated yet. */
	displayUsername: string;

	/** Password shown (masked) in the credentials row. May be empty;
	 *  the panel hides the Show/Copy controls in that case. */
	displayPassword: string;

	/** Drives whether the Console button is clickable. We don't try to
	 *  attach to a powered-off VM since WMKS would just bounce. */
	isPoweredOn: boolean;

	/** Destination for the Console button. When undefined, the button
	 *  is hidden — this is how callers opt out of the console entirely. */
	consoleHref?: string;

	/** Drives the "shared credentials" / "no per-pod customization"
	 *  hints at the bottom of the panel. Defaults to clone_with_customize
	 *  at the call site if the template isn't loaded yet. */
	templateKind: TemplateKind;

	/** Set when the template has assign_ip=false. The panel renders a
	 *  hint telling the user to use the console to find the IP because
	 *  the provisioner skipped WaitForIP intentionally. */
	noIpExpected: boolean;
}
