/**
 * Optional WebMKS key-path probe. Off unless `?wmksDebug=1`.
 *
 * Observes only: does not preventDefault / stopPropagation, does not call
 * `_keyboardManager.onKeyDown`, and is not a send path.
 *
 * After ui#62: operator Edge showed physical keys reach onKeyVScan (vscan=1)
 * but Ubuntu guest showed no glyph while Paste + Windows physical worked.
 * This build records keyCode/which and the scancode args into onKeyVScan so
 * we can compare physical vs paste on that client.
 */

export const WMKS_KEY_TRACE_LIMIT = 50;
export const WMKS_DEBUG_HUD_ID = 'wmks-debug-hud';

export type KeyboardManagerKind = 'KeyboardManager2' | 'KeyboardManager' | 'unknown';

export type WmksKeyTraceEl = {
	id: string;
	tag: string;
	className: string;
};

export type WmksKeyTraceRecord = {
	t: number;
	source: 'physical' | 'paste';
	type: 'keydown' | 'keyup';
	key: string;
	code: string;
	keyCode: number;
	which: number;
	repeat: boolean;
	active: WmksKeyTraceEl;
	target: WmksKeyTraceEl;
	currentTarget: WmksKeyTraceEl;
	keydownWmks: boolean;
	onKeyDown: boolean;
	keyboardManager: KeyboardManagerKind;
	onKeyVScan: boolean;
	onVMWKeyUnicode: boolean;
	/** First arg to `_vncDecoder.onKeyVScan` when observed (PC scancode). */
	vscanKey: number | null;
	/** Second arg to `_vncDecoder.onKeyVScan` when observed (keydown=true). */
	vscanDown: boolean | null;
	/** First arg to `_vncDecoder.onVMWKeyUnicode` when observed. */
	unicodeKey: number | null;
	/** Debug-only: `updateScreen()` ran after this physical key (flush A/B). */
	screenRefresh: boolean;
};

type WmksDataLike = {
	_keyboardManager?: {
		onKeyDown?: (...args: unknown[]) => unknown;
		sendVScanKey?: unknown;
		sendKey?: unknown;
	};
	_vncDecoder?: {
		onKeyVScan?: (...args: unknown[]) => unknown;
		onVMWKeyUnicode?: (...args: unknown[]) => unknown;
	};
};

const WRAPPED = Symbol('wmksKeyTraceWrapped');

let ring: WmksKeyTraceRecord[] = [];

export function isWmksDebugEnabled(
	search = typeof window !== 'undefined' ? window.location.search : ''
): boolean {
	try {
		return new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('wmksDebug') === '1';
	} catch {
		return false;
	}
}

export function getWmksKeyTrace(): readonly WmksKeyTraceRecord[] {
	return ring;
}

export function resetWmksKeyTrace(): void {
	ring = [];
}

export function describeEl(el: EventTarget | null | undefined): WmksKeyTraceEl {
	if (!(el instanceof Element)) return { id: '', tag: '', className: '' };
	const className = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
	return { id: el.id || '', tag: el.tagName.toLowerCase(), className };
}

export function describeKeyboardManager(km: unknown): KeyboardManagerKind {
	if (!km || typeof km !== 'object') return 'unknown';
	const rec = km as { sendVScanKey?: unknown; sendKey?: unknown };
	if (typeof rec.sendVScanKey === 'function') return 'KeyboardManager2';
	if (typeof rec.sendKey === 'function') return 'KeyboardManager';
	return 'unknown';
}

function numArg(arg: unknown): number | null {
	return typeof arg === 'number' && Number.isFinite(arg) ? arg : null;
}

export function formatWmksKeyTraceRecord(rec: WmksKeyTraceRecord): string {
	const active = `${rec.active.tag}${rec.active.id ? '#' + rec.active.id : ''}`;
	const target = `${rec.target.tag}${rec.target.id ? '#' + rec.target.id : ''}`;
	const parts = [
		rec.source,
		rec.type,
		`${rec.key}/${rec.code}`,
		`kc=${rec.keyCode}`,
		`which=${rec.which}`,
		rec.repeat ? 'repeat' : null,
		`active=${active}`,
		`target=${target}`,
		`wmks=${rec.keydownWmks ? 1 : 0}`,
		`onKeyDown=${rec.onKeyDown ? 1 : 0}`,
		rec.keyboardManager,
		`vscan=${rec.onKeyVScan ? 1 : 0}`,
		rec.vscanKey !== null ? `scan=${rec.vscanKey}` : null,
		rec.vscanDown !== null ? `down=${rec.vscanDown ? 1 : 0}` : null,
		`unicode=${rec.onVMWKeyUnicode ? 1 : 0}`,
		rec.unicodeKey !== null ? `uch=${rec.unicodeKey}` : null,
		rec.screenRefresh ? 'scr=1' : null
	];
	return parts.filter((p) => p != null && p !== '').join(' ');
}

function pushRecord(rec: WmksKeyTraceRecord): void {
	ring.push(rec);
	if (ring.length > WMKS_KEY_TRACE_LIMIT) {
		ring.splice(0, ring.length - WMKS_KEY_TRACE_LIMIT);
	}
	renderWmksDebugHud();
}

export function removeWmksDebugHud(): void {
	if (typeof document === 'undefined') return;
	document.getElementById(WMKS_DEBUG_HUD_ID)?.remove();
}

