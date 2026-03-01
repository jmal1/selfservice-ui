<script lang="ts">
	import { page } from '$app/state';
	import { config } from '$lib/config';
	import { onMount, onDestroy } from 'svelte';

	const podId = $derived(page.params.podId);
	const vmId = $derived(page.params.vmId);

	let canvasContainer: HTMLDivElement;
	let wmks: any = null;
	let WMKS: any = null;
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

		if (!WMKS) {
			status = 'error';
			errorMessage = 'WMKS SDK failed to load.';
			return;
		}

		const wsUrl = getConsoleWsUrl();

		try {
			wmks = WMKS.createWMKS('console-canvas', {
				rescale: true,
				changeResolution: true,
				position: WMKS.CONST.Position.CENTER,
			});

			wmks.register(WMKS.CONST.Events.CONNECTION_STATE_CHANGE, (_event: any, data: any) => {
				switch (data.state) {
					case WMKS.CONST.ConnectionState.CONNECTED:
						status = 'connected';
						break;
					case WMKS.CONST.ConnectionState.DISCONNECTED:
						status = 'disconnected';
						break;
				}
			});

			wmks.register(WMKS.CONST.Events.ERROR, (_event: any, data: any) => {
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

	onMount(async () => {
		try {
			// Load WMKS as a classic script (not ESM) so jQuery + jQuery UI
			// widget factory initialise correctly in the global scope.
			if (!(window as any).WMKS) {
				// Prevent AMD loaders from hijacking jQuery UI's factory
				const prevDefine = (window as any).define;
				(window as any).define = undefined;

				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = '/wmks/wmks.js';
					script.onload = () => resolve();
					script.onerror = () => reject(new Error('Failed to load WMKS script'));
					document.head.appendChild(script);
				});

				// Restore define if it existed
				if (prevDefine !== undefined) (window as any).define = prevDefine;
			}

			const w = window as any;
			WMKS = w.WMKS;

			// Diagnostics for debugging
			console.log('[WMKS] window.WMKS:', typeof WMKS);
			console.log('[WMKS] window.$:', typeof w.$);
			console.log('[WMKS] $.widget:', typeof w.$?.widget);
			console.log('[WMKS] $.fn.nwmks:', typeof w.$?.fn?.nwmks);
			console.log('[WMKS] WMKS.createWMKS:', typeof WMKS?.createWMKS);
			console.log('[WMKS] #console-canvas exists:', !!document.getElementById('console-canvas'));

			if (!WMKS || typeof WMKS.createWMKS !== 'function') {
				throw new Error(
					`WMKS.createWMKS not available. WMKS=${typeof WMKS}, ` +
					`$=${typeof w.$}, $.widget=${typeof w.$?.widget}, $.fn.nwmks=${typeof w.$?.fn?.nwmks}`
				);
			}

			connect();
		} catch (e) {
			status = 'error';
			errorMessage = `Failed to initialize console: ${e}`;
		}
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

	<!-- Console canvas (always in DOM so WMKS widget can attach/reattach) -->
	<div class="relative flex-1 overflow-hidden" bind:this={canvasContainer}>
		<div id="console-canvas" class="h-full w-full"></div>

		{#if status === 'error'}
			<div class="absolute inset-0 flex items-center justify-center bg-black/80">
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
			<div class="absolute inset-0 flex items-center justify-center bg-black/80">
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
