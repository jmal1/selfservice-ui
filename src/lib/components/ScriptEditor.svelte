<!--
  ScriptEditor.svelte
  
  Monaco-backed editor for bash/shell scripts in the admin workflow + action
  editors. Lazy-loads the ~3MB Monaco bundle on first mount so the rest of
  the admin UI stays light.

  Validation runs in two layers:
    1. Quick (client-side, ~300ms debounce) — sh-syntax WASM parser, no
       network. Catches syntax errors (missing then/fi, unclosed quotes,
       bad redirection). Most of what students hit while typing.
    2. Deep (server-side, ~2000ms debounce or explicit) — shellcheck via
       POST /api/v1/admin/scripts/validate. Catches the full SC**** rule
       set. Hits the server less aggressively so untrusted code only gets
       parsed (still: shellcheck *parses*, never executes) on real pauses
       or Save.

  Quick + deep markers are kept in separate Monaco "owner" namespaces so
  they don't clobber each other.

  Usage:
    <ScriptEditor
      bind:value={customScript}
      language="bash"
      height="400px"
      inputContextNames={['path','value']}
      bind:hasErrors
      bind:hasWarnings
    />
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { adminValidateScript } from '$lib/api/client';
	import type { ScriptValidationFinding } from '$lib/api/client';

	interface Props {
		value: string;
		language?: 'bash' | 'shell' | 'sh';
		height?: string;
		readonly?: boolean;
		placeholder?: string;
		/** Debounce for the client-side sh-syntax parse (default 300ms). */
		quickValidateDebounceMs?: number;
		/** Debounce for the server-side shellcheck call (default 2000ms). */
		validateDebounceMs?: number;
		/** CTX_* input context names declared on this action (admin form). */
		inputContextNames?: string[];
		/** CTX_* output context names declared on this action (admin form). */
		outputContextNames?: string[];
		hasErrors?: boolean;
		hasWarnings?: boolean;
		findings?: ScriptValidationFinding[];
	}

	let {
		value = $bindable(''),
		language = 'bash',
		height = '400px',
		readonly = false,
		placeholder = '',
		quickValidateDebounceMs = 300,
		validateDebounceMs = 2000,
		inputContextNames = [],
		outputContextNames = [],
		hasErrors = $bindable(false),
		hasWarnings = $bindable(false),
		findings = $bindable([])
	}: Props = $props();

	const MARKER_OWNER_QUICK = 'sh-syntax';
	const MARKER_OWNER_DEEP = 'shellcheck';

	let container: HTMLDivElement | undefined = $state();
	let editor: any = null;
	let monaco: any = null;
	let model: any = null;
	let shParse: ((text: string, opts: { variant: number }) => Promise<unknown>) | null = null;
	let langBash = 0;
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let validating = $state(false);
	let lastDeepValidatedScript = '';
	let quickFindings: ScriptValidationFinding[] = [];
	let deepFindings: ScriptValidationFinding[] = [];
	let quickDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let deepDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressNextChange = false;

	onMount(() => {
		(async () => {
			try {
				// Lazy-load Monaco. editor.main pulls the standard editor
				// contributions (clipboard / Ctrl+A / find / hover peek) which
				// editor.api alone leaves out — without it, Ctrl+C copies random
				// page content and Ctrl+A selects the whole webpage.
				const monacoMod = await import('monaco-editor/esm/vs/editor/editor.main');
				monaco = monacoMod;

				// Lazy-load sh-syntax for client-side parsing. We have to wire
				// up the WASM URL ourselves because the package's default
				// entrypoint uses node fs to read main.wasm — Vite's `?url`
				// loader gives us a fetchable asset URL the browser can use.
				try {
					const [{ getProcessor, LangVariant }, wasmModule] = await Promise.all([
						import('sh-syntax'),
						import('sh-syntax/main.wasm?url')
					]);
					// vendors/wasm_exec.cjs registers `globalThis.Go`. Side
					// effect only — the import order matters: it has to be
					// loaded before getProcessor calls `new Go()`.
					await import('sh-syntax/vendors/wasm_exec');
					langBash = LangVariant.LangBash;
					shParse = getProcessor(async () => {
						const res = await fetch(wasmModule.default);
						return await res.arrayBuffer();
					});
				} catch (err) {
					// Non-fatal: deep server-side validation still works.
					console.warn('sh-syntax failed to load; client-side parsing disabled', err);
				}

				const EditorWorker = (
					await import('monaco-editor/esm/vs/editor/editor.worker?worker')
				).default;
				(self as any).MonacoEnvironment = {
					getWorker() {
						return new EditorWorker();
					}
				};

				if (!container) return;

				const monacoLang = language === 'bash' ? 'shell' : language;

				model = monaco.editor.createModel(value, monacoLang);
				model.setEOL(monaco.editor.EndOfLineSequence.LF);
				editor = monaco.editor.create(container, {
					model,
					theme: prefersDark() ? 'vs-dark' : 'vs',
					automaticLayout: true,
					minimap: { enabled: false },
					fontSize: 13,
					fontFamily:
						'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
					lineNumbers: 'on',
					readOnly: readonly,
					tabSize: 2,
					insertSpaces: true,
					scrollBeyondLastLine: false,
					renderLineHighlight: 'gutter',
					wordWrap: 'off',
					glyphMargin: false,
					folding: true,
					padding: { top: 8, bottom: 8 },
					fixedOverflowWidgets: true,
					hover: { above: false },
					'semanticHighlighting.enabled': true
				});

				if (placeholder && !value) {
					installPlaceholderWidget(editor, placeholder);
				}

				editor.onDidChangeModelContent(() => {
					if (suppressNextChange) {
						suppressNextChange = false;
						return;
					}
					value = editor.getValue();
					scheduleQuickValidate();
					scheduleDeepValidate();
				});

				loading = false;
				// Seed both layers on initial load.
				scheduleQuickValidate();
				scheduleDeepValidate();
			} catch (err) {
				console.error('Monaco failed to load', err);
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			}
		})();
	});

	onDestroy(() => {
		if (quickDebounceTimer) clearTimeout(quickDebounceTimer);
		if (deepDebounceTimer) clearTimeout(deepDebounceTimer);
		if (editor) editor.dispose();
		if (model) model.dispose();
	});

	$effect(() => {
		if (editor && model && value !== editor.getValue()) {
			suppressNextChange = true;
			editor.setValue(value);
		}
	});

	function prefersDark(): boolean {
		if (typeof document === 'undefined') return false;
		return (
			document.documentElement.classList.contains('dark') ||
			(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
		);
	}

	function scheduleQuickValidate() {
		if (quickDebounceTimer) clearTimeout(quickDebounceTimer);
		quickDebounceTimer = setTimeout(runQuickValidate, quickValidateDebounceMs);
	}

	function scheduleDeepValidate() {
		if (deepDebounceTimer) clearTimeout(deepDebounceTimer);
		deepDebounceTimer = setTimeout(runDeepValidate, validateDebounceMs);
	}

	// runQuickValidate parses the buffer client-side with sh-syntax. Catches
	// syntax errors immediately without contacting the server. Never blocks
	// on the network so it's safe to run on every keystroke (debounced).
	async function runQuickValidate() {
		if (!editor || !monaco || !model) return;
		if (!shParse) {
			quickFindings = [];
			refreshAggregateState();
			return;
		}
		const script = editor.getValue();
		if (script.trim() === '') {
			quickFindings = [];
			setMarkers(MARKER_OWNER_QUICK, []);
			refreshAggregateState();
			return;
		}
		try {
			await shParse(script, { variant: langBash });
			quickFindings = [];
		} catch (err: any) {
			// sh-syntax throws a ParseError shaped like
			// { Text: string, Pos: { Line, Col, Offset } }.
			const line = err?.Pos?.Line ?? 1;
			const col = err?.Pos?.Col ?? 1;
			const message = typeof err?.Text === 'string' ? err.Text : err?.message ?? 'syntax error';
			quickFindings = [
				{
					line,
					column: col,
					end_line: line,
					end_column: col + 1,
					severity: 'error',
					code: 'PARSE',
					message
				}
			];
		}
		setMarkers(MARKER_OWNER_QUICK, quickFindings);
		refreshAggregateState();
	}

	// runDeepValidate calls the server-side shellcheck endpoint with the
	// declared input/output context names so SC2154 doesn't fire on legitimate
	// CTX_* references. Runs on a much longer debounce than runQuickValidate.
	async function runDeepValidate() {
		if (!editor || !monaco || !model) return;
		const script = editor.getValue();
		if (script === lastDeepValidatedScript) return;
		lastDeepValidatedScript = script;

		if (script.trim() === '') {
			deepFindings = [];
			setMarkers(MARKER_OWNER_DEEP, []);
			refreshAggregateState();
			return;
		}

		validating = true;
		try {
			const res = await adminValidateScript(language === 'sh' ? 'bash' : language, script, {
				inputContextNames,
				outputContextNames
			});
			deepFindings = res.findings;
			setMarkers(MARKER_OWNER_DEEP, res.findings);
		} catch (err) {
			console.warn('script validation failed', err);
		} finally {
			validating = false;
			refreshAggregateState();
		}
	}

	function refreshAggregateState() {
		findings = [...quickFindings, ...deepFindings];
		hasErrors = findings.some((f) => f.severity === 'error');
		hasWarnings = findings.some((f) => f.severity === 'warning');
	}

	function setMarkers(owner: string, items: ScriptValidationFinding[]) {
		if (!monaco || !model) return;
		const markers = items.map((f) => ({
			startLineNumber: f.line,
			startColumn: f.column,
			endLineNumber: f.end_line || f.line,
			endColumn: f.end_column || f.column + 1,
			message: `[${f.code}] ${f.message}`,
			severity: severityToMonaco(f.severity)
		}));
		monaco.editor.setModelMarkers(model, owner, markers);
	}

	function severityToMonaco(s: ScriptValidationFinding['severity']): number {
		switch (s) {
			case 'error':
				return 8;
			case 'warning':
				return 4;
			case 'info':
				return 2;
			case 'style':
				return 1;
			default:
				return 2;
		}
	}

	// Force-run both validation layers now (used by the "Validate" button +
	// Save click). Returns true only if both passes succeed without errors.
	export async function validateNow(): Promise<boolean> {
		if (quickDebounceTimer) clearTimeout(quickDebounceTimer);
		if (deepDebounceTimer) clearTimeout(deepDebounceTimer);
		lastDeepValidatedScript = '';
		await Promise.all([runQuickValidate(), runDeepValidate()]);
		return !hasErrors;
	}

	function installPlaceholderWidget(ed: any, text: string) {
		const ContentWidget = {
			getId: () => 'crucible.placeholder',
			getDomNode: () => {
				const el = document.createElement('div');
				el.style.color = 'rgba(120, 120, 120, 0.6)';
				el.style.fontStyle = 'italic';
				el.style.pointerEvents = 'none';
				el.style.whiteSpace = 'pre';
				el.style.padding = '0';
				el.style.fontFamily = 'ui-monospace, monospace';
				el.style.fontSize = '13px';
				el.textContent = text;
				return el;
			},
			getPosition: () => ({
				position: { lineNumber: 1, column: 1 },
				preference: [0]
			})
		};
		ed.addContentWidget(ContentWidget);
		const hide = () => ed.removeContentWidget(ContentWidget);
		ed.onDidChangeModelContent(() => {
			if (ed.getValue()) hide();
		});
		ed.onDidFocusEditorWidget(hide);
	}
</script>

<div class="script-editor-wrapper">
	{#if loadError}
		<div class="border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 rounded">
			Editor failed to load: {loadError}. Falling back to plain textarea.
			<textarea class="textarea font-mono text-sm mt-2 w-full" rows="16" bind:value></textarea>
		</div>
	{:else}
		{#if loading}
			<div
				class="flex items-center justify-center rounded border border-surface-300 bg-surface-100 text-sm text-surface-500 dark:border-surface-700 dark:bg-surface-900"
				style:height
			>
				Loading editor…
			</div>
		{/if}
		<div
			bind:this={container}
			class="monaco-container rounded border border-surface-300 dark:border-surface-700"
			class:hidden={loading}
			style:height
		></div>
		<div class="mt-1 flex items-center gap-3 text-xs text-surface-500 dark:text-surface-400">
			{#if validating}
				<span>Linting…</span>
			{:else if hasErrors}
				<span class="text-red-600 dark:text-red-400 font-medium">
					✗ {findings.filter((f) => f.severity === 'error').length} error{findings.filter((f) => f.severity === 'error').length === 1 ? '' : 's'}
					{#if hasWarnings}, {findings.filter((f) => f.severity === 'warning').length} warning(s){/if}
				</span>
			{:else if hasWarnings}
				<span class="text-amber-600 dark:text-amber-400">
					⚠ {findings.filter((f) => f.severity === 'warning').length} warning(s)
				</span>
			{:else if findings.length === 0 && !loading}
				<span class="text-emerald-600 dark:text-emerald-400">✓ shellcheck clean</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.script-editor-wrapper {
		display: flex;
		flex-direction: column;
	}
	.monaco-container {
		overflow: hidden;
	}
</style>
