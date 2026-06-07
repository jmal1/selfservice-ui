<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '',
		label = 'Default Password',
		hint = ''
	}: { value?: string; placeholder?: string; label?: string; hint?: string } = $props();

	let visible = $state(false);

	const inputClass = 'mt-1 w-full rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
</script>

<label class="block">
	<span class="text-xs font-medium text-surface-500">{label}</span>
	<div class="relative">
		<!--
			Use a single input that swaps type=password ↔ type=text on toggle so
			the cursor position and IME state are preserved. autocomplete=new-password
			tells the browser to keep its password manager out of this field — the
			"default password" is shared instructor-owned credentials, not the
			user's own.
		-->
		<input
			type={visible ? 'text' : 'password'}
			bind:value
			{placeholder}
			autocomplete="new-password"
			class="{inputClass} pr-16"
		/>
		<button
			type="button"
			class="absolute inset-y-0 right-2 my-auto h-6 text-xs text-primary-500 hover:text-primary-400"
			onclick={() => (visible = !visible)}
		>{visible ? 'Hide' : 'Show'}</button>
	</div>
	{#if hint}
		<span class="mt-1 block text-[11px] italic text-surface-400">{hint}</span>
	{/if}
</label>
