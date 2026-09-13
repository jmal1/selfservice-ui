// Status literals mirror the canonical API values defined in
// selfservice-api/internal/models/models.go (PodStatus*, VMStatus*, JobStatus*).
// Keep them in sync — drift here causes the kind of silent type/runtime
// mismatch that broke /admin gating in 2026-06.

export type PodStatus =
	| 'pending'
	| 'provisioning'
	| 'active'
	| 'destroying'
	| 'destroy_failed'
	| 'destroyed'
	| 'error';

export type VMStatus =
	| 'pending'
	| 'cloning'
	| 'configuring'
	| 'running'
	| 'stopped'
	| 'suspended'
	| 'error'
	| 'deleted';

export type JobStatus =
	| 'pending'
	| 'claimed'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'rollback';

// --- Domain models ---

export interface User {
	id: string;
	username: string;
	email: string;
	display_name: string;
	role: 'student' | 'instructor' | 'admin';
	max_vcpus: number;
	max_ram_mb: number;
	max_pods: number;
	/** Role policy from GET /auth/me — optional during rolling deploy. */
	limits?: RoleLimits;
}

export interface RoleLimits {
	pod_ttl_days: number;
	extend_days: number;
	max_extensions: number;
	idle_suspend_hours: number | null;
	idle_suspend_applies: boolean;
	suspended_delete_days: number;
	max_user_snapshots: number;
	max_pods: number;
	max_vcpus: number;
	max_ram_mb: number;
	template_orphan_days?: number;
}

export type TemplateKind =
	| 'clone_with_customize'
	| 'clone_no_customize'
	| 'registered_existing_vm';

export type TemplateVisibility = 'public' | 'instructor_only';

export type TemplateLifecycleState =
	| 'draft'
	| 'provisioning'
	| 'configuring'
	| 'generalizing'
	| 'ready'
	| 'active'
	| 'error';

export type TemplateSourceType =
	| 'clone_template'
	| 'clone_vcenter'
	| 'iso'
	| 'ovf'
	| '';

export interface Template {
	id: string;
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
	default_username: string;
	default_password: string;
	kind: TemplateKind;
	assign_ip: boolean;
	is_active: boolean;
	visibility?: TemplateVisibility;
	// T4 wizard lifecycle fields (migration 000018). Older templates
	// created before T4 default to template_state="active" via the
	// migration backfill.
	template_state?: TemplateLifecycleState;
	source_type?: TemplateSourceType;
	source_ref?: string;
	// skip_generalize=true skips GuestOps sysprep/cloud-init clean only.
	// Verify still runs (ready → verifying → active). Allowed on ovf and
	// clone_vcenter; rejected on iso and clone_template.
	skip_generalize?: boolean;
	staging_network?: string;
	vcenter_vm_id?: string;
	created_by?: string;
	creator?: User;
	created_at?: string;
	updated_at?: string;
	// Pinning fields (migration 000030). Instructors can pin templates
	// to surface them at the top of the list.
	pinned?: boolean;
	pin_order?: number;
	pinned_at?: string | null;
}

// ResolvedCredentialsResponse is the wire type returned by
// GET /api/v1/admin/templates/{id}/resolved-credentials.
// The raw password is never included — has_password indicates
// whether one is available without exposing it.
// source is one of "template" | "unattend_config" | "none".
export interface ResolvedCredentialsResponse {
	username: string;
	has_password: boolean;
	source: 'template' | 'unattend_config' | 'none';
}

export interface PodVM {
	id: string;
	pod_id: string;
	template_id: string;
	display_name: string;
	vcenter_vm_name: string;
	vcenter_vm_id?: string;
	vcpus: number;
	ram_mb: number;
	disk_gb: number;
	ip_address: string;
	status: VMStatus;
	default_username: string;
	default_password: string;
	generated_username: string;
	generated_password: string;
	boot_order: number;
	template_name: string;
	os_type: string;
	/** Wire field from templates.kind (preferred over nested template). */
	template_kind?: TemplateKind;
	/** Wire field from templates.assign_ip. Defaults true when omitted. */
	assign_ip?: boolean;
	/** Wire field from templates.skip_generalize. Defaults false when omitted. */
	skip_generalize?: boolean;
	template?: Template;
	// Suspend fields (migration 000025). Omitted by the API when not suspended.
	suspended_at?: string;
	suspend_reason?: string;
}

