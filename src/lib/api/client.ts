import { goto } from '$app/navigation';
import { authStore } from '$lib/stores/auth.svelte';
import { config } from '$lib/config';
import { mockApi } from './mock';
import type {
	Pod,
	PodVM,
	Template,
	User,
	ResourceUsage,
	Job,
	AuditEntry,
	VLANPoolEntry
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
		authStore.logout();
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

	return (await response.json()) as T;
}

// --- Pods ---

// Normalize pod data — ensure vms array is never null
function normalizePod(pod: Pod): Pod {
	return { ...pod, vms: pod.vms ?? [] };
}

export async function getPods(): Promise<Pod[]> {
	if (isMock) return mockApi.getPods();
	const pods = await apiFetch<Pod[]>('/api/v1/pods');
	return (pods ?? []).map(normalizePod);
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

// --- VMs ---

export function startVM(podId: string, vmId: string): Promise<void> {
	if (isMock) return mockApi.startVM(podId, vmId);
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
	return apiFetch<Template[]>('/api/v1/templates');
}

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
}

export function adminCreateTemplate(req: CreateTemplateRequest): Promise<Template> {
	if (isMock) return mockApi.adminCreateTemplate(req as unknown as Record<string, unknown>);
	return apiFetch<Template>('/api/v1/admin/templates', { method: 'POST', body: JSON.stringify(req) });
}

export function adminUpdateTemplate(id: string, req: Partial<CreateTemplateRequest>): Promise<Template> {
	if (isMock) return mockApi.adminUpdateTemplate(id, req as unknown as Record<string, unknown>);
	return apiFetch<Template>(`/api/v1/admin/templates/${id}`, { method: 'PATCH', body: JSON.stringify(req) });
}

export function adminDeleteTemplate(id: string): Promise<void> {
	if (isMock) return mockApi.adminDeleteTemplate(id);
	return apiFetch<void>(`/api/v1/admin/templates/${id}`, { method: 'DELETE' });
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
	return jobs ?? [];
}

// --- Admin ---

export function adminGetUsers(): Promise<User[]> {
	if (isMock) return mockApi.adminGetUsers();
	return apiFetch<User[]>('/api/v1/admin/users');
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
	return apiFetch<Job[]>('/api/v1/admin/jobs');
}

export function adminGetAuditLog(): Promise<AuditEntry[]> {
	if (isMock) return mockApi.adminGetAuditLog();
	return apiFetch<AuditEntry[]>('/api/v1/admin/audit');
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
