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
			const canvas = document.createElement('canvas');
			canvas.addEventListener('keydown', physicalKeydown);
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
	const canvas = document.querySelector<HTMLCanvasElement>('#console-canvas canvas');
	await waitFor(() => expect(document.activeElement).toBe(canvas));
	return { ...result, canvas: canvas! };
}

describe('WMKSConsole keyboard focus', () => {
	it('makes the SDK canvas focusable after CONNECTED so native key events reach WMKS', async () => {
		const { canvas } = await renderConnectedConsole();

		expect(canvas.tabIndex).toBe(0);
		expect(canvas.getAttribute('aria-label')).toBe('Ubuntu console display');
		await fireEvent.keyDown(document.activeElement!, { key: 'a', code: 'KeyA' });

		expect(physicalKeydown).toHaveBeenCalledTimes(1);
		expect(physicalKeydown.mock.calls[0][0]).toMatchObject({ key: 'a', code: 'KeyA' });
	});

	it('reacquires canvas focus on pointer and click interaction without stealing form input', async () => {
		const { canvas } = await renderConnectedConsole();

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

		await fireEvent.pointerDown(canvas);
		expect(document.activeElement).toBe(canvas);
		textarea.focus();
		await fireEvent.click(canvas);
		expect(document.activeElement).toBe(canvas);
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
			const canvas = document.querySelector<HTMLCanvasElement>('#console-canvas canvas');
			expect(canvas?.tabIndex).toBe(0);
			expect(canvas?.getAttribute('aria-label')).toBe('Ubuntu console display');
		});
		expect(document.activeElement).toBe(textarea);
	});

	it('preserves the Ctrl+Shift+V console shortcut', async () => {
		const { canvas } = await renderConnectedConsole();
		vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce('');

		const eventWasNotCancelled = await fireEvent.keyDown(canvas, {
			key: 'V',
			code: 'KeyV',
			ctrlKey: true,
			shiftKey: true
		});

		expect(eventWasNotCancelled).toBe(false);
		expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
		expect(physicalKeydown).not.toHaveBeenCalled();
	});

	it('focuses a newly created canvas after reconnect and cleans up each SDK instance', async () => {
		const { unmount, canvas: firstCanvas } = await renderConnectedConsole();
		instances[0].emitConnectionState('disconnected');

		const reconnectButtons = await screen.findAllByRole('button', { name: 'Reconnect' });
		await fireEvent.click(reconnectButtons[0]);
		expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
		expect(instances[0].destroy).toHaveBeenCalledTimes(1);
		expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
		expect(firstCanvas.isConnected).toBe(false);

		expect(instances).toHaveLength(2);
		instances[1].emitConnectionState('connected');
		const secondCanvas = document.querySelector<HTMLCanvasElement>('#console-canvas canvas');
		await waitFor(() => expect(document.activeElement).toBe(secondCanvas));
		expect(secondCanvas).not.toBe(firstCanvas);
		expect(secondCanvas?.tabIndex).toBe(0);

		unmount();
		expect(instances[1].disconnect).toHaveBeenCalledTimes(1);
		expect(instances[1].destroy).toHaveBeenCalledTimes(1);
		expect(resizeObservers[1].disconnect).toHaveBeenCalledTimes(1);
	});
});
