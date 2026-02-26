<script lang="ts">
	let { width = '100%', height = '1rem', rounded = 'rounded-md' }: {
		width?: string;
		height?: string;
		rounded?: string;
	} = $props();
</script>

<div
	class="animate-pulse bg-surface-200-800 {rounded}"
	style="width: {width}; height: {height};"
	aria-hidden="true"
></div>
