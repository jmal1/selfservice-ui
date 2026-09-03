import { goto } from '$app/navigation';
import { authStore } from '$lib/stores/auth.svelte';
import { config } from '$lib/config';
import { mockApi } from './mock';
import {
	normalizeBlueprint,
	normalizePod,
	normalizeWorkflow,
	normalizePlaylist,
	normalizeRun,
	asArray
} from './normalize';
import { buildCreateTemplateDraftBody } from './templateDraft';
import type {
	Pod,
	PodVM,
	Template,
	User,
	ResourceUsage,
	Job,
	AuditEntry,
	AuditLogPage,
	ActiveSession,
	VLANPoolEntry,
	VMSnapshot,
	Blueprint,
	TestingDashboard,
	Run,
	Workflow,
	Playlist,
	Action,
	ImageUpload,
	VCenterISOListResponse,
	ResolvedCredentialsResponse
} from '$lib/types';

const isMock = config.mock;

// --- Error type ---

export class ApiError extends Error {
	constructor(
		public status: number,
		public statusText: string,
		public body: Record<string, unknown> | null
	) {
		super(`API Error ${status}: ${statusText}`);
		this.name = 'ApiError';
	}
}

// --- Typed fetch wrapper ---

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const url = `${config.apiBaseUrl}${path}`;
	const headers = new Headers(options.headers);

	if (!headers.has('Content-Type') && options.body) {
		headers.set('Content-Type', 'application/json');
	}

	const response = await fetch(url, {
		...options,
		headers,
		credentials: 'include'
	});

	if (response.status === 401) {
		authStore.clearState();
		await goto('/login');
		throw new ApiError(401, 'Unauthorized', null);
	}

	if (!response.ok) {
		let body: Record<string, unknown> | null = null;
		try {
			body = (await response.json()) as Record<string, unknown>;
		} catch {
			// response may not be JSON
		}
		throw new ApiError(response.status, response.statusText, body);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	// Some endpoints (e.g. 202 Accepted for a power action) return success
	// with no body. Read the text once and only parse when there's content so
	// a bodyless 2xx doesn't blow up on response.json().
	const text = await response.text();
	if (!text) {
		return undefined as T;
	}
	return JSON.parse(text) as T;
}

// --- Provisioning availability ---

export interface ProvisioningStatus {
	enabled: boolean;
	message: string;
}

const PROVISIONING_ENABLED_MESSAGE = 'Provisioning is available.';
const PROVISIONING_DISABLED_MESSAGE = 'Provisioning is temporarily unavailable for maintenance.';

export async function getProvisioningStatus(): Promise<ProvisioningStatus> {
	if (isMock) return mockApi.getProvisioningStatus();

	const status = await apiFetch<unknown>('/api/v1/provisioning/status');
	if (
		typeof status !== 'object' ||
		status === null ||
		typeof (status as Record<string, unknown>).enabled !== 'boolean' ||
		typeof (status as Record<string, unknown>).message !== 'string'
	) {
		throw new TypeError('Invalid provisioning status response');
	}

	const provisioningStatus = status as ProvisioningStatus;
	const isValidPair =
		(provisioningStatus.enabled && provisioningStatus.message === PROVISIONING_ENABLED_MESSAGE) ||
		(!provisioningStatus.enabled &&
			provisioningStatus.message === PROVISIONING_DISABLED_MESSAGE);
	if (!isValidPair) {
		throw new TypeError('Invalid provisioning status response');
	}

	return provisioningStatus;
}

// --- Pods ---

export async function getPods(): Promise<Pod[]> {
	if (isMock) return mockApi.getPods();
	const pods = await apiFetch<Pod[]>('/api/v1/pods');
	return asArray(pods).map(normalizePod);
}

export async function getPod(id: string): Promise<Pod> {
	if (isMock) return mockApi.getPod(id);
	const pod = await apiFetch<Pod>(`/api/v1/pods/${id}`);
	return normalizePod(pod);
}

export interface CreatePodRequest {
	name: string;
	vms: {
		template_id: string;
		display_name: string;
		vcpus?: number;
		ram_mb?: number;
		disk_gb?: number;
	}[];
}

export interface CreatePodResponse {
	job_id: string;
	status: string;
}

export function createPod(req: CreatePodRequest): Promise<CreatePodResponse> {
	if (isMock) return mockApi.createPod(req) as unknown as Promise<CreatePodResponse>;
	return apiFetch<CreatePodResponse>('/api/v1/pods', {
		method: 'POST',
		body: JSON.stringify(req)
	});
}

export function deletePod(id: string): Promise<void> {
	if (isMock) return mockApi.deletePod(id);
	return apiFetch<void>(`/api/v1/pods/${id}`, { method: 'DELETE' });
}

export function extendPod(id: string): Promise<{ pod_id: string; expires_at: string; extended_by_days: number }> {
	return apiFetch<{ pod_id: string; expires_at: string; extended_by_days: number }>(`/api/v1/pods/${id}/extend`, {
		method: 'POST'
	});
}

// --- VMs ---

