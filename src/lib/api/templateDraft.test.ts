import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	TEMPLATE_DRAFT_SOURCE_TYPES,
	SOURCE_TYPE_REQUIRED,
	SOURCE_TYPE_INVALID,
	SKIP_GENERALIZE_ISO,
	SKIP_GENERALIZE_CLONE_TEMPLATE,
	sourceTypeAllowsSkipGeneralize,
	defaultSkipGeneralizeForSourceType,
	OVA_SOURCE_TYPE_LABEL,
	validateTemplateDraftSource,
	buildCreateTemplateDraftBody
} from './templateDraft';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { adminCreateTemplateDraft, ApiError, type CreateTemplateDraftRequest } from './client';

function baseReq(
	over: Partial<CreateTemplateDraftRequest> = {}
): CreateTemplateDraftRequest {
	return {
		name: 'Ubuntu lab',
		os_type: 'linux',
		source_type: 'clone_template',
		source_ref: 'tpl-1',
		vcpus: 2,
		ram_mb: 4096,
		disk_gb: 40,
		...over
	};
}

describe('sourceTypeAllowsSkipGeneralize', () => {
	it('allows ovf and clone_vcenter only', () => {
		expect(sourceTypeAllowsSkipGeneralize('ovf')).toBe(true);
		expect(sourceTypeAllowsSkipGeneralize('clone_vcenter')).toBe(true);
		expect(sourceTypeAllowsSkipGeneralize('iso')).toBe(false);
		expect(sourceTypeAllowsSkipGeneralize('clone_template')).toBe(false);
		expect(sourceTypeAllowsSkipGeneralize('')).toBe(false);
	});
});

describe('defaultSkipGeneralizeForSourceType', () => {
	it('defaults on for prepared OVA appliances only', () => {
		expect(defaultSkipGeneralizeForSourceType('ovf')).toBe(true);
		expect(defaultSkipGeneralizeForSourceType('clone_vcenter')).toBe(false);
		expect(defaultSkipGeneralizeForSourceType('iso')).toBe(false);
		expect(defaultSkipGeneralizeForSourceType('clone_template')).toBe(false);
	});
});

describe('OVA_SOURCE_TYPE_LABEL', () => {
	it('names the wizard option OVA, not OVF', () => {
		expect(OVA_SOURCE_TYPE_LABEL).toBe('Imported OVA');
		expect(OVA_SOURCE_TYPE_LABEL).not.toMatch(/OVF/i);
	});
});

describe('validateTemplateDraftSource', () => {
	it('requires source_type with the API 400 copy', () => {
		expect(validateTemplateDraftSource({ source_type: '' })).toBe(SOURCE_TYPE_REQUIRED);
		expect(validateTemplateDraftSource({})).toBe(SOURCE_TYPE_REQUIRED);
	});

	it('rejects unknown source_type with the API 400 copy', () => {
		expect(validateTemplateDraftSource({ source_type: 'upload_uuid' })).toBe(
			SOURCE_TYPE_INVALID
		);
	});

	it('accepts every frozen source_type enum', () => {
		for (const source_type of TEMPLATE_DRAFT_SOURCE_TYPES) {
			expect(validateTemplateDraftSource({ source_type })).toBeNull();
		}
	});

	it('surfaces the iso skip_generalize 400 copy', () => {
		expect(
			validateTemplateDraftSource({ source_type: 'iso', skip_generalize: true })
		).toBe(SKIP_GENERALIZE_ISO);
	});

	it('surfaces the clone_template skip_generalize 400 copy', () => {
		expect(
			validateTemplateDraftSource({
				source_type: 'clone_template',
				skip_generalize: true
			})
		).toBe(SKIP_GENERALIZE_CLONE_TEMPLATE);
	});

	it('allows skip_generalize on ovf and clone_vcenter', () => {
		expect(
			validateTemplateDraftSource({ source_type: 'ovf', skip_generalize: true })
		).toBeNull();
		expect(
			validateTemplateDraftSource({
				source_type: 'clone_vcenter',
				skip_generalize: true
			})
		).toBeNull();
	});
});

