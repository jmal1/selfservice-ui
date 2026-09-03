/**
 * Small console-keyboard helpers. Physical keys are NOT delivered here.
 *
 * Last-known-good send path (0a2d9c80 / eeb3b843 #15): the HTML5 WMKS SDK
 * (static/wmks/wmks.js) binds `keydown.wmks` on `this.element` (#console-canvas)
 * and that handler calls `_keyboardManager.onKeyDown` (KeyboardManager2 →
 * onKeyVScan). A window capture that preventDefault+stopPropagation-eats the
 * event (#59) starves that bind. Do not reintroduce a replacement send path.
 */

const EDITABLE_SELECTOR = 'input, textarea, select';

export function isEditableFormControl(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return target.closest(EDITABLE_SELECTOR) !== null;
}

/** True for the console paste chord (Ctrl+Shift+V / Cmd+Shift+V). */
export function isConsolePasteChord(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		event.shiftKey &&
		(event.key === 'V' || event.key === 'v')
	);
}
