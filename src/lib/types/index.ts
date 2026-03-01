// --- Status literal types ---

export type PodStatus =
	| 'pending'
	| 'creating'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'deleting'
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
	template_name: string;
	os_type: string;
	template?: Template;
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
	vms: PodVM[];
	owner?: User;
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