export function startVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.startVM(podId, vmId);
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/start`, { method: 'POST' });
}

// resumeVM uses the same /start endpoint as startVM — PowerOnVM on the backend
// handles both resuming from a saved-state suspend and starting a stopped VM.
// A separate export makes intent clear at the call site.
export function resumeVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.resumeVM(podId, vmId);
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/start`, { method: 'POST' });
}

export function stopVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.stopVM(podId, vmId);
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/stop`, { method: 'POST' });
}

export function restartVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.restartVM(podId, vmId);
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/restart`, { method: 'POST' });
}

export function resetVM(podId: string, vmId: string): Promise<void> {
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/reset`, { method: 'POST' });
}

export function deleteVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.deleteVM(podId, vmId);
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}`, { method: 'DELETE' });
}

export interface AddVMRequest {
	template_id: string;
	display_name: string;
	vcpus?: number;
	ram_mb?: number;
	disk_gb?: number;
}

export function addVM(podId: string, req: AddVMRequest): Promise<PodVM> {
	if (isMock) return mockApi.addVM(podId, req);
	return apiFetch<PodVM>(`/api/v1/pods/${podId}/vms`, {
		method: 'POST',
		body: JSON.stringify(req)
	});
}

export interface ConsoleTicket {
	ticket: string;
	url: string;
}

export function getConsoleTicket(podId: string, vmId: string): Promise<ConsoleTicket> {
	if (isMock) return mockApi.getConsoleTicket(podId, vmId);
	return apiFetch<ConsoleTicket>(`/api/v1/pods/${podId}/vms/${vmId}/console`);
}

// --- Templates ---

export function getTemplates(): Promise<Template[]> {
	if (isMock) return mockApi.getTemplates();
	return apiFetch<Template[]>('/api/v1/templates').then(asArray);
}

// adminListTemplates returns ALL templates regardless of is_active or
// template_state. Use this on admin pages so drafts and errored wizard
// templates remain visible (the public /api/v1/templates filters
// is_active=true and would hide them).
export function adminListTemplates(): Promise<Template[]> {
	if (isMock) return mockApi.getTemplates();
	return apiFetch<Template[]>('/api/v1/admin/templates').then(asArray);
}

export type TemplateVisibility = 'public' | 'instructor_only';

export interface CreateTemplateRequest {
	name: string;
	vcenter_template: string;
	os_type: string;
	default_vcpus: number;
	default_ram_mb: number;
	default_disk_gb: number;
	min_vcpus: number;
	min_ram_mb: number;
	description: string;
	icon_url: string;
	is_active: boolean;
	default_username: string;
	default_password: string;
	kind?: 'clone_with_customize' | 'clone_no_customize' | 'registered_existing_vm';
	assign_ip?: boolean;
	visibility?: TemplateVisibility;
}

export function adminCreateTemplate(req: CreateTemplateRequest): Promise<Template> {
	if (isMock) return mockApi.adminCreateTemplate(req as unknown as Record<string, unknown>);
	return apiFetch<Template>('/api/v1/admin/templates', { method: 'POST', body: JSON.stringify(req) });
}

export type UpdateTemplateRequest = Partial<CreateTemplateRequest> & {
	expected_updated_at?: string;
};

export function adminUpdateTemplate(id: string, req: UpdateTemplateRequest): Promise<Template> {
	if (isMock) return mockApi.adminUpdateTemplate(id, req as unknown as Record<string, unknown>);
	return apiFetch<Template>(`/api/v1/admin/templates/${id}`, { method: 'PATCH', body: JSON.stringify(req) });
}

export function adminDeleteTemplate(id: string): Promise<void> {
	if (isMock) return mockApi.adminDeleteTemplate(id);
	return apiFetch<void>(`/api/v1/admin/templates/${id}`, { method: 'DELETE' });
}

// --- Template Creation Wizard (T4) ---
//
// Multi-step instructor flow: Draft → Provision → Configure → Generalize
// → Ready → Active. Instructor-accessible (lab-instructors group) — does
// not require full admin role. State conflicts return 409 with
// {error, reason, current_state, allowed_next_states} in ApiError.body
// so the UI can re-render the action buttons without a fresh GET.

export interface CreateTemplateDraftRequest {
	name: string;
	os_type: 'linux' | 'windows';
	source_type: 'clone_template' | 'clone_vcenter' | 'iso' | 'ovf';
	source_ref: string;
	vcpus?: number;
	ram_mb?: number;
	disk_gb?: number;
	description?: string;
	icon_url?: string;
	default_username?: string;
	default_password?: string;
	// skip_generalize skips GuestOps generalize only (not verify). Default
	// false. Allowed on ovf and clone_vcenter; rejected on iso / clone_template.
	skip_generalize?: boolean;
	// ISO-only fields
	guest_id?: string;
	unattend_mode?: 'manual' | 'cloudinit_cidata' | 'debian_preseed' | 'windows_autounattend';
	unattend_config?: {
		hostname?: string;
		username?: string;
		password?: string;
		locale?: string;
		time_zone?: string;
		apt_proxy?: string;
		extra_pkgs?: string[];
	};
}

