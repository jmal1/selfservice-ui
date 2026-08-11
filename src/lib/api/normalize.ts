import type { Blueprint, Pod, Workflow, Playlist, Run } from '$lib/types';

/**
 * Coerce a value that *should* be an array into one.
 *
 * The Go API serializes empty slices with `json:"...,omitempty"`, so a
 * resource with zero children comes back with the key omitted entirely (or,
 * for some list endpoints, as a bare `null`). UI code that iterates the field
 * (`.map` / `.reduce` / `.forEach` / `{#each}`) would then throw
 * `TypeError: Cannot read properties of undefined`. Before error boundaries
 * existed that single throw blanked the entire SPA (the Blueprints outage).
 *
 * `asArray` is the belt to the error boundary's suspenders: it guarantees the
 * field is iterable regardless of what the server sent (undefined, null, or a
 * non-array), so the common case never reaches an error boundary at all.
 */
export function asArray<T>(value: T[] | null | undefined): T[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Ensure a blueprint's `vms` is always an array.
 *
 * See {@link asArray}. `bp.vms` is declared `json:"vms,omitempty"` server-side,
 * so a blueprint with zero VMs omits the key entirely and the admin blueprints
 * page's `bp.vms.reduce(...)` would crash.
 */
export function normalizeBlueprint(bp: Blueprint): Blueprint {
	return { ...bp, vms: asArray(bp?.vms) };
}

/**
 * Ensure a pod's `vms` is always an array. `Pod.VMs` is `json:"vms,omitempty"`.
 */
export function normalizePod(pod: Pod): Pod {
	return { ...pod, vms: asArray(pod?.vms) };
}

/**
 * Ensure a workflow's `actions` is always an array. `Workflow.Actions` is
 * `json:"actions,omitempty"` and is iterated on the busiest admin surfaces
 * (admin/workflows, the job panel), so a workflow with no actions must not
 * crash those blades.
 */
export function normalizeWorkflow(wf: Workflow): Workflow {
	return { ...wf, actions: asArray(wf?.actions) };
}

/**
 * Ensure a playlist's `workflows` is always an array (and each nested workflow
 * is itself normalized). `Playlist.Workflows` is omitempty.
 */
export function normalizePlaylist(pl: Playlist): Playlist {
	return { ...pl, workflows: asArray(pl?.workflows).map(normalizeWorkflow) };
}

/**
 * Ensure a run's `results` is always an array. `WorkflowRunWithResults.Results`
 * is `json:"results,omitempty"` and is iterated on the assessment results view.
 */
export function normalizeRun(run: Run): Run {
	return { ...run, results: asArray(run?.results) };
}