describe('buildCreateTemplateDraftBody', () => {
	it('omits skip_generalize when false so clone/iso payloads stay unchanged', () => {
		const clone = buildCreateTemplateDraftBody(baseReq({ skip_generalize: false }));
		expect(clone).not.toHaveProperty('skip_generalize');
		expect(clone.source_type).toBe('clone_template');
		expect(clone.source_ref).toBe('tpl-1');

		const iso = buildCreateTemplateDraftBody(
			baseReq({ source_type: 'iso', source_ref: '[datastore] foo.iso', skip_generalize: false })
		);
		expect(iso).not.toHaveProperty('skip_generalize');
		expect(iso.source_type).toBe('iso');
	});

	it('omits skip_generalize when undefined', () => {
		expect(buildCreateTemplateDraftBody(baseReq())).not.toHaveProperty('skip_generalize');
	});

	it('sends skip_generalize:true for ovf with a vCenter moref', () => {
		const body = buildCreateTemplateDraftBody(
			baseReq({
				source_type: 'ovf',
				source_ref: 'vm-123',
				skip_generalize: true
			})
		);
		expect(body.source_type).toBe('ovf');
		expect(body.source_ref).toBe('vm-123');
		expect(body.skip_generalize).toBe(true);
	});

	it('does not strip skip_generalize:true on iso (do not hide the contract)', () => {
		const body = buildCreateTemplateDraftBody(
			baseReq({ source_type: 'iso', source_ref: 'iso-1', skip_generalize: true })
		);
		expect(body.skip_generalize).toBe(true);
		expect(body.source_type).toBe('iso');
	});
});

describe('adminCreateTemplateDraft', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('POSTs ovf + moref + skip_generalize to /draft', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ id: 'tpl-new', name: 'OVA lab' }), {
				status: 201,
				statusText: 'Created'
			})
		);

		await adminCreateTemplateDraft(
			baseReq({
				source_type: 'ovf',
				source_ref: 'vm-123',
				skip_generalize: true
			})
		);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(String(url)).toContain('/api/v1/admin/templates/draft');
		expect(opts.method).toBe('POST');
		expect(JSON.parse(opts.body as string)).toMatchObject({
			source_type: 'ovf',
			source_ref: 'vm-123',
			skip_generalize: true
		});
	});

	it('omits skip_generalize on an unchecked clone_template draft', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ id: 'tpl-2', name: 'Ubuntu lab' }), {
				status: 201,
				statusText: 'Created'
			})
		);

		await adminCreateTemplateDraft(baseReq({ skip_generalize: false }));

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
		expect(body).not.toHaveProperty('skip_generalize');
		expect(body.source_type).toBe('clone_template');
	});

	it('surfaces an iso skip_generalize 400 without dropping the field', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ error: SKIP_GENERALIZE_ISO }), {
				status: 400,
				statusText: 'Bad Request'
			})
		);

		await expect(
			adminCreateTemplateDraft(
				baseReq({ source_type: 'iso', source_ref: 'iso-1', skip_generalize: true })
			)
		).rejects.toMatchObject({ status: 400 });

		const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
		expect(body.skip_generalize).toBe(true);
		expect(body.source_type).toBe('iso');
	});

	it('throws ApiError so the wizard can show the 400 copy', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ error: SKIP_GENERALIZE_CLONE_TEMPLATE }), {
				status: 400,
				statusText: 'Bad Request'
			})
		);

		try {
			await adminCreateTemplateDraft(
				baseReq({ skip_generalize: true, source_type: 'clone_template' })
			);
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			expect((err as ApiError).body).toEqual({ error: SKIP_GENERALIZE_CLONE_TEMPLATE });
		}
	});
});