export interface WizardStateResponse {
	template_id: string;
	template_state: string;
	allowed_next_states: string[];
	vcenter_vm_id?: string;
	source_type?: string;
	source_ref?: string;
	skip_generalize?: boolean;
	staging_network?: string;
	// Latest worker job for this template. When template_state === 'error'
	// these tell the wizard which step failed (`template_provision` →
	// failure during Provision, `template_generalize` → failure during
	// Generalize) and surface the raw error string from the worker so the
	// user sees the actual cause instead of a generic "check worker logs".
	last_job_type?: string;
	last_job_status?: string;
	last_job_error?: string;
	// Phase H: build-VM access surface mirrored from the API. Populated
	// during the transient build states (provisioning / configuring /
	// generalizing). The wizard converts these into a VMAccessInfo for
	// VMAccessPanel so instructors can SSH/RDP into the staging VM and
	// see the bootstrap credentials when the OS locks them out.
	//
	// CONTRACT: keep the fields in sync with WizardStateResponse in
	// selfservice-api/internal/api/handlers/templates_wizard.go.
	os_type?: string;
	template_kind?: 'clone_with_customize' | 'clone_no_customize' | 'registered_existing_vm';
	assign_ip?: boolean;
	build_vm_name?: string;
	build_vm_ip?: string;
	build_vm_power_on?: boolean;
	build_vm_tools_running?: boolean;
	default_username?: string;
	default_password?: string;
}

export interface WizardJobResponse {
	job_id: string;
	state: WizardStateResponse;
}

export function adminCreateTemplateDraft(req: CreateTemplateDraftRequest): Promise<Template> {
	return apiFetch<Template>('/api/v1/admin/templates/draft', {
		method: 'POST',
		body: JSON.stringify(buildCreateTemplateDraftBody(req))
	});
}

// GuestOSOption is one entry in the wizard's "Guest OS" dropdown. It maps a
// friendly Label to the vSphere guest_id an ISO build needs, plus the os_type
// family (linux/windows) the wizard should auto-select. Sourced from
// GET /admin/templates/guest-os-catalog (models.GuestOSCatalog in the API), so
// the list stays in one place — adding an OS server-side surfaces here with no
// UI change. The catalog is NOT an allowlist: instructors can also type any
// "<name>Guest"-shaped id via the "Other (advanced)" field.
export interface GuestOSOption {
	label: string;
	guest_id: string;
	os_type: 'linux' | 'windows';
	group: string;
	note?: string;
}

export function adminListGuestOSCatalog(): Promise<{ options: GuestOSOption[] }> {
	return apiFetch<{ options: GuestOSOption[] }>('/api/v1/admin/templates/guest-os-catalog');
}

export function adminProvisionTemplate(id: string): Promise<WizardJobResponse> {
	return apiFetch<WizardJobResponse>(`/api/v1/admin/templates/${id}/provision`, {
		method: 'POST'
	});
}

