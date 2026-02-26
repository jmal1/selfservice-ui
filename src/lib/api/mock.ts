/**
 * Mock data for local development without a backend.
 * Enable by setting PUBLIC_MOCK=true in .env
 */
import type { Pod, PodVM, Template, User, ResourceUsage, Job, AuditEntry } from '$lib/types';

// --- Helpers ---
let idCounter = 100;
function id(): string {
	return `mock-${++idCounter}`;
}

function generateSalt(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < 6; i++) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}

function sanitizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- Users ---
export const mockUser: User = {
	id: 'usr-001',
	username: 'jmal',
	email: 'jmal@lab.jmal.io',
	display_name: 'Jordan Maloney',
	role: 'admin',
	max_vcpus: 16,
	max_ram_mb: 32768,
	max_pods: 4
};

export const mockUsers: User[] = [
	mockUser,
	{
		id: 'usr-002',
		username: 'student1',
		email: 'student1@lab.jmal.io',
		display_name: 'Alice Chen',
		role: 'user',
		max_vcpus: 8,
		max_ram_mb: 16384,
		max_pods: 2
	},
	{
		id: 'usr-003',
		username: 'student2',
		email: 'student2@lab.jmal.io',
		display_name: 'Bob Williams',
		role: 'user',
		max_vcpus: 8,
		max_ram_mb: 16384,
		max_pods: 2
	}
];

// --- Templates ---
export const mockTemplates: Template[] = [
	{
		id: 'tpl-ubuntu',
		name: 'Ubuntu 24.04 LTS',
		vcenter_template: 'tpl-ubuntu-2404',
		os_type: 'linux',
		default_vcpus: 2,
		default_ram_mb: 4096,
		default_disk_gb: 40,
		min_vcpus: 1,
		min_ram_mb: 2048,
		description: 'Ubuntu 24.04 LTS with Docker pre-installed',
		icon_url: '',
		is_active: true
	},
	{
		id: 'tpl-windows',
		name: 'Windows Server 2022',
		vcenter_template: 'tpl-win2022-std',
		os_type: 'windows',
		default_vcpus: 4,
		default_ram_mb: 8192,
		default_disk_gb: 80,
		min_vcpus: 2,
		min_ram_mb: 4096,
		description: 'Windows Server 2022 Standard with AD tools',
		icon_url: '',
		is_active: true
	},
	{
		id: 'tpl-kali',
		name: 'Kali Linux 2024',
		vcenter_template: 'tpl-kali-2024',
		os_type: 'linux',
		default_vcpus: 2,
		default_ram_mb: 4096,
		default_disk_gb: 60,
		min_vcpus: 2,
		min_ram_mb: 2048,
		description: 'Kali Linux rolling release for penetration testing',
		icon_url: '',
		is_active: true
	},
	{
		id: 'tpl-centos',
		name: 'CentOS Stream 9',
		vcenter_template: 'tpl-centos-stream9',
		os_type: 'linux',
		default_vcpus: 2,
		default_ram_mb: 2048,
		default_disk_gb: 30,
		min_vcpus: 1,
		min_ram_mb: 1024,
		description: 'CentOS Stream 9 minimal install',
		icon_url: '',
		is_active: false
	}
];

// --- Pods + VMs ---
function makeVM(overrides: Partial<PodVM> & { pod_id: string; template_id: string; display_name: string }): PodVM {
	const tpl = mockTemplates.find((t) => t.id === overrides.template_id);
	return {
		id: id(),
		vcenter_vm_name: overrides.vcenter_vm_name ?? `vm-${idCounter}`,
		vcpus: tpl?.default_vcpus ?? 2,
		ram_mb: tpl?.default_ram_mb ?? 4096,
		disk_gb: tpl?.default_disk_gb ?? 40,
		ip_address: '',
		status: 'powered_on',
		template: tpl,
		...overrides
	};
}

