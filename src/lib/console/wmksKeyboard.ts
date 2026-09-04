/**
 * Small console-keyboard helpers. Physical keys are NOT delivered here.
 *
 * Last-known-good send path (0a2d9c80 / eeb3b843 #15): the HTML5 WMKS SDK
 * (static/wmks/wmks.js) binds `keydown.wmks` on `this.element` (#console-canvas)
 * and that handler calls `_keyboardManager.onKeyDown` (KeyboardManager2 →
 * onKeyVScan). A window capture that preventDefault+stopPropagation-eats the
 * event (#59) starves that bind. Do not reintroduce a replacement send path.
 *
 * Paste already `dispatchEvent`s on #console-canvas, so the bind always sees
 * it. Physical keys only reach that same bind when focus is on #console-canvas
 * or a descendant. Helpers below keep the nested SDK canvas (tabindex=1)
 * from becoming the focused node and say when we should reclaim container
 * focus — they do not send keys.
 */

const EDITABLE_SELECTOR = 'input, textarea, select';

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
