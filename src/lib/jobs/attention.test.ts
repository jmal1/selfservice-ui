import { describe, expect, it } from 'vitest';
import type { Job } from '$lib/types';
import { attentionCount, attentionLabel, attentionSummary, opensPanel, visibleJobs } from './attention';

const NOW = Date.parse('2026-10-02T20:00:00Z');
const HOUR = 60 * 60 * 1000;

function job(over: Partial<Job> & Pick<Job, 'id' | 'status'>): Job {
	return {
		type: 'pod_create',
		payload: {},
		claimed_by: '',
		started_at: '',
		completed_at: '',
		result: {},
		rollback_steps: [],
		created_at: new Date(NOW - 5 * 60 * 1000).toISOString(),
		...over
	};
}

describe('job attention', () => {
	it('counts in-flight work and recent failures, not finished successes', () => {
		const jobs = [
			job({ id: 'pend', status: 'pending' }),
			job({ id: 'claim', status: 'claimed' }),
			job({ id: 'run', status: 'in_progress' }),
			job({ id: 'roll', status: 'rollback' }),
			job({ id: 'ok', status: 'completed', completed_at: new Date(NOW - 1000).toISOString() }),
			job({ id: 'bad', status: 'failed', completed_at: new Date(NOW - 1000).toISOString() }),
			job({ id: 'old', status: 'failed', completed_at: new Date(NOW - HOUR).toISOString() })
		];
		expect(attentionSummary(jobs, NOW)).toEqual({ inFlight: 4, failed: 1, total: 5 });
		expect(attentionCount(jobs, NOW)).toBe(5);
		expect(visibleJobs(jobs, NOW, new Set()).map((j) => j.id)).toEqual([
			'pend',
			'claim',
			'run',
			'roll',
			'bad'
		]);
	});

	it('keeps a failed job that has no completion time, and every recent failure', () => {
		const failed = Array.from({ length: 4 }, (_, i) =>
			job({
				id: `f${i}`,
				status: 'failed',
				completed_at: new Date(NOW - (i + 1) * 1000).toISOString()
			})
		);
		const jobs = [
			...failed,
			job({ id: 'untimed', status: 'failed', completed_at: '' }),
			job({ id: 'done', status: 'completed', completed_at: new Date(NOW - 1000).toISOString() })
		];
		const ids = visibleJobs(jobs, NOW, new Set()).map((j) => j.id);
		expect(ids).toEqual(['f0', 'f1', 'f2', 'f3', 'untimed']);
		expect(attentionCount(jobs, NOW)).toBe(5);
	});

	it('shows a completion only while it is flashing, and does not count it', () => {
		const done = job({ id: 'ok', status: 'completed', completed_at: new Date(NOW - 1000).toISOString() });
		expect(visibleJobs([done], NOW, new Set())).toEqual([]);
		expect(visibleJobs([done], NOW, new Set(['ok'])).map((j) => j.id)).toEqual(['ok']);
		expect(attentionCount([done], NOW)).toBe(0);
		expect(opensPanel('completed')).toBe(false);
		expect(opensPanel('failed')).toBe(true);
		expect(opensPanel('in_progress')).toBe(true);
	});

	it('names the My Labs link from what still needs attention', () => {
		expect(attentionLabel({ inFlight: 1, failed: 0, total: 1 })).toBe(
			'1 operation in progress — view Current Operations'
		);
		expect(attentionLabel({ inFlight: 2, failed: 0, total: 2 })).toBe(
			'2 operations in progress — view Current Operations'
		);
		expect(attentionLabel({ inFlight: 0, failed: 1, total: 1 })).toBe(
			'1 operation failed — view Current Operations'
		);
		expect(attentionLabel({ inFlight: 1, failed: 2, total: 3 })).toBe(
			'1 operation in progress, 2 failed — view Current Operations'
		);
	});
});
