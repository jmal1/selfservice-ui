<script lang="ts">
	export type UsagePoint = { t: number; v: number };

	let {
		label,
		points,
		unit = '%',
		maxValue = null as number | null,
		maxLabel = ''
	}: {
		label: string;
		points: UsagePoint[];
		unit?: string;
		maxValue?: number | null;
		maxLabel?: string;
	} = $props();

	const width = 640;
	const height = 160;
	const pad = 8;

	const path = $derived.by(() => {
		if (points.length === 0) return '';
		const xs = points.map((p) => p.t);
		const ys = points.map((p) => p.v);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = 0;
		const maxY = maxValue != null && maxValue > 0 ? maxValue : Math.max(unit === '%' ? 100 : 1, ...ys);
		const spanX = Math.max(maxX - minX, 1);
		const spanY = Math.max(maxY - minY, 1);
		return points
			.map((p, i) => {
				const x = pad + ((p.t - minX) / spanX) * (width - pad * 2);
				const y = height - pad - ((p.v - minY) / spanY) * (height - pad * 2);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	});

	const latest = $derived(points.length ? points[points.length - 1].v : null);

	function formatValue(v: number): string {
		if (unit === 'GHz') return (v / 1000).toFixed(1);
		if (unit === 'GB') return (v / 1024).toFixed(0);
		return v.toFixed(0);
	}
</script>

<div class="panel rounded-2xl p-5">
	<div class="flex items-baseline justify-between gap-3">
		<p class="text-xs font-semibold uppercase tracking-[0.05em] text-surface-500">{label}</p>
		{#if latest != null}
			<p class="text-lg font-bold text-surface-900 dark:text-surface-100">
				{formatValue(latest)}{unit === '%' ? '%' : ` ${unit}`}
				{#if maxValue != null && maxValue > 0}
					<span class="text-sm font-normal text-surface-500">/ {formatValue(maxValue)}{unit === '%' ? '%' : ` ${unit}`}{maxLabel ? ` ${maxLabel}` : ''}</span>
				{/if}
			</p>
		{/if}
	</div>
	{#if points.length === 0}
		<p class="mt-8 text-center text-sm text-surface-500">No history yet.</p>
	{:else}
		<svg class="mt-3 h-40 w-full text-primary-500" viewBox="0 0 {width} {height}" preserveAspectRatio="none" role="img" aria-label="{label} 7-day trend">
			<path d={path} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
		</svg>
	{/if}
</div>