export function adminGeneralizeTemplate(
	id: string,
	body: { guest_username?: string; guest_password?: string } = {}
): Promise<WizardJobResponse> {
	return apiFetch<WizardJobResponse>(`/api/v1/admin/templates/${id}/generalize`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

// adminGetResolvedCredentials calls GET .../resolved-credentials to learn
// whether the server can supply guest credentials for the generalize step
// without the operator typing them. The raw password is NEVER returned —
// only has_password (boolean) and the source string.
export function adminGetResolvedCredentials(id: string): Promise<ResolvedCredentialsResponse> {
	return apiFetch<ResolvedCredentialsResponse>(
		`/api/v1/admin/templates/${id}/resolved-credentials`
	);
}

export function adminPublishTemplate(id: string): Promise<WizardStateResponse> {
	return apiFetch<WizardStateResponse>(`/api/v1/admin/templates/${id}/publish`, {
		method: 'POST'
	});
}

export function adminUnpublishTemplate(id: string): Promise<WizardStateResponse> {
	return apiFetch<WizardStateResponse>(`/api/v1/admin/templates/${id}/unpublish`, {
		method: 'POST'
	});
}

export function adminCancelTemplate(id: string): Promise<WizardStateResponse> {
	return apiFetch<WizardStateResponse>(`/api/v1/admin/templates/${id}/cancel`, {
		method: 'POST'
	});
}

export function adminRetryTemplate(id: string): Promise<WizardStateResponse> {
	return apiFetch<WizardStateResponse>(`/api/v1/admin/templates/${id}/retry`, {
		method: 'POST'
	});
}

// Power actions for the staging (build) VM during the wizard. The endpoint is
// a simple command surface — it returns 200/202 on success and the caller is
// expected to re-fetch wizard-state to observe the new build_vm_power_on.
export type TemplatePowerAction = 'start' | 'stop' | 'restart' | 'reset';

export function adminTemplatePower(id: string, action: TemplatePowerAction): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/templates/${id}/power`, {
		method: 'POST',
		body: JSON.stringify({ action })
	});
}

export function adminGetWizardState(id: string): Promise<WizardStateResponse> {
	return apiFetch<WizardStateResponse>(`/api/v1/admin/templates/${id}/wizard-state`);
}

// --- Preflight checks ---

/** One structured result from a single preflight check (mirrors preflight.Result in the API). */
export interface PreflightResult {
	id: string;       // e.g. "PF-01"
	severity: string; // "block" | "warn"
	ok: boolean;
	detail: string;   // what was observed, in plain language
	fix: string;      // what to do when failing
}

/** Response shape from POST /api/v1/admin/templates/{id}/preflight */
export interface PreflightResponse {
	template_id: string;
	any_block_failed: boolean;
	results: PreflightResult[];
}

/**
 * Run all preflight checks for the given template.
 * Returns 200 with the result list regardless of pass/fail.
 * Use any_block_failed to decide whether to block provisioning.
 */
export function adminRunPreflight(id: string): Promise<PreflightResponse> {
	return apiFetch<PreflightResponse>(`/api/v1/admin/templates/${id}/preflight`, {
		method: 'POST'
	});
}

/**
 * TemplateConsoleTicket is the wire shape returned by
 * GET /api/v1/admin/templates/{id}/console/ticket. Server-side auth +
 * state gating happen on this request, so a successful fetch implies
 * the caller is allowed to open the WS at `ws_url`.
 *
 * Mirrors `handlers.TemplateConsoleTicketResponse` in
 * selfservice-api/internal/api/handlers/templates_console.go.
 */
export interface TemplateConsoleTicket {
	ws_url: string;
	template_state: string;
	vm_name: string;
}

export function getTemplateConsoleTicket(id: string): Promise<TemplateConsoleTicket> {
	return apiFetch<TemplateConsoleTicket>(`/api/v1/admin/templates/${id}/console/ticket`);
}

// --- vCenter Templates Folder Browser ---

export interface VCenterFolderVM {
	name: string;
	moref: string;
	power_state: string;
	os_type: string;
	guest_full_name: string;
	num_cpu: number;
	memory_mb: number;
	disk_gb: number;
	snapshot_count: number;
	has_initial_snapshot: boolean;
	vmware_tools_status: string;
	registered_template_id: string | null;
	registered_template_name: string | null;
}

export interface VCenterTemplatesFolder {
	vms: VCenterFolderVM[];
	folder_path: string;
	cached: boolean;
	cache_age_seconds: number;
}

export function adminListVCenterTemplatesFolder(refresh = false): Promise<VCenterTemplatesFolder> {
	if (isMock) {
		return Promise.resolve({
			vms: [
				{
					name: 'student-ubuntu-2404',
					moref: 'vm-mock-1',
					power_state: 'poweredOff',
					os_type: 'linux',
					guest_full_name: 'Ubuntu 24.04 LTS (64-bit)',
					num_cpu: 2,
					memory_mb: 4096,
					disk_gb: 40,
					snapshot_count: 1,
					has_initial_snapshot: true,
					vmware_tools_status: 'toolsOk',
					registered_template_id: null,
					registered_template_name: null
				}
			],
			folder_path: '/JMAL-Datacenter/vm/Templates (mock)',
			cached: false,
			cache_age_seconds: 0
		});
	}
	const qs = refresh ? '?refresh=true' : '';
	return apiFetch<VCenterTemplatesFolder>(`/api/v1/admin/vcenter/templates-folder${qs}`);
}

// --- User / Profile ---

interface MeResponse {
	user: User;
	resource_usage: ResourceUsage;
}

export async function getMe(): Promise<MeResponse> {
	if (isMock) {
		const user = await mockApi.getMe();
		const usage = await mockApi.getResourceUsage();
		return { user, resource_usage: usage };
	}
	return apiFetch<MeResponse>('/auth/me');
}

export async function getResourceUsage(): Promise<ResourceUsage> {
	if (isMock) return mockApi.getResourceUsage();
	const me = await apiFetch<MeResponse>('/auth/me');
	return me.resource_usage;
}

// --- Jobs ---

export async function getMyJobs(): Promise<Job[]> {
	if (isMock) return mockApi.adminGetJobs();
	const jobs = await apiFetch<Job[]>('/api/v1/jobs');
	return asArray(jobs);
}

// --- Admin ---

export function adminGetUsers(): Promise<User[]> {
	if (isMock) return mockApi.adminGetUsers();
	return apiFetch<User[]>('/api/v1/admin/users').then(asArray);
}

export interface UpdateQuotaRequest {
	max_vcpus: number;
	max_ram_mb: number;
	max_pods: number;
}

export function adminUpdateQuota(userId: string, req: UpdateQuotaRequest): Promise<User> {
	if (isMock) return mockApi.adminUpdateQuota(userId, req);
	return apiFetch<User>(`/api/v1/admin/users/${userId}/quotas`, {
		method: 'PATCH',
		body: JSON.stringify(req)
	});
}

export function adminGetJobs(): Promise<Job[]> {
	if (isMock) return mockApi.adminGetJobs();
	return apiFetch<Job[]>('/api/v1/admin/jobs').then(asArray);
}

export function adminGetAuditLog(): Promise<AuditEntry[]> {
	if (isMock) return mockApi.adminGetAuditLog();
	return apiFetch<AuditEntry[]>('/api/v1/admin/audit').then(asArray);
}

export function adminSearchAuditLog(params: {
	action?: string;
	user_id?: string;
	resource_id?: string;
	since?: string;
	until?: string;
	page?: number;
	per_page?: number;
} = {}): Promise<AuditLogPage> {
	const qs = new URLSearchParams();
	if (params.action) qs.set('action', params.action);
	if (params.user_id) qs.set('user_id', params.user_id);
	if (params.resource_id) qs.set('resource_id', params.resource_id);
	if (params.since) qs.set('since', params.since);
	if (params.until) qs.set('until', params.until);
	if (params.page) qs.set('page', String(params.page));
	if (params.per_page) qs.set('per_page', String(params.per_page));
	const query = qs.toString();
	return apiFetch<AuditLogPage>(`/api/v1/admin/audit/search${query ? `?${query}` : ''}`);
}

export function adminListSessions(): Promise<ActiveSession[]> {
	return apiFetch<ActiveSession[]>('/api/v1/admin/sessions').then(asArray);
}

// --- Admin Health Dashboard ---

export type HealthDepStatus = 'ok' | 'degraded' | 'down' | 'not_configured';

export interface HealthDep {
	name: string;
	status: HealthDepStatus;
	latency_ms: number;
	last_check: string;
	detail?: string;
}

export interface HealthResponse {
	status: HealthDepStatus;
	deps: HealthDep[];
}

export function adminGetHealth(): Promise<HealthResponse> {
	return apiFetch<HealthResponse>('/api/v1/admin/health');
}

// --- Instructor Wiki ---

/**
 * WikiManifestEntry is the wire shape of a single entry in
 * `/api/v1/wiki/index`. It MUST stay in lockstep with the Go
 * `wikitypes.ManifestEntry` struct in `selfservice-api/internal/wikitypes`.
 *
 * **If you add or remove a field here, also update:**
 * 1. `selfservice-api/internal/wikitypes/types.go` (the Go source of truth)
 * 2. The golden file at `selfservice-api/internal/docs/testdata/manifest.golden.json`
 *    by running `go test ./internal/docs -update`
 * 3. The `wantFields` allowlist in
 *    `selfservice-api/internal/docs/embed_test.go::TestManifestSchema_EveryWireFieldDocumented`
 *
 * That last test is the trip-wire — CI fails when Go JSON keys drift
 * from this TS shape, so any uncoordinated change here or there will
 * be caught before merge.
 */
export interface WikiManifestEntry {
	path: string;
	/** Human-friendly display name from the bundler. For markdown
	 *  files this is the first `# H1` heading; for source files it's
	 *  the basename with a parenthesised language hint. Always
	 *  populated by the API since the manifest schema added it. */
	title: string;
	size: number;
	sha256: string;
	is_markdown: boolean;
	links_out?: string[];
	from_seed: boolean;
}

export interface WikiIndex {
	seeds: string[];
	files: WikiManifestEntry[];
	total_bytes: number;
}

export function wikiGetIndex(): Promise<WikiIndex> {
	return apiFetch<WikiIndex>('/api/v1/wiki/index');
}

// wikiGetPage fetches a single bundle file as raw text. Bypasses
// apiFetch's JSON parser since wiki pages are markdown or source code,
// not JSON. Reuses the same 401 -> /login redirect via a manual check.
export async function wikiGetPage(path: string): Promise<string> {
	const url = `${config.apiBaseUrl}/api/v1/wiki/page/${path}`;
	const resp = await fetch(url, { credentials: 'include' });
	if (resp.status === 401) {
		authStore.clearState();
		await goto('/login');
		throw new ApiError(401, 'Unauthorized', null);
	}
	if (!resp.ok) {
		throw new ApiError(resp.status, resp.statusText, null);
	}
	return resp.text();
}

// wikiZipURL returns an absolute URL for the bundle.zip endpoint so the
// UI can use it as an <a href> for download — the browser will send the
// session cookie automatically, no JS fetch needed.
export function wikiZipURL(): string {
	return `${config.apiBaseUrl}/api/v1/wiki/bundle.zip`;
}

// wikiPageDownloadURL returns an absolute URL with ?download=1 so the
// browser saves the file instead of inlining it.
export function wikiPageDownloadURL(path: string): string {
	return `${config.apiBaseUrl}/api/v1/wiki/page/${path}?download=1`;
}

// --- Student Guide ---

// The student guide exposes the same manifest shape as the instructor wiki,
// but its API only includes the allowlisted docs/student pages.
export type StudentGuideIndex = WikiIndex;

export function studentGuideGetIndex(): Promise<StudentGuideIndex> {
	return apiFetch<StudentGuideIndex>('/api/v1/student-guide/index');
}

// studentGuideGetPage is intentionally separate from wikiGetPage so student
// navigation can only use the API's student-document allowlist.
export async function studentGuideGetPage(path: string): Promise<string> {
	const url = `${config.apiBaseUrl}/api/v1/student-guide/page/${path}`;
	const resp = await fetch(url, { credentials: 'include' });
	if (resp.status === 401) {
		authStore.clearState();
		await goto('/login');
		throw new ApiError(401, 'Unauthorized', null);
	}
	if (!resp.ok) {
		throw new ApiError(resp.status, resp.statusText, null);
	}
	return resp.text();
}

// --- VLAN Pool Admin ---

export async function adminGetVLANPool(): Promise<VLANPoolEntry[]> {
	const entries = await apiFetch<VLANPoolEntry[]>('/api/v1/admin/vlans');
	return entries ?? [];
}

export interface AddVLANRequest {
	vlan_tag: number;
	subnet: string;
	host_scope: string;
}

export function adminAddVLAN(req: AddVLANRequest): Promise<VLANPoolEntry> {
	return apiFetch<VLANPoolEntry>('/api/v1/admin/vlans', {
		method: 'POST',
		body: JSON.stringify(req)
	});
}

export function adminUpdateVLAN(
	id: number,
	req: { host_scope: string }
): Promise<VLANPoolEntry> {
	return apiFetch<VLANPoolEntry>(`/api/v1/admin/vlans/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(req)
	});
}

export function adminRemoveVLAN(id: number): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/vlans/${id}`, { method: 'DELETE' });
}

// --- Snapshot Operations ---

export function listSnapshots(podId: string, vmId: string): Promise<VMSnapshot[]> {
	return apiFetch<VMSnapshot[]>(`/api/v1/pods/${podId}/vms/${vmId}/snapshots`).then(asArray);
}

export function createSnapshot(
	podId: string,
	vmId: string,
	name: string,
	description: string = ''
): Promise<{ job_id: string }> {
	return apiFetch<{ job_id: string }>(`/api/v1/pods/${podId}/vms/${vmId}/snapshots`, {
		method: 'POST',
		body: JSON.stringify({ name, description })
	});
}

export function revertToInitial(podId: string, vmId: string): Promise<{ job_id: string }> {
	return apiFetch<{ job_id: string }>(`/api/v1/pods/${podId}/vms/${vmId}/snapshots/revert-initial`, {
		method: 'POST'
	});
}

export function revertToSnapshot(
	podId: string,
	vmId: string,
	snapshotId: string
): Promise<{ job_id: string }> {
	return apiFetch<{ job_id: string }>(
		`/api/v1/pods/${podId}/vms/${vmId}/snapshots/${snapshotId}/revert`,
		{ method: 'POST' }
	);
}

export function deleteSnapshot(podId: string, vmId: string, snapshotId: string): Promise<void> {
	return apiFetch<void>(`/api/v1/pods/${podId}/vms/${vmId}/snapshots/${snapshotId}`, {
		method: 'DELETE'
	});
}

// --- Blueprints ---

export async function getBlueprints(): Promise<Blueprint[]> {
	const blueprints = await apiFetch<Blueprint[]>('/api/v1/blueprints');
	return blueprints ?? [];
}

export async function getBlueprint(id: string): Promise<Blueprint> {
	return apiFetch<Blueprint>(`/api/v1/blueprints/${id}`);
}

export function deployBlueprint(id: string, name: string): Promise<{ job_id: string; pod_id: string; status: string }> {
	return apiFetch<{ job_id: string; pod_id: string; status: string }>(`/api/v1/blueprints/${id}/deploy`, {
		method: 'POST',
		body: JSON.stringify({ name })
	});
}

// --- Admin Blueprints ---

// Normalize blueprint data — ensure vms array is never null/undefined.
// See normalizeBlueprint in ./normalize for why the API can omit `vms`.
export async function adminGetBlueprints(): Promise<Blueprint[]> {
	const blueprints = await apiFetch<Blueprint[]>('/api/v1/admin/blueprints');
	return (blueprints ?? []).map(normalizeBlueprint);
}

export interface CreateBlueprintRequest {
	name: string;
	description: string;
	allow_vm_additions: boolean;
	is_active?: boolean;
	vms: {
		template_id: string;
		display_name: string;
		vcpus?: number;
		ram_mb?: number;
		disk_gb?: number;
		boot_order: number;
		quantity: number;
	}[];
}

export async function adminCreateBlueprint(req: CreateBlueprintRequest): Promise<Blueprint> {
	return normalizeBlueprint(
		await apiFetch<Blueprint>('/api/v1/admin/blueprints', {
			method: 'POST',
			body: JSON.stringify(req)
		})
	);
}

export async function adminUpdateBlueprint(id: string, req: CreateBlueprintRequest): Promise<Blueprint> {
	return normalizeBlueprint(
		await apiFetch<Blueprint>(`/api/v1/admin/blueprints/${id}`, {
			method: 'PUT',
			body: JSON.stringify(req)
		})
	);
}

export function adminDeleteBlueprint(id: string): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/blueprints/${id}`, { method: 'DELETE' });
}

export function adminSetBlueprintAccess(
	id: string,
	rules: { user_id?: string; role?: string }[]
): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/blueprints/${id}/access`, {
		method: 'POST',
		body: JSON.stringify({ rules })
	});
}

