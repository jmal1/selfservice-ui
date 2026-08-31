/**
 * Friendly, user-facing error copy.
 *
 * Context: the audience for Crucible is high-school students. Before this,
 * every route page did `catch (e) { error = e instanceof Error ? e.message : '...' }`,
 * which leaked raw strings like `API Error 500: Internal Server Error` and,
 * because the API used to emit plain-text error bodies, dropped any actual
 * server-provided reason on the floor (ApiError.body was always null). The API
 * now returns structured JSON errors (`{ error, request_id }`); this module is
 * the single place that turns any thrown value — an ApiError, a network
 * TypeError, or anything else — into calm, actionable copy.
 *
 * Design rules:
 *  - Never throws. Error handling that can itself crash defeats its purpose.
 *  - Prefers a real, human-readable server message when one is present.
 *  - Otherwise falls back to a status-based map, then a caller fallback, then
 *    a generic line.
 */

import { ApiError } from '$lib/api/client';
import { toErrorMessage } from '$lib/errors/reportClientError';

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';
const ERROR_KEYS = new Set(['error', 'message', 'reason', 'detail', 'title', 'summary', 'description']);

function normalizeErrorText(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const lowered = trimmed.toLowerCase();
	if (lowered === 'internal server error' || lowered === 'unknown error') return null;
	return trimmed;
}

/**
 * Extract a human-readable server message from a structured API payload without
 * ever letting a raw object stringify to `[object Object]`.
 */
export function safeErrorText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return normalizeErrorText(value);
	if (typeof value === 'number' || typeof value === 'boolean') {
		const str = String(value);
		return str ? str : null;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			const nested = safeErrorText(entry);
			if (nested) return nested;
		}
		return null;
	}
	if (typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (ERROR_KEYS.has(key.toLowerCase())) {
			const found = safeErrorText(record[key]);
			if (found) return found;
		}
	}

	for (const nested of Object.values(record)) {
		if (nested === null || typeof nested !== 'object') continue;
		const nestedKeys = Object.keys(nested as Record<string, unknown>);
		const hasMessageLikeKey = nestedKeys.some((key) => ERROR_KEYS.has(key.toLowerCase()));
		if (!hasMessageLikeKey) continue;
		const found = safeErrorText(nested);
		if (found) return found;
	}

	return null;
}

/**
 * Pull a usable, human-readable message out of an ApiError body if the server
 * provided one. Returns null when there is nothing useful (so the caller can
 * fall back to the status map). Accepts common server key spellings.
 */
function serverMessage(body: Record<string, unknown> | null): string | null {
	return safeErrorText(body);
}

/**
 * Map an HTTP status to friendly, actionable copy. Covers the codes our
 * handlers actually emit; unknown 4xx/5xx get a sensible bucket default.
 */
function statusMessage(status: number, fallback: string): string {
	switch (status) {
		case 400:
			return 'Please check the highlighted fields and try again.';
		case 401:
			return 'Your session expired. Please sign in again.';
		case 403:
			return "You don't have permission to do that.";
		case 404:
			return "That item couldn't be found — it may have been deleted.";
		case 409:
			return 'That conflicts with the current state. Refresh and try again.';
		case 413:
			return "That's too large. Please reduce the size and try again.";
		case 422:
			return "Some of that input isn't valid. Please review and try again.";
		case 429:
			return "You're doing that too fast. Wait a moment and try again.";
		default:
			if (status >= 500) {
				return "Something went wrong on our end. It's been logged — please try again shortly.";
			}
			if (status >= 400) {
				return fallback;
			}
			return fallback;
	}
}

/**
 * Convert any caught value into friendly, user-facing text.
 *
 * @param e        The thrown value (unknown — could be anything).
 * @param fallback Page/action-specific fallback (e.g. 'Failed to load blueprints').
 */
export function friendlyError(e: unknown, fallback: string = DEFAULT_FALLBACK): string {
	try {
		if (e instanceof ApiError) {
			// A real server-provided reason always wins — it's the most specific.
			const fromServer = serverMessage(e.body);
			if (fromServer) return fromServer;
			return statusMessage(e.status, fallback);
		}

		// fetch() rejects with a TypeError when the network is unreachable, the
		// request is blocked, or CORS fails — before any response exists.
		if (e instanceof TypeError) {
			return "Can't reach the server. Check your connection and try again.";
		}

		// Anything else: use the caller fallback rather than a raw message so we
		// never leak a stack-ish string to a student.
		return fallback || DEFAULT_FALLBACK;
	} catch {
		// Absolutely never throw from here.
		return fallback || DEFAULT_FALLBACK;
	}
}

/**
 * Same mapping, but always returns a non-empty string suitable for embedding
 * in a toast/sentence. Currently identical to friendlyError; kept as a named
 * export so call sites read clearly and we have a seam if toast copy diverges.
 */
export function friendlyErrorText(e: unknown, fallback: string = DEFAULT_FALLBACK): string {
	return friendlyError(e, fallback);
}

// Exported for tests only.
export const __test = { serverMessage, statusMessage, DEFAULT_FALLBACK, toErrorMessage, safeErrorText };
