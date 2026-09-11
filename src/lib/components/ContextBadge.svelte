<script lang="ts">
	let {
		ctxKey,
		direction,
		description = '',
		satisfied = true,
		runtime = false
	}: {
		ctxKey: string;
		direction: 'in' | 'out';
		description?: string;
		satisfied?: boolean;
		runtime?: boolean;
	} = $props();

	function colorForKey(key: string): string {
		let hash = 0;
		for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
		const colors = [
			'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
			'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
			'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
			'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
			'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
			'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
			'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
		];
		return colors[Math.abs(hash) % colors.length];
	}

	const unsatisfiedClass = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
	const runtimeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
	const arrow = $derived(direction === 'in' ? '↓' : '↑');
	const colorClass = $derived(
		direction === 'in' && !satisfied ? unsatisfiedClass
		: direction === 'in' && runtime ? runtimeClass
		: colorForKey(ctxKey)
	);
	const titlePrefix = $derived(direction === 'in' ? 'Reads' : 'Writes');
	const titleSuffix = $derived(
		direction === 'in' && !satisfied ? ' ⚠ not provided by a previous action'
		: runtime ? ' (runtime-provided by Crucible)'
		: ''
	);
	const title = $derived(`${titlePrefix}: ${description}${titleSuffix}`);
</script>

<span
	class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium {colorClass}"
	{title}
>
	{#if runtime}⚡{/if}{arrow} {ctxKey}
	{#if direction === 'in' && !satisfied}
		<span class="ml-0.5">⚠</span>
	{/if}
</span>
