/** Standalone, sidebar-free briefing page for a pod. */
export function briefingHref(podId: string): string {
	return `/briefing/${encodeURIComponent(podId)}`;
}

/**
 * Open the briefing in a named popup so it can sit beside the VM console.
 * The fixed window name makes a second click reuse and raise the same
 * window instead of stacking new ones. Returns null when the browser
 * blocked the popup; the caller then offers the plain new-tab link.
 */
export function openBriefingWindow(podId: string): Window | null {
	const w = window.open(briefingHref(podId), `crucible-briefing-${podId}`, 'popup,width=760,height=900');
	w?.focus();
	return w;
}
