/**
 * Template-draft payload helpers for POST /api/v1/admin/templates/draft.
 *
 * Frozen contract: jmal1/selfservice-api#253 @ 111d3ef
 *   source_type: clone_template | clone_vcenter | iso | ovf
 *   skip_generalize: boolean, default false
 *   skip_generalize=true allowed on ovf and clone_vcenter only
 *   skip_generalize=true skips GuestOps generalize, not verify/publish
 */

export const TEMPLATE_DRAFT_SOURCE_TYPES = [
	'clone_template',
	'clone_vcenter',
	'iso',
	'ovf'
] as const;

export type TemplateDraftSourceType = (typeof TEMPLATE_DRAFT_SOURCE_TYPES)[number];

/** API 400 copy — keep client-side messages aligned with these strings. */
export const SOURCE_TYPE_REQUIRED =
	'source_type is required (clone_template, clone_vcenter, iso, or ovf)';
export const SOURCE_TYPE_INVALID =
	'source_type must be clone_template, clone_vcenter, iso, or ovf';
export const SKIP_GENERALIZE_ISO =
	'skip_generalize is not allowed for source_type=iso: a fresh ISO install must run GuestOps generalize';
export const SKIP_GENERALIZE_CLONE_TEMPLATE =
	'skip_generalize is not allowed for source_type=clone_template: a customized clone must be re-generalized before publish';

export function isTemplateDraftSourceType(value: string): value is TemplateDraftSourceType {
	return (TEMPLATE_DRAFT_SOURCE_TYPES as readonly string[]).includes(value);
}

/** skip_generalize=true is allowed on ovf and clone_vcenter only. */
export function sourceTypeAllowsSkipGeneralize(sourceType: string): boolean {
	return sourceType === 'ovf' || sourceType === 'clone_vcenter';
}

/**
 * Prepared OVA appliances should skip GuestOps clean by default. clone_vcenter
 * still allows the checkbox but does not auto-check it.
 */
export function defaultSkipGeneralizeForSourceType(sourceType: string): boolean {
	return sourceType === 'ovf';
}

/**
 * Client-side checks that paraphrase the API 400s. Returns null when the
 * source fields are acceptable. Does not invent new semantics.
 */
export function validateTemplateDraftSource(req: {
	source_type?: string;
	skip_generalize?: boolean;
}): string | null {
	if (!req.source_type) {
		return SOURCE_TYPE_REQUIRED;
	}
	if (!isTemplateDraftSourceType(req.source_type)) {
		return SOURCE_TYPE_INVALID;
	}
	if (req.skip_generalize === true && req.source_type === 'iso') {
		return SKIP_GENERALIZE_ISO;
	}
	if (req.skip_generalize === true && req.source_type === 'clone_template') {
		return SKIP_GENERALIZE_CLONE_TEMPLATE;
	}
	return null;
}

/**
 * JSON body for create-draft. skip_generalize is omitted when false/undefined
 * so clone/iso payloads stay unchanged. true is never stripped — even on
 * iso/clone_template — so a contract-violating request still reaches the API
 * (or is blocked earlier by validateTemplateDraftSource with the same copy).
 */
export function buildCreateTemplateDraftBody(req: {
	skip_generalize?: boolean;
}): Record<string, unknown> {
	const body: Record<string, unknown> = { ...(req as Record<string, unknown>) };
	if (req.skip_generalize === true) {
		body.skip_generalize = true;
	} else {
		delete body.skip_generalize;
	}
	return body;
}
