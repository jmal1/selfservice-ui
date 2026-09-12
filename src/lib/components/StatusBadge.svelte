<script lang="ts">
	let { status }: { status: string } = $props();

	const statusConfig = $derived.by(() => {
		const s = status.toLowerCase();
		switch (s) {
			case 'active':
			case 'running':
			case 'powered_on':
			case 'completed':
				return { bg: 'bg-success-500/10', text: 'text-success-500', dot: 'bg-success-500', label: format(s), animate: s === 'running' || s === 'powered_on' };
			case 'pending':
			case 'provisioning':
			case 'cloning':
			case 'configuring':
			case 'creating':
			case 'claimed':
			case 'in_progress':
				return { bg: 'bg-warning-500/10', text: 'text-warning-500', dot: 'bg-warning-500', label: format(s), animate: false };
			case 'stopped':
			case 'destroyed':
			case 'deleted':
			case 'powered_off':
				case 'cancelled':
					return { bg: 'bg-surface-400/10', text: 'text-surface-500', dot: 'bg-surface-500', label: format(s), animate: false };
				case 'suspended':
					return { bg: 'bg-warning-500/15', text: 'text-warning-400', dot: 'bg-warning-400', label: 'Suspended', animate: false };
			case 'error':
			case 'failed':
			case 'destroy_failed':
			case 'rollback':
				return { bg: 'bg-error-500/10', text: 'text-error-500', dot: 'bg-error-500', label: format(s), animate: false };
			case 'destroying':
				return { bg: 'bg-warning-500/10', text: 'text-warning-500', dot: 'bg-warning-500', label: 'Marked for destruction', animate: true };
			case 'deleting':
			case 'suspending':
			case 'stopping':
				return { bg: 'bg-warning-500/10', text: 'text-warning-500', dot: 'bg-warning-500', label: format(s), animate: true };
			default:
				return { bg: 'bg-surface-400/10', text: 'text-surface-500', dot: 'bg-surface-500', label: format(s), animate: false };
		}
	});

	function format(s: string): string {
		return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold {statusConfig.bg} {statusConfig.text}">
	<span
		class="inline-block h-2 w-2 rounded-full {statusConfig.dot}"
		class:status-pulse={statusConfig.animate}
		style={statusConfig.animate ? `box-shadow: 0 0 6px currentColor` : ''}
	></span>
	{statusConfig.label}
</span>
