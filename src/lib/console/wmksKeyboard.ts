/**
 * Live-WMKS keyboard delivery for the shared console.
 *
 * The shipped HTML5 WMKS SDK (static/wmks/wmks.js, nwmks widget) binds
 * keydown/keypress/keyup to `this.element` (#console-canvas) and then
 * KeyboardManager2 calls `_vncDecoder.onKeyVScan`. That is the only send
 * path that actually injects native keys into the guest while vScan is
 * enabled (the Windows-working default).
 *
 * DOM focus on the canvas is not sufficient:
 *   - toolbar / overlay clicks move focus off `this.element`
 *   - the SDK's nested canvas is created with tabindex=1 and can steal focus
 *   - a stale jQuery widget left bound on the container will preventDefault
 *     keys without talking to the live CoreWMKS instance
 *   - VNCDecoder.onKeyVScan silently drops keys when `_serverInitialized`
 *     is false (disconnected / not yet handed off)
 *
 * Paste still works today because it synthesizes KeyboardEvents onto the
 * container, bypassing focus. Native keys must instead be handed to the
 * *live* `wmks.wmksData._keyboardManager` while connected, and dropped
 * (never queued) otherwise — a deferred queue is what produces the
 * "leave the pod and the keys flush on return" symptom.
 */

export type WmksKeyEvent = {
	originalEvent: KeyboardEvent;
	type: string;
	keyCode: number;
	which: number;
	key: string;
	code: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	preventDefault: () => void;
	stopPropagation: () => void;
	returnValue: boolean;
};

export type WmksKeyHandler = {
	onKeyDown?: (event: WmksKeyEvent) => unknown;
	onKeyPress?: (event: WmksKeyEvent) => unknown;
	onKeyUp?: (event: WmksKeyEvent) => unknown;
};

export type LiveWmks = {
	wmksData?: {
		_keyboardManager?: WmksKeyHandler;
		element?: { 0?: HTMLElement } | HTMLElement;
	};
	wmks?: {
		0?: HTMLElement;
		data?: (key: string) => { _keyboardManager?: WmksKeyHandler } | undefined;
	};
	_keyboardManager?: WmksKeyHandler;
};

const EDITABLE_SELECTOR = 'input, textarea, select';

export function isEditableFormControl(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return target.closest(EDITABLE_SELECTOR) !== null;
}

export function getLiveKeyboardManager(wmks: LiveWmks | null | undefined): WmksKeyHandler | null {
	if (!wmks) return null;
	return (
		wmks.wmksData?._keyboardManager ??
		wmks._keyboardManager ??
		wmks.wmks?.data?.('nwmks')?._keyboardManager ??
		wmks.wmks?.data?.('wmks-nwmks')?._keyboardManager ??
		null
	);
}

export function getLiveWmksElement(
	wmks: LiveWmks | null | undefined,
	fallback?: HTMLElement | null
): HTMLElement | null {
	const fromWidget = wmks?.wmksData?.element;
	if (fromWidget instanceof HTMLElement) return fromWidget;
	if (fromWidget && fromWidget[0] instanceof HTMLElement) return fromWidget[0];
	if (wmks?.wmks?.[0] instanceof HTMLElement) return wmks.wmks[0];
	return fallback ?? null;
}

/**
 * Capture native keys that belong to the fullscreen console, including when
 * focus has fallen through to <body> after a toolbar click or canvas rebuild.
 * Never steal keys from the paste/text-input drawer.
 */
export function shouldDeliverNativeKey(
	event: KeyboardEvent,
	consoleRoot: HTMLElement | null | undefined
): boolean {
	if (event.isComposing) return false;
	if (isEditableFormControl(event.target)) return false;

	const target = event.target;
	if (!(target instanceof Node)) {
		// Window-level synthetic events in tests may have no target.
		return true;
	}
	if (!consoleRoot) return true;
	if (consoleRoot.contains(target)) return true;
	return target === document.body || target === document.documentElement;
}

export function toWmksKeyEvent(event: KeyboardEvent): WmksKeyEvent {
	return {
		originalEvent: event,
		type: event.type,
		keyCode: event.keyCode,
		which: event.which || event.keyCode,
		key: event.key,
		code: event.code,
		shiftKey: event.shiftKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		preventDefault: () => event.preventDefault(),
		stopPropagation: () => event.stopPropagation(),
		returnValue: true
	};
}

export type DeliverNativeKeyOptions = {
	wmks: LiveWmks | null | undefined;
	event: KeyboardEvent;
	/** Only deliver while the live session is connected. Disconnected keys are dropped, not queued. */
	connected: boolean;
	consoleRoot?: HTMLElement | null;
};

/**
 * Hand a native key event to the live WMKS keyboard manager.
 * Returns true if the live send path was invoked. Never records the event
 * for later replay — callers must not build a deferred queue around this.
 */
export function deliverNativeKeyToLiveWmks(opts: DeliverNativeKeyOptions): boolean {
	if (!opts.connected) return false;
	if (!shouldDeliverNativeKey(opts.event, opts.consoleRoot)) return false;

	const km = getLiveKeyboardManager(opts.wmks);
	if (!km) return false;

	const wrapped = toWmksKeyEvent(opts.event);
	if (opts.event.type === 'keydown') {
		km.onKeyDown?.(wrapped);
	} else if (opts.event.type === 'keypress') {
		km.onKeyPress?.(wrapped);
	} else if (opts.event.type === 'keyup') {
		km.onKeyUp?.(wrapped);
	} else {
		return false;
	}

	opts.event.preventDefault();
	opts.event.stopPropagation();
	return true;
}

/** True for the console paste chord (Ctrl+Shift+V / Cmd+Shift+V). */
export function isConsolePasteChord(event: KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		event.shiftKey &&
		(event.key === 'V' || event.key === 'v')
	);
}
