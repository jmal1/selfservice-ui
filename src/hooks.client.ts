import type { HandleClientError } from '@sveltejs/kit';
import { reportClientError } from '$lib/errors/reportClientError';

/**
 * SvelteKit client error hook.
 *
 * Catches errors thrown during load functions, navigation, and other
 * framework-level client work (the render-time crashes inside components are
 * additionally caught by <ErrorBoundary> / <svelte:boundary>). Every such error
 * is routed to the central reporting sink, and we return a friendly message
 * that `+error.svelte` renders instead of a blank page.
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
	reportClientError({
		error,
		source: 'sveltekit-hook',
		path: event?.url?.pathname,
		info: { status, message }
	});

	return {
		message: 'Something went wrong. Try reloading the page.'
	};
};
