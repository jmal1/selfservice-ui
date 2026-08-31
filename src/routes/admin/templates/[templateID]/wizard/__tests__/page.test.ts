import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WizardPage from '../+page.svelte';

const authState = vi.hoisted(() => ({
	isInstructor: false,
	isAdmin: false
}));
const pageStore = vi.hoisted(() => ({ store: null as any }));
const gotoMock = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const wizardStateMock = vi.hoisted(() => vi.fn());
const resolvedCredsMock = vi.hoisted(() => vi.fn());
const preflightMock = vi.hoisted(() => vi.fn());
const powerMock = vi.hoisted(() => vi.fn());
const provisionMock = vi.hoisted(() => vi.fn());
const generalizeMock = vi.hoisted(() => vi.fn());
const publishMock = vi.hoisted(() => vi.fn());
const unpublishMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());

vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	pageStore.store = writable({
		params: {
			templateID: 'template-123'
		}
	});
	return {
		page: pageStore.store
	};
});

vi.mock('$app/navigation', () => ({
	goto: gotoMock
}));

vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: authState
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: {
		error: toastError,
		success: vi.fn()
	}
}));

vi.mock('$lib/api/client', () => ({
	adminGetWizardState: wizardStateMock,
	adminGetResolvedCredentials: resolvedCredsMock,
	adminRunPreflight: preflightMock,
	adminTemplatePower: powerMock,
	adminProvisionTemplate: provisionMock,
	adminGeneralizeTemplate: generalizeMock,
	adminPublishTemplate: publishMock,
	adminUnpublishTemplate: unpublishMock,
	adminCancelTemplate: cancelMock,
	adminRetryTemplate: retryMock,
	ApiError: class ApiError extends Error {
		status: number;
		body: unknown;
		constructor(status: number, message: string, body: unknown) {
			super(message);
			this.status = status;
			this.body = body;
		}
	}
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('admin template wizard page', () => {
	beforeEach(() => {
		authState.isInstructor = false;
		authState.isAdmin = false;
		gotoMock.mockReset();
		toastError.mockReset();
		wizardStateMock.mockReset();
		resolvedCredsMock.mockReset();
		preflightMock.mockReset();
		powerMock.mockReset();
		provisionMock.mockReset();
		generalizeMock.mockReset();
		publishMock.mockReset();
		unpublishMock.mockReset();
		cancelMock.mockReset();
		retryMock.mockReset();
	});

	it('bounces non-admin instructors and does not load wizard state', async () => {
		render(WizardPage);

		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/admin/templates'));
		expect(toastError).toHaveBeenCalledWith('Forbidden', 'You need the instructor role.');
		expect(wizardStateMock).not.toHaveBeenCalled();
		expect(resolvedCredsMock).not.toHaveBeenCalled();
	});

	it('shows loading and surfaces wizard load errors', async () => {
		authState.isInstructor = true;
		const wizard = deferred<unknown>();
		wizardStateMock.mockReturnValue(wizard.promise);
		resolvedCredsMock.mockResolvedValue(null);

		render(WizardPage);

		expect(screen.getByText('Loading wizard…')).not.toBeNull();
		expect(wizardStateMock).toHaveBeenCalledTimes(1);
		expect(resolvedCredsMock).not.toHaveBeenCalled();

		wizard.reject(new Error('wizard stalled'));

		await waitFor(() => expect(screen.getByText(/wizard stalled/i)).not.toBeNull());
		expect(screen.getByText(/Template wizard/i)).not.toBeNull();
	});
});
