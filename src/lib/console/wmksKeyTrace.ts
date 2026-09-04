/**
 * Optional WebMKS key-path probe. Off unless `?wmksDebug=1`.
 *
 * Observes only: does not preventDefault / stopPropagation, does not call
 * `_keyboardManager.onKeyDown`, and is not a send path.
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
	key: string;
	code: string;
	active: WmksKeyTraceEl;
	target: WmksKeyTraceEl;
	currentTarget: WmksKeyTraceEl;
	keydownWmks: boolean;
	onKeyDown: boolean;
	keyboardManager: KeyboardManagerKind;
	onKeyVScan: boolean;
	onVMWKeyUnicode: boolean;
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

export function formatWmksKeyTraceRecord(rec: WmksKeyTraceRecord): string {
	const active = `${rec.active.tag}${rec.active.id ? '#' + rec.active.id : ''}`;
	const target = `${rec.target.tag}${rec.target.id ? '#' + rec.target.id : ''}`;
	return [
		rec.source,
		`${rec.key}/${rec.code}`,
		`active=${active}`,
		`target=${target}`,
		`wmks=${rec.keydownWmks ? 1 : 0}`,
		`onKeyDown=${rec.onKeyDown ? 1 : 0}`,
		rec.keyboardManager,
		`vscan=${rec.onKeyVScan ? 1 : 0}`,
		`unicode=${rec.onVMWKeyUnicode ? 1 : 0}`
	].join(' ');
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
			maxWidth: '56rem',
			maxHeight: '12rem',
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
	const lines = ring.slice(-8).map(formatWmksKeyTraceRecord);
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
}): () => void {
	resetWmksKeyTrace();
	renderWmksDebugHud();

	const inflight = new WeakMap<Event, WmksKeyTraceRecord>();
	let lastRec: WmksKeyTraceRecord | null = null;
	const km = opts.wmksData?._keyboardManager;
	const decoder = opts.wmksData?._vncDecoder;
	const managerKind = describeKeyboardManager(km);

	const onCapture = (event: Event) => {
		if (!(event instanceof KeyboardEvent) || event.type !== 'keydown') return;
		const rec: WmksKeyTraceRecord = {
			t: Date.now(),
			source: opts.getSource(),
			key: event.key,
			code: event.code,
			active: describeEl(document.activeElement),
			target: describeEl(event.target),
			currentTarget: describeEl(event.currentTarget),
			keydownWmks: false,
			onKeyDown: false,
			keyboardManager: managerKind,
			onKeyVScan: false,
			onVMWKeyUnicode: false
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
	wrapMethod(decoder as Record<string, unknown> | undefined, 'onKeyVScan', () => {
		if (lastRec) lastRec.onKeyVScan = true;
		renderWmksDebugHud();
	});
	wrapMethod(decoder as Record<string, unknown> | undefined, 'onVMWKeyUnicode', () => {
		if (lastRec) lastRec.onVMWKeyUnicode = true;
		renderWmksDebugHud();
	});

	// Observe only — never preventDefault / stopPropagation (#59).
	document.addEventListener('keydown', onCapture, true);

	return () => {
		document.removeEventListener('keydown', onCapture, true);
		lastRec = null;
		removeWmksDebugHud();
	};
}
