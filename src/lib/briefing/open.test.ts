import { afterEach, describe, expect, it, vi } from 'vitest';
import { briefingHref, openBriefingWindow } from './open';

afterEach(() => vi.restoreAllMocks());

describe('openBriefingWindow', () => {
	it('opens one named popup per pod and raises it', () => {
		const focus = vi.fn();
		const open = vi.spyOn(window, 'open').mockReturnValue({ focus } as unknown as Window);
		expect(openBriefingWindow('p-1')).not.toBeNull();
		expect(open).toHaveBeenCalledWith('/briefing/p-1', 'crucible-briefing-p-1', 'popup,width=760,height=900');
		expect(focus).toHaveBeenCalled();
	});

	it('returns null when the browser blocks the popup', () => {
		vi.spyOn(window, 'open').mockReturnValue(null);
		expect(openBriefingWindow('p-1')).toBeNull();
	});

	it('encodes the pod id in the standalone href', () => {
		expect(briefingHref('a/b')).toBe('/briefing/a%2Fb');
	});
});