export let mockPods: Pod[] = [
	{
		id: 'pod-001',
		owner_id: 'usr-001',
		name: 'Security Lab',
		salt: 'x7k2m9',
		pod_index: 1,
		vlan_id: 101,
		subnet: '10.101.0.0/24',
		status: 'running',
		error_message: '',
		expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
		owner: mockUser,
		vms: [
			makeVM({
				pod_id: 'pod-001',
				template_id: 'tpl-kali',
				display_name: 'Attacker',
				vcenter_vm_name: 'x7k2m9-attacker',
				ip_address: '10.101.0.10',
				status: 'powered_on'
			}),
			makeVM({
				pod_id: 'pod-001',
				template_id: 'tpl-ubuntu',
				display_name: 'Target Server',
				vcenter_vm_name: 'x7k2m9-target-server',
				ip_address: '10.101.0.11',
				status: 'powered_on'
			}),
			makeVM({
				pod_id: 'pod-001',
				template_id: 'tpl-windows',
				display_name: 'Domain Controller',
				vcenter_vm_name: 'x7k2m9-domain-controller',
				ip_address: '10.101.0.12',
				status: 'powered_on'
			})
		]
	},
	{
		id: 'pod-002',
		owner_id: 'usr-001',
		name: 'Dev Playground',
		salt: 'b3f8q1',
		pod_index: 2,
		vlan_id: 102,
		subnet: '10.102.0.0/24',
		status: 'running',
		error_message: '',
		expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
		owner: mockUser,
		vms: [
			makeVM({
				pod_id: 'pod-002',
				template_id: 'tpl-ubuntu',
				display_name: 'Docker Host',
				vcenter_vm_name: 'b3f8q1-docker-host',
				ip_address: '10.102.0.10',
				status: 'powered_on'
			})
		]
	},
	{
		id: 'pod-003',
		owner_id: 'usr-002',
		name: "Alice's Lab",
		salt: 'p5w4n6',
		pod_index: 3,
		vlan_id: 103,
		subnet: '10.103.0.0/24',
		status: 'stopped',
		error_message: '',
		expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
		owner: mockUsers[1],
		vms: [
			makeVM({
				pod_id: 'pod-003',
				template_id: 'tpl-ubuntu',
				display_name: 'Web Server',
				vcenter_vm_name: 'p5w4n6-web-server',
				ip_address: '10.103.0.10',
				status: 'powered_off'
			}),
			makeVM({
				pod_id: 'pod-003',
				template_id: 'tpl-ubuntu',
				display_name: 'Database',
				vcenter_vm_name: 'p5w4n6-database',
				ip_address: '10.103.0.11',
				status: 'powered_off'
			})
		]
	}
];

// --- Resource Usage ---
export function mockResourceUsage(): ResourceUsage {
	let usedVcpus = 0;
	let usedRam = 0;
	let usedDisk = 0;
	let activePods = 0;

	for (const pod of mockPods) {
		if (pod.owner_id === mockUser.id) {
			if (pod.status === 'running') activePods++;
			for (const vm of pod.vms) {
				usedVcpus += vm.vcpus;
				usedRam += vm.ram_mb;
				usedDisk += vm.disk_gb;
			}
		}
	}

	return {
		used_vcpus: usedVcpus,
		used_ram_mb: usedRam,
		used_storage_gb: usedDisk,
		max_vcpus: mockUser.max_vcpus,
		max_ram_mb: mockUser.max_ram_mb,
		max_pods: mockUser.max_pods,
		active_pods: activePods
	};
}

// --- Jobs ---
export const mockJobs: Job[] = [
	{
		id: 'job-001',
		type: 'create_pod',
		payload: { pod_name: 'Security Lab' },
		status: 'completed',
		claimed_by: 'worker-0',
		started_at: new Date(Date.now() - 300000).toISOString(),
		completed_at: new Date(Date.now() - 120000).toISOString(),
		result: { success: true },
		rollback_steps: [],
		created_at: new Date(Date.now() - 360000).toISOString()
	},
	{
		id: 'job-002',
		type: 'create_pod',
		payload: { pod_name: 'Dev Playground' },
		status: 'completed',
		claimed_by: 'worker-0',
		started_at: new Date(Date.now() - 600000).toISOString(),
		completed_at: new Date(Date.now() - 480000).toISOString(),
		result: { success: true },
		rollback_steps: [],
		created_at: new Date(Date.now() - 660000).toISOString()
	}
];

