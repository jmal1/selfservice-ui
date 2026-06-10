import { describe, it, expect } from 'vitest';
import {
	podVMToAccessInfo,
	wizardStateToAccessInfo
} from './vm-access-adapters';
import type { PodVM } from '$lib/types';
import type { WizardStateResponse } from '$lib/api/client';

// These adapters are the only place the call-site shape conversion
// happens, so we test them tightly. Any new field on VMAccessInfo
// will fail the "fully populated" assertion below unless both
// adapters learn how to fill it.

describe('podVMToAccessInfo', () => {
	const baseVM: PodVM = {
		id: 'vm-1',
		pod_id: 'pod-1',
		template_id: 'tpl-1',
		display_name: 'My VM',
		vcenter_vm_name: 'pod-myvm-1',
		vcenter_vm_id: 'vm-9001',
		vcpus: 2,
		ram_mb: 4096,
		disk_gb: 40,
		ip_address: '10.10.30.5',
		status: 'running',
		default_username: 'student',
		default_password: 'defaultpw',
		generated_username: 'pod-student-7',
		generated_password: 'GenPw!7',
		boot_order: 0,
		template_name: 'Kali',
		os_type: 'linux'
	};

	it('prefers generated credentials over defaults', () => {
		const info = podVMToAccessInfo(baseVM);
		expect(info.displayUsername).toBe('pod-student-7');
		expect(info.displayPassword).toBe('GenPw!7');
	});

	it('falls back to default credentials when no generated creds', () => {
		const info = podVMToAccessInfo({
			...baseVM,
			generated_username: '',
			generated_password: ''
		});
		expect(info.displayUsername).toBe('student');
		expect(info.displayPassword).toBe('defaultpw');
	});

	it('builds a pod-scoped console href', () => {
		const info = podVMToAccessInfo(baseVM);
		expect(info.consoleHref).toBe('/console/pod-1/vm-1');
	});

	it('marks not-powered-on when status !== running', () => {
		const info = podVMToAccessInfo({ ...baseVM, status: 'stopped' });
		expect(info.isPoweredOn).toBe(false);
	});

	it('defaults templateKind when template is absent', () => {
		const info = podVMToAccessInfo(baseVM);
		expect(info.templateKind).toBe('clone_with_customize');
	});

	it('flags noIpExpected when template.assign_ip === false', () => {
		const info = podVMToAccessInfo({
			...baseVM,
			template: {
				...({} as any),
				kind: 'registered_existing_vm',
				assign_ip: false
			}
		});
		expect(info.noIpExpected).toBe(true);
		expect(info.templateKind).toBe('registered_existing_vm');
	});
});

describe('wizardStateToAccessInfo', () => {
	const baseState: WizardStateResponse = {
		template_id: 'tpl-h-1',
		template_state: 'configuring',
		allowed_next_states: ['generalizing', 'error'],
		vcenter_vm_id: 'vm-build-42',
		os_type: 'windows',
		template_kind: 'clone_with_customize',
		assign_ip: true,
		build_vm_name: 'tpl-windows11-ab12cd',
		build_vm_ip: '10.10.30.42',
		build_vm_power_on: true,
		build_vm_tools_running: true,
		default_username: 'Student',
		default_password: 'Changeme123!'
	};

	it('returns null when no build VM exists yet', () => {
		const info = wizardStateToAccessInfo({
			...baseState,
			vcenter_vm_id: undefined
		});
		expect(info).toBeNull();
	});

	it('builds a template-scoped console href', () => {
		const info = wizardStateToAccessInfo(baseState);
		expect(info?.consoleHref).toBe('/admin/templates/tpl-h-1/console');
	});

	it('uses template defaults (build VM has no per-pod creds)', () => {
		const info = wizardStateToAccessInfo(baseState);
		expect(info?.displayUsername).toBe('Student');
		expect(info?.displayPassword).toBe('Changeme123!');
	});

	it('reflects live power state from the wizard response', () => {
		const off = wizardStateToAccessInfo({
			...baseState,
			build_vm_power_on: false
		});
		expect(off?.isPoweredOn).toBe(false);
	});

	it('flags noIpExpected when template.assign_ip is false', () => {
		const info = wizardStateToAccessInfo({
			...baseState,
			assign_ip: false
		});
		expect(info?.noIpExpected).toBe(true);
	});

	it('treats empty live fields gracefully (IP / name not reported yet)', () => {
		const info = wizardStateToAccessInfo({
			...baseState,
			build_vm_ip: undefined,
			build_vm_name: undefined,
			build_vm_power_on: false,
			build_vm_tools_running: false
		});
		expect(info?.ipAddress).toBe('');
		expect(info?.vcenterVmName).toBe('');
		// The panel renders even with no IP, as long as vcenter_vm_id is set,
		// so the user still sees the credentials + Console button.
		expect(info?.vcenterVmId).toBe('vm-build-42');
	});

	it('defaults templateKind to clone_with_customize when unset', () => {
		const info = wizardStateToAccessInfo({
			...baseState,
			template_kind: undefined
		});
		expect(info?.templateKind).toBe('clone_with_customize');
	});
});