export function adminExtendPod(id: string): Promise<{ pod_id: string; expires_at: string; extended_by_days: number }> {
	return apiFetch<{ pod_id: string; expires_at: string; extended_by_days: number }>(`/api/v1/admin/pods/${id}/extend`, {
		method: 'POST'
	});
}

// --- Testing / Assessments ---

export function getTestingDashboard(podId: string): Promise<TestingDashboard> {
	return apiFetch<TestingDashboard>(`/api/v1/pods/${podId}/testing`);
}

export function createTestingRun(
	podId: string,
	req: { playlist_id?: string; workflow_ids?: string[] }
): Promise<{ run_id: string; status: string; message: string }> {
	return apiFetch<{ run_id: string; status: string; message: string }>(`/api/v1/pods/${podId}/testing/run`, {
		method: 'POST',
		body: JSON.stringify(req)
	});
}

export function listTestingRuns(podId: string): Promise<Run[]> {
	return apiFetch<Run[]>(`/api/v1/pods/${podId}/testing/runs`).then((d) => asArray(d).map(normalizeRun));
}

export function getTestingRun(podId: string, runId: string): Promise<Run> {
	return apiFetch<Run>(`/api/v1/pods/${podId}/testing/runs/${runId}`).then(normalizeRun);
}

export function cancelTestingRun(podId: string, runId: string): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/pods/${podId}/testing/runs/${runId}/cancel`, {
		method: 'POST'
	});
}

// --- Admin Workflows ---

export async function adminListWorkflows(): Promise<Workflow[]> {
	const data = await apiFetch<Workflow[] | null>('/api/v1/admin/workflows');
	return asArray(data).map(normalizeWorkflow);
}

export function adminGetWorkflow(id: string): Promise<Workflow> {
	return apiFetch<Workflow>(`/api/v1/admin/workflows/${id}`).then(normalizeWorkflow);
}

export function adminCreateWorkflow(wf: Partial<Workflow>): Promise<Workflow> {
	return apiFetch<Workflow>('/api/v1/admin/workflows', {
		method: 'POST',
		body: JSON.stringify(wf)
	});
}

export function adminUpdateWorkflow(id: string, wf: Partial<Workflow>): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/workflows/${id}`, {
		method: 'PUT',
		body: JSON.stringify(wf)
	});
}

