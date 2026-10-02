import type { RoleLimits, User } from '$lib/types';

export const isolatedLabsDeniedMessage = 'Isolated labs are not enabled for this account.';

const staleTemplateMessage =
	'This template was modified by another admin since you opened the edit form. Cancel and re-open the row to load the latest version, then re-apply your changes.';

export interface LabsSession {
	role?: string;
	labs_enabled?: boolean;
	labs_require_grant?: boolean;
}

interface MeEnvelope {
	user?: User;
	limits?: RoleLimits;
	labs_require_grant?: boolean;
}

export function labsClosed(user: LabsSession | null | undefined): boolean {
	if (!user || user.labs_require_grant !== true) return false;
	if (user.role === 'instructor' || user.role === 'admin') return false;
	return user.labs_enabled !== true;
}

export function showDeploy(user: LabsSession | null | undefined): boolean {
	return !labsClosed(user);
}

export function retainsIsolatedLab(
	pods: { status: string; network_mode?: string }[]
): boolean {
	return pods.some((pod) => pod.status !== 'destroyed' && pod.network_mode !== 'shared');
}

export function showMyLabs(user: LabsSession | null | undefined, ownsIsolatedPod: boolean): boolean {
	if (!labsClosed(user)) return true;
	return ownsIsolatedPod;
}

// defaultHome is the page every signed-in user can open. Students without a
// labs grant land on Single VM. My Labs stays the home for everyone else.
export function defaultHome(user: LabsSession | null | undefined, ownsIsolatedPod: boolean): '/' | '/single-vm' {
	if (showMyLabs(user, ownsIsolatedPod)) return '/';
	return '/single-vm';
}

export function labsPageDenied(
	user: LabsSession | null | undefined,
	pods: { status: string; network_mode?: string }[],
	loading: boolean
): boolean {
	if (loading || !labsClosed(user)) return false;
	return !retainsIsolatedLab(pods);
}

export function studentAccessEditable(role: string): boolean {
	return role !== 'instructor' && role !== 'admin';
}

export function accessPatch(
	labsEnabled: boolean,
	maxSingleVMs: number
): { ok: true; labs_enabled: boolean; max_single_vms: number } | { ok: false; error: string } {
	if (!Number.isInteger(maxSingleVMs) || maxSingleVMs < 0 || maxSingleVMs > 3) {
		return { ok: false, error: 'Single VM limit must be a whole number from 0 to 3' };
	}
	return { ok: true, labs_enabled: labsEnabled, max_single_vms: maxSingleVMs };
}

export function sessionUser(data: MeEnvelope | User): User {
	const envelope = data as MeEnvelope;
	const nested = envelope.user ?? (data as User);
	return {
		...nested,
		limits: envelope.limits ?? nested.limits,
		labs_require_grant: envelope.labs_require_grant === true,
		labs_enabled: nested.labs_enabled === true
	};
}

export function templateUpdateError(serverMessage: string): string {
	if (serverMessage.includes('blueprints')) return serverMessage;
	return staleTemplateMessage;
}
