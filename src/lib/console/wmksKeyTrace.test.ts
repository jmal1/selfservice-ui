import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	attachWmksKeyTrace,
	describeKeyboardManager,
	formatWmksKeyTraceRecord,
	getWmksKeyTrace,
	isWmksDebugEnabled,
	removeWmksDebugHud,
	resetWmksKeyTrace,
	WMKS_DEBUG_HUD_ID
} from './wmksKeyTrace';

afterEach(() => {
	resetWmksKeyTrace();
	removeWmksDebugHud();
});

describe('wmks key trace (debug only — not the send path)', () => {
	it('is off unless ?wmksDebug=1', () => {
		expect(isWmksDebugEnabled('')).toBe(false);
		expect(isWmksDebugEnabled('?foo=1')).toBe(false);
		expect(isWmksDebugEnabled('?wmksDebug=0')).toBe(false);
		expect(isWmksDebugEnabled('?wmksDebug=1')).toBe(true);
		expect(isWmksDebugEnabled('foo=1&wmksDebug=1')).toBe(true);
	});

	it('classifies KeyboardManager2 by sendVScanKey (nwmks default)', () => {
		expect(describeKeyboardManager({ sendVScanKey: () => {}, sendKey: () => {} })).toBe(
			'KeyboardManager2'
		);
		expect(describeKeyboardManager({ sendKey: () => {} })).toBe('KeyboardManager');
		expect(describeKeyboardManager({})).toBe('unknown');
	});

	it('records physical vs paste keydown and whether the live bind / vScan ran', () => {
		const native = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true });
		const onKeyDown = vi.fn();
		const onKeyVScan = vi.fn();
		const onVMWKeyUnicode = vi.fn();
		const wmksData = {
			_keyboardManager: { onKeyDown, sendVScanKey: () => {} },
			_vncDecoder: { onKeyVScan, onVMWKeyUnicode }
		};

		let source: 'physical' | 'paste' = 'physical';
		const dispose = attachWmksKeyTrace({ wmksData, getSource: () => source });

		document.body.dispatchEvent(native);
		wmksData._keyboardManager.onKeyDown({ originalEvent: native, currentTarget: document.body });
		wmksData._vncDecoder.onKeyVScan(30, true);

		source = 'paste';
		const paste = new KeyboardEvent('keydown', { key: 'H', code: 'KeyH', bubbles: true });
		document.body.dispatchEvent(paste);
		wmksData._keyboardManager.onKeyDown({ originalEvent: paste, currentTarget: document.body });
		wmksData._vncDecoder.onKeyVScan(35, true);

		const records = getWmksKeyTrace();
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			source: 'physical',
			key: 'a',
			code: 'KeyA',
			keydownWmks: true,
			onKeyDown: true,
			keyboardManager: 'KeyboardManager2',
			onKeyVScan: true,
			onVMWKeyUnicode: false
		});
		expect(records[1]).toMatchObject({
			source: 'paste',
			key: 'H',
			code: 'KeyH',
			keydownWmks: true,
			onKeyDown: true,
			onKeyVScan: true
		});
		expect(formatWmksKeyTraceRecord(records[0])).toContain('physical');
		expect(onKeyDown).toHaveBeenCalled();
		expect(onKeyVScan).toHaveBeenCalled();
		expect(onVMWKeyUnicode).not.toHaveBeenCalled();

		dispose();
	});

	it('does not mount a HUD when debug is off', () => {
		expect(document.getElementById(WMKS_DEBUG_HUD_ID)).toBeNull();
	});
});