export function adminSubmitWorkflow(id: string): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/workflows/${id}/submit`, { method: 'POST' });
}

export function adminApproveWorkflow(id: string): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/workflows/${id}/approve`, { method: 'POST' });
}

export function adminActivateWorkflow(id: string): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/workflows/${id}/activate`, { method: 'POST' });
}

export function adminDeleteWorkflow(id: string): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/workflows/${id}`, { method: 'DELETE' });
}

export function adminImportWorkflows(workflows: Partial<Workflow>[]): Promise<{ imported: number; skipped: number }> {
	return apiFetch<{ imported: number; skipped: number }>('/api/v1/admin/workflows/import', {
		method: 'POST',
		body: JSON.stringify(workflows)
	});
}

export function adminExportWorkflows(): Promise<Workflow[]> {
	return apiFetch<Workflow[]>('/api/v1/admin/workflows/export').then((d) => asArray(d).map(normalizeWorkflow));
}

// --- Admin Playlists ---

export async function adminListPlaylists(): Promise<Playlist[]> {
	const data = await apiFetch<Playlist[] | null>('/api/v1/admin/playlists');
	return asArray(data).map(normalizePlaylist);
}

export function adminGetPlaylist(id: string): Promise<Playlist> {
	return apiFetch<Playlist>(`/api/v1/admin/playlists/${id}`).then(normalizePlaylist);
}

