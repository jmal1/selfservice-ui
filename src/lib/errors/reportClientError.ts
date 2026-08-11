/**
 * Centralized client-side error reporting.
 *
 * Context: the Blueprints outage was a single render-time `TypeError`
 * (`bp.vms.reduce` on an omitted array) that crashed the entire SvelteKit
 * client — every "blade" went blank until a hard reload. There was no error
 * boundary and no `handleError` hook, so one throw took down the whole app.
 *
 * This module is the single sink for client errors caught by the render-time
 * `<svelte:boundary>` (see ErrorBoundary.svelte) and by SvelteKit's
 * `handleError` hook (see hooks.client.ts). It is intentionally dependency-free
 * and side-effect-light so it is trivially unit-testable. Wiring these reports
 * to a metrics/ingestion endpoint is a tracked follow-up (Reliability
 * Hardening on the Roadmap).
 */

export type ClientErrorSource = 'render-boundary' | 'sveltekit-hook' | 'unhandled';

export interface ClientErrorReport {
	error: unknown;
	source: ClientErrorSource;
	path?: string;
	info?: Record<string, unknown>;
}

/**
 * Best-effort extraction of a human-readable message from an unknown throw.
 * Never throws itself — a reporter that can crash defeats its own purpose.
 */
export function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message || error.name || 'Error';
	if (typeof error === 'string') return error;
	if (error == null) return 'Unknown error';
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

let clientErrorCount = 0;

/** Number of client errors reported this session (used by tests + future metrics). */
export function getClientErrorCount(): number {
	return clientErrorCount;
}

/** Reset the counter. Test-only helper. */
export function __resetClientErrorCount(): void {
	clientErrorCount = 0;
}

/**
 * Record a client-side error. Safe to call from anywhere; swallows its own
 * failures so error handling can never itself become a source of crashes.
 */
export function reportClientError(report: ClientErrorReport): void {
	clientErrorCount += 1;
	try {
		// Structured, greppable console error. Kept as console.error so it is
		// visible in the browser and captured by any log forwarder.
		// eslint-disable-next-line no-console
		console.error('[crucible:client-error]', {
			source: report.source,
			path: report.path,
			message: toErrorMessage(report.error),
			info: report.info,
			error: report.error
		});
	} catch {
		// Never let reporting throw.
	}
}
