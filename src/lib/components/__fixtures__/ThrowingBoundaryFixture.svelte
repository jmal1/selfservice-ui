<script lang="ts">
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';

	/**
	 * Test-only fixture: renders a child inside <ErrorBoundary> that throws
	 * during render when `shouldThrow` is true. Used by ErrorBoundary.test.ts to
	 * prove the boundary contains render-time crashes and shows the fallback.
	 */
	let { shouldThrow = false }: { shouldThrow?: boolean } = $props();

	function boom(): string {
		throw new Error('fixture boom');
	}
</script>

<ErrorBoundary label="the test section">
	{#if shouldThrow}{boom()}{/if}
	<p data-testid="child-ok">child rendered ok</p>
</ErrorBoundary>
