<script lang="ts">
	interface Props {
		class?: string;
		rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
	}

	let { class: className = 'h-4 w-full', rounded = 'lg' }: Props = $props();

	const radiusMap: Record<string, string> = {
		sm: 'rounded-sm',
		md: 'rounded-md',
		lg: 'rounded-lg',
		xl: 'rounded-xl',
		full: 'rounded-full'
	};
</script>

<div
	class="animate-[skeleton-pulse_1.5s_ease-in-out_infinite] bg-surface-overlay {radiusMap[rounded]} {className}"
	role="status"
	aria-label="Chargement..."
></div>
