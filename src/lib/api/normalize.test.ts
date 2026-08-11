import { describe, it, expect } from 'vitest';
import { normalizeBlueprint } from './normalize';
import type { Blueprint } from '$lib/types';

// A blueprint object as it arrives from the API when it has zero VMs:
// the `vms` key is omitted (json:"vms,omitempty" on the Go side).
function blueprintWithoutVms(): Blueprint {
	return {
		id: 'a163794d-0a69-4238-8e0e-7d8319c137ec',
		name: 'AD Lab',
		description: '',
		allow_vm_additions: false,
		is_active: true,
		created_at: '2026-03-09T05:16:33Z',
		updated_at: '2026-08-11T01:37:42Z'
		// note: no `vms` key
	} as unknown as Blueprint;
}

describe('normalizeBlueprint', () => {
	it('defaults a missing vms key to an empty array (regression: crashed the blueprints tab)', () => {
		const bp = normalizeBlueprint(blueprintWithoutVms());
		expect(Array.isArray(bp.vms)).toBe(true);
		expect(bp.vms).toHaveLength(0);
		// The crash was bp.vms.reduce(...) on undefined — prove it no longer throws.
		expect(() => bp.vms.reduce((a, v) => a + v.quantity, 0)).not.toThrow();
	});

	it('coerces an explicit null vms to an empty array', () => {
		const bp = normalizeBlueprint({ ...blueprintWithoutVms(), vms: null as unknown as Blueprint['vms'] });
		expect(bp.vms).toEqual([]);
	});

	it('preserves a populated vms array unchanged', () => {
		const vms = [
			{
				id: 'vm-1',
				blueprint_id: 'a163794d-0a69-4238-8e0e-7d8319c137ec',
				template_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				display_name: 'Domain Controller',
				vcpus: 1,
				ram_mb: 1024,
				disk_gb: 20,
				boot_order: 0,
				quantity: 1
			}
		] as unknown as Blueprint['vms'];
		const bp = normalizeBlueprint({ ...blueprintWithoutVms(), vms });
		expect(bp.vms).toBe(vms);
		expect(bp.vms).toHaveLength(1);
	});
});
