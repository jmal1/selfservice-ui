import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
	let originalClipboard: PropertyDescriptor | undefined;

	beforeEach(() => {
		originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	});

	afterEach(() => {
		if (originalClipboard) {
			Object.defineProperty(navigator, 'clipboard', originalClipboard);
		}
	});

	function setClipboardMock(writeText: (text: string) => Promise<void>) {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});
	}

	it('returns true and writes the text when the clipboard API succeeds', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		setClipboardMock(writeText);

		const ok = await copyToClipboard('hello world');

		expect(ok).toBe(true);
		expect(writeText).toHaveBeenCalledOnce();
		expect(writeText).toHaveBeenCalledWith('hello world');
	});

	it('returns false (and does not throw) when the clipboard API rejects', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
		setClipboardMock(writeText);

		await expect(copyToClipboard('x')).resolves.toBe(false);
	});
});
