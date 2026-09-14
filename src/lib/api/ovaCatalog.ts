/**
 * Helpers for GET /api/v1/admin/vcenter/ovas — the wizard's Imported OVA picker.
 *
 * The catalog (not /admin/images and not the templates-folder VM list) is the
 * discovery surface for source_type=ovf. Selectable rows carry source_ref, the
 * imported VM moref. In-flight and failed rows stay visible but disabled.
 */

import type { OVACatalogEntry } from '$lib/types';

export type { OVACatalogEntry, VCenterOVAListResponse } from '$lib/types';

/** Deep-link from Images after an OVA import finishes. */
export function ovaCreateTemplateHref(sourceRef: string): string {
	const moref = sourceRef.trim();
	if (!moref) return '/admin/templates/new?source_type=ovf';
	return `/admin/templates/new?source_type=ovf&source_ref=${encodeURIComponent(moref)}`;
}

export function ovaEntryIsSelectable(entry: OVACatalogEntry): boolean {
	return !entry.disabled && !!entry.source_ref;
}

/** Options the Imported OVA picker may bind as source_ref. Folder VMs are not mixed in. */
export function ovaPickerOptions(
	ovas: OVACatalogEntry[],
	deepLinkedSourceRef?: string
): OVACatalogEntry[] {
	const out = [...ovas];
	const linked = deepLinkedSourceRef?.trim();
	if (linked && !out.some((e) => e.source_ref === linked)) {
		out.unshift({
			name: linked,
			image_id: '',
			status: 'imported',
			disabled: false,
			source_ref: linked,
			reason: 'from create-template link'
		});
	}
	return out;
}

export function ovaPickerLabel(entry: OVACatalogEntry): string {
	if (entry.disabled) {
		if (entry.status === 'error') {
			const detail = entry.error_message || entry.reason || 'import failed';
			return `⚠ ${entry.name} — ${detail}`;
		}
		return `⏳ ${entry.name} — ${entry.reason || 'still being uploaded or imported'}`;
	}
	if (entry.source_ref) {
		return `${entry.name} (${entry.source_ref})`;
	}
	return entry.name;
}
