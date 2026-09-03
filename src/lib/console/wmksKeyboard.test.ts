import { describe, expect, it } from 'vitest';
import { isConsolePasteChord, isEditableFormControl } from './wmksKeyboard';

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

describe('console keyboard helpers (not the send path)', () => {
	it('identifies the Ctrl+Shift+V paste chord without treating it as a guest key', () => {
		expect(
			isConsolePasteChord(
				keyEvent({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true })
			)
		).toBe(true);
		expect(
			isConsolePasteChord(
				keyEvent({ key: 'v', code: 'KeyV', metaKey: true, shiftKey: true })
			)
		).toBe(true);
		expect(isConsolePasteChord(keyEvent())).toBe(false);
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
});
