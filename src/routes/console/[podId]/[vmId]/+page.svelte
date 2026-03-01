<script lang="ts">
	import { page } from '$app/state';
	import { config } from '$lib/config';
	import { onMount, onDestroy } from 'svelte';

	const podId = $derived(page.params.podId);
	const vmId = $derived(page.params.vmId);

	let canvasContainer: HTMLDivElement;
	let wmks: any = null;
	let status = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
	let errorMessage = $state('');

	function getConsoleWsUrl(): string {
		const base = config.apiBaseUrl || window.location.origin;
		const wsBase = base.replace(/^http/, 'ws');
		return `${wsBase}/api/v1/pods/${podId}/vms/${vmId}/console/ws`;
	}

	function connect() {
		status = 'connecting';
		errorMessage = '';

		const wsUrl = getConsoleWsUrl();

		// Check if WMKS SDK is available
		if (typeof (window as any).WMKS === 'undefined') {
			// Fallback: raw WebSocket display with message
			status = 'error';
			errorMessage = 'WMKS SDK not loaded. Please ensure wmks.min.js is available.';
			return;
		}

		try {
			wmks = (window as any).WMKS.createWMKS('console-canvas', {
				rescale: true,
				changeResolution: true,
				position: (window as any).WMKS.CONST.Position.CENTER,
			});

			wmks.register((window as any).WMKS.CONST.Events.CONNECTION_STATE_CHANGE, (event: any, data: any) => {
				switch (data.state) {
					case (window as any).WMKS.CONST.ConnectionState.CONNECTED:
						status = 'connected';
						break;
					case (window as any).WMKS.CONST.ConnectionState.DISCONNECTED:
						status = 'disconnected';
						break;
				}
			});

			wmks.register((window as any).WMKS.CONST.Events.ERROR, (_event: any, data: any) => {
				status = 'error';
				errorMessage = data?.message || 'Console connection error';
			});

			wmks.connect(wsUrl);
		} catch (e) {
			status = 'error';
			errorMessage = `Failed to initialize console: ${e}`;
		}
	}

	function sendCtrlAltDel() {
		if (wmks) {
			wmks.sendCAD();
		}
	}

	function reconnect() {
		if (wmks) {
			try { wmks.disconnect(); } catch {}
			try { wmks.destroy(); } catch {}
		}
		wmks = null;
		connect();
	}

	onMount(() => {
		connect();
	});

	onDestroy(() => {
		if (wmks) {
			try { wmks.disconnect(); } catch {}
			try { wmks.destroy(); } catch {}
		}
	});
</script>

<svelte:head>
	<title>VM Console</title>
	<script src="/wmks/wmks.min.js"></script>
	<link rel="stylesheet" href="/wmks/css/wmks-all.css" />
</svelte:head>

<div class="flex h-screen w-screen flex-col bg-black">
	<!-- Toolbar -->
	<div class="flex items-center gap-3 bg-surface-900 px-4 py-2">
		<span class="text-sm font-semibold text-surface-200">VM Console</span>

		<!-- Status badge -->
		{#if status === 'connecting'}
			<span class="flex items-center gap-1.5 rounded-full bg-warning-500/20 px-2.5 py-0.5 text-xs text-warning-400">
				<span class="h-2 w-2 animate-pulse rounded-full bg-warning-400"></span>
				Connecting…
			</span>
		{:else if status === 'connected'}
			<span class="flex items-center gap-1.5 rounded-full bg-success-500/20 px-2.5 py-0.5 text-xs text-success-400">
				<span class="h-2 w-2 rounded-full bg-success-400"></span>
				Connected
			</span>
		{:else if status === 'disconnected'}
			<span class="flex items-center gap-1.5 rounded-full bg-surface-500/20 px-2.5 py-0.5 text-xs text-surface-400">
				<span class="h-2 w-2 rounded-full bg-surface-400"></span>
				Disconnected
			</span>
		{:else}
			<span class="flex items-center gap-1.5 rounded-full bg-error-500/20 px-2.5 py-0.5 text-xs text-error-400">
				<span class="h-2 w-2 rounded-full bg-error-400"></span>
				Error
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<button
				class="rounded border border-surface-600 bg-surface-800 px-3 py-1 text-xs text-surface-300 transition-colors hover:bg-surface-700"
				onclick={sendCtrlAltDel}
				disabled={status !== 'connected'}
			>
				Ctrl+Alt+Del
			</button>
			{#if status === 'disconnected' || status === 'error'}
				<button
					class="rounded border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs text-primary-400 transition-colors hover:bg-primary-500/20"
					onclick={reconnect}
				>
					Reconnect
				</button>
			{/if}
			<a
				href="/pods/{podId}"
				class="rounded border border-surface-600 bg-surface-800 px-3 py-1 text-xs text-surface-300 transition-colors hover:bg-surface-700"
			>
				← Back to Pod
			</a>
		</div>
	</div>

	<!-- Console canvas -->
	<div class="relative flex-1 overflow-hidden" bind:this={canvasContainer}>
		{#if status === 'error'}
			<div class="flex h-full items-center justify-center">
				<div class="rounded-xl border border-error-500/30 bg-error-500/10 p-8 text-center">
					<p class="text-lg font-semibold text-error-400">Console Error</p>
					<p class="mt-2 text-sm text-surface-400">{errorMessage}</p>
					<button
						class="mt-4 rounded border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm text-primary-400 transition-colors hover:bg-primary-500/20"
						onclick={reconnect}
					>
						Try Again
					</button>
				</div>
			</div>
		{:else if status === 'disconnected'}
			<div class="flex h-full items-center justify-center">
				<div class="rounded-xl border border-surface-600 bg-surface-800/50 p-8 text-center">
					<p class="text-lg font-semibold text-surface-300">Disconnected</p>
					<p class="mt-2 text-sm text-surface-400">The console session has ended.</p>
					<button
						class="mt-4 rounded border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm text-primary-400 transition-colors hover:bg-primary-500/20"
						onclick={reconnect}
					>
						Reconnect
					</button>
				</div>
			</div>
		{:else}
			<div id="console-canvas" class="h-full w-full"></div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		overflow: hidden;
		margin: 0;
		padding: 0;
	}
</style>
