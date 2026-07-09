<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'code' | 'design' | 'game' | 'security';
		size?: 'sm' | 'md';
		children: Snippet;
	}

	let { variant = 'default', size = 'sm', children }: Props = $props();

	const variants: Record<string, string> = {
		default: 'bg-surface-overlay text-text-muted',
		primary: 'bg-primary/15 text-primary',
		accent: 'bg-accent/15 text-accent',
		success: 'bg-success/15 text-success',
		warning: 'bg-warning/15 text-warning',
		error: 'bg-error/15 text-error',
		code: 'bg-blue-400/15 text-blue-400',
		design: 'bg-pink-400/15 text-pink-400',
		game: 'bg-green-400/15 text-green-400',
		security: 'bg-red-400/15 text-red-400'
	};

	const sizes: Record<string, string> = {
		sm: 'px-2 py-0.5 text-xs',
		md: 'px-3 py-1 text-sm'
	};
</script>

<span class="inline-flex items-center gap-1 rounded-lg font-medium {variants[variant]} {sizes[size]}">
	{@render children()}
</span>
