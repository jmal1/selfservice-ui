import type { Run } from '$lib/types';

function normalize(value?: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
	for (const value of values) {
		const normalized = normalize(value);
		if (normalized) return normalized;
	}
	return undefined;
}

export function formatRunActor(run: Pick<Run, 'triggered_by_display_name' | 'triggered_by_username'>): string {
	return firstNonEmpty(run.triggered_by_display_name, run.triggered_by_username) ?? '(unknown)';
}

export function formatRunTargetVm(
	run: Pick<Run, 'target_vm_name' | 'target_vm_ip'>
): { recorded: boolean; name: string; ip?: string } {
	const name = firstNonEmpty(run.target_vm_name);
	if (!name) return { recorded: false, name: '(not recorded)' };

	const ip = firstNonEmpty(run.target_vm_ip);
	return { recorded: true, name, ip };
}

export function formatRunPod(run: Pick<Run, 'pod_name' | 'pod_status'>): { label: string; deleted: boolean } {
	const label = firstNonEmpty(run.pod_name);
	const deletedStatus = run.pod_status === 'destroyed' || run.pod_status === 'deleted';
	if (!label) return { label: '(deleted)', deleted: true };
	return { label, deleted: deletedStatus };
}

export function formatRunPlaylist(run: Pick<Run, 'playlist_name'>): { label: string; deleted: boolean } {
	const label = firstNonEmpty(run.playlist_name);
	if (!label) return { label: '(deleted)', deleted: true };
	return { label, deleted: false };
}

export function formatRunScore(run: Pick<Run, 'earned_points' | 'total_points'>): string {
	if (run.earned_points == null || run.total_points == null) return '—';
	return `${run.earned_points} / ${run.total_points}`;
}

export function formatTimestamp(value?: string, fallback = '—'): string {
	const normalized = normalize(value);
	return normalized ? new Date(normalized).toLocaleString() : fallback;
}

export function formatDuration(ms?: number): string {
	if (ms == null) return '—';
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function statusIcon(status: string): string {
	switch (status) {
		case 'pass': return '✅';
		case 'fail': return '❌';
		case 'error': return '⚠️';
		case 'timeout': return '⏱️';
		case 'skipped': return '⏭️';
		case 'running': return '⏳';
		case 'pending': return '⏸️';
		default: return '•';
	}
}
