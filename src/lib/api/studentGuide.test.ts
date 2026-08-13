import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { studentGuideGetIndex, studentGuideGetPage } from './client';

describe('student guide API client', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('loads the student-only guide manifest', async () => {
		const manifest = {
			seeds: ['docs/student/overview.md'],
			files: [],
			total_bytes: 0
		};
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(manifest)));

		await expect(studentGuideGetIndex()).resolves.toEqual(manifest);
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/student-guide/index'),
			expect.objectContaining({ credentials: 'include' })
		);
	});

	it('loads a student guide page as markdown text', async () => {
		fetchSpy.mockResolvedValue(new Response('# My lab'));

		await expect(studentGuideGetPage('docs/student/labs.md')).resolves.toBe('# My lab');
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/student-guide/page/docs/student/labs.md'),
			{ credentials: 'include' }
		);
	});
});
