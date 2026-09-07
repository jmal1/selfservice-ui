/**
 * Console keyboard helpers.
 *
 * Paste and physical-key synthesis both `dispatchEvent` on `#console-canvas`
 * so the SDK `keydown.wmks` bind → KeyboardManager2 → onKeyVScan runs.
 *
 * Operator Edge on Ubuntu (Helm 216 / ui#67): native KM2 delivers unshifted
 * lowercase immediately, but Shift/uppercase, Enter, and Backspace stay
 * invisible until a lowercase key "flushes" them. The paste synthesizer path
 * is guest-visible for those keys — map them here and send only via synth
 * (preventDefault the physical event so native does not also fire).
 *
 * Right Shift still hit the native flush gap after ui#68 (Left Shift OK).
 * Synth ShiftLeft/ShiftRight on the physical modifier events too.
 *
 * Do not call `_keyboardManager.onKeyDown` behind the SDK (#59). Do not queue
 * disconnected keys. Focus helpers below keep the nested SDK canvas from
 * stealing focus; they are not a send path.
 */

const EDITABLE_SELECTOR = 'input, textarea, select';

/** key → [keyCode, code, needsShift] for physical keys not covered by char KEY_MAP. */
export const CONSOLE_SPECIAL_KEYS: Record<string, [number, string, boolean]> = {
	Enter: [13, 'Enter', false],
	Backspace: [8, 'Backspace', false],
	Tab: [9, 'Tab', false],
	Escape: [27, 'Escape', false],
	Delete: [46, 'Delete', false],
	ArrowLeft: [37, 'ArrowLeft', false],
	ArrowUp: [38, 'ArrowUp', false],
	ArrowRight: [39, 'ArrowRight', false],
	ArrowDown: [40, 'ArrowDown', false],
	Home: [36, 'Home', false],
	End: [35, 'End', false],
	PageUp: [33, 'PageUp', false],
	PageDown: [34, 'PageDown', false],
	Insert: [45, 'Insert', false]
};

/** Physical Shift → KeyboardEvent.code for synth (native Right Shift flushes on Ubuntu). */
export function resolveConsoleShiftCode(event: KeyboardEvent): 'ShiftLeft' | 'ShiftRight' | null {
	if (event.key !== 'Shift') return null;
	if (event.code === 'ShiftRight') return 'ShiftRight';
	if (event.code === 'ShiftLeft') return 'ShiftLeft';
	// DOM_KEY_LOCATION_RIGHT === 2
	if (event.location === 2) return 'ShiftRight';
	return 'ShiftLeft';
}

export function isEditableFormControl(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return target.closest(EDITABLE_SELECTOR) !== null;
}

/** True for the console paste chord (Ctrl+V / Cmd+V, Shift optional). */
export function isConsolePasteChord(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		!event.altKey &&
		(event.key === 'V' || event.key === 'v')
	);
}

/**
 * Resolve a physical key to a synth mapping when we must bypass native KM2.
 * `printableKeyMap` is the component US KEY_MAP (char → keyCode/code/shift).
 * Shift modifiers are handled separately via `resolveConsoleShiftCode`.
 */
export function resolveConsoleSynthMapping(
	event: KeyboardEvent,
	printableKeyMap: Record<string, [number, string, boolean]>
): [number, string, boolean] | null {
	if (event.ctrlKey || event.altKey || event.metaKey) return null;
	if (event.key === 'Shift') return null;
	const special = CONSOLE_SPECIAL_KEYS[event.key];
	if (special) return special;
	if (event.key.length === 1 && printableKeyMap[event.key]) {
		return printableKeyMap[event.key];
	}
	return null;
}

/** Force every nested framebuffer canvas to tabindex=-1 (SDK default is 1). */
export function demoteNestedConsoleCanvases(root: ParentNode | null | undefined): HTMLCanvasElement[] {
	if (!root || typeof root.querySelectorAll !== 'function') return [];
	const changed: HTMLCanvasElement[] = [];
	for (const node of root.querySelectorAll('canvas')) {
		if (!(node instanceof HTMLCanvasElement)) continue;
		if (node.tabIndex !== -1) {
			node.tabIndex = -1;
			changed.push(node);
		}
	}
	return changed;
}

/**
 * True when physical keys would miss #console-canvas (body / empty / the
 * nested SDK canvas) and we should move focus back to the widget element.
 * Never steal from editors or toolbar buttons/links.
 */
export function shouldReclaimConsoleFocus(
	active: EventTarget | null,
	consoleEl: HTMLElement | null
): boolean {
	if (!consoleEl) return false;
	if (isEditableFormControl(active)) return false;
	if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) {
		return false;
	}
	if (active === consoleEl) return false;
	if (active instanceof HTMLCanvasElement && consoleEl.contains(active)) return true;
	if (!active || active === document.body || active === document.documentElement) return true;
	return false;
}

/** Observe #console-canvas for a late / replaced SDK canvas and demote it. */
export function observeNestedConsoleCanvases(
	root: HTMLElement,
	onMutate?: () => void
): MutationObserver {
	const apply = () => {
		demoteNestedConsoleCanvases(root);
		onMutate?.();
	};
	apply();
	const observer = new MutationObserver(apply);
	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['tabindex']
	});
	return observer;
}
