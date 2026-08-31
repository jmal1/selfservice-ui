<!--
  Template build-VM console page. Counterpart to the pod-VM console;
  shares the <WMKSConsole> component for everything that matters.

  Backed by:
    - GET /api/v1/admin/templates/{templateID}/console/ticket
      Returns { ws_url, template_state, vm_name }; gives the UI a
      single place to do auth + state gating server-side.
    - WS  /api/v1/admin/templates/{templateID}/console/ws
      The actual WebMKS proxy. Same wire-level contract as the
      pod console (see internal/api/handlers/templates_console.go).

  Auth model: admin OR template.created_by == current user.
  State gating: provisioning / configuring / generalizing only.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { config } from '$lib/config';
	import { getTemplateConsoleTicket, type TemplateConsoleTicket } from '$lib/api/client';
	import { onMount } from 'svelte';
	import WMKSConsole from '$lib/components/WMKSConsole.svelte';

	const templateID = $derived(page.params.templateID as string);
	let ticket = $state<TemplateConsoleTicket | null>(null);
	let loadError = $state('');

	const wsUrl = $derived.by(() => {
		if (!ticket) return '';
		const base = config.apiBaseUrl || window.location.origin;
		const wsBase = base.replace(/^http/, 'ws');
		return `${wsBase}${ticket.ws_url}`;
	});

	const title = $derived(ticket ? `Build Console: ${ticket.vm_name}` : 'Template Build Console');
	const wizardHref = $derived(`/admin/templates/${templateID}/wizard`);

	onMount(async () => {
		try {
			ticket = await getTemplateConsoleTicket(templateID);
		} catch (e: any) {
			loadError = e?.message || String(e);
		}
	});
</script>

{#if loadError}
	<div class="fixed inset-0 flex items-center justify-center bg-black">
		<div class="max-w-md rounded-xl border border-error-500/30 bg-error-500/10 p-8 text-center">
			<p class="text-lg font-semibold text-error-400">Cannot open console</p>
			<p class="mt-2 text-sm text-surface-300">{loadError}</p>
			<a
				href={wizardHref}
				class="mt-4 inline-block rounded border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm text-primary-400 transition-colors hover:bg-primary-500/20"
			>
				← Back to wizard
			</a>
		</div>
	</div>
{:else if !ticket}
	<div class="fixed inset-0 flex items-center justify-center bg-black">
		<div class="rounded-xl border border-surface-700 bg-surface-900/70 p-8 text-center">
			<p class="text-sm text-surface-400">Loading console…</p>
		</div>
	</div>
{:else}
	<WMKSConsole
		{wsUrl}
		{title}
		backHref={wizardHref}
		backLabel="← Back to wizard"
	/>
{/if}