export interface VMSnapshot {
	id: string;
	pod_vm_id: string;
	name: string;
	description: string;
	is_initial: boolean;
	created_at: string;
}

export interface Pod {
	id: string;
	owner_id: string;
	name: string;
	salt: string;
	vlan_id: number;
	subnet: string;
	status: PodStatus;
	error_message: string;
	expires_at: string;
	blueprint_id?: string;
	allow_vm_additions: boolean;
	vms: PodVM[];
	owner?: User;
	extensions_used?: number;
	extensions_remaining?: number;
	extend_days?: number;
}

export interface Blueprint {
	id: string;
	name: string;
	description: string;
	created_by: string;
	allow_vm_additions: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	vms: BlueprintVM[];
	creator?: User;
	// Pinning fields (migration 000030). Instructors can pin blueprints
	// to surface them at the top of the list.
	pinned?: boolean;
	pin_order?: number;
	pinned_at?: string | null;
}

export interface BlueprintVM {
	id: string;
	blueprint_id: string;
	template_id: string;
	display_name: string;
	vcpus?: number;
	ram_mb?: number;
	disk_gb?: number;
	boot_order: number;
	quantity: number;
	template_name: string;
}

export interface Job {
	id: string;
	type: string;
	payload: Record<string, unknown>;
	status: JobStatus;
	claimed_by: string;
	started_at: string;
	completed_at: string;
	result: Record<string, unknown>;
	rollback_steps: Record<string, unknown>[];
	created_at: string;
}

export interface AuditEntry {
	id: string;
	user_id: string;
	user_display_name?: string;
	user_email?: string;
	action: string;
	resource_type: string;
	resource_id: string;
	details: Record<string, unknown>;
	ip_address: string;
	created_at: string;
}

export interface AuditLogPage {
	entries: AuditEntry[];
	total: number;
	page: number;
	per_page: number;
}

export interface ActiveSession {
	id: string;
	user_id: string;
	username: string;
	display_name?: string;
	email?: string;
	created_at: string;
	last_activity: string;
	ip_address?: string;
	user_agent?: string;
}

export interface VLANPoolEntry {
	id: number;
	vlan_tag: number;
	subnet: string;
	host_scope: string;
	pod_id: string | null;
	allocated_at: string | null;
}

export interface ResourceUsage {
	used_vcpus: number;
	used_ram_mb: number;
	used_storage_gb: number;
	max_vcpus: number;
	max_ram_mb: number;
	max_pods: number;
	active_pods: number;
}

// --- WebSocket event types ---

export interface WSJobStatusEvent {
	type: 'job.status';
	job_id: string;
	status: JobStatus;
	result?: Record<string, unknown>;
}

export interface WSPodStatusEvent {
	type: 'pod.status';
	pod_id: string;
	status: PodStatus;
	error_message?: string;
}

export interface WSVMStatusEvent {
	type: 'vm.status';
	vm_id: string;
	pod_id: string;
	status: VMStatus;
	ip_address?: string;
	suspended_at?: string;
	suspend_reason?: string;
}

export type WSEvent = WSJobStatusEvent | WSPodStatusEvent | WSVMStatusEvent;

// --- Testing / Workflow Engine types ---

export type RunStatus = 'pending' | 'provisioning' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

export type WorkflowStatus = 'draft' | 'pending_review' | 'approved' | 'active';

export type ResultStatus = 'pending' | 'running' | 'pass' | 'fail' | 'error' | 'timeout' | 'skipped';

export interface Workflow {
	id: string;
	name: string;
	slug: string;
	description: string;
	category: string;
	execution_mode: string;
	script?: string;
	setup_script?: string;
	timeout_seconds: number;
	metadata?: Record<string, unknown>;
	status: WorkflowStatus;
	creation_mode: string;
	visible_to_students: boolean;
	created_by: string;
	approved_by?: string;
	creator?: User;
	approver?: User;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	actions?: Action[];
}

