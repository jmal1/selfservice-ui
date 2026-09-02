import { describe, expect, it, vi } from 'vitest';
import {
	deliverNativeKeyToLiveWmks,
	getLiveKeyboardManager,
	getLiveWmksElement,
	isConsolePasteChord,
	isEditableFormControl,
	shouldDeliverNativeKey,
	type LiveWmks,
	type WmksKeyHandler
} from './wmksKeyboard';

function keyEvent(
	type: string,
	overrides: Partial<KeyboardEvent> & { target?: EventTarget | null } = {}
): KeyboardEvent {
	const preventDefault = vi.fn();
	const stopPropagation = vi.fn();
	return {
		type,
		key: 'a',
		code: 'KeyA',
		keyCode: 65,
		which: 65,
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		isComposing: false,
		target: document.body,
		preventDefault,
		stopPropagation,
		...overrides
	} as unknown as KeyboardEvent;
}

function liveWmks(handler: WmksKeyHandler, element?: HTMLElement): LiveWmks {
	return {
		wmksData: {
			_keyboardManager: handler,
			element: element ? { 0: element } : undefined
		}
	};
}

describe('live WMKS keyboard delivery', () => {
	it('invokes the live keyboard-manager send path (not a DOM listener) for a connected session', () => {
		const onKeyDown = vi.fn();
		const wmks = liveWmks({ onKeyDown });
		const event = keyEvent('keydown');

		const delivered = deliverNativeKeyToLiveWmks({
			wmks,
			event,
			connected: true
		});

		expect(delivered).toBe(true);
		expect(onKeyDown).toHaveBeenCalledTimes(1);
		expect(onKeyDown.mock.calls[0][0]).toMatchObject({
			type: 'keydown',
			key: 'a',
			code: 'KeyA',
			originalEvent: event
		});
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(event.stopPropagation).toHaveBeenCalledTimes(1);
	});

	it('sends to the live instance and never to a stale one after the live pointer is swapped', () => {
		const staleDown = vi.fn();
		const liveDown = vi.fn();
		const stale = liveWmks({ onKeyDown: staleDown });
		const live = liveWmks({ onKeyDown: liveDown });

		let current: LiveWmks = stale;
		deliverNativeKeyToLiveWmks({
			wmks: current,
			event: keyEvent('keydown', { key: 'x', code: 'KeyX' }),
			connected: true
		});
		current = live;
		deliverNativeKeyToLiveWmks({
			wmks: current,
			event: keyEvent('keydown', { key: 'y', code: 'KeyY' }),
			connected: true
		});

		expect(staleDown).toHaveBeenCalledTimes(1);
		expect(staleDown.mock.calls[0][0]).toMatchObject({ key: 'x' });
		expect(liveDown).toHaveBeenCalledTimes(1);
		expect(liveDown.mock.calls[0][0]).toMatchObject({ key: 'y' });
		expect(staleDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'y' }));
	});

	it('drops keys while disconnected and does not queue them for a later connect', () => {
		const onKeyDown = vi.fn();
		const wmks = liveWmks({ onKeyDown });
		const held: KeyboardEvent[] = [];

		const disconnected = keyEvent('keydown', { key: 'h', code: 'KeyH' });
		const deliveredWhileDown = deliverNativeKeyToLiveWmks({
			wmks,
			event: disconnected,
			connected: false
		});
		// Callers must not record dropped events. This assertion sabotages any
		// "push onto a pending queue" implementation sitting next to the helper.
		if (deliveredWhileDown) held.push(disconnected);

		expect(deliveredWhileDown).toBe(false);
		expect(onKeyDown).not.toHaveBeenCalled();
		expect(held).toHaveLength(0);

		const connected = keyEvent('keydown', { key: 'i', code: 'KeyI' });
		const deliveredAfterConnect = deliverNativeKeyToLiveWmks({
			wmks,
			event: connected,
			connected: true
		});
		expect(deliveredAfterConnect).toBe(true);
		expect(onKeyDown).toHaveBeenCalledTimes(1);
		expect(onKeyDown.mock.calls[0][0]).toMatchObject({ key: 'i', code: 'KeyI' });
		expect(held).toHaveLength(0);
	});

	it('does not flush a caller-side buffer on remount: dropped keys stay dropped', () => {
		const firstSession = vi.fn();
		const secondSession = vi.fn();
		const pending: KeyboardEvent[] = [];

		deliverNativeKeyToLiveWmks({
			wmks: liveWmks({ onKeyDown: firstSession }),
			event: keyEvent('keydown', { key: 'q', code: 'KeyQ' }),
			connected: false
		});
		// Simulate navigate-away: the correct implementation has nothing to flush.
		expect(pending).toHaveLength(0);
		expect(firstSession).not.toHaveBeenCalled();

		deliverNativeKeyToLiveWmks({
			wmks: liveWmks({ onKeyDown: secondSession }),
			event: keyEvent('keydown', { key: 'w', code: 'KeyW' }),
			connected: true
		});
		expect(secondSession).toHaveBeenCalledTimes(1);
		expect(secondSession.mock.calls[0][0]).toMatchObject({ key: 'w' });
		expect(firstSession).not.toHaveBeenCalled();
	});

	it('does not deliver into an editable drawer control', () => {
		const onKeyDown = vi.fn();
		const textarea = document.createElement('textarea');
		document.body.appendChild(textarea);

		const delivered = deliverNativeKeyToLiveWmks({
			wmks: liveWmks({ onKeyDown }),
			event: keyEvent('keydown', { target: textarea }),
			connected: true,
			consoleRoot: document.body
		});

		expect(delivered).toBe(false);
		expect(onKeyDown).not.toHaveBeenCalled();
		textarea.remove();
	});

	it('does deliver when focus has fallen through to <body> (toolbar / canvas teardown)', () => {
		const onKeyDown = vi.fn();
		const root = document.createElement('div');
		document.body.appendChild(root);

		const delivered = deliverNativeKeyToLiveWmks({
			wmks: liveWmks({ onKeyDown }),
			event: keyEvent('keydown', { target: document.body }),
			connected: true,
			consoleRoot: root
		});

		expect(delivered).toBe(true);
		expect(onKeyDown).toHaveBeenCalledTimes(1);
		root.remove();
	});

	it('resolves the keyboard manager from CoreWMKS.wmksData (the live widget), not from a detached node', () => {
		const onKeyDown = vi.fn();
		const detached = document.createElement('div');
		const liveEl = document.createElement('div');
		const wmks: LiveWmks = {
			wmksData: {
				_keyboardManager: { onKeyDown },
				element: { 0: liveEl }
			}
		};

		expect(getLiveKeyboardManager(wmks)).toBe(wmks.wmksData?._keyboardManager);
		expect(getLiveWmksElement(wmks, detached)).toBe(liveEl);
		expect(getLiveWmksElement(wmks, detached)).not.toBe(detached);
	});

	it('identifies the Ctrl+Shift+V paste chord without treating it as a guest key', () => {
		expect(
			isConsolePasteChord(
				keyEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true })
			)
		).toBe(true);
		expect(isConsolePasteChord(keyEvent('keydown'))).toBe(false);
	});

	it('treats only real editors as form controls — toolbar buttons must not eat guest keys', () => {
		const button = document.createElement('button');
		const input = document.createElement('input');
		document.body.append(button, input);
		expect(isEditableFormControl(button)).toBe(false);
		expect(isEditableFormControl(input)).toBe(true);
		expect(shouldDeliverNativeKey(keyEvent('keydown', { target: button }), document.body)).toBe(
			true
		);
		button.remove();
		input.remove();
	});
});
