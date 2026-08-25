import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import VMAccessPanel from './VMAccessPanel.svelte';
import type { VMAccessInfo } from '$lib/types/vm-access';

// The power controls are wizard-only: they must stay hidden in the student pod
// view (showPowerControls defaults off) and must gate Start vs Stop/Restart/
// Reset on the VM's power state.

function baseInfo(overrides: Partial<VMAccessInfo> = {}): VMAccessInfo {
	return {
		osType: 'linux',
		ipAddress: '10.10.30.5',
		vcenterVmId: 'vm-9001',
		vcenterVmName: 'build-vm',
		displayUsername: 'student',
		displayPassword: '',
		isPoweredOn: true,
		consoleHref: '/admin/templates/tpl-1/console',
		templateKind: 'clone_with_customize',
		noIpExpected: false,
		isSuspended: false,
		...overrides
	};
}

describe('VMAccessPanel power controls', () => {
	it('does not render power controls by default (pod-safety)', () => {
		render(VMAccessPanel, { props: { info: baseInfo() } });
		expect(screen.queryByLabelText('Start staging VM')).toBeNull();
		expect(screen.queryByLabelText('Stop staging VM')).toBeNull();
	});

	it('when powered on: Start disabled, Stop/Restart/Reset enabled', () => {
		render(VMAccessPanel, {
			props: { info: baseInfo({ isPoweredOn: true }), showPowerControls: true, onPower: vi.fn() }
		});
		expect((screen.getByLabelText('Start staging VM') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByLabelText('Stop staging VM') as HTMLButtonElement).disabled).toBe(false);
		expect((screen.getByLabelText('Restart staging VM') as HTMLButtonElement).disabled).toBe(false);
		expect((screen.getByLabelText('Reset staging VM') as HTMLButtonElement).disabled).toBe(false);
	});

	it('when powered off: Start enabled, Stop/Restart/Reset disabled', () => {
		render(VMAccessPanel, {
			props: { info: baseInfo({ isPoweredOn: false }), showPowerControls: true, onPower: vi.fn() }
		});
		expect((screen.getByLabelText('Start staging VM') as HTMLButtonElement).disabled).toBe(false);
		expect((screen.getByLabelText('Stop staging VM') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByLabelText('Restart staging VM') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByLabelText('Reset staging VM') as HTMLButtonElement).disabled).toBe(true);
	});

	it('calls onPower with the chosen action', async () => {
		const onPower = vi.fn().mockResolvedValue(undefined);
		render(VMAccessPanel, {
			props: { info: baseInfo({ isPoweredOn: false }), showPowerControls: true, onPower }
		});
		await fireEvent.click(screen.getByLabelText('Start staging VM'));
		expect(onPower).toHaveBeenCalledWith('start');
	});

	it('renders no power controls without a vCenter VM even when enabled', () => {
		render(VMAccessPanel, {
			props: {
				info: baseInfo({ vcenterVmId: undefined, consoleHref: undefined }),
				showPowerControls: true,
				onPower: vi.fn()
			}
		});
		expect(screen.queryByLabelText('Start staging VM')).toBeNull();
	});
});
