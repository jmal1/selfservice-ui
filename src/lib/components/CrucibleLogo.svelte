<script lang="ts">
	let { size = 'h-16 w-16', variant = 'auto' }: { size?: string; variant?: 'light' | 'dark' | 'auto' } = $props();

	const bgClass = $derived(variant === 'auto' ? 'fill-surface-200 dark:fill-surface-800' : variant === 'dark' ? 'fill-[#12121f]' : 'fill-surface-200');
</script>

<svg class={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="flame-grad" x1="32" y1="44" x2="32" y2="12" gradientUnits="userSpaceOnUse">
			<stop stop-color="#CC2200"/>
			<stop offset="0.4" stop-color="#FF4500"/>
			<stop offset="0.8" stop-color="#FF8C00"/>
			<stop offset="1" stop-color="#FFD700"/>
		</linearGradient>
		<linearGradient id="hex-grad" x1="12" y1="6" x2="52" y2="50" gradientUnits="userSpaceOnUse">
			<stop stop-color="#E8E8E8"/>
			<stop offset="1" stop-color="#888888"/>
		</linearGradient>
	</defs>
	<rect width="64" height="64" rx="14" class={bgClass}/>
	<path d="M32 6 L52 17 L52 39 L32 50 L12 39 L12 17 Z"
		  fill="none" stroke="url(#hex-grad)" stroke-width="2.5" stroke-linecap="round"
		  stroke-dasharray="0 28 120" stroke-dashoffset="-14"/>
	<path d="M32 44 C26 40 22 35 22 30 C22 24 26 20 29 18 C28 22 30 21 30 18 C30 14 32 12 32 12 C32 12 34 14 34 18 C34 21 36 22 35 18 C38 20 42 24 42 30 C42 35 38 40 32 44Z" fill="url(#flame-grad)"/>
	<path d="M32 40 C29 38 27 35 27 32 C27 28 29 26 31 24 C30 27 32 26 32 24 C32 24 34 26 33 24 C35 26 37 28 37 32 C37 35 35 38 32 40Z" fill="#FFD700" opacity="0.7"/>
	<circle cx="32" cy="30" r="2" fill="white" opacity="0.5"/>
</svg>