// --- Audit Log ---
export const mockAuditLog: AuditEntry[] = [
	{
		id: 'aud-001',
		user_id: 'usr-001',
		action: 'pod.create',
		resource_type: 'pod',
		resource_id: 'pod-001',
		details: { pod_name: 'Security Lab', vm_count: 3 },
		ip_address: '100.122.0.5',
		created_at: new Date(Date.now() - 360000).toISOString()
	},
	{
		id: 'aud-002',
		user_id: 'usr-001',
		action: 'pod.create',
		resource_type: 'pod',
		resource_id: 'pod-002',
		details: { pod_name: 'Dev Playground', vm_count: 1 },
		ip_address: '100.122.0.5',
		created_at: new Date(Date.now() - 660000).toISOString()
	},
	{
		id: 'aud-003',
		user_id: 'usr-002',
		action: 'vm.stop',
		resource_type: 'vm',
		resource_id: 'mock-108',
		details: { vm_name: 'alice-web-01' },
		ip_address: '100.122.0.12',
		created_at: new Date(Date.now() - 1800000).toISOString()
	},
	{
		id: 'aud-004',
		user_id: 'usr-001',
		action: 'user.login',
		resource_type: 'user',
		resource_id: 'usr-001',
		details: {},
		ip_address: '100.122.0.5',
		created_at: new Date(Date.now() - 3600000).toISOString()
	}
];

// --- Simulated latency ---
function delay(ms = 300): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));
}

