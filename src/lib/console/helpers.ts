// Extensible console helper registry. The student console page builds a
// ConsoleHelperContext from GET /pods/{id}, then resolveConsoleHelpers
// returns ordered sections for ConsoleHelperPanel. Add new helpers by
// registering another section builder — keep gating logic here, not in
// the Svelte markup.

import type { TemplateKind } from '$lib/types';

export interface ConsoleHelperField {
	id: string;
	label: string;
	value: string;
	copyable?: boolean;
	secret?: boolean;
}

export interface ConsoleHelperSection {
	id: string;
	title: string;
	priority: number;
	body?: string;
	fields?: ConsoleHelperField[];
}

export interface ConsoleHelperContext {
	username: string;
	password: string;
	credentialsPending: boolean;
	vlanId?: number | null;
	subnet?: string;
	ipAddress?: string;
	assignIp: boolean;
	skipGeneralize: boolean;
	templateKind: TemplateKind;
	osType: string;
}

function credentialsSection(ctx: ConsoleHelperContext): ConsoleHelperSection {
	if (ctx.username || ctx.password) {
		const fields: ConsoleHelperField[] = [];
		if (ctx.username) {
			fields.push({
				id: 'username',
				label: 'User',
				value: ctx.username,
				copyable: true
			});
		}
		if (ctx.password) {
			fields.push({
				id: 'password',
				label: 'Pass',
				value: ctx.password,
				copyable: true,
				secret: true
			});
		}
		return {
			id: 'credentials',
			title: 'Credentials',
			priority: 10,
			fields
		};
	}

	return {
		id: 'credentials',
		title: 'Credentials',
		priority: 10,
		body: ctx.credentialsPending
			? 'Credentials appear here when the VM is running and guest login is ready.'
			: 'No credentials are available for this VM yet.'
	};
}

function needsNetworkHelper(ctx: ConsoleHelperContext): boolean {
	return ctx.skipGeneralize || !ctx.assignIp;
}

function networkSection(ctx: ConsoleHelperContext): ConsoleHelperSection | null {
	if (!needsNetworkHelper(ctx)) return null;

	const fields: ConsoleHelperField[] = [];
	if (ctx.vlanId != null && ctx.vlanId !== 0) {
		fields.push({
			id: 'vlan',
			label: 'VLAN',
			value: String(ctx.vlanId),
			copyable: true
		});
	}
	if (ctx.subnet) {
		fields.push({
			id: 'subnet',
			label: 'Subnet',
			value: ctx.subnet,
			copyable: true
		});
	}
	if (ctx.ipAddress) {
		fields.push({
			id: 'observed-ip',
			label: 'Observed IP',
			value: ctx.ipAddress,
			copyable: true
		});
	}

	return {
		id: 'network',
		title: 'Network',
		priority: 20,
		body: 'This image was not generalized (or manages its own networking). Configure the guest NIC for DHCP on this lab network using the VLAN and subnet below. If an observed IP is listed, prefer that address.',
		fields: fields.length ? fields : undefined
	};
}

/** Pure registry — unit-test this; do not encode gating in the panel markup. */
export function resolveConsoleHelpers(ctx: ConsoleHelperContext): ConsoleHelperSection[] {
	const sections: ConsoleHelperSection[] = [credentialsSection(ctx)];
	const network = networkSection(ctx);
	if (network) sections.push(network);
	return sections.sort((a, b) => a.priority - b.priority);
}