export function renderWmksDebugHud(): void {
	if (typeof document === 'undefined' || !isWmksDebugEnabled()) return;
	let hud = document.getElementById(WMKS_DEBUG_HUD_ID);
	if (!hud) {
		hud = document.createElement('pre');
		hud.id = WMKS_DEBUG_HUD_ID;
		hud.setAttribute('aria-hidden', 'true');
		hud.setAttribute('data-testid', WMKS_DEBUG_HUD_ID);
		Object.assign(hud.style, {
			position: 'fixed',
			left: '8px',
			bottom: '8px',
			zIndex: '99999',
			maxWidth: '72rem',
			maxHeight: '14rem',
			overflow: 'auto',
			margin: '0',
			padding: '6px 8px',
			fontSize: '10px',
			lineHeight: '1.35',
			color: '#d1fae5',
			background: 'rgba(0,0,0,0.75)',
			border: '1px solid rgba(52,211,153,0.4)',
			pointerEvents: 'none',
			whiteSpace: 'pre-wrap'
		} as CSSStyleDeclaration);
		document.body.appendChild(hud);
	}
	const lines = ring.slice(-10).map(formatWmksKeyTraceRecord);
	hud.textContent = [`wmksDebug last ${ring.length}/${WMKS_KEY_TRACE_LIMIT}`, ...lines].join('\n');
}

function wrapMethod(
	obj: Record<string, unknown> | null | undefined,
	name: string,
	hook: (...args: unknown[]) => void
): void {
	if (!obj) return;
	const orig = obj[name];
	if (typeof orig !== 'function' || (orig as { [WRAPPED]?: boolean })[WRAPPED]) return;
	const wrapped = function (this: unknown, ...args: unknown[]) {
		hook.apply(this, args);
		return orig.apply(this, args);
	};
	(wrapped as { [WRAPPED]?: boolean })[WRAPPED] = true;
	obj[name] = wrapped;
}

function nativeFromKeyArg(arg: unknown): Event | null {
	if (arg instanceof Event) return arg;
	if (arg && typeof arg === 'object' && 'originalEvent' in arg) {
		const native = (arg as { originalEvent?: unknown }).originalEvent;
		if (native instanceof Event) return native;
	}
	return null;
}

export function attachWmksKeyTrace(opts: {
	wmksData: WmksDataLike | null | undefined;
	getSource: () => 'physical' | 'paste';
	/**
	 * Optional debug probe: after a physical key reaches onKeyVScan, ask the
	 * SDK to refresh the framebuffer. Operator reported physical glyphs only
	 * appear after Paste (click does not flush) — this A/B tests display lag
	 * vs a true deferred send. Observe-only aside from updateScreen.
	 */
	onPhysicalVScan?: (rec: WmksKeyTraceRecord) => void;
}): () => void {
	resetWmksKeyTrace();
	renderWmksDebugHud();

	const inflight = new WeakMap<Event, WmksKeyTraceRecord>();
	let lastRec: WmksKeyTraceRecord | null = null;
	const km = opts.wmksData?._keyboardManager;
	const decoder = opts.wmksData?._vncDecoder;
	const managerKind = describeKeyboardManager(km);

	const onCapture = (event: Event) => {
		if (!(event instanceof KeyboardEvent)) return;
		if (event.type !== 'keydown' && event.type !== 'keyup') return;
		const rec: WmksKeyTraceRecord = {
			t: Date.now(),
			source: opts.getSource(),
			type: event.type,
			key: event.key,
			code: event.code,
			keyCode: event.keyCode,
			which: event.which,
			repeat: event.repeat,
			active: describeEl(document.activeElement),
			target: describeEl(event.target),
			currentTarget: describeEl(event.currentTarget),
			keydownWmks: false,
			onKeyDown: false,
			keyboardManager: managerKind,
			onKeyVScan: false,
			onVMWKeyUnicode: false,
			vscanKey: null,
			vscanDown: null,
			unicodeKey: null,
			screenRefresh: false
		};
		inflight.set(event, rec);
		lastRec = rec;
		pushRecord(rec);
	};

	wrapMethod(km as Record<string, unknown> | undefined, 'onKeyDown', (arg) => {
		const native = nativeFromKeyArg(arg);
		const rec = (native && inflight.get(native)) || lastRec;
		if (!rec) return;
		rec.onKeyDown = true;
		rec.keydownWmks = true;
		if (arg && typeof arg === 'object' && 'currentTarget' in arg) {
			rec.currentTarget = describeEl((arg as { currentTarget?: EventTarget | null }).currentTarget);
		}
		renderWmksDebugHud();
	});
	wrapMethod(decoder as Record<string, unknown> | undefined, 'onKeyVScan', (keyArg, downArg) => {
		const rec = lastRec;
		if (!rec) return;
		rec.onKeyVScan = true;
		rec.vscanKey = numArg(keyArg);
		rec.vscanDown = typeof downArg === 'boolean' ? downArg : null;
		// Flush A/B: only after physical keyup (complete press) so we do not
		// refresh twice per key. Paste already causes enough screen damage.
		if (
			rec.source === 'physical' &&
			rec.type === 'keyup' &&
			typeof opts.onPhysicalVScan === 'function'
		) {
			try {
				opts.onPhysicalVScan(rec);
				rec.screenRefresh = true;
			} catch {
				/* probe must never break the send path */
			}
		}
		renderWmksDebugHud();
	});
	wrapMethod(decoder as Record<string, unknown> | undefined, 'onVMWKeyUnicode', (keyArg) => {
		const rec = lastRec;
		if (!rec) return;
		rec.onVMWKeyUnicode = true;
		rec.unicodeKey = numArg(keyArg);
		renderWmksDebugHud();
	});

	// Observe only — never preventDefault / stopPropagation (#59).
	document.addEventListener('keydown', onCapture, true);
	document.addEventListener('keyup', onCapture, true);

	return () => {
		document.removeEventListener('keydown', onCapture, true);
		document.removeEventListener('keyup', onCapture, true);
		lastRec = null;
		removeWmksDebugHud();
	};
}
