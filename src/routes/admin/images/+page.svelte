<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		adminCreateImageUpload,
		adminCompleteImageUpload,
		adminImportImage,
		adminListImages,
		adminDeleteImage,
		ApiError,
		type CompleteImageUploadPart
	} from '$lib/api/client';
	import type { ImageUpload } from '$lib/types';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { goto } from '$app/navigation';

	// --- State ---

	let images = $state<ImageUpload[]>([]);
	let loadingList = $state(true);
	let listError = $state<string | null>(null);

	// Per-file upload tracking
	interface UploadEntry {
		file: File;
		progress: number; // 0–100
		status: 'pending' | 'uploading' | 'completing' | 'importing' | 'done' | 'error' | 'cancelled';
		error: string | null;
		imageId: string | null;
		abortController: AbortController | null;
		xhrs: XMLHttpRequest[];
	}

	let uploads = $state<UploadEntry[]>([]);

	let dragOver = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// --- Lifecycle ---

	onMount(async () => {
		if (!authStore.isInstructor && !authStore.isAdmin) {
			toastStore.error('Forbidden', 'You need the instructor role.');
			await goto('/admin');
			return;
		}
		await refreshList();
		startPolling();
	});

	onDestroy(() => {
		stopPolling();
	});

	// --- List / polling ---

	async function refreshList() {
		try {
			images = await adminListImages();
			listError = null;
		} catch (err) {
			listError = err instanceof ApiError ? ((err.body?.error as string) ?? err.message) : String(err);
		} finally {
			loadingList = false;
		}
	}

	function startPolling() {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			const needsPoll =
				images.some((img) => img.status === 'uploading' || img.status === 'importing') ||
				uploads.some((u) => u.status === 'importing');
			if (needsPoll) {
				await refreshList();
			}
		}, 3000);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// --- Drag and drop ---

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		enqueueFiles(files);
	}

	function onFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		enqueueFiles(files);
		input.value = '';
	}

	// --- File validation and upload queueing ---

	function enqueueFiles(files: File[]) {
		for (const file of files) {
			const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
			if (ext !== '.iso' && ext !== '.ova') {
				toastStore.error('Unsupported file type', `${file.name} — only .iso and .ova are accepted`);
				continue;
			}
			const entry: UploadEntry = {
				file,
				progress: 0,
				status: 'pending',
				error: null,
				imageId: null,
				abortController: new AbortController(),
				xhrs: []
			};
			uploads.push(entry);
			startUpload(entry);
		}
	}

	// --- Multipart upload flow ---

	async function startUpload(entry: UploadEntry) {
		entry.status = 'uploading';
		entry.error = null;

		try {
			// Step 1: initiate multipart upload
			const init = await adminCreateImageUpload({
				filename: entry.file.name,
				size_bytes: entry.file.size
			});
			entry.imageId = init.id;

			// Step 2: upload each part via XHR (need onprogress)
			const partSize = init.part_size;
			const numParts = init.urls.length;
			const parts: CompleteImageUploadPart[] = [];
			let bytesUploaded = 0;

			for (let i = 0; i < numParts; i++) {
				if (entry.abortController?.signal.aborted) {
					throw new DOMException('Upload cancelled', 'AbortError');
				}

				const start = i * partSize;
				const end = Math.min(start + partSize, entry.file.size);
				const chunk = entry.file.slice(start, end);
				const chunkSize = end - start;
				const partBytesAtStart = bytesUploaded;

				const etag = await new Promise<string>((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					entry.xhrs.push(xhr);

					xhr.upload.onprogress = (ev) => {
						if (ev.lengthComputable) {
							const loaded = partBytesAtStart + ev.loaded;
							entry.progress = Math.round((loaded / entry.file.size) * 100);
						}
					};

					xhr.onload = () => {
						if (xhr.status < 200 || xhr.status >= 300) {
							reject(new Error(`Part ${i + 1} upload failed: HTTP ${xhr.status}`));
							return;
						}
						let tag = xhr.getResponseHeader('ETag');
						if (tag === null) {
							// CORS: ETag header not exposed by MinIO. This requires an
							// infra fix (Access-Control-Expose-Headers: ETag on the MinIO
							// bucket). Cannot proceed — report to orchestrator.
							reject(
								new Error(
									'ETag header is null — MinIO must expose ETag via Access-Control-Expose-Headers. ' +
										'This is an infra-side fix; report to the orchestrator.'
								)
							);
							return;
						}
						// Strip surrounding quotes
						tag = tag.replace(/^"|"$/g, '');
						resolve(tag);
					};

					xhr.onerror = () => reject(new Error(`Part ${i + 1} network error`));
					xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

					// Presigned PUT — do NOT attach app auth header; URL is already signed
					xhr.open('PUT', init.urls[i]);
					xhr.send(chunk);

					// Wire abort
					entry.abortController?.signal.addEventListener('abort', () => xhr.abort(), { once: true });
				});

				bytesUploaded += chunkSize;
				parts.push({ part_number: i + 1, etag });
			}

				entry.progress = 100;

				// Step 3: complete multipart — this also auto-enqueues the import job
				entry.status = 'completing';
				await adminCompleteImageUpload(init.id, parts);

				// No explicit import call needed; the API auto-enqueues image_import
				// on upload completion. The image moves to 'importing' in the background.
				entry.status = 'done';
				toastStore.success('Upload complete', `${entry.file.name} is queued for import into vCenter.`);
				await refreshList();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				entry.status = 'cancelled';
				// Clean up the row if we already created it
				if (entry.imageId) {
					adminDeleteImage(entry.imageId).catch(() => {});
				}
			} else {
				entry.status = 'error';
				let msg: string;
				if (err instanceof ApiError) {
					msg = (err.body?.error as string) ?? err.message;
					// Surface specific error codes readably
					if (err.status === 413) msg = `File too large: ${msg}`;
					else if (err.status === 507) msg = `Insufficient staging space: ${msg}`;
					else if (err.status === 409) msg = `Conflict: ${msg}`;
				} else {
					msg = String(err);
				}
				entry.error = msg;
				toastStore.error('Upload failed', msg);
			}
		}
	}

	async function cancelUpload(entry: UploadEntry) {
		entry.abortController?.abort();
	}

	async function retryUpload(entry: UploadEntry) {
		entry.abortController = new AbortController();
		entry.xhrs = [];
		entry.progress = 0;
		entry.error = null;
		entry.imageId = null;
		await startUpload(entry);
	}

	function dismissUpload(entry: UploadEntry) {
		const idx = uploads.indexOf(entry);
		if (idx >= 0) uploads.splice(idx, 1);
	}

	// --- Delete existing image ---

	async function deleteImage(img: ImageUpload) {
		if (!confirm(`Delete "${img.filename}"? This cannot be undone.`)) return;
		try {
			await adminDeleteImage(img.id);
			toastStore.success('Deleted', `${img.filename} removed.`);
			await refreshList();
		} catch (err) {
			let msg = String(err);
			if (err instanceof ApiError) {
				if (err.status === 409) msg = `Cannot delete: ${(err.body?.message as string) ?? 'image is still referenced by a template'}`;
				else msg = (err.body?.error as string) ?? err.message;
			}
			toastStore.error('Delete failed', msg);
		}
	}

	// --- Retry a failed import ---

	let retryingId = $state<string | null>(null);

	async function retryImport(img: ImageUpload) {
		if (retryingId) return;
		retryingId = img.id;
		try {
			await adminImportImage(img.id);
			toastStore.success('Import retried', `${img.filename} is re-queued for import.`);
			await refreshList();
		} catch (err) {
			let msg = String(err);
			if (err instanceof ApiError) {
				msg = (err.body?.message as string) ?? (err.body?.error as string) ?? err.message;
			}
			toastStore.error('Retry failed', msg);
		} finally {
			retryingId = null;
		}
	}

	// --- Helpers ---

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
	}

	function statusBadgeClass(status: string): string {
		switch (status) {
			case 'imported': return 'badge preset-filled-success';
			case 'error': return 'badge preset-filled-error';
			case 'importing': return 'badge preset-filled-warning';
			case 'uploaded': return 'badge preset-tonal-primary';
			default: return 'badge preset-tonal-surface';
		}
	}
