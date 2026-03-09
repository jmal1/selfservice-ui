<script lang="ts">
	import { page } from '$app/state';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { onMount, onDestroy } from 'svelte';

	const podId = $derived(page.params.podId);
	const vmId = $derived(page.params.vmId);

	let canvasContainer: HTMLDivElement;
	let wmks: any = null;
	let WMKS: any = null;
	let resizeObserver: ResizeObserver | null = null;
	let status = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
	let errorMessage = $state('');

	// Paste / text input state
	let showTextDrawer = $state(false);
	let textInput = $state('');
	let slowMode = $state(false);
	let sending = $state(false);

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
				fitToParent: true,
				fitGuest: true,
				position: WMKS.CONST.Position.CENTER,
			});

			wmks.register(WMKS.CONST.Events.CONNECTION_STATE_CHANGE, (_event: any, data: any) => {
				switch (data.state) {
					case WMKS.CONST.ConnectionState.CONNECTED:
						status = 'connected';
						// Trigger a resize so WMKS fits to the actual container
						try { wmks.updateScreen(); } catch {}
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

			// Watch for container resizes and re-fit WMKS
			resizeObserver = new ResizeObserver(() => {
				if (wmks && status === 'connected') {
					try { wmks.updateScreen(); } catch {}
				}
			});
			resizeObserver.observe(canvasContainer);
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

	async function handlePaste() {
		if (!wmks || status !== 'connected') return;
		try {
			const text = await navigator.clipboard.readText();
			if (!text) {
				toastStore.warning('Clipboard is empty');
				return;
			}
			if (slowMode) {
				sending = true;
				for (const char of text) {
					wmks.sendInputString(char);
					await new Promise(r => setTimeout(r, 50));
				}
				sending = false;
			} else {
				wmks.sendInputString(text);
			}
			toastStore.success(`Pasted ${text.length} chars`);
		} catch {
			// Clipboard permission denied — open text drawer as fallback
			showTextDrawer = true;
			toastStore.warning('Clipboard access denied — use the text input panel');
		}
	}

	async function sendTextToVM() {
		if (!wmks || !textInput || status !== 'connected') return;
		sending = true;
		try {
			if (slowMode) {
				for (const char of textInput) {
					wmks.sendInputString(char);
					await new Promise(r => setTimeout(r, 50));
				}
			} else {
				wmks.sendInputString(textInput);
			}
			toastStore.success(`Sent ${textInput.length} chars to VM`);
			textInput = '';
		} catch {
			toastStore.error('Failed to send text to VM');
		} finally {
			sending = false;
		}
	}

	function handlePageKeydown(e: KeyboardEvent) {
		// Ctrl+Shift+V triggers paste into VM
		if (e.ctrlKey && e.shiftKey && e.key === 'V') {
			e.preventDefault();
			e.stopPropagation();
			handlePaste();
		}
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

			WMKS = (window as any).WMKS;

			if (!WMKS || typeof WMKS.createWMKS !== 'function') {
				throw new Error('WMKS SDK failed to load');
			}

			connect();
		} catch (e) {
			status = 'error';
			errorMessage = `Failed to initialize console: ${e}`;
		}
	});

	onDestroy(() => {
		if (resizeObserver) resizeObserver.disconnect();
		if (wmks) {
			try { wmks.disconnect(); } catch {}
			try { wmks.destroy(); } catch {}
		}
	});
</script>

<svelte:head>
	<title>VM Console</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex h-screen w-screen flex-col bg-black" onkeydown={handlePageKeydown}>
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
			<!-- Paste clipboard into VM -->
			<button
				class="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
				onclick={handlePaste}
				disabled={status !== 'connected' || sending}
				title="Paste clipboard into VM (Ctrl+Shift+V)"
			>
				{#if sending}
					<span class="inline-flex items-center gap-1">
						<svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
						Sending…
					</span>
				{:else}
					📋 Paste
				{/if}
			</button>
			<!-- Toggle text input drawer -->
			<button
				class="rounded border border-surface-600 bg-surface-800 px-3 py-1 text-xs transition-colors hover:bg-surface-700
					{showTextDrawer ? 'text-primary-400 border-primary-500/30' : 'text-surface-300'}"
				onclick={() => showTextDrawer = !showTextDrawer}
				title="Open text input panel for pasting into VM"
			>
				⌨️ Text Input
			</button>
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

	<!-- Text input drawer -->
	{#if showTextDrawer}
		<div class="border-b border-surface-700 bg-surface-900/95 px-4 py-3">
			<div class="flex items-start gap-3">
				<textarea
					bind:value={textInput}
					placeholder="Type or paste text here, then click Send to type it into the VM…"
					rows="3"
					class="flex-1 resize-y rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 font-mono text-sm text-surface-200 placeholder-surface-500 focus:border-primary-500/50 focus:outline-none"
					disabled={sending}
				></textarea>
				<div class="flex flex-col gap-1.5">
					<button
						onclick={sendTextToVM}
						disabled={!textInput || status !== 'connected' || sending}
						class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
					>
						{#if sending}
							Sending…
						{:else}
							Send to VM
						{/if}
					</button>
					<button
						onclick={() => { textInput = ''; }}
						disabled={sending}
						class="rounded-lg border border-surface-600 px-4 py-1.5 text-xs text-surface-400 transition-colors hover:bg-surface-800"
					>
						Clear
					</button>
				</div>
			</div>
			<div class="mt-2 flex items-center gap-4 text-xs text-surface-500">
				<label class="flex items-center gap-1.5 cursor-pointer">
					<input type="checkbox" bind:checked={slowMode} class="rounded border-surface-600" />
					Slow mode <span class="text-surface-600">(for laggy VMs — sends one char at a time)</span>
				</label>
				<span class="text-surface-600">|</span>
				<span title="This version of the console SDK does not support reading text from the VM display. Use SSH or RDP to copy text out of the VM.">
					ℹ️ Copy from VM requires SSH/RDP
				</span>
			</div>
		</div>
	{/if}

	<!-- Console canvas (always in DOM so WMKS widget can attach/reattach) -->
	<div class="relative flex-1 overflow-hidden" bind:this={canvasContainer}>
		<div id="console-canvas"></div>

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
	:global(html),
	:global(body) {
		overflow: hidden !important;
		margin: 0;
		padding: 0;
		height: 100%;
		width: 100%;
	}
	/* Pin the WMKS container to the parent via absolute positioning
	   so its dimensions come from the parent, not its children */
	:global(#console-canvas) {
		position: absolute !important;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden !important;
	}
	:global(#console-canvas > div) {
		overflow: hidden !important;
		max-width: 100% !important;
		max-height: 100% !important;
	}
	:global(#console-canvas canvas) {
		max-width: 100% !important;
		max-height: 100% !important;
		object-fit: contain;
	}
</style>
