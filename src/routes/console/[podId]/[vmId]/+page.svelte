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
	let sending = $state(false);

	// US keyboard layout: char → [keyCode, code, needsShift]
	const KEY_MAP: Record<string, [number, string, boolean]> = {
		"\n": [13, "Enter", false], "\r": [13, "Enter", false],
		"\t": [9, "Tab", false], " ": [32, "Space", false],
		"`": [192, "Backquote", false], "~": [192, "Backquote", true],
		"1": [49, "Digit1", false], "!": [49, "Digit1", true],
		"2": [50, "Digit2", false], "@": [50, "Digit2", true],
		"3": [51, "Digit3", false], "#": [51, "Digit3", true],
		"4": [52, "Digit4", false], "$": [52, "Digit4", true],
		"5": [53, "Digit5", false], "%": [53, "Digit5", true],
		"6": [54, "Digit6", false], "^": [54, "Digit6", true],
		"7": [55, "Digit7", false], "&": [55, "Digit7", true],
		"8": [56, "Digit8", false], "*": [56, "Digit8", true],
		"9": [57, "Digit9", false], "(": [57, "Digit9", true],
		"0": [48, "Digit0", false], ")": [48, "Digit0", true],
		"-": [189, "Minus", false], "_": [189, "Minus", true],
		"=": [187, "Equal", false], "+": [187, "Equal", true],
		"q": [81, "KeyQ", false], "Q": [81, "KeyQ", true],
		"w": [87, "KeyW", false], "W": [87, "KeyW", true],
		"e": [69, "KeyE", false], "E": [69, "KeyE", true],
		"r": [82, "KeyR", false], "R": [82, "KeyR", true],
		"t": [84, "KeyT", false], "T": [84, "KeyT", true],
		"y": [89, "KeyY", false], "Y": [89, "KeyY", true],
		"u": [85, "KeyU", false], "U": [85, "KeyU", true],
		"i": [73, "KeyI", false], "I": [73, "KeyI", true],
		"o": [79, "KeyO", false], "O": [79, "KeyO", true],
		"p": [80, "KeyP", false], "P": [80, "KeyP", true],
		"[": [219, "BracketLeft", false], "{": [219, "BracketLeft", true],
		"]": [221, "BracketRight", false], "}": [221, "BracketRight", true],
		"\\": [220, "Backslash", false], "|": [220, "Backslash", true],
		"a": [65, "KeyA", false], "A": [65, "KeyA", true],
		"s": [83, "KeyS", false], "S": [83, "KeyS", true],
		"d": [68, "KeyD", false], "D": [68, "KeyD", true],
		"f": [70, "KeyF", false], "F": [70, "KeyF", true],
		"g": [71, "KeyG", false], "G": [71, "KeyG", true],
		"h": [72, "KeyH", false], "H": [72, "KeyH", true],
		"j": [74, "KeyJ", false], "J": [74, "KeyJ", true],
		"k": [75, "KeyK", false], "K": [75, "KeyK", true],
		"l": [76, "KeyL", false], "L": [76, "KeyL", true],
		";": [186, "Semicolon", false], ":": [186, "Semicolon", true],
		"'": [222, "Quote", false], '"': [222, "Quote", true],
		"z": [90, "KeyZ", false], "Z": [90, "KeyZ", true],
		"x": [88, "KeyX", false], "X": [88, "KeyX", true],
		"c": [67, "KeyC", false], "C": [67, "KeyC", true],
		"v": [86, "KeyV", false], "V": [86, "KeyV", true],
		"b": [66, "KeyB", false], "B": [66, "KeyB", true],
		"n": [78, "KeyN", false], "N": [78, "KeyN", true],
		"m": [77, "KeyM", false], "M": [77, "KeyM", true],
		",": [188, "Comma", false], "<": [188, "Comma", true],
		".": [190, "Period", false], ">": [190, "Period", true],
		"/": [191, "Slash", false], "?": [191, "Slash", true],
	};

	function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

	// Find the WMKS canvas element to dispatch keyboard events to
	function getWmksCanvas(): HTMLElement | null {
		return document.querySelector('#console-canvas canvas') as HTMLElement
			|| document.getElementById('mainCanvas');
	}

	async function typeTextToVM(text: string) {
		const target = getWmksCanvas();
		if (!target) {
			toastStore.error('Console canvas not found');
			return;
		}

		const baseProps = {
			bubbles: true,
			cancelable: true,
			charCode: 0,
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			repeat: false,
			location: KeyboardEvent.DOM_KEY_LOCATION_STANDARD,
		};

		let shiftHeld = false;
		let typed = 0;

		for (const char of text) {
			const mapping = KEY_MAP[char];
			if (!mapping) continue; // skip unmapped chars

			const [keyCode, code, needsShift] = mapping;

			// Press shift if needed and not already held
			if (needsShift && !shiftHeld) {
				target.dispatchEvent(new KeyboardEvent('keydown', {
					...baseProps, code: 'ShiftLeft', key: 'Shift', keyCode: 16, shiftKey: true,
				}));
				shiftHeld = true;
				await sleep(10);
			}
			// Release shift if not needed but held
			if (!needsShift && shiftHeld) {
				target.dispatchEvent(new KeyboardEvent('keyup', {
					...baseProps, code: 'ShiftLeft', key: 'Shift', keyCode: 16, shiftKey: false,
				}));
				shiftHeld = false;
				await sleep(10);
			}

			target.dispatchEvent(new KeyboardEvent('keydown', {
				...baseProps, code, key: char, keyCode, shiftKey: needsShift,
			}));
			target.dispatchEvent(new KeyboardEvent('keyup', {
				...baseProps, code, key: char, keyCode, shiftKey: needsShift,
			}));
			typed++;
			await sleep(10);
		}

		// Release shift if still held
		if (shiftHeld) {
			target.dispatchEvent(new KeyboardEvent('keyup', {
				...baseProps, code: 'ShiftLeft', key: 'Shift', keyCode: 16, shiftKey: false,
			}));
		}

		return typed;
	}

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
		if (status !== 'connected') return;
		try {
			const text = await navigator.clipboard.readText();
			if (!text) {
				toastStore.warning('Clipboard is empty');
				return;
			}
			sending = true;
			const typed = await typeTextToVM(text);
			toastStore.success(`Pasted ${typed} chars`);
		} catch {
			showTextDrawer = true;
			toastStore.warning('Clipboard access denied — use the text input panel');
		} finally {
			sending = false;
		}
	}

	async function sendTextToVM() {
		if (!textInput || status !== 'connected') return;
		sending = true;
		try {
			const typed = await typeTextToVM(textInput);
			toastStore.success(`Sent ${typed} chars to VM`);
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
<div class="fixed inset-0 flex flex-col overflow-hidden bg-black" onkeydown={handlePageKeydown}>
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
	/* Pin the WMKS container to fill the parent exactly */
	:global(#console-canvas) {
		position: absolute !important;
		inset: 0;
		overflow: hidden !important;
	}
	/* Clip the inner wrapper WMKS creates */
	:global(#console-canvas > div) {
		overflow: hidden !important;
	}
	/* Let WMKS manage canvas sizing via rescale transforms;
	   max-* acts as a safety ceiling without fighting WMKS */
	:global(#console-canvas canvas) {
		display: block;
		max-width: 100% !important;
		max-height: 100% !important;
	}
</style>
