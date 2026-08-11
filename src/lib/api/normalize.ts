import type { Blueprint } from '$lib/types';

/**
 * Ensure a blueprint's `vms` is always an array.
 *
 * The API serializes blueprint VMs with `json:"vms,omitempty"`, so a blueprint
 * with zero VMs comes back with the `vms` key omitted entirely. Callers that
 * iterate `bp.vms` (e.g. the admin blueprints page's `bp.vms.reduce(...)`)
 * would then throw `TypeError: Cannot read properties of undefined`, which
 * crashes the whole SvelteKit render until a hard reload.
 */
export function normalizeBlueprint(bp: Blueprint): Blueprint {
	return { ...bp, vms: bp.vms ?? [] };
}