</script>

<svelte:head>
	<title>VM Images — Crucible</title>
</svelte:head>

<div class="container mx-auto max-w-5xl p-6 space-y-6">
	<header class="space-y-1">
		<a href="/admin" class="text-sm text-surface-500 hover:underline">← Admin</a>
		<h1 class="h2">VM Images</h1>
		<p class="text-surface-600 dark:text-surface-300 text-sm">
			Upload ISO or OVA images to MinIO; they are then imported into vCenter and available for
			template creation. Imported ISOs appear in the template wizard's ISO source picker. Imported
			OVAs appear automatically in the "Clone an existing vCenter VM" picker — no separate source
			type needed.
		</p>
	</header>

	<!-- Drop zone -->
	<section
		class="border-2 border-dashed rounded-container-token p-10 text-center transition-colors {dragOver
			? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
			: 'border-surface-300 dark:border-surface-600'}"
		aria-label="File drop zone"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
	>
		<p class="text-surface-500 mb-3">Drag & drop <code>.iso</code> or <code>.ova</code> files here</p>
		<label class="btn preset-filled-primary cursor-pointer">
			Browse files
			<input type="file" accept=".iso,.ova" multiple class="hidden" onchange={onFileInput} />
		</label>
	</section>

	<!-- In-progress uploads -->
	{#if uploads.length > 0}
		<section class="card p-4 space-y-3">
			<h2 class="h5">Uploads in progress</h2>
			{#each uploads as entry (entry)}
				<div class="space-y-1 border border-surface-200 dark:border-surface-700 rounded p-3">
					<div class="flex justify-between items-center">
						<span class="text-sm font-medium truncate max-w-xs">{entry.file.name}</span>
						<span class="text-xs text-surface-500">{formatBytes(entry.file.size)}</span>
					</div>

					{#if entry.status === 'uploading' || entry.status === 'completing'}
						<div class="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-2">
							<div
								class="bg-primary-500 h-2 rounded-full transition-all"
								style="width: {entry.progress}%"
							></div>
						</div>
						<div class="flex justify-between items-center text-xs text-surface-500">
							<span>{entry.status === 'completing' ? 'Completing…' : `${entry.progress}%`}</span>
							<button
								type="button"
								class="btn btn-sm preset-tonal-error"
								onclick={() => cancelUpload(entry)}
							>
								Cancel
							</button>
						</div>
					{:else if entry.status === 'importing'}
						<p class="text-xs text-warning-600">Importing into vCenter…</p>
					{:else if entry.status === 'done'}
						<div class="flex justify-between items-center">
							<p class="text-xs text-success-600">✓ Import queued</p>
							<button type="button" class="btn btn-sm preset-tonal-surface text-xs" onclick={() => dismissUpload(entry)}>
								Dismiss
							</button>
						</div>
					{:else if entry.status === 'cancelled'}
						<div class="flex justify-between items-center">
							<p class="text-xs text-surface-500">Cancelled</p>
							<button type="button" class="btn btn-sm preset-tonal-surface text-xs" onclick={() => dismissUpload(entry)}>
								Dismiss
							</button>
						</div>
					{:else if entry.status === 'error'}
						<div class="space-y-1">
							<p class="text-xs text-error-600 break-words">{entry.error}</p>
							<div class="flex gap-2">
								<button type="button" class="btn btn-sm preset-tonal-primary text-xs" onclick={() => retryUpload(entry)}>
									Retry
								</button>
								<button type="button" class="btn btn-sm preset-tonal-surface text-xs" onclick={() => dismissUpload(entry)}>
									Dismiss
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	<!-- Existing images table -->
	<section class="card p-4 space-y-3">
		<h2 class="h5">Staged images</h2>

		{#if loadingList}
			<p class="text-surface-500 text-sm">Loading…</p>
		{:else if listError}
			<aside class="card preset-tonal-error p-3">
				<p class="text-sm">⚠️ {listError}</p>
			</aside>
		{:else if images.length === 0}
			<p class="text-surface-500 text-sm">No images yet. Upload one above.</p>
		{:else}
			<div class="table-container">
				<table class="table table-hover">
					<thead>
						<tr>
							<th>Filename</th>
							<th>Kind</th>
							<th>Size</th>
							<th>Status</th>
							<th>Info</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each images as img (img.id)}
							<tr>
								<td class="font-mono text-sm">{img.filename}</td>
								<td><span class="badge preset-tonal-surface uppercase">{img.kind}</span></td>
								<td class="text-sm">{formatBytes(img.size_bytes)}</td>
								<td><span class={statusBadgeClass(img.status)}>{img.status}</span></td>
								<td class="text-xs text-surface-500 max-w-xs">
									{#if img.status === 'error' && img.error_message}
										<span class="text-error-600">{img.error_message}</span>
									{:else if img.status === 'imported' && img.datastore_path}
										{img.datastore_path}
									{:else if img.status === 'importing'}
										<span class="text-warning-600">Importing into vCenter…</span>
									{:else}
										—
									{/if}
								</td>
								<td>
									<div class="flex gap-2">
										{#if img.status === 'error'}
											<button
												type="button"
												class="btn btn-sm preset-tonal-warning"
												onclick={() => retryImport(img)}
												disabled={retryingId === img.id}
												title="Retry import without re-uploading the file"
											>
												{retryingId === img.id ? 'Retrying…' : 'Retry import'}
											</button>
										{/if}
										<button
											type="button"
											class="btn btn-sm preset-tonal-error"
											onclick={() => deleteImage(img)}
											disabled={img.status === 'importing'}
											title={img.status === 'importing' ? 'Cannot delete while importing' : 'Delete image'}
										>
											Delete
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