export interface Action {
	id: string;
	workflow_id?: string;
	name: string;
	slug?: string;
	description: string;
	action_type: string;
	action_category: string;
	params: Record<string, unknown>;
	script: string;
	input_context: ContextParam[];
	output_context: ContextParam[];
	execution_order: number;
	timeout_seconds: number;
	student_fail_hint?: string;
	points?: number;
	penalty?: number;
	is_library: boolean;
	supported_platforms: string[];
	created_at: string;
	updated_at: string;
}

export interface ContextParam {
	key: string;
	type: string;
	description: string;
}

export interface Playlist {
	id: string;
	name: string;
	slug: string;
	description: string;
	scoring_mode: string;
	created_by: string;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	workflows?: Workflow[];
}

export interface Run {
	id: string;
	pod_id: string;
	playlist_id?: string;
	triggered_by: string;
	triggered_by_username?: string;
	triggered_by_display_name?: string;
	pod_owner_id?: string;
	pod_owner_username?: string;
	pod_owner_display_name?: string;
	pod_name?: string;
	pod_status?: string;
	playlist_name?: string;
	status: RunStatus;
	total_workflows: number;
	passed_workflows: number;
	failed_workflows: number;
	total_points?: number;
	earned_points?: number;
	/** The pod VM this run was executed against. Name and IP are stored on the
	 * run itself so attribution survives pod teardown; target_pod_vm_id goes
	 * null once the pod_vms row is deleted. */
	target_pod_vm_id?: string | null;
	target_vm_name?: string;
	target_vm_ip?: string;
	error_message?: string;
	started_at?: string;
	completed_at?: string;
	created_at: string;
	updated_at?: string;
	results?: WorkflowResult[];
}

export interface WorkflowResult {
	id: string;
	run_id: string;
	workflow_id: string;
	execution_order: number;
	execution_mode: string;
	status: ResultStatus;
	student_message?: string;
	instructor_output?: Record<string, unknown>;
	action_results?: ActionResult[];
	duration_ms?: number;
	started_at?: string;
	completed_at?: string;
	workflow_name: string;
}

export interface ActionResult {
	action: string;
	status: string;
	message?: string;
	exit_code: number;
	duration_ms: number;
}

export interface TestingTarget {
	pod_vm_id: string;
	display_name: string;
	ip_address: string;
	template_id: string;
	template_name: string;
	status: string;
	playlists: Playlist[];
}

export interface TestingDashboard {
	targets: TestingTarget[];
	recent_runs: Run[];
}

// --- Image Uploads ---

export type ImageUploadStatus =
	| 'pending'
	| 'uploading'
	| 'uploaded'
	| 'importing'
	| 'imported'
	| 'error';

export interface ImageUpload {
	id: string;
	filename: string;
	kind: 'iso' | 'ova';
	size_bytes: number;
	checksum_sha256: string;
	object_key: string;
	upload_id: string;
	status: ImageUploadStatus;
	datastore_path: string;
	vcenter_vm_id: string;
	error_message: string;
	uploaded_by?: string;
	created_at: string;
	updated_at: string;
}

export interface VCenterDatastoreFile {
	name: string;
	path: string;
	folder_path: string;
	size_bytes: number;
	modified_time: string;
}

/**
 * MergedISOEntry is one entry in the /admin/vcenter/isos response.
 * source="datastore" means the file was found directly on the vCenter datastore.
 * source="uploaded" means it came through the image upload pipeline.
 * When disabled=true, the entry is not yet usable (still importing or errored).
 */
export interface MergedISOEntry {
	name: string;
	path?: string;
	folder_path?: string;
	size_bytes?: number;
	modified_time?: string;
	/** "uploaded" | "datastore" */
	source: 'uploaded' | 'datastore';
	/** true = not yet selectable (in-flight or error) */
	disabled: boolean;
	/** Mirrors image_uploads.status for uploaded entries */
	status?: ImageUploadStatus;
	/** Set when status === 'error' */
	error_message?: string;
	/** image_uploads.id for uploaded entries */
	image_id?: string;
}

export interface VCenterISOListResponse {
	/** Merged list of ISOs from both the vCenter datastore and the image upload pipeline. */
	isos: MergedISOEntry[];
	datastore: string;
	cached: boolean;
	cache_age_seconds: number;
}
