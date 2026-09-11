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

	it('records keyCode/which and onKeyVScan scancode args for physical vs paste', () => {
		const native = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true });
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
		const paste = new KeyboardEvent('keydown', { key: 'H', code: 'KeyH', keyCode: 72, bubbles: true });
		document.body.dispatchEvent(paste);
		wmksData._keyboardManager.onKeyDown({ originalEvent: paste, currentTarget: document.body });
		wmksData._vncDecoder.onKeyVScan(35, true);

		const records = getWmksKeyTrace();
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			source: 'physical',
			type: 'keydown',
			key: 'a',
			code: 'KeyA',
			keyCode: 65,
			keydownWmks: true,
			onKeyDown: true,
			keyboardManager: 'KeyboardManager2',
			onKeyVScan: true,
			vscanKey: 30,
			vscanDown: true,
			onVMWKeyUnicode: false,
			screenRefresh: false
		});
		expect(records[1]).toMatchObject({
			source: 'paste',
			key: 'H',
			code: 'KeyH',
			keyCode: 72,
			keydownWmks: true,
			onKeyDown: true,
			onKeyVScan: true,
			vscanKey: 35,
			vscanDown: true
		});
		const formatted = formatWmksKeyTraceRecord(records[0]);
		expect(formatted).toContain('physical');
		expect(formatted).toContain('kc=65');
		expect(formatted).toContain('scan=30');
		expect(formatted).toContain('down=1');
		expect(onKeyDown).toHaveBeenCalled();
		expect(onKeyVScan).toHaveBeenCalled();
		expect(onVMWKeyUnicode).not.toHaveBeenCalled();

		dispose();
	});

	it('records keyup without treating it as the send path', () => {
		const wmksData = {
			_keyboardManager: { onKeyDown: vi.fn(), sendVScanKey: () => {} },
			_vncDecoder: { onKeyVScan: vi.fn(), onVMWKeyUnicode: vi.fn() }
		};
		const dispose = attachWmksKeyTrace({ wmksData, getSource: () => 'physical' });
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'f', code: 'KeyF', keyCode: 70, bubbles: true }));
		expect(getWmksKeyTrace()[0]).toMatchObject({ type: 'keyup', key: 'f', code: 'KeyF', keyCode: 70 });
		dispose();
	});

	it('calls onPhysicalVScan after physical keyup reaches onKeyVScan (flush A/B)', () => {
		const onPhysicalVScan = vi.fn();
		const onKeyVScan = vi.fn();
		const wmksData = {
			_keyboardManager: { onKeyDown: vi.fn(), sendVScanKey: () => {} },
			_vncDecoder: { onKeyVScan, onVMWKeyUnicode: vi.fn() }
		};
		const dispose = attachWmksKeyTrace({
			wmksData,
			getSource: () => 'physical',
			onPhysicalVScan
		});
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'f', code: 'KeyF', keyCode: 70, bubbles: true }));
		wmksData._vncDecoder.onKeyVScan(33, false);
		expect(onPhysicalVScan).toHaveBeenCalledTimes(1);
		expect(getWmksKeyTrace()[0]).toMatchObject({ screenRefresh: true, vscanKey: 33, vscanDown: false });
		expect(formatWmksKeyTraceRecord(getWmksKeyTrace()[0])).toContain('scr=1');
		dispose();
	});

	it('does not mount a HUD when debug is off', () => {
		expect(document.getElementById(WMKS_DEBUG_HUD_ID)).toBeNull();
	});
});