export function adminCreatePlaylist(pl: { name: string; slug: string; description: string; workflow_ids: string[] }): Promise<Playlist> {
	return apiFetch<Playlist>('/api/v1/admin/playlists', {
		method: 'POST',
		body: JSON.stringify(pl)
	});
}

export function adminUpdatePlaylist(id: string, pl: Partial<{ name: string; description: string; workflow_ids: string[]; is_active: boolean }>): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/playlists/${id}`, {
		method: 'PUT',
		body: JSON.stringify(pl)
	});
}

export function adminDeletePlaylist(id: string): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/playlists/${id}`, { method: 'DELETE' });
}

export function adminGetTemplatePlaylists(templateId: string): Promise<{ playlist_ids: string[] }> {
	return apiFetch<{ playlist_ids: string[] }>(`/api/v1/admin/templates/${templateId}/playlists`);
}

export function adminSetTemplatePlaylists(templateId: string, playlistIds: string[]): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/templates/${templateId}/playlists`, {
		method: 'POST',
		body: JSON.stringify({ playlist_ids: playlistIds })
	});
}

export function adminSetBlueprintVMPlaylists(blueprintId: string, vmSlot: number, playlistIds: string[]): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/blueprints/${blueprintId}/vm-playlists`, {
		method: 'POST',
		body: JSON.stringify({ vm_slot: vmSlot, playlist_ids: playlistIds })
	});
}

export interface BlueprintVMPlaylistsResolvedResponse {
	vm_playlists: Array<{
		vm_slot: number;
		playlists: Array<{
			playlist_id: string;
			name: string;
			slug: string;
			source: 'blueprint_override' | 'template_default';
			execution_order: number;
		}>;
	}>;
}

export function adminGetBlueprintVMPlaylistsResolved(blueprintId: string): Promise<BlueprintVMPlaylistsResolvedResponse> {
	return apiFetch<BlueprintVMPlaylistsResolvedResponse>(`/api/v1/admin/blueprints/${blueprintId}/vm-playlists`);
}

