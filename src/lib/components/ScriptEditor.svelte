<!--
  ScriptEditor.svelte
  
  Monaco-backed editor for bash/shell scripts in the admin workflow + action
  editors. Lazy-loads the ~3MB Monaco bundle on first mount so the rest of
  the admin UI stays light. Debounces validation calls (default 500ms) and
  exposes lint results to the parent so it can gate Save on errors.

  Usage:
    <ScriptEditor
      bind:value={customScript}
      language="bash"
      height="400px"
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
		validateDebounceMs?: number;
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
		validateDebounceMs = 500,
		hasErrors = $bindable(false),
		hasWarnings = $bindable(false),
		findings = $bindable([])
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let editor: any = null;
	let monaco: any = null;
	let model: any = null;
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let validating = $state(false);
	let lastValidatedScript = '';
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressNextChange = false;

	onMount(() => {
		// Vite static import resolution requires the URL to be a literal.
		// We use dynamic imports so the Monaco bundle is code-split out of
		// the main admin bundle.
		(async () => {
			try {
				// Use the editor.api entrypoint to avoid pulling in language
				// services (ts/html/css/json) we never use. The default
				// `monaco-editor` package registers all language workers; we
				// only need shell highlighting.
				const monacoMod = await import('monaco-editor/esm/vs/editor/editor.api');
				monaco = monacoMod;

				// Register the basic shell tokenizer (not pulled in by the api entrypoint).
				await import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution');

				// Worker setup. We only need the core editor worker for syntax
				// services on a single language (shell). Language-specific
				// workers (ts/json/html/css) are not needed.
				const EditorWorker = (
					await import('monaco-editor/esm/vs/editor/editor.worker?worker')
				).default;
				(self as any).MonacoEnvironment = {
					getWorker() {
						return new EditorWorker();
					}
				};

				if (!container) return;

				// Map our language strings to Monaco's built-in IDs. Monaco ships
				// with "shell" but not "bash" — they parse close enough for editor
				// highlighting that we just alias.
				const monacoLang = language === 'bash' ? 'shell' : language;

				model = monaco.editor.createModel(value, monacoLang);
				// Force LF line endings. Scripts run on the linux runner, so
				// any \r in the saved content breaks shebangs and conditionals
				// and floods shellcheck with SC1017. The backend also strips
				// CRs on save as a belt-and-suspenders fix.
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
					// Render hover tooltips, suggestion popups and the diagnostics
					// peek widget in a top-level fixed overlay instead of inside
					// the editor's scrollable region. Without this, hovering a
					// finding on line 1 (or any line near the top/right edge)
					// causes the tooltip to be clipped by the container box.
					fixedOverflowWidgets: true,
					hover: { above: false },
					'semanticHighlighting.enabled': true
				});

				if (placeholder && !value) {
					// Monaco doesn't have first-class placeholder support. Light-touch
					// alternative: render the placeholder as a content widget that
					// hides on focus or first keystroke.
					installPlaceholderWidget(editor, placeholder);
				}

				editor.onDidChangeModelContent(() => {
					if (suppressNextChange) {
						suppressNextChange = false;
						return;
					}
					value = editor.getValue();
					scheduleValidate();
				});

				loading = false;
				// Validate the seeded content once.
				scheduleValidate();
			} catch (err) {
				console.error('Monaco failed to load', err);
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			}
		})();
	});

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (editor) editor.dispose();
		if (model) model.dispose();
	});

	// Mirror external value changes back into the editor (e.g. when the parent
	// loads a saved workflow and resets `customScript`). Use suppressNextChange
	// so we don't echo into a validation loop.
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

	function scheduleValidate() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(runValidate, validateDebounceMs);
	}

	async function runValidate() {
		if (!editor || !monaco || !model) return;
		const script = editor.getValue();
		if (script === lastValidatedScript) return;
		lastValidatedScript = script;

		if (script.trim() === '') {
			setMarkers([]);
			findings = [];
			hasErrors = false;
			hasWarnings = false;
			return;
		}

		validating = true;
		try {
			const res = await adminValidateScript(language === 'sh' ? 'bash' : language, script);
			findings = res.findings;
			hasErrors = res.has_errors;
			hasWarnings = res.has_warnings;
			setMarkers(res.findings);
		} catch (err) {
			// Validation failure shouldn't break the editor; surface in dev
			// tools but leave the markers untouched so the user can keep typing.
			console.warn('script validation failed', err);
		} finally {
			validating = false;
		}
	}

	function setMarkers(items: ScriptValidationFinding[]) {
		if (!monaco || !model) return;
		const markers = items.map((f) => ({
			startLineNumber: f.line,
			startColumn: f.column,
			endLineNumber: f.end_line || f.line,
			endColumn: f.end_column || f.column + 1,
			message: `[${f.code}] ${f.message}`,
			severity: severityToMonaco(f.severity)
		}));
		monaco.editor.setModelMarkers(model, 'shellcheck', markers);
	}

	function severityToMonaco(s: ScriptValidationFinding['severity']): number {
		// monaco.MarkerSeverity is an enum: Hint=1, Info=2, Warning=4, Error=8.
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

	// Force-run validation now (used by the "Validate" button + Save click).
	export async function validateNow(): Promise<boolean> {
		if (debounceTimer) clearTimeout(debounceTimer);
		lastValidatedScript = ''; // force re-run even if unchanged
		await runValidate();
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
				preference: [0] // ABOVE
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
