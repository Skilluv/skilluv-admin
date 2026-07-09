<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
		href?: string;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		href,
		children,
		disabled,
		class: className = '',
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';

	const variants: Record<string, string> = {
		primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
		secondary: 'border border-border text-text-primary hover:bg-surface-overlay hover:border-text-muted',
		ghost: 'text-text-muted hover:text-text-primary hover:bg-surface-overlay',
		accent: 'bg-accent text-accent-fg hover:bg-accent-hover',
		danger: 'bg-error text-error-fg hover:brightness-90'
	};

	const sizes: Record<string, string> = {
		sm: 'h-8 px-4 text-xs rounded-full gap-1.5',
		md: 'h-10 px-5 text-sm rounded-full gap-2',
		lg: 'h-12 px-7 text-xs rounded-full uppercase tracking-wider gap-2.5'
	};

	let classes = $derived(`${base} ${variants[variant]} ${sizes[size]} ${className}`);

	// Le composant est polymorphe : rend un <button> ou un <a> selon `href`.
	// Les attributs déclarés sont ceux d'un <button> ; on caste pour le passage
	// à <a> (les props réellement utilisées côté appelant — aria-*, data-*,
	// onclick, target — sont communes aux deux éléments).
	const anchorRest = $derived(rest as unknown as HTMLAnchorAttributes);
</script>

{#if href && !disabled}
	<a {href} class={classes} {...anchorRest}>
		{@render children()}
	</a>
{:else}
	<button class={classes} disabled={disabled || loading} {...rest}>
		{#if loading}
			<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
			</svg>
		{/if}
		{@render children()}
	</button>
{/if}
