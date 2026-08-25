import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WMKSConsole from './WMKSConsole.svelte';

const toastMocks = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	warning: vi.fn()
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: toastMocks
}));

type WmksInstance = {
	connect: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	sendCAD: ReturnType<typeof vi.fn>;
	updateScreen: ReturnType<typeof vi.fn>;
	emitConnectionState: (state: string) => void;
};

const instances: WmksInstance[] = [];
const resizeObservers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
const physicalKeydown = vi.fn();

// Mirrors the REAL WMKS SDK (static/wmks/wmks.js):
//   WMKS.createWMKS(containerId, opts) -> $("#"+containerId).nwmks(opts)
//   WMKS.widgetProto.connectEvents binds native keydown/keypress/keyup
//   handlers to `this.element` (the jQuery-wrapped container passed to
//   createWMKS), NOT to the internal <canvas> it creates for rendering.
// The internal canvas only ever gets focus/blur bound to it for shadow
// cursor cosmetics. It is also destroyed and recreated by the SDK on every
// connect/reconnect. A correct fix must keep native keyboard capture wired
// to the persistent #console-canvas container, so this mock deliberately
// attaches `physicalKeydown` to the CONTAINER — attaching it to the nested
// canvas instead would make these tests a false positive, exactly like the
// pre-fix mock did.
function installWmksMock(): void {
	(window as any).WMKS = {
		CONST: {
			Position: { CENTER: 'center' },
			Events: {
				CONNECTION_STATE_CHANGE: 'connection-state-change',
				ERROR: 'error'
			},
			ConnectionState: {
				CONNECTED: 'connected',
				DISCONNECTED: 'disconnected'
			}
		},
		createWMKS: vi.fn((containerId: string) => {
			const container = document.getElementById(containerId);
			container?.addEventListener('keydown', physicalKeydown);

			// The SDK still creates an internal rendering canvas — nested
			// canvas rendering must be preserved — but it is NOT the
			// keyboard capture target.
			const canvas = document.createElement('canvas');
			container?.appendChild(canvas);

			const handlers = new Map<string, (_event: unknown, data: any) => void>();
			const instance: WmksInstance = {
				connect: vi.fn(),
				disconnect: vi.fn(),
				destroy: vi.fn(() => canvas.remove()),
				sendCAD: vi.fn(),
				updateScreen: vi.fn(),
				emitConnectionState: (state) => {
					handlers.get('connection-state-change')?.({}, { state });
				}
			};
			(instance as any).register = vi.fn(
				(event: string, handler: (_event: unknown, data: any) => void) => {
					handlers.set(event, handler);
				}
			);
			instances.push(instance);
			return instance;
		})
	};
}

beforeEach(() => {
	instances.length = 0;
	resizeObservers.length = 0;
	physicalKeydown.mockClear();
	Object.values(toastMocks).forEach((mock) => mock.mockClear());

	class ResizeObserverMock {
		disconnect = vi.fn();
		observe = vi.fn();

		constructor() {
			resizeObservers.push(this);
		}
	}
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { readText: vi.fn() }
	});
	installWmksMock();
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete (window as any).WMKS;
});

async function renderConnectedConsole() {
	const result = render(WMKSConsole, {
		props: {
			wsUrl: 'wss://example.test/console',
			title: 'Ubuntu console'
		}
	});
	await waitFor(() => expect(instances).toHaveLength(1));
	instances[0].emitConnectionState('connected');
	const container = document.getElementById('console-canvas') as HTMLDivElement;
	await waitFor(() => expect(document.activeElement).toBe(container));
	return { ...result, container };
}