export function adminDeleteBlueprintVMPlaylistsOverride(blueprintId: string, vmSlot: number): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/blueprints/${blueprintId}/vm-playlists/${vmSlot}`, {
		method: 'DELETE'
	});
}

export async function adminListRuns(params?: {
	triggered_by?: string;
	pod_owner?: string;
	status?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
}): Promise<Run[]> {
	if (isMock) return mockApi.adminListRuns();
	const url = new URL('/api/v1/admin/runs', config.apiBaseUrl);
	if (params?.triggered_by) url.searchParams.set('triggered_by', params.triggered_by);
	if (params?.pod_owner) url.searchParams.set('pod_owner', params.pod_owner);
	if (params?.status) url.searchParams.set('status', params.status);
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.limit) url.searchParams.set('limit', String(params.limit));
	if (params?.offset) url.searchParams.set('offset', String(params.offset));
	const data = await apiFetch<Run[] | null>(url.pathname + url.search);
	return asArray(data).map(normalizeRun);
}

export function adminGetRun(runId: string): Promise<Run> {
	if (isMock) return mockApi.adminGetRun(runId);
	return apiFetch<Run>(`/api/v1/admin/runs/${runId}`).then(normalizeRun);
}

// --- Admin Actions (Library) ---

export async function adminListActions(): Promise<Action[]> {
	const data = await apiFetch<Action[] | null>('/api/v1/admin/actions');
	return Array.isArray(data) ? data : [];
}

export function adminGetAction(id: string): Promise<Action> {
	return apiFetch<Action>(`/api/v1/admin/actions/${id}`);
}

export function adminCreateAction(action: Partial<Action>): Promise<Action> {
	return apiFetch<Action>('/api/v1/admin/actions', {
		method: 'POST',
		body: JSON.stringify(action)
	});
}

export function adminUpdateAction(id: string, action: Partial<Action>): Promise<{ status: string }> {
	return apiFetch<{ status: string }>(`/api/v1/admin/actions/${id}`, {
		method: 'PUT',
		body: JSON.stringify(action)
	});
}

export function adminDeleteAction(id: string): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/actions/${id}`, { method: 'DELETE' });
}

// --- Script validator (shellcheck) ---
export interface ScriptValidationFinding {
	line: number;
	column: number;
	end_line: number;
	end_column: number;
	severity: 'error' | 'warning' | 'info' | 'style';
	code: string;
	message: string;
}

export interface ScriptValidationResult {
	language: string;
	findings: ScriptValidationFinding[];
	has_errors: boolean;
	has_warnings: boolean;
	linter_stderr?: string;
	duration_ms: number;
}

export function adminValidateScript(
	language: string,
	script: string,
	opts?: { inputContextNames?: string[]; outputContextNames?: string[] }
): Promise<ScriptValidationResult> {
	return apiFetch<ScriptValidationResult>('/api/v1/admin/scripts/validate', {
		method: 'POST',
		body: JSON.stringify({
			language,
			script,
			input_context_names: opts?.inputContextNames,
			output_context_names: opts?.outputContextNames
		})
	});
}

// --- Image Uploads ---

export interface CreateImageUploadRequest {
	filename: string;
	size_bytes: number;
	checksum_sha256?: string;
}

export interface CreateImageUploadResponse {
	id: string;
	kind: 'iso' | 'ova';
	object_key: string;
	upload_id: string;
	part_size: number;
	urls: string[];
	expires_in: number;
}

export interface CompleteImageUploadPart {
	part_number: number;
	etag: string;
}

export interface ImportImageResponse {
	job_id: string;
	image_id: string;
	status: string;
}

export function adminCreateImageUpload(req: CreateImageUploadRequest): Promise<CreateImageUploadResponse> {
	return apiFetch<CreateImageUploadResponse>('/api/v1/admin/images', {
		method: 'POST',
		body: JSON.stringify(req)
	});
}

export function adminCompleteImageUpload(
	id: string,
	parts: CompleteImageUploadPart[]
): Promise<ImageUpload> {
	return apiFetch<ImageUpload>(`/api/v1/admin/images/${id}/complete`, {
		method: 'POST',
		body: JSON.stringify({ parts })
	});
}

export function adminImportImage(id: string): Promise<ImportImageResponse> {
	return apiFetch<ImportImageResponse>(`/api/v1/admin/images/${id}/import`, {
		method: 'POST'
	});
}

export async function adminListImages(): Promise<ImageUpload[]> {
	const data = await apiFetch<ImageUpload[] | null>('/api/v1/admin/images');
	return Array.isArray(data) ? data : [];
}

export function adminGetImage(id: string): Promise<ImageUpload> {
	return apiFetch<ImageUpload>(`/api/v1/admin/images/${id}`);
}

export function adminDeleteImage(id: string): Promise<void> {
	return apiFetch<void>(`/api/v1/admin/images/${id}`, { method: 'DELETE' });
}

export function adminListVCenterISOs(refresh = false): Promise<VCenterISOListResponse> {
	const qs = refresh ? '?refresh=true' : '';
	return apiFetch<VCenterISOListResponse>(`/api/v1/admin/vcenter/isos${qs}`);
}
