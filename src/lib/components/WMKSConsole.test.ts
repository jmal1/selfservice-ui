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

type KeyboardManagerSpy = {
	onKeyDown: ReturnType<typeof vi.fn>;
	onKeyUp: ReturnType<typeof vi.fn>;
	onKeyPress: ReturnType<typeof vi.fn>;
};

type WmksInstance = {
	connect: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	sendCAD: ReturnType<typeof vi.fn>;
	updateScreen: ReturnType<typeof vi.fn>;
	emitConnectionState: (state: string) => void;
	wmksData: {
		_keyboardManager: KeyboardManagerSpy;
		element: { 0?: HTMLElement };
	};
};

const instances: WmksInstance[] = [];
const resizeObservers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
const physicalKeydown = vi.fn();

// Mirrors the REAL WMKS SDK (static/wmks/wmks.js):
//   WMKS.createWMKS(containerId, opts) -> $("#"+containerId).nwmks(opts)
//   CoreWMKS.wmksData is the live nwmks widget; _keyboardManager.onKeyDown
//   is KeyboardManager2, which calls VNCDecoder.onKeyVScan.
// The nested canvas is still created (and given tabindex=1 by the SDK) for
// rendering. DOM listeners on that canvas or on a stale container are NOT
// the send path — tests that only assert canvas/container keydown are
// supporting. Acceptance is: the live instance's keyboard manager is invoked.
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

			const canvas = document.createElement('canvas');
			canvas.tabIndex = 1;
			container?.appendChild(canvas);

			const keyboardManager: KeyboardManagerSpy = {
				onKeyDown: vi.fn(),
				onKeyUp: vi.fn(),
				onKeyPress: vi.fn()
			};

			const handlers = new Map<string, (_event: unknown, data: any) => void>();
			const instance: WmksInstance = {
				connect: vi.fn(),
				disconnect: vi.fn(),
				destroy: vi.fn(() => canvas.remove()),
				sendCAD: vi.fn(),
				updateScreen: vi.fn(),
				wmksData: {
					_keyboardManager: keyboardManager,
					element: { 0: container ?? undefined }
				},
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

function liveKm(index = 0): KeyboardManagerSpy {
	return instances[index].wmksData._keyboardManager;
}

async function renderConnectedConsole(expectedInstances = 1) {
	const result = render(WMKSConsole, {
		props: {
			wsUrl: 'wss://example.test/console',
			title: 'Ubuntu console'
		}
	});
	await waitFor(() => expect(instances).toHaveLength(expectedInstances));
	const instance = instances[expectedInstances - 1];
	instance.emitConnectionState('connected');
	const container = document.getElementById('console-canvas') as HTMLDivElement;
	await waitFor(() => expect(document.activeElement).toBe(container));
	return { ...result, container, instance };
}

describe('WMKSConsole live keyboard send path', () => {
	it('delivers native keydown to the live WMKS keyboard manager while connected', async () => {
		await renderConnectedConsole();

		await fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });

		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown.mock.calls[0][0]).toMatchObject({
			key: 'a',
			code: 'KeyA',
			originalEvent: expect.objectContaining({ key: 'a', code: 'KeyA' })
		});
	});

	it('does not hold disconnected keys and does not flush them on reconnect', async () => {
		const { container } = await renderConnectedConsole();
		instances[0].emitConnectionState('disconnected');

		await fireEvent.keyDown(window, { key: 'z', code: 'KeyZ' });
		expect(liveKm(0).onKeyDown).not.toHaveBeenCalled();

		const reconnectButtons = await screen.findAllByRole('button', { name: 'Reconnect' });
		await fireEvent.click(reconnectButtons[0]);
		expect(instances).toHaveLength(2);
		instances[1].emitConnectionState('connected');
		await waitFor(() => expect(document.activeElement).toBe(container));

		expect(liveKm(1).onKeyDown).not.toHaveBeenCalled();
		expect(liveKm(0).onKeyDown).not.toHaveBeenCalled();

		await fireEvent.keyDown(window, { key: 'y', code: 'KeyY' });
		expect(liveKm(1).onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'y', code: 'KeyY' });
		expect(liveKm(0).onKeyDown).not.toHaveBeenCalled();
	});

	it('does not flush keys across navigate-away / remount', async () => {
		const first = await renderConnectedConsole();
		await fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(1);
		first.unmount();

		const second = await renderConnectedConsole(2);
		expect(instances).toHaveLength(2);
		expect(liveKm(1).onKeyDown).not.toHaveBeenCalled();

		await fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
		expect(liveKm(1).onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'b', code: 'KeyB' });
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(1);
		second.unmount();
	});

	it('still delivers to the live manager when focus has fallen through to <body>', async () => {
		const { container } = await renderConnectedConsole();
		const nestedCanvas = container.querySelector('canvas')!;
		nestedCanvas.tabIndex = 0;
		nestedCanvas.focus();
		nestedCanvas.remove();
		expect(document.activeElement).toBe(document.body);

		await fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC' });

		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'c', code: 'KeyC' });
	});

	it('restores live-element focus after a toolbar click, then delivers the next key', async () => {
		const { container } = await renderConnectedConsole();
		await fireEvent.click(screen.getByRole('button', { name: /Ctrl\+Alt\+Del/i }));
		expect(instances[0].sendCAD).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(document.activeElement).toBe(container));

		await fireEvent.keyDown(window, { key: 'd', code: 'KeyD' });
		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'd', code: 'KeyD' });
	});

	it('does not send drawer typing to the live WMKS object', async () => {
		await renderConnectedConsole();
		await fireEvent.click(screen.getByRole('button', { name: /Text Input/i }));
		const textarea = screen.getByRole('textbox');
		textarea.focus();

		await fireEvent.keyDown(textarea, { key: 'e', code: 'KeyE' });
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(textarea);
	});

	it('paste synthesis talks to the live keyboard manager, not a detached canvas', async () => {
		await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('Hi');

		await fireEvent.click(screen.getByRole('button', { name: /Paste/i }));

		await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
		const keys = liveKm().onKeyDown.mock.calls.map((call) => call[0].key);
		expect(keys).toEqual(['Shift', 'H', 'i']);
	});
});

describe('WMKSConsole keyboard focus (supporting)', () => {
	it('makes the #console-canvas container (not the nested canvas) focusable after CONNECTED', async () => {
		const { container } = await renderConnectedConsole();

		expect(container.tabIndex).toBe(0);
		expect(container.getAttribute('aria-label')).toBe('Ubuntu console display');

		const nestedCanvas = container.querySelector('canvas');
		expect(nestedCanvas).not.toBeNull();
		expect(nestedCanvas?.tabIndex).toBe(-1);
		expect(document.activeElement).not.toBe(nestedCanvas);
		expect(document.activeElement).toBe(container);
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
		await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('');

		const eventWasNotCancelled = await fireEvent.keyDown(window, {
			key: 'V',
			code: 'KeyV',
			ctrlKey: true,
			shiftKey: true
		});

		expect(eventWasNotCancelled).toBe(false);
		expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
	});

	it('keeps the persistent container focused across reconnect, even though the nested canvas is replaced', async () => {
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
		expect(container.tabIndex).toBe(0);
		expect(secondNestedCanvas?.tabIndex).toBe(-1);

		unmount();
		expect(instances[1].disconnect).toHaveBeenCalledTimes(1);
		expect(instances[1].destroy).toHaveBeenCalledTimes(1);
		expect(resizeObservers[1].disconnect).toHaveBeenCalledTimes(1);
	});
});