describe('WMKSConsole keyboard focus', () => {
	it('makes the #console-canvas container (not the nested canvas) focusable after CONNECTED', async () => {
		const { container } = await renderConnectedConsole();

		expect(container.tabIndex).toBe(0);
		expect(container.getAttribute('aria-label')).toBe('Ubuntu console display');

		// Nested canvas rendering must still be preserved…
		const nestedCanvas = container.querySelector('canvas');
		expect(nestedCanvas).not.toBeNull();
		// …but it must NOT be the element the SDK's real keyboard capture
		// binds to, and it must NOT hold DOM focus.
		expect(document.activeElement).not.toBe(nestedCanvas);
		expect(document.activeElement).toBe(container);

		await fireEvent.keyDown(document.activeElement!, { key: 'a', code: 'KeyA' });

		expect(physicalKeydown).toHaveBeenCalledTimes(1);
		expect(physicalKeydown.mock.calls[0][0]).toMatchObject({ key: 'a', code: 'KeyA' });
	});

	it('reacquires container focus on pointer and click interaction without stealing form input', async () => {
		const { container } = await renderConnectedConsole();

		await fireEvent.click(screen.getByRole('button', { name: /Text Input/i }));
		const textarea = screen.getByRole('textbox');
		textarea.focus();
		expect(document.activeElement).toBe(textarea);

		const drawerPasteWasNotCancelled = await fireEvent.keyDown(textarea, {
			key: 'V',
			code: 'KeyV',
			ctrlKey: true,
			shiftKey: true
		});
		expect(drawerPasteWasNotCancelled).toBe(true);
		expect(navigator.clipboard.readText).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(textarea);

		await fireEvent.pointerDown(container);
		expect(document.activeElement).toBe(container);
		textarea.focus();
		await fireEvent.click(container);
		expect(document.activeElement).toBe(container);
	});

	it('does not steal focus from text input when CONNECTED arrives', async () => {
		render(WMKSConsole, {
			props: {
				wsUrl: 'wss://example.test/console',
				title: 'Ubuntu console'
			}
		});
		await waitFor(() => expect(instances).toHaveLength(1));
		await fireEvent.click(screen.getByRole('button', { name: /Text Input/i }));
		const textarea = screen.getByRole('textbox');
		textarea.focus();

		instances[0].emitConnectionState('connected');
		await waitFor(() => {
			const container = document.getElementById('console-canvas');
			expect(container?.tabIndex).toBe(0);
			expect(container?.getAttribute('aria-label')).toBe('Ubuntu console display');
		});
		expect(document.activeElement).toBe(textarea);
	});

	it('preserves the Ctrl+Shift+V console shortcut', async () => {
		const { container } = await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('');

		const eventWasNotCancelled = await fireEvent.keyDown(container, {
			key: 'V',
			code: 'KeyV',
			ctrlKey: true,
			shiftKey: true
		});

		expect(eventWasNotCancelled).toBe(false);
		expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
		expect(physicalKeydown).not.toHaveBeenCalled();
	});

	it('keeps focus (and native keyboard capture) on the persistent container across reconnect, even though the nested canvas is replaced', async () => {
		const { unmount, container } = await renderConnectedConsole();
		const firstNestedCanvas = container.querySelector('canvas');
		instances[0].emitConnectionState('disconnected');

		const reconnectButtons = await screen.findAllByRole('button', { name: 'Reconnect' });
		await fireEvent.click(reconnectButtons[0]);
		expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
		expect(instances[0].destroy).toHaveBeenCalledTimes(1);
		expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
		expect(firstNestedCanvas?.isConnected).toBe(false);

		expect(instances).toHaveLength(2);
		instances[1].emitConnectionState('connected');
		await waitFor(() => expect(document.activeElement).toBe(container));

		const secondNestedCanvas = container.querySelector('canvas');
		expect(secondNestedCanvas).not.toBe(firstNestedCanvas);
		// The container — not the (replaced) nested canvas — is what holds
		// focus and keyboard capture after reconnect.
		expect(container.tabIndex).toBe(0);
		await fireEvent.keyDown(document.activeElement!, { key: 'b', code: 'KeyB' });
		expect(physicalKeydown).toHaveBeenCalledTimes(1);

		unmount();
		expect(instances[1].disconnect).toHaveBeenCalledTimes(1);
		expect(instances[1].destroy).toHaveBeenCalledTimes(1);
		expect(resizeObservers[1].disconnect).toHaveBeenCalledTimes(1);
	});

	it('demonstrates why nested-canvas focus is fragile: focus (and thus keyboard capture) is lost to <body> once the nested canvas is torn down, but the persistent container survives it', async () => {
		const { container } = await renderConnectedConsole();
		const nestedCanvas = container.querySelector('canvas')!;

		// Simulate the OLD (buggy) approach of focusing the SDK-owned
		// nested canvas instead of the persistent container.
		nestedCanvas.tabIndex = 0;
		nestedCanvas.focus();
		expect(document.activeElement).toBe(nestedCanvas);

		// WMKS destroys/recreates this internal canvas across its own
		// lifecycle (e.g. reconnect, resolution change). Per DOM semantics,
		// removing the focused element drops focus to <body>.
		nestedCanvas.remove();
		expect(document.activeElement).toBe(document.body);

		// Physical keydown now targets <body>, which is NOT a descendant
		// of #console-canvas, so it never bubbles into the container's
		// native keydown binding — physical keyboard input to the guest is
		// silently dropped. This is the real regression.
		await fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC' });
		expect(physicalKeydown).not.toHaveBeenCalled();

		// The fix's persistent container, by contrast, is never removed —
		// refocusing it (as focusConsoleAfterConnect/focusConsole do)
		// immediately restores keyboard capture.
		container.focus();
		expect(document.activeElement).toBe(container);
		await fireEvent.keyDown(container, { key: 'c', code: 'KeyC' });
		expect(physicalKeydown).toHaveBeenCalledTimes(1);
	});
});
