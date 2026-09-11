/**
 * Shared Enter-key navigation for wizard-style flows (e.g. the deploy env/VM
 * wizard and single-screen create forms).
 *
 * These flows aren't wrapped in a `<form>` and several controls are `<button>`s,
 * so browsers never fire an implicit submit and Enter does nothing. Wiring
 * `handleWizardEnter` to a `<svelte:window onkeydown>` gives every wizard the
 * expected behavior: Enter advances a step (or triggers the primary action on
 * the last step) while deliberately yielding to whatever the focused element
 * already does with Enter.
 */

/** Tags whose own Enter handling we must not override. */
const ENTER_NATIVE_TAGS = new Set(['BUTTON', 'A', 'TEXTAREA', 'SELECT']);

/**
 * True when the event is a plain Enter press we should act on:
 * the Enter key, with no modifier held, not mid-IME-composition, and not
 * targeting an element that has its own Enter semantics (a focused choice
 * button, link, textarea, or select).
 */
export function isPlainEnter(e: KeyboardEvent): boolean {
	if (e.key !== 'Enter' || e.isComposing) return false;
	if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;

	const target = e.target as HTMLElement | null;
	if (target) {
		if (ENTER_NATIVE_TAGS.has(target.tagName)) return false;
		if (target.isContentEditable) return false;
	}
	return true;
}

export interface WizardEnterOptions {
	/** Step-validity check; mirrors the disabled state of the Next button. Ignored on the last step. */
	canAdvance: () => boolean;
	/** Whether the wizard is on its final step (single-screen forms: always true). */
	isLastStep: () => boolean;
	/** Advance to the next step. */
	advance: () => void;
	/** Trigger the primary action (Deploy / Create). */
	submit: () => void;
	/** When true, Enter is ignored (e.g. loading or submitting). */
	busy?: () => boolean;
}

/**
 * Handle a keydown for a wizard: on the last step trigger `submit()`, otherwise
 * `advance()` when the current step is valid. No-ops for non-plain Enter presses
 * or while busy, and only calls `preventDefault()` when it actually acts.
 */
export function handleWizardEnter(e: KeyboardEvent, opts: WizardEnterOptions): void {
	if (!isPlainEnter(e)) return;
	if (opts.busy?.()) return;

	if (opts.isLastStep()) {
		e.preventDefault();
		opts.submit();
		return;
	}

	if (!opts.canAdvance()) return;
	e.preventDefault();
	opts.advance();
}
