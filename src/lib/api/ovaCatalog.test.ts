import { describe, expect, it } from 'vitest';
import {
	ovaCreateTemplateHref,
	ovaEntryIsSelectable,
	ovaPickerLabel,
	ovaPickerOptions,
	type OVACatalogEntry
} from './ovaCatalog';

const imported: OVACatalogEntry = {
	name: 'lab.ova',
	image_id: 'img-1',
	status: 'imported',
	disabled: false,
	source_ref: 'vm-4242'
};

const importing: OVACatalogEntry = {
	name: 'busy.ova',
	image_id: 'img-2',
	status: 'importing',
	disabled: true,
	reason: 'still being uploaded or imported'
};

const failed: OVACatalogEntry = {
	name: 'bad.ova',
	image_id: 'img-3',
	status: 'error',
	disabled: true,
	reason: 'import failed; retry with POST /admin/images/{id}/import',
	error_message: 'not enough free space'
};

describe('ovaCreateTemplateHref', () => {
	it('encodes the imported moref for the wizard OVA picker', () => {
		expect(ovaCreateTemplateHref('vm-4242')).toBe(
			'/admin/templates/new?source_type=ovf&source_ref=vm-4242'
		);
	});

	it('falls back to ovf without a moref when the id is blank', () => {
		expect(ovaCreateTemplateHref('  ')).toBe('/admin/templates/new?source_type=ovf');
	});
});

describe('ovaEntryIsSelectable', () => {
	it('requires an enabled row with a moref', () => {
		expect(ovaEntryIsSelectable(imported)).toBe(true);
		expect(ovaEntryIsSelectable(importing)).toBe(false);
		expect(ovaEntryIsSelectable({ ...imported, disabled: false, source_ref: undefined })).toBe(
			false
		);
	});
});

describe('ovaPickerOptions', () => {
	it('does not invent folder VMs — catalog rows only', () => {
		const opts = ovaPickerOptions([imported, importing]);
		expect(opts.map((e) => e.name)).toEqual(['lab.ova', 'busy.ova']);
		expect(opts.some((e) => e.name === 'unrelated-folder-vm')).toBe(false);
	});

	it('keeps a deep-linked moref selectable even if the catalog has not refreshed', () => {
		const opts = ovaPickerOptions([importing], 'vm-999');
		expect(opts[0]?.source_ref).toBe('vm-999');
		expect(ovaEntryIsSelectable(opts[0])).toBe(true);
	});

	it('does not duplicate a moref already in the catalog', () => {
		const opts = ovaPickerOptions([imported], 'vm-4242');
		expect(opts.filter((e) => e.source_ref === 'vm-4242')).toHaveLength(1);
	});
});

describe('ovaPickerLabel', () => {
	it('shows moref on imported rows and reason on in-flight / error rows', () => {
		expect(ovaPickerLabel(imported)).toBe('lab.ova (vm-4242)');
		expect(ovaPickerLabel(importing)).toContain('⏳');
		expect(ovaPickerLabel(importing)).toContain('still being uploaded or imported');
		expect(ovaPickerLabel(failed)).toContain('⚠');
		expect(ovaPickerLabel(failed)).toContain('not enough free space');
	});
});