// --- Mock API implementations ---
export const mockApi = {
	async getMe(): Promise<User> {
		await delay(100);
		return mockUser;
	},

	async getPods(): Promise<Pod[]> {
		await delay();
		return mockPods.filter((p) => p.owner_id === mockUser.id || mockUser.role === 'admin');
	},

	async getPod(podId: string): Promise<Pod> {
		await delay();
		const pod = mockPods.find((p) => p.id === podId);
		if (!pod) throw new Error(`Pod ${podId} not found`);
		return pod;
	},

	async createPod(req: { name: string; vms: { template_id: string; display_name: string; vcpus?: number; ram_mb?: number; disk_gb?: number }[] }): Promise<Pod> {
		await delay(800);
		const podIndex = mockPods.length + 1;
		const salt = generateSalt();
		const newPod: Pod = {
			id: id(),
			owner_id: mockUser.id,
			name: req.name,
			salt,
			pod_index: podIndex,
			vlan_id: 100 + podIndex,
			subnet: `10.${100 + podIndex}.0.0/24`,
			status: 'creating',
			error_message: '',
			expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
			owner: mockUser,
			vms: req.vms.map((v, i) =>
				makeVM({
					pod_id: `pod-new-${podIndex}`,
					template_id: v.template_id,
					display_name: v.display_name,
					vcenter_vm_name: `${salt}-${sanitizeName(v.display_name)}`,
					vcpus: v.vcpus,
					ram_mb: v.ram_mb,
					disk_gb: v.disk_gb,
					ip_address: `10.${100 + podIndex}.0.${10 + i}`,
					status: 'creating'
				})
			)
		};
		mockPods = [...mockPods, newPod];

		// Simulate provisioning completing after 2s
		setTimeout(() => {
			mockPods = mockPods.map((p) =>
				p.id === newPod.id
					? {
							...p,
							status: 'running',
							vms: p.vms.map((vm) => ({ ...vm, status: 'powered_on' as const }))
						}
					: p
			);
		}, 2000);

		return newPod;
	},

	async deletePod(podId: string): Promise<void> {
		await delay(500);
		mockPods = mockPods.filter((p) => p.id !== podId);
	},

	async startVM(podId: string, vmId: string): Promise<void> {
		await delay(600);
		mockPods = mockPods.map((p) =>
			p.id === podId
				? { ...p, vms: p.vms.map((vm) => (vm.id === vmId ? { ...vm, status: 'powered_on' as const } : vm)) }
				: p
		);
	},

	async stopVM(podId: string, vmId: string): Promise<void> {
		await delay(600);
		mockPods = mockPods.map((p) =>
			p.id === podId
				? { ...p, vms: p.vms.map((vm) => (vm.id === vmId ? { ...vm, status: 'powered_off' as const } : vm)) }
				: p
		);
	},

	async restartVM(podId: string, vmId: string): Promise<void> {
		await delay(1000);
		// Status stays powered_on after restart
		void podId;
		void vmId;
	},

	async deleteVM(podId: string, vmId: string): Promise<void> {
		await delay(500);
		mockPods = mockPods.map((p) =>
			p.id === podId ? { ...p, vms: p.vms.filter((vm) => vm.id !== vmId) } : p
		);
		// Auto-delete pod if no VMs remain
		mockPods = mockPods.filter((p) => !(p.id === podId && p.vms.length === 0));
	},

	async addVM(podId: string, req: { template_id: string; display_name: string; vcpus?: number; ram_mb?: number; disk_gb?: number }): Promise<PodVM> {
		await delay(600);
		const pod = mockPods.find((p) => p.id === podId);
		if (!pod) throw new Error('Pod not found');
		const vm = makeVM({
			pod_id: podId,
			template_id: req.template_id,
			display_name: req.display_name,
			vcenter_vm_name: `${pod.salt}-${sanitizeName(req.display_name)}`,
			vcpus: req.vcpus,
			ram_mb: req.ram_mb,
			disk_gb: req.disk_gb,
			ip_address: `${pod.subnet.replace('.0/24', '')}.${10 + pod.vms.length}`,
			status: 'powered_on'
		});
		mockPods = mockPods.map((p) => (p.id === podId ? { ...p, vms: [...p.vms, vm] } : p));
		return vm;
	},

	async getConsoleTicket(_podId: string, _vmId: string): Promise<{ ticket: string; url: string }> {
		await delay();
		return { ticket: 'mock-ticket-abc123', url: 'wss://vcenter.lab.jmal.io/ticket/mock' };
	},

	async getTemplates(): Promise<Template[]> {
		await delay();
		return mockTemplates;
	},

	async getResourceUsage(): Promise<ResourceUsage> {
		await delay(150);
		return mockResourceUsage();
	},

	async adminGetUsers(): Promise<User[]> {
		await delay();
		return mockUsers;
	},

	async adminUpdateQuota(userId: string, req: { max_vcpus: number; max_ram_mb: number; max_pods: number }): Promise<User> {
		await delay();
		const idx = mockUsers.findIndex((u) => u.id === userId);
		if (idx === -1) throw new Error('User not found');
		mockUsers[idx] = { ...mockUsers[idx], ...req };
		return mockUsers[idx];
	},

	async adminGetJobs(): Promise<Job[]> {
		await delay();
		return mockJobs;
	},

	async adminGetAuditLog(): Promise<AuditEntry[]> {
		await delay();
		return mockAuditLog;
	},

	async adminCreateTemplate(req: Record<string, unknown>): Promise<Template> {
		await delay();
		const tpl: Template = {
			id: id(),
			name: req.name as string,
			vcenter_template: req.vcenter_template as string,
			os_type: req.os_type as string,
			default_vcpus: req.default_vcpus as number,
			default_ram_mb: req.default_ram_mb as number,
			default_disk_gb: req.default_disk_gb as number,
			min_vcpus: req.min_vcpus as number,
			min_ram_mb: req.min_ram_mb as number,
			description: req.description as string,
			icon_url: req.icon_url as string,
			is_active: req.is_active as boolean
		};
		mockTemplates.push(tpl);
		return tpl;
	},

	async adminUpdateTemplate(templateId: string, req: Record<string, unknown>): Promise<Template> {
		await delay();
		const idx = mockTemplates.findIndex((t) => t.id === templateId);
		if (idx === -1) throw new Error('Template not found');
		mockTemplates[idx] = { ...mockTemplates[idx], ...(req as Partial<Template>) };
		return mockTemplates[idx];
	},

	async adminDeleteTemplate(templateId: string): Promise<void> {
		await delay();
		const idx = mockTemplates.findIndex((t) => t.id === templateId);
		if (idx !== -1) mockTemplates.splice(idx, 1);
	}
};
