import { describe, it, expect } from 'vitest';
import {
	normalizeBlueprint,
	normalizePod,
	normalizeWorkflow,
	normalizePlaylist,
	normalizeRun,
	asArray
} from './normalize';
import type { Blueprint, Pod, Workflow, Playlist, Run } from '$lib/types';

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
		expect(bp.vms).toHaveLength(1);
		expect(bp.vms[0].display_name).toBe('Domain Controller');
	});
});

// --- Fault-injection ("chaos") suite ---------------------------------------
//
// The audience is high-schoolers on an internet-exposed site, so malformed,
// empty, and null API payloads are *expected* inputs, not edge cases. Every
// normalizer must turn a degenerate response into something the UI can iterate
// without throwing. These tests feed each normalizer the shapes a flaky/edge
// API actually produces (`omitempty` key missing, explicit null, wrong type)
// and assert the iterated field is always a real array and nothing throws.

// The shapes an array-typed field can arrive as from a real (or misbehaving)
// backend. `[]` and a populated array are the happy paths; the rest are the
// crash triggers the error boundary used to have to catch.
const badArrayValues: unknown[] = [undefined, null, {}, 'oops', 42, true, NaN];

describe('asArray (fault injection)', () => {
	it.each(badArrayValues)('coerces non-array %p to []', (v) => {
		expect(asArray(v as unknown[])).toEqual([]);
	});

	it('returns the same reference for a real array (no needless copy)', () => {
		const arr = [1, 2, 3];
		expect(asArray(arr)).toBe(arr);
	});
});

describe('normalizeWorkflow (fault injection)', () => {
	const base = { id: 'w1', name: 'Recon', slug: 'recon' } as unknown as Workflow;

	it.each(badArrayValues)('missing/invalid actions (%p) becomes an iterable []', (v) => {
		const wf = normalizeWorkflow({ ...base, actions: v as Workflow['actions'] });
		expect(Array.isArray(wf.actions)).toBe(true);
		// The admin/workflows + JobPanel blades do wf.actions.map(...) / {#each}.
		expect(() => wf.actions!.map((a) => a.id)).not.toThrow();
	});

	it('preserves populated actions', () => {
		const actions = [{ id: 'a1' }, { id: 'a2' }] as unknown as Workflow['actions'];
		expect(normalizeWorkflow({ ...base, actions }).actions).toHaveLength(2);
	});
});

describe('normalizePlaylist (fault injection)', () => {
	const base = { id: 'p1', name: 'Intro', slug: 'intro' } as unknown as Playlist;

	it.each(badArrayValues)('missing/invalid workflows (%p) becomes an iterable []', (v) => {
		const pl = normalizePlaylist({ ...base, workflows: v as Playlist['workflows'] });
		expect(Array.isArray(pl.workflows)).toBe(true);
		expect(() => pl.workflows!.map((w) => w.id)).not.toThrow();
	});

	it('normalizes nested workflows so their actions are also arrays', () => {
		const pl = normalizePlaylist({
			...base,
			workflows: [{ id: 'w1', name: 'x', slug: 'x' }] as unknown as Playlist['workflows']
		});
		expect(pl.workflows![0].actions).toEqual([]);
	});
});

describe('normalizeRun (fault injection)', () => {
	const base = { id: 'r1', pod_id: 'pod1' } as unknown as Run;

	it.each(badArrayValues)('missing/invalid results (%p) becomes an iterable []', (v) => {
		const run = normalizeRun({ ...base, results: v as Run['results'] });
		expect(Array.isArray(run.results)).toBe(true);
		expect(() => run.results!.map((r) => r.id)).not.toThrow();
	});
});

describe('normalizePod (fault injection)', () => {
	const base = { id: 'pod1', name: 'lab' } as unknown as Pod;

	it.each(badArrayValues)('missing/invalid vms (%p) becomes an iterable []', (v) => {
		const pod = normalizePod({ ...base, vms: v as Pod['vms'] });
		expect(Array.isArray(pod.vms)).toBe(true);
		expect(() => pod.vms.map((vm) => vm.id)).not.toThrow();
	});
});

describe('normalizeBlueprint (fault injection)', () => {
	it.each(badArrayValues)('missing/invalid vms (%p) becomes an iterable []', (v) => {
		const bp = normalizeBlueprint({ ...blueprintWithoutVms(), vms: v as Blueprint['vms'] });
		expect(Array.isArray(bp.vms)).toBe(true);
		expect(() => bp.vms.reduce((a, x) => a + (x.quantity ?? 0), 0)).not.toThrow();
	});
});
