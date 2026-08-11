import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	reportClientError,
	toErrorMessage,
	getClientErrorCount,
	__resetClientErrorCount
} from './reportClientError';

describe('toErrorMessage', () => {
	it('extracts the message from an Error', () => {
		expect(toErrorMessage(new Error('boom'))).toBe('boom');
	});

	it('returns plain strings as-is', () => {
		expect(toErrorMessage('bad thing')).toBe('bad thing');
	});

	it('handles null and undefined', () => {
		expect(toErrorMessage(null)).toBe('Unknown error');
		expect(toErrorMessage(undefined)).toBe('Unknown error');
	});

	it('serializes plain objects', () => {
		expect(toErrorMessage({ code: 42 })).toBe('{"code":42}');
	});

	it('never throws on circular structures', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => toErrorMessage(circular)).not.toThrow();
	});
});

describe('reportClientError', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		__resetClientErrorCount();
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('increments the counter and logs a structured payload', () => {
		reportClientError({
			error: new Error('x'),
			source: 'sveltekit-hook',
			path: '/admin/blueprints',
			info: { status: 500 }
		});

		expect(getClientErrorCount()).toBe(1);
		expect(errorSpy).toHaveBeenCalledWith(
			'[crucible:client-error]',
			expect.objectContaining({
				source: 'sveltekit-hook',
				path: '/admin/blueprints',
				message: 'x',
				info: { status: 500 }
			})
		);
	});

	it('does not throw even if console.error itself throws', () => {
		errorSpy.mockImplementation(() => {
			throw new Error('console is down');
		});
		expect(() => reportClientError({ error: 'y', source: 'unhandled' })).not.toThrow();
		// The counter still advanced, proving the guard is around the logging only.
		expect(getClientErrorCount()).toBe(1);
	});
});
