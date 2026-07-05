import { describe, it, expect, vi } from 'vitest';
import { isPlainEnter, handleWizardEnter, type WizardEnterOptions } from './wizardEnter';

/** Build a KeyboardEvent-like object with a stubbed preventDefault + target. */
function keyEvent(
	overrides: Partial<KeyboardEvent> & { targetTag?: string; contentEditable?: boolean } = {}
): KeyboardEvent {
	const { targetTag = 'DIV', contentEditable = false, ...rest } = overrides;
	const target = { tagName: targetTag, isContentEditable: contentEditable };
	return {
		key: 'Enter',
		isComposing: false,
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		target,
		preventDefault: vi.fn(),
		...rest
	} as unknown as KeyboardEvent;
}

describe('isPlainEnter', () => {
	it('accepts a bare Enter on a non-interactive element', () => {
		expect(isPlainEnter(keyEvent())).toBe(true);
		expect(isPlainEnter(keyEvent({ targetTag: 'INPUT' }))).toBe(true);
	});

	it('rejects non-Enter keys', () => {
		expect(isPlainEnter(keyEvent({ key: 'a' }))).toBe(false);
		expect(isPlainEnter(keyEvent({ key: 'Tab' }))).toBe(false);
	});

	it('rejects Enter during IME composition', () => {
		expect(isPlainEnter(keyEvent({ isComposing: true }))).toBe(false);
	});

	it('rejects Enter with any modifier held', () => {
		expect(isPlainEnter(keyEvent({ shiftKey: true }))).toBe(false);
		expect(isPlainEnter(keyEvent({ ctrlKey: true }))).toBe(false);
		expect(isPlainEnter(keyEvent({ metaKey: true }))).toBe(false);
		expect(isPlainEnter(keyEvent({ altKey: true }))).toBe(false);
	});

	it('yields to elements with native Enter semantics', () => {
		for (const tag of ['BUTTON', 'A', 'TEXTAREA', 'SELECT']) {
			expect(isPlainEnter(keyEvent({ targetTag: tag }))).toBe(false);
		}
	});

	it('yields to contenteditable elements', () => {
		expect(isPlainEnter(keyEvent({ targetTag: 'DIV', contentEditable: true }))).toBe(false);
	});
});

describe('handleWizardEnter', () => {
	function opts(over: Partial<WizardEnterOptions> = {}): WizardEnterOptions {
		return {
			canAdvance: () => true,
			isLastStep: () => false,
			advance: vi.fn(),
			submit: vi.fn(),
			busy: () => false,
			...over
		};
	}

	it('advances on a valid non-final step and prevents default', () => {
		const e = keyEvent();
		const o = opts();
		handleWizardEnter(e, o);
		expect(o.advance).toHaveBeenCalledOnce();
		expect(o.submit).not.toHaveBeenCalled();
		expect(e.preventDefault).toHaveBeenCalledOnce();
	});

	it('does not advance when the step is invalid', () => {
		const e = keyEvent();
		const o = opts({ canAdvance: () => false });
		handleWizardEnter(e, o);
		expect(o.advance).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('submits on the last step regardless of canAdvance', () => {
		const e = keyEvent();
		const o = opts({ isLastStep: () => true, canAdvance: () => false });
		handleWizardEnter(e, o);
		expect(o.submit).toHaveBeenCalledOnce();
		expect(o.advance).not.toHaveBeenCalled();
		expect(e.preventDefault).toHaveBeenCalledOnce();
	});

	it('is a no-op while busy', () => {
		const e = keyEvent();
		const o = opts({ busy: () => true, isLastStep: () => true });
		handleWizardEnter(e, o);
		expect(o.submit).not.toHaveBeenCalled();
		expect(o.advance).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('is a no-op for a non-plain Enter (focused button)', () => {
		const e = keyEvent({ targetTag: 'BUTTON' });
		const o = opts();
		handleWizardEnter(e, o);
		expect(o.advance).not.toHaveBeenCalled();
		expect(o.submit).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('works without a busy() callback', () => {
		const e = keyEvent();
		const o = opts();
		delete (o as Partial<WizardEnterOptions>).busy;
		handleWizardEnter(e, o);
		expect(o.advance).toHaveBeenCalledOnce();
	});
});
