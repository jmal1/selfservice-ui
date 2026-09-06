import { describe, expect, it, vi } from 'vitest';
import {
	CONSOLE_SPECIAL_KEYS,
	demoteNestedConsoleCanvases,
	isConsolePasteChord,
	isEditableFormControl,
	observeNestedConsoleCanvases,
	resolveConsoleSynthMapping,
	shouldReclaimConsoleFocus
} from './wmksKeyboard';

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
	return {
		type: 'keydown',
		key: 'a',
		code: 'KeyA',
		keyCode: 65,
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		...overrides
	} as KeyboardEvent;
}

const SAMPLE_KEY_MAP: Record<string, [number, string, boolean]> = {
	a: [65, 'KeyA', false],
	A: [65, 'KeyA', true],
	' ': [32, 'Space', false]
};

describe('console keyboard helpers (not the send path)', () => {
	it('identifies Ctrl+V / Ctrl+Shift+V paste chords', () => {
		expect(
			isConsolePasteChord(
				keyEvent({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true })
			)
		).toBe(true);
		expect(
			isConsolePasteChord(keyEvent({ key: 'v', code: 'KeyV', ctrlKey: true }))
		).toBe(true);
		expect(
			isConsolePasteChord(
				keyEvent({ key: 'v', code: 'KeyV', metaKey: true, shiftKey: true })
			)
		).toBe(true);
		expect(isConsolePasteChord(keyEvent())).toBe(false);
		expect(
			isConsolePasteChord(keyEvent({ key: 'v', code: 'KeyV', altKey: true, ctrlKey: true }))
		).toBe(false);
	});

	it('maps Enter/Backspace and shifted printables for synth (Ubuntu KM2 flush gap)', () => {
		expect(resolveConsoleSynthMapping(keyEvent({ key: 'Enter', code: 'Enter' }), SAMPLE_KEY_MAP)).toEqual(
			CONSOLE_SPECIAL_KEYS.Enter
		);
		expect(
			resolveConsoleSynthMapping(keyEvent({ key: 'Backspace', code: 'Backspace' }), SAMPLE_KEY_MAP)
		).toEqual(CONSOLE_SPECIAL_KEYS.Backspace);
		expect(resolveConsoleSynthMapping(keyEvent({ key: 'A', code: 'KeyA', shiftKey: true }), SAMPLE_KEY_MAP)).toEqual(
			SAMPLE_KEY_MAP.A
		);
		expect(resolveConsoleSynthMapping(keyEvent({ key: 'a', code: 'KeyA' }), SAMPLE_KEY_MAP)).toEqual(
			SAMPLE_KEY_MAP.a
		);
		expect(
			resolveConsoleSynthMapping(keyEvent({ key: 'a', code: 'KeyA', ctrlKey: true }), SAMPLE_KEY_MAP)
		).toBeNull();
		expect(resolveConsoleSynthMapping(keyEvent({ key: 'Shift', code: 'ShiftLeft' }), SAMPLE_KEY_MAP)).toBeNull();
	});

	it('treats only real editors as form controls — toolbar buttons must not eat guest keys', () => {
		const button = document.createElement('button');
		const input = document.createElement('input');
		const textarea = document.createElement('textarea');
		document.body.append(button, input, textarea);
		expect(isEditableFormControl(button)).toBe(false);
		expect(isEditableFormControl(input)).toBe(true);
		expect(isEditableFormControl(textarea)).toBe(true);
		button.remove();
		input.remove();
		textarea.remove();
	});

	it('demotes nested SDK canvases from tabindex=1 to -1', () => {
		const root = document.createElement('div');
		const canvas = document.createElement('canvas');
		canvas.tabIndex = 1;
		root.appendChild(canvas);
		expect(demoteNestedConsoleCanvases(root)).toEqual([canvas]);
		expect(canvas.tabIndex).toBe(-1);
		expect(demoteNestedConsoleCanvases(root)).toEqual([]);
	});

	it('observeNestedConsoleCanvases demotes a canvas added after subscribe', async () => {
		const root = document.createElement('div');
		document.body.append(root);
		const observer = observeNestedConsoleCanvases(root);
		const late = document.createElement('canvas');
		late.tabIndex = 1;
		root.appendChild(late);
		await vi.waitFor(() => expect(late.tabIndex).toBe(-1));
		observer.disconnect();
		root.remove();
	});

	it('reclaims from body or the nested canvas, never from editors or toolbar buttons', () => {
		const consoleEl = document.createElement('div');
		const canvas = document.createElement('canvas');
		const input = document.createElement('input');
		const button = document.createElement('button');
		consoleEl.append(canvas, input, button);
		document.body.append(consoleEl);

		expect(shouldReclaimConsoleFocus(document.body, consoleEl)).toBe(true);
		expect(shouldReclaimConsoleFocus(document.documentElement, consoleEl)).toBe(true);
		expect(shouldReclaimConsoleFocus(canvas, consoleEl)).toBe(true);
		expect(shouldReclaimConsoleFocus(consoleEl, consoleEl)).toBe(false);
		expect(shouldReclaimConsoleFocus(input, consoleEl)).toBe(false);
		expect(shouldReclaimConsoleFocus(button, consoleEl)).toBe(false);

		consoleEl.remove();
	});
});
