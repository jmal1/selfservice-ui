import type { Job } from '$lib/types';

/** Finished successes leave after two flashes of about 0.8s each. */
export const SUCCESS_FLASH_MS = 1600;

const ATTENTION_WINDOW_MS = 60 * 60 * 1000;

const IN_FLIGHT = new Set(['pending', 'claimed', 'in_progress', 'rollback']);

export interface AttentionSummary {
	inFlight: number;
	failed: number;
	total: number;
}

function completedAt(job: Job): number | null {
	if (!job.completed_at) return null;
	const at = new Date(job.completed_at).getTime();
	return Number.isNaN(at) ? null : at;
}

function withinWindow(job: Job, now: number): boolean {
	const at = completedAt(job);
	if (at === null) return true;
	return now - at < ATTENTION_WINDOW_MS;
}

export function isInFlight(status: string): boolean {
	return IN_FLIGHT.has(status);
}

/** A new in-flight or failed job may open the panel. A success must not. */
export function opensPanel(status: string): boolean {
	return isInFlight(status) || status === 'failed';
}

export function attentionSummary(jobs: Job[], now: number): AttentionSummary {
	let inFlight = 0;
	let failed = 0;
	for (const job of jobs) {
		if (isInFlight(job.status)) inFlight += 1;
		else if (job.status === 'failed' && withinWindow(job, now)) failed += 1;
	}
	return { inFlight, failed, total: inFlight + failed };
}

export function attentionCount(jobs: Job[], now: number): number {
	return attentionSummary(jobs, now).total;
}

/**
 * Jobs the panel should render. Completed rows appear only while their id is
 * in `flashing`, and only so the open panel can flash green before they leave.
 * Failures in the last hour are not capped, so successes cannot push them out.
 */
export function visibleJobs(jobs: Job[], now: number, flashing: ReadonlySet<string>): Job[] {
	const inFlight = jobs
		.filter((job) => isInFlight(job.status))
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	const failed = jobs
		.filter((job) => job.status === 'failed' && withinWindow(job, now))
		.sort((a, b) => (completedAt(b) ?? 0) - (completedAt(a) ?? 0));
	const flashingDone = jobs.filter((job) => job.status === 'completed' && flashing.has(job.id));
	return [...inFlight, ...failed, ...flashingDone];
}

export function attentionLabel(summary: AttentionSummary): string {
	const noun = (n: number) => (n === 1 ? 'operation' : 'operations');
	if (summary.inFlight > 0 && summary.failed > 0) {
		return `${summary.inFlight} ${noun(summary.inFlight)} in progress, ${summary.failed} failed — view Current Operations`;
	}
	if (summary.failed > 0) {
		return `${summary.failed} ${noun(summary.failed)} failed — view Current Operations`;
	}
	return `${summary.inFlight} ${noun(summary.inFlight)} in progress — view Current Operations`;
}
