export function describeAudit(action: string, details?: Record<string, unknown> | null): string {
	const d = details ?? {};
	if (action === 'api.request') {
		const method = text(d, 'method');
		const path = text(d, 'path');
		if (method && path && (typeof d.status === 'number' || typeof d.status === 'string')) {
			return `${method} ${path} → ${d.status}`;
		}
		if (method && path) return `${method} ${path}`;
		return action;
	}
	if (action === 'pod.delete' && text(d, 'mode') === 'cancelled') {
		const name = text(d, 'pod_name');
		return name ? `Cancelled pod “${name}”` : 'Cancelled a pod';
	}

	const verb = verbs[action];
	if (!verb) {
		const extra = text(d, 'pod_name') || text(d, 'name') || text(d, 'path');
		return extra ? `${action} · ${extra}` : action;
	}
	if (action.startsWith('pod.')) {
		return withName(verb, text(d, 'pod_name'));
	}
	if (action.startsWith('vm.snapshot.')) {
		return withName(verb, text(d, 'name'));
	}
	return verb.bare;
}

const verbs: Record<string, { bare: string; named: string }> = {
	'auth.login': { bare: 'Signed in', named: 'Signed in' },
	'auth.logout': { bare: 'Signed out', named: 'Signed out' },
	'auth.login_failed': { bare: 'Sign-in failed', named: 'Sign-in failed' },
	'pod.create': { bare: 'Created a pod', named: 'Created pod' },
	'pod.delete': { bare: 'Deleted a pod', named: 'Deleted pod' },
	'pod.extend': { bare: 'Extended a pod', named: 'Extended pod' },
	'pod.admin_extend': { bare: 'Extended a pod', named: 'Extended pod' },
	'pod.finalize_orphaned_destroy': { bare: 'Finalized an orphaned pod destroy', named: 'Finalized orphaned destroy' },
	'vm.add': { bare: 'Added a VM', named: 'Added a VM' },
	'vm.delete': { bare: 'Deleted a VM', named: 'Deleted a VM' },
	'vm.start': { bare: 'Started a VM', named: 'Started a VM' },
	'vm.stop': { bare: 'Stopped a VM', named: 'Stopped a VM' },
	'vm.restart': { bare: 'Restarted a VM', named: 'Restarted a VM' },
	'vm.reset': { bare: 'Reset a VM', named: 'Reset a VM' },
	'console.open': { bare: 'Opened the console', named: 'Opened the console' },
	'console.close': { bare: 'Closed the console', named: 'Closed the console' },
	'template.console.open': { bare: 'Opened a template console', named: 'Opened a template console' },
	'template.console.close': { bare: 'Closed a template console', named: 'Closed a template console' },
	'vm.snapshot.create': { bare: 'Created a snapshot', named: 'Created snapshot' },
	'vm.snapshot.delete': { bare: 'Deleted a snapshot', named: 'Deleted snapshot' },
	'vm.snapshot.revert': { bare: 'Reverted a snapshot', named: 'Reverted snapshot' }
};

function withName(verb: { bare: string; named: string }, name: string): string {
	return name ? `${verb.named} “${name}”` : verb.bare;
}

function text(details: Record<string, unknown>, key: string): string {
	const value = details[key];
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}
