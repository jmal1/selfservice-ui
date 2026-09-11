import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Pod } from '$lib/types';
import PodList from './PodList.svelte';

const pod: Pod = {
	id: 'pod-1',
	owner_id: 'user-1',
	name: 'Existing lab',
	salt: 'abc123',
	vlan_id: 101,
	subnet: '10.101.0.0/24',
	status: 'active',
	error_message: '',
	expires_at: '2030-01-01T00:00:00Z',
	allow_vm_additions: true,
	vms: [
		{
			id: 'vm-1',
			pod_id: 'pod-1',
			template_id: 'template-1',
			display_name: 'Existing VM',
			vcenter_vm_name: 'abc123-existing-vm',
			vcpus: 2,
			ram_mb: 4096,
			disk_gb: 40,
			ip_address: '10.101.0.10',
			status: 'stopped',
			default_username: 'student',
			default_password: '',
			generated_username: 'student',
			generated_password: '',
			boot_order: 0,
			template_name: 'Ubuntu',
			os_type: 'linux'
		}
	]
};

describe('PodList maintenance behavior', () => {
	it('keeps cleanup and existing-VM controls usable', () => {
		render(PodList, { props: { pods: [pod] } });

		for (const button of screen.getAllByRole('button', { name: /delete pod/i })) {
			expect((button as HTMLButtonElement).disabled).toBe(false);
		}
		for (const button of screen.getAllByRole('button', { name: /delete vm/i })) {
			expect((button as HTMLButtonElement).disabled).toBe(false);
		}
		for (const button of screen.getAllByRole('button', { name: /start vm/i })) {
			expect((button as HTMLButtonElement).disabled).toBe(false);
		}
	});
});
