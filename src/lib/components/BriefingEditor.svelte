<!--
  BriefingEditor.svelte

  Instructor authoring for a lab briefing (versioned Markdown) attached to a
  template or blueprint. Backed by /api/v1/admin/{templates|blueprints}/{id}/briefing.

  - Every save is an immutable revision; saving never changes what students
    see. Publish points students at a revision (publishing an older one is a
    rollback); Restore copies an old revision to a new head.
  - Saves carry base_revision. A 409 means someone saved first: we show a
    Monaco diff (theirs vs yours) and let the instructor overwrite or discard.
  - The unsaved buffer is mirrored to sessionStorage so a closed tab does not
    lose work. That buffer is never a revision.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import {
		ApiError,
		adminGetBriefing,
		adminGetBriefingRevision,
		adminListBriefingRevisions,
		adminPublishBriefing,
		adminRestoreBriefingRevision,
		adminSaveBriefingRevision,
		adminUnpublishBriefing,
		type BriefingMeta,
		type BriefingOwnerKind,
		type BriefingRevision
	} from '$lib/api/client';
	import { renderBriefing } from '$lib/wiki/markdown';
	import { toastStore } from '$lib/stores/toast.svelte';
	import '$lib/wiki/wiki-prose.css';

	interface Props {
		kind: BriefingOwnerKind;
		ownerId: string;
		ownerName: string;
	}
	let { kind, ownerId, ownerName }: Props = $props();

	let meta = $state<BriefingMeta | null>(null);
	let revisions = $state<BriefingRevision[]>([]);
	let value = $state('');
	let base = $state(0); // revision the buffer was loaded from (0 = never saved)
	let baseBody = $state('');
	let message = $state('');
	let busy = $state(false);
	let loadError = $state('');
	let editorError = $state('');
	let loaded = false; // the draft mirror must not run before the head (and any draft) is loaded
	let conflict = $state<{ head: number; headBody: string } | null>(null);
	let compare = $state<{ title: string; original: string; modified: string } | null>(null);

	const dirty = $derived(value !== baseBody);
	const preview = $derived(renderBriefing(value));
	const draftKey = $derived(`crucible-briefing-draft:${kind}:${ownerId}`);

	let container: HTMLDivElement | undefined = $state();
	let monaco: any = null;
	let editor: any = null;
	let suppressChange = false;

	async function loadMonaco() {
		if (monaco) return monaco;
		monaco = await import('monaco-editor/esm/vs/editor/editor.main');
		const EditorWorker = (await import('monaco-editor/esm/vs/editor/editor.worker?worker')).default;
		(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
		return monaco;
	}

	function prefersDark(): boolean {
		return (
			document.documentElement.classList.contains('dark') ||
			window.matchMedia?.('(prefers-color-scheme: dark)').matches
		);
	}

	function readDraft(): { base: number; body: string } | null {
		try {
			const raw = sessionStorage.getItem(draftKey);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}

	$effect(() => {
		const body = value;
		if (!loaded) return;
		try {
			if (body !== baseBody) sessionStorage.setItem(draftKey, JSON.stringify({ base, body }));
			else sessionStorage.removeItem(draftKey);
		} catch {
			// storage unavailable (private mode / blocked): the unload guard still protects the buffer
		}
	});

	function setBuffer(body: string) {
		value = body;
		if (editor && editor.getValue() !== body) {
			suppressChange = true;
			editor.setValue(body);
		}
	}

	async function refresh() {
		[meta, revisions] = await Promise.all([
			adminGetBriefing(kind, ownerId),
			adminListBriefingRevisions(kind, ownerId)
		]);
	}

	async function loadHead() {
		await refresh();
		base = meta!.head_revision;
		baseBody = base > 0 ? ((await adminGetBriefingRevision(kind, ownerId, base)).body_md ?? '') : '';
		setBuffer(baseBody);
	}

	function errorText(e: unknown): string {
		if (e instanceof ApiError && typeof e.body?.error === 'string') return e.body.error;
		return e instanceof Error ? e.message : String(e);
	}

	async function run(label: string, fn: () => Promise<void>) {
		busy = true;
		try {
			await fn();
		} catch (e) {
			toastStore.error(label, errorText(e));
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (busy || !dirty) return;
		busy = true;
		try {
			const rev = await adminSaveBriefingRevision(kind, ownerId, {
				body_md: value,
				message: message.trim(),
				base_revision: base
			});
			base = rev.revision;
			baseBody = value;
			message = '';
			conflict = null;
			await refresh();
			toastStore.success(`Saved revision ${rev.revision}`, 'Students still see the published revision until you publish.');
		} catch (e) {
			if (e instanceof ApiError && e.status === 409 && typeof e.body?.head_revision === 'number') {
				const head = e.body.head_revision;
				const headBody = (await adminGetBriefingRevision(kind, ownerId, head)).body_md ?? '';
				conflict = { head, headBody };
				compare = { title: `Revision ${head} (saved by someone else) → your edits`, original: headBody, modified: value };
			} else {
				toastStore.error('Save failed', errorText(e));
			}
		} finally {
			busy = false;
		}
	}

	async function overwriteWithMine() {
		if (!conflict) return;
		base = conflict.head;
		baseBody = conflict.headBody;
		compare = null;
		await save();
	}

	function discardMine() {
		if (!conflict) return;
		base = conflict.head;
		baseBody = conflict.headBody;
		setBuffer(conflict.headBody);
		conflict = null;
		compare = null;
	}

	const publish = (revision: number) =>
		run('Publish failed', async () => {
			meta = await adminPublishBriefing(kind, ownerId, revision);
			await refresh();
			toastStore.success(`Published revision ${revision}`, 'Students see it on their next page load.');
		});

	const unpublish = () =>
		run('Unpublish failed', async () => {
			meta = await adminUnpublishBriefing(kind, ownerId);
			await refresh();
			toastStore.info('Briefing hidden from students');
		});

	const restore = (revision: number) =>
		run('Restore failed', async () => {
			if (dirty && !confirm('Restoring replaces your unsaved edits. Continue?')) return;
			const rev = await adminRestoreBriefingRevision(kind, ownerId, revision);
			await loadHead();
			toastStore.success(`Restored revision ${revision} as revision ${rev.revision}`, 'Publish it when ready.');
		});

	const compareWith = (revision: number) =>
		run('Could not load revision', async () => {
			const rev = await adminGetBriefingRevision(kind, ownerId, revision);
			compare = { title: `Revision ${revision} → editor`, original: rev.body_md ?? '', modified: value };
		});

	// Svelte action: a read-only Monaco diff for the compare/conflict dialog.
	function monacoDiff(node: HTMLElement, c: { original: string; modified: string }) {
		let diff: any;
		let models: any[] = [];
		loadMonaco().then((m) => {
			models = [m.editor.createModel(c.original, 'markdown'), m.editor.createModel(c.modified, 'markdown')];
			diff = m.editor.createDiffEditor(node, {
				readOnly: true,
				automaticLayout: true,
				renderSideBySide: true,
				theme: prefersDark() ? 'vs-dark' : 'vs',
				minimap: { enabled: false },
				wordWrap: 'on'
			});
			diff.setModel({ original: models[0], modified: models[1] });
		});
		return {
			destroy() {
				diff?.dispose();
				models.forEach((m) => m.dispose());
			}
		};
	}

	// For a tab close/reload (type "leave") cancel() makes the browser show its own prompt;
	// confirm() is blocked there. In-app navigation gets an explicit confirm.
	beforeNavigate(({ type, cancel }) => {
		if (!dirty) return;
		if (type === 'leave' || !confirm('You have unsaved briefing changes. Leave anyway? (A draft stays in this tab.)')) cancel();
	});

	onMount(() => {
		(async () => {
			try {
				await loadHead();
			} catch (e) {
				loadError = errorText(e);
				return;
			}
			const draft = readDraft();
			if (draft && draft.base === base && draft.body !== baseBody) {
				value = draft.body;
				toastStore.info('Restored your unsaved draft', 'It has not been saved as a revision yet.');
			}
			loaded = true;
			try {
				const m = await loadMonaco();
				if (!container) return;
				editor = m.editor.create(container, {
					value,
					language: 'markdown',
					theme: prefersDark() ? 'vs-dark' : 'vs',
					automaticLayout: true,
					minimap: { enabled: false },
					wordWrap: 'on',
					fontSize: 13,
					scrollBeyondLastLine: false,
					padding: { top: 8, bottom: 8 }
				});
				editor.getModel()?.setEOL(m.editor.EndOfLineSequence.LF);
				editor.onDidChangeModelContent(() => {
					if (suppressChange) {
						suppressChange = false;
						return;
					}
					value = editor.getValue();
				});
				editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, save);
			} catch (e) {
				editorError = errorText(e);
			}
		})();
	});

	onDestroy(() => {
		editor?.dispose();
	});

	const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
</script>

<div class="space-y-4">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold">Briefing — {ownerName}</h1>
			<p class="mt-1 text-sm text-surface-500">
				Students see the published revision after they provision. Saving does not publish.
			</p>
		</div>
		{#if meta}
			<div class="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
				<span class="rounded-full bg-surface-200-800 px-2 py-0.5">Head: {meta.head_revision || 'none'}</span>
				<span class="rounded-full px-2 py-0.5 {meta.published_revision ? 'bg-success-500/10 text-success-500' : 'bg-warning-500/10 text-warning-500'}">
					{meta.published_revision ? `Published: revision ${meta.published_revision}` : 'Not published'}
				</span>
				{#if dirty}<span class="rounded-full bg-primary-500/10 px-2 py-0.5 text-primary-500">Unsaved changes</span>{/if}
			</div>
		{/if}
	</header>

	{#if loadError}
		<div class="rounded border border-error-500/30 bg-error-500/10 p-4 text-sm text-error-500" role="alert">
			Could not load the briefing: {loadError}
		</div>
	{:else}
		<div class="flex flex-wrap items-end gap-2">
			<label class="flex min-w-64 flex-1 flex-col text-xs text-surface-500">
				Revision message
				<input
					class="input mt-1 text-sm"
					maxlength="500"
					placeholder="What changed? (optional)"
					bind:value={message}
					onkeydown={(e) => e.key === 'Enter' && save()}
				/>
			</label>
			<button class="btn btn-primary" onclick={save} disabled={busy || !dirty} title="Ctrl+S">
				Save revision
			</button>
			<button
				class="btn btn-secondary"
				onclick={() => publish(base)}
				disabled={busy || dirty || base === 0 || meta?.published_revision === base}
				title={dirty ? 'Save first, then publish' : 'Show this revision to students'}
			>
				Publish revision {base || ''}
			</button>
			<button class="btn btn-sm btn-ghost" onclick={unpublish} disabled={busy || !meta?.published_revision}>
				Unpublish
			</button>
		</div>

		{#if conflict}
			<div class="rounded border border-warning-500/30 bg-warning-500/10 p-3 text-sm" role="alert">
				Someone saved revision {conflict.head} while you were editing. Compare the two, then keep yours on top of theirs or discard yours.
				<div class="mt-2 flex gap-2">
					<button class="btn btn-sm btn-danger" onclick={overwriteWithMine} disabled={busy}>Overwrite with mine</button>
					<button class="btn btn-sm btn-ghost" onclick={discardMine} disabled={busy}>Discard mine</button>
				</div>
			</div>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<section aria-label="Markdown editor" class="overflow-hidden rounded border border-surface-300 dark:border-surface-700">
				{#if editorError}
					<p class="p-3 text-xs text-error-500">Editor failed to load ({editorError}). You can still edit below.</p>
					<textarea class="h-[65vh] w-full p-3 font-mono text-sm" bind:value aria-label="Briefing markdown"></textarea>
				{:else}
					<div bind:this={container} class="h-[65vh]"></div>
				{/if}
			</section>
			<section aria-label="Preview" class="h-[65vh] overflow-auto rounded border border-surface-300 p-4 dark:border-surface-700">
				{#if value.trim()}
					<article class="wiki-prose">{@html preview}</article>
				{:else}
					<p class="text-sm text-surface-500">Nothing written yet. The preview shows exactly what students will see once published.</p>
				{/if}
			</section>
		</div>

		<section aria-labelledby="briefing-history">
			<h2 id="briefing-history" class="mb-2 text-sm font-semibold">History</h2>
			{#if revisions.length === 0}
				<p class="text-sm text-surface-500">No revisions yet. Your first save creates revision 1.</p>
			{:else}
				<table class="w-full text-left text-sm">
					<thead class="text-xs text-surface-500">
						<tr><th class="py-1">Revision</th><th>Message</th><th>Author</th><th>Saved</th><th class="text-right">Actions</th></tr>
					</thead>
					<tbody>
						{#each revisions as r (r.revision)}
							<tr class="border-t border-surface-200 dark:border-surface-800">
								<td class="py-1.5">
									{r.revision}
									{#if r.is_published}<span class="ml-1 rounded-full bg-success-500/10 px-1.5 text-xs text-success-500">published</span>{/if}
									{#if r.restored_from}<span class="ml-1 rounded-full bg-surface-200-800 px-1.5 text-xs">from {r.restored_from}</span>{/if}
								</td>
								<td class="max-w-72 truncate" title={r.message}>{r.message || '—'}</td>
								<td>{r.author || '—'}</td>
								<td class="text-xs">{fmt(r.created_at)}</td>
								<td class="space-x-2 text-right text-xs">
									<button class="text-primary-500 hover:underline" onclick={() => compareWith(r.revision)} disabled={busy}>Compare</button>
									<button class="text-primary-500 hover:underline" onclick={() => restore(r.revision)} disabled={busy || r.revision === meta?.head_revision}>Restore</button>
									<button class="text-success-500 hover:underline" onclick={() => publish(r.revision)} disabled={busy || r.is_published}>Publish</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

{#if compare}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="briefing-compare-title">
		<div class="flex h-[85vh] w-full max-w-6xl flex-col rounded bg-surface-50 p-3 dark:bg-surface-900">
			<div class="mb-2 flex items-center justify-between">
				<h2 id="briefing-compare-title" class="text-sm font-semibold">{compare.title}</h2>
				<button class="btn btn-sm btn-ghost" onclick={() => (compare = null)}>Close</button>
			</div>
			{#key compare}
				<div class="flex-1" use:monacoDiff={compare}></div>
			{/key}
		</div>
	</div>
{/if}
