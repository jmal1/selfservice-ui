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
	/** Mirrors this.element.bind("keydown.wmks", ...) — the only legal send path. */
	sdkWidgetKeydown: ReturnType<typeof vi.fn>;
	/** Decoy: a nested-canvas listener is NOT the send path. */
	canvasOnlyKeydown: ReturnType<typeof vi.fn>;
	wmksData: {
		_keyboardManager: KeyboardManagerSpy;
		_vncDecoder: {
			onKeyVScan: ReturnType<typeof vi.fn>;
			onVMWKeyUnicode: ReturnType<typeof vi.fn>;
		};
		element: { 0?: HTMLElement };
	};
};

const instances: WmksInstance[] = [];
const resizeObservers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];

function toWidgetKeyEvent(event: KeyboardEvent) {
	return {
		originalEvent: event,
		type: event.type,
		key: event.key,
		code: event.code,
		keyCode: event.keyCode,
		which: event.which || event.keyCode,
		shiftKey: event.shiftKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		metaKey: event.metaKey
	};
}

// Mirrors the REAL WMKS SDK (static/wmks/wmks.js connectEvents):
//   this.element.bind("keydown.wmks", function(b) {
//     return a.updateUserActivity(), a._keyboardManager.onKeyDown(b)
//   })
// createWMKS(containerId) -> $("#"+containerId).nwmks(opts); this.element is
// #console-canvas. The nested canvas is rendering-only (tabindex=1 in the SDK).
// Acceptance is: the widget bind ran AND it invoked _keyboardManager.onKeyDown.
// A canvas-only listener, a window capture, or calling onKeyDown without the
// bind having seen the event must fail these tests.
function installWmksMock(options: { deferCanvas?: boolean } = {}): void {
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
		createWMKS: vi.fn((containerId: string, opts: Record<string, unknown>) => {
			void opts;
			const container = document.getElementById(containerId);
			const canvas = document.createElement('canvas');
			canvas.tabIndex = 1;
			if (!options.deferCanvas) container?.appendChild(canvas);

			const onKeyDown = vi.fn();
			const onKeyUp = vi.fn();
			const onKeyPress = vi.fn();
			const keyboardManager: KeyboardManagerSpy = {
				onKeyDown,
				onKeyUp,
				onKeyPress
			};
			const vncDecoder = {
				onKeyVScan: vi.fn(),
				onVMWKeyUnicode: vi.fn()
			};

			const canvasOnlyKeydown = vi.fn();
			canvas.addEventListener('keydown', canvasOnlyKeydown);

			const sdkWidgetKeydown = vi.fn((event: Event) => {
				onKeyDown(toWidgetKeyEvent(event as KeyboardEvent));
			});
			container?.addEventListener('keydown', sdkWidgetKeydown);
			container?.addEventListener('keyup', (event) => {
				onKeyUp(toWidgetKeyEvent(event as KeyboardEvent));
			});

			const handlers = new Map<string, (_event: unknown, data: any) => void>();
			const instance: WmksInstance = {
				connect: vi.fn(),
				disconnect: vi.fn(),
				destroy: vi.fn(() => {
					// Mirrors widgetProto.disconnectEvents: unbind keydown.wmks
					// from this.element so a destroyed session cannot flush later.
					container?.removeEventListener('keydown', sdkWidgetKeydown);
					canvas.remove();
				}),
				sendCAD: vi.fn(),
				updateScreen: vi.fn(),
				sdkWidgetKeydown,
				canvasOnlyKeydown,
				wmksData: {
					_keyboardManager: keyboardManager,
					_vncDecoder: vncDecoder,
					element: { 0: container ?? undefined }
				},
				emitConnectionState: (state) => {
					if (state === 'connected' && options.deferCanvas && !canvas.isConnected) {
						container?.appendChild(canvas);
					}
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

function createOpts(index = 0): Record<string, unknown> {
	return (window as any).WMKS.createWMKS.mock.calls[index][1] ?? {};
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
	await waitFor(() => expect(container).toBeTruthy());
	return { ...result, container, instance };
}

describe('WMKSConsole live nwmks keyboard send path', () => {
	it('does not disable vScan (Windows KeyboardManager2 / onKeyVScan must stay the default)', async () => {
		await renderConnectedConsole();
		expect(createOpts()).not.toMatchObject({ disableVscanKeyboard: true });
	});

	it('delivers native keydown to _keyboardManager.onKeyDown via the SDK widget bind', async () => {
		const { container, instance } = await renderConnectedConsole();

		await fireEvent.keyDown(container, { key: 'a', code: 'KeyA' });

		expect(instance.sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown.mock.calls[0][0]).toMatchObject({
			key: 'a',
			code: 'KeyA',
			originalEvent: expect.objectContaining({ key: 'a', code: 'KeyA' })
		});
		// Nested-canvas DOM is not the send path.
		expect(instance.canvasOnlyKeydown).not.toHaveBeenCalled();
	});

	it('synths Enter, Backspace, and uppercase through the SDK bind (not native-only)', async () => {
		const { container, instance } = await renderConnectedConsole();

		for (const init of [
			{ key: 'Enter', code: 'Enter', keyCode: 13 },
			{ key: 'Backspace', code: 'Backspace', keyCode: 8 },
			{ key: 'A', code: 'KeyA', keyCode: 65, shiftKey: true }
		]) {
			instance.sdkWidgetKeydown.mockClear();
			liveKm().onKeyDown.mockClear();
			const cancelled = !(await fireEvent.keyDown(container, init));
			expect(cancelled).toBe(true);
			expect(instance.sdkWidgetKeydown).toHaveBeenCalled();
			expect(liveKm().onKeyDown).toHaveBeenCalled();
			const keys = liveKm().onKeyDown.mock.calls.map((call) => call[0].key);
			expect(keys).toContain(init.key === 'A' ? 'A' : init.key);
		}
	});

	it('bubbles nested-canvas keydown into synth → widget bind for printables', async () => {
		const { container, instance } = await renderConnectedConsole();
		const nestedCanvas = container.querySelector('canvas');
		expect(nestedCanvas).not.toBeNull();

		const cancelled = !(await fireEvent.keyDown(nestedCanvas!, { key: 'b', code: 'KeyB' }));

		expect(cancelled).toBe(true);
		expect(instance.canvasOnlyKeydown).not.toHaveBeenCalled();
		expect(instance.sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'b', code: 'KeyB' });
	});

	it('does not send via a window listener — that path starves keydown.wmks', async () => {
		const { instance } = await renderConnectedConsole();

		await fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });

		expect(instance.sdkWidgetKeydown).not.toHaveBeenCalled();
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
		expect(instance.canvasOnlyKeydown).not.toHaveBeenCalled();
	});

	it('fails if a window capture stopPropagation-eats the SDK bind (the #59 failure mode)', async () => {
		const { container, instance } = await renderConnectedConsole();

		const eater = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
		};
		window.addEventListener('keydown', eater, true);
		try {
			await fireEvent.keyDown(container, { key: 'z', code: 'KeyZ' });
			expect(instance.sdkWidgetKeydown).not.toHaveBeenCalled();
			expect(liveKm().onKeyDown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', eater, true);
		}

		await fireEvent.keyDown(container, { key: 'z', code: 'KeyZ' });
		expect(instance.sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown).toHaveBeenCalledTimes(1);
	});

	it('does not hold disconnected keys and does not flush them on reconnect', async () => {
		const { container } = await renderConnectedConsole();
		instances[0].emitConnectionState('disconnected');

		await fireEvent.keyDown(container, { key: 'z', code: 'KeyZ' });
		// LKG has no app-side gate: the still-bound widget may see the event.
		// What must not happen is a deferred queue that replays into the next session.
		const firstSessionSaw = liveKm(0).onKeyDown.mock.calls.length;

		const reconnectButtons = await screen.findAllByRole('button', { name: 'Reconnect' });
		await fireEvent.click(reconnectButtons[0]);
		expect(instances).toHaveLength(2);
		instances[1].emitConnectionState('connected');

		expect(liveKm(1).onKeyDown).not.toHaveBeenCalled();
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(firstSessionSaw);

		const second = document.getElementById('console-canvas') as HTMLDivElement;
		await fireEvent.keyDown(second, { key: 'y', code: 'KeyY' });
		expect(instances[1].sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'y', code: 'KeyY' });
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(firstSessionSaw);
	});

	it('does not flush keys across navigate-away / remount', async () => {
		const first = await renderConnectedConsole();
		await fireEvent.keyDown(first.container, { key: 'a', code: 'KeyA' });
		expect(first.instance.sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(1);
		first.unmount();

		const second = await renderConnectedConsole(2);
		expect(instances).toHaveLength(2);
		expect(liveKm(1).onKeyDown).not.toHaveBeenCalled();
		expect(second.instance.sdkWidgetKeydown).not.toHaveBeenCalled();

		await fireEvent.keyDown(second.container, { key: 'b', code: 'KeyB' });
		expect(second.instance.sdkWidgetKeydown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown).toHaveBeenCalledTimes(1);
		expect(liveKm(1).onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'b', code: 'KeyB' });
		expect(liveKm(0).onKeyDown).toHaveBeenCalledTimes(1);
		second.unmount();
	});

	it('does not send drawer typing to the live WMKS object', async () => {
		const { instance } = await renderConnectedConsole();
		await fireEvent.click(screen.getByRole('button', { name: /Text Input/i }));
		const textarea = screen.getByRole('textbox');
		textarea.focus();

		await fireEvent.keyDown(textarea, { key: 'e', code: 'KeyE' });
		expect(instance.sdkWidgetKeydown).not.toHaveBeenCalled();
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(textarea);
	});

	it('paste synthesis talks to the live keyboard manager through the SDK bind, not a detached canvas', async () => {
		const { instance } = await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('Hi');

		await fireEvent.click(screen.getByRole('button', { name: /Paste/i }));

		await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
		expect(instance.sdkWidgetKeydown).toHaveBeenCalled();
		const keys = liveKm().onKeyDown.mock.calls.map((call) => call[0].key);
		expect(keys).toEqual(['Shift', 'H', 'i']);
	});

	it('keeps Ctrl+Alt+Del on wmks.sendCAD', async () => {
		await renderConnectedConsole();
		await fireEvent.click(screen.getByRole('button', { name: /Ctrl\+Alt\+Del/i }));
		expect(instances[0].sendCAD).toHaveBeenCalledTimes(1);
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
	});

	it('preserves the Ctrl+V console shortcut without sending V through the bind', async () => {
		const { container, instance } = await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('');

		const eventWasNotCancelled = await fireEvent.keyDown(container, {
			key: 'V',
			code: 'KeyV',
			ctrlKey: true
		});

		expect(eventWasNotCancelled).toBe(false);
		expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
		expect(instance.sdkWidgetKeydown).not.toHaveBeenCalled();
		expect(liveKm().onKeyDown).not.toHaveBeenCalled();
	});
});

describe('WMKSConsole keyboard focus (supporting — not acceptance)', () => {
	it('demotes a nested canvas that appears after CONNECTED (MutationObserver / late SDK canvas)', async () => {
		const { container } = await renderConnectedConsole();
		const late = document.createElement('canvas');
		late.id = 'lateCanvas';
		late.tabIndex = 1;
		container.appendChild(late);
		await waitFor(() => expect(late.tabIndex).toBe(-1));
	});

	it('demotes nested canvas tabindex after CONNECTED even when createWMKS had no canvas yet', async () => {
		delete (window as any).WMKS;
		installWmksMock({ deferCanvas: true });
		const { container } = await renderConnectedConsole();
		const nestedCanvas = container.querySelector('canvas');
		expect(nestedCanvas).not.toBeNull();
		await waitFor(() => expect(nestedCanvas?.tabIndex).toBe(-1));
		await waitFor(() => expect(document.activeElement).toBe(container));
	});

	it('reclaims #console-canvas focus when the nested canvas becomes activeElement', async () => {
		const { container } = await renderConnectedConsole();
		const nestedCanvas = container.querySelector('canvas') as HTMLCanvasElement;
		expect(nestedCanvas).not.toBeNull();
		nestedCanvas.focus();
		await waitFor(() => expect(document.activeElement).toBe(container));
		expect(nestedCanvas.tabIndex).toBe(-1);
	});

	it('does not mount the wmksDebug HUD unless ?wmksDebug=1', async () => {
		await renderConnectedConsole();
		expect(document.getElementById('wmks-debug-hud')).toBeNull();
	});

	it('makes the #console-canvas container focusable after CONNECTED', async () => {
		const { container } = await renderConnectedConsole();

		expect(container.tabIndex).toBe(0);
		expect(container.getAttribute('aria-label')).toBe('Ubuntu console display');

		const nestedCanvas = container.querySelector('canvas');
		expect(nestedCanvas).not.toBeNull();
		expect(nestedCanvas?.tabIndex).toBe(-1);
		await waitFor(() => expect(document.activeElement).toBe(container));
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
