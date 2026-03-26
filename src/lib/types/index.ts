// --- Status literal types ---

export type PodStatus =
	| 'pending'
	| 'creating'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'deleting'
	| 'destroy_failed'
	| 'error';

export type VMStatus =
	| 'pending'
	| 'creating'
	| 'powered_on'
	| 'powered_off'
	| 'suspending'
	| 'suspended'
	| 'deleting'
	| 'error';

export type JobStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';

// --- Domain models ---

export interface User {
	id: string;
	username: string;
	email: string;
	display_name: string;
	role: 'user' | 'admin';
	max_vcpus: number;
	max_ram_mb: number;
	max_pods: number;
}

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
	is_active: boolean;
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
	template?: Template;
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
	status: WorkflowStatus;
	creation_mode: string;
	visible_to_students: boolean;
	created_by: string;
	approved_by?: string;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	actions?: Action[];
}

export interface Action {
	id: string;
	workflow_id: string;
	name: string;
	description: string;
	action_type: string;
	params: Record<string, unknown>;
	execution_order: number;
	timeout_seconds: number;
	student_fail_hint?: string;
	points?: number;
	penalty?: number;
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
	status: RunStatus;
	total_workflows: number;
	passed_workflows: number;
	failed_workflows: number;
	error_message?: string;
	started_at?: string;
	completed_at?: string;
	created_at: string;
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

export interface TestingDashboard {
	playlists: Playlist[];
	recent_runs: Run[];
}
