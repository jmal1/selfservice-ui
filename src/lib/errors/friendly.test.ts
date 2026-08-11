import { describe, it, expect } from 'vitest';
import { friendlyError, friendlyErrorText, __test } from './friendly';
import { ApiError } from '$lib/api/client';

describe('friendlyError', () => {
	it('prefers a real server-provided message from ApiError.body', () => {
		const e = new ApiError(400, 'Bad Request', {
			error: 'name and at least one VM are required'
		});
		expect(friendlyError(e, 'Failed to create blueprint')).toBe(
			'name and at least one VM are required'
		);
	});

	it('accepts alternate server key spellings (message/reason/detail)', () => {
		expect(friendlyError(new ApiError(409, 'Conflict', { message: 'already deployed' }))).toBe(
			'already deployed'
		);
		expect(friendlyError(new ApiError(422, 'Unprocessable', { reason: 'bad cidr' }))).toBe(
			'bad cidr'
		);
		expect(friendlyError(new ApiError(400, 'Bad Request', { detail: 'nope' }))).toBe('nope');
	});

	it('ignores empty / unhelpful server strings and falls back to the status map', () => {
		expect(friendlyError(new ApiError(500, 'Internal Server Error', { error: '   ' }))).toBe(
			"Something went wrong on our end. It's been logged — please try again shortly."
		);
		// A bare "internal server error" echo should not be shown verbatim.
		expect(
			friendlyError(new ApiError(500, 'Internal Server Error', { error: 'internal server error' }))
		).toBe("Something went wrong on our end. It's been logged — please try again shortly.");
	});

	it('maps known status codes to friendly copy when no server message', () => {
		expect(friendlyError(new ApiError(401, 'Unauthorized', null))).toBe(
			'Your session expired. Please sign in again.'
		);
		expect(friendlyError(new ApiError(403, 'Forbidden', null))).toBe(
			"You don't have permission to do that."
		);
		expect(friendlyError(new ApiError(404, 'Not Found', null))).toBe(
			"That item couldn't be found — it may have been deleted."
		);
		expect(friendlyError(new ApiError(409, 'Conflict', null))).toBe(
			'That conflicts with the current state. Refresh and try again.'
		);
		expect(friendlyError(new ApiError(429, 'Too Many Requests', null))).toBe(
			"You're doing that too fast. Wait a moment and try again."
		);
		expect(friendlyError(new ApiError(503, 'Service Unavailable', null))).toBe(
			"Something went wrong on our end. It's been logged — please try again shortly."
		);
	});

	it('uses the caller fallback for an unmapped 4xx with no body', () => {
		expect(friendlyError(new ApiError(418, "I'm a teapot", null), 'Failed to brew')).toBe(
			'Failed to brew'
		);
	});

	it('maps a network TypeError to a connectivity message', () => {
		expect(friendlyError(new TypeError('Failed to fetch'), 'Failed to load')).toBe(
			"Can't reach the server. Check your connection and try again."
		);
	});

	it('returns the caller fallback for a non-ApiError, non-network throw', () => {
		expect(friendlyError(new Error('kaboom'), 'Failed to load pods')).toBe('Failed to load pods');
		expect(friendlyError('a bare string', 'Failed to load pods')).toBe('Failed to load pods');
		expect(friendlyError(null, 'Failed to load pods')).toBe('Failed to load pods');
	});

	it('falls back to a generic message when no fallback is supplied', () => {
		expect(friendlyError(new Error('x'))).toBe(__test.DEFAULT_FALLBACK);
		expect(friendlyError(undefined)).toBe(__test.DEFAULT_FALLBACK);
	});

	it('never throws, even on a hostile object', () => {
		const hostile = {
			get body() {
				throw new Error('trap');
			}
		};
		expect(() => friendlyError(hostile, 'safe')).not.toThrow();
		expect(friendlyError(hostile, 'safe')).toBe('safe');
	});

	it('friendlyErrorText behaves identically to friendlyError', () => {
		const e = new ApiError(403, 'Forbidden', null);
		expect(friendlyErrorText(e, 'fb')).toBe(friendlyError(e, 'fb'));
	});
});
