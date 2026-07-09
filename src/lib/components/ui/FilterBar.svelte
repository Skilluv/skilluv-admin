<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Label uppercase optionnel préfixe (ex: "Filtres :") */
		label?: string;
		/** Contenu (SegmentedControl / Select / Input / boutons de filtre) */
		children: Snippet;
		/** Bordure/fond éditorial (par défaut : sans bg, pour zone hors card) */
		variant?: 'plain' | 'boxed';
		class?: string;
	}

	let { label, children, variant = 'plain', class: className = '' }: Props = $props();
</script>

{#if variant === 'boxed'}
	<div class="rounded-2xl border border-border bg-surface-elevated/40 px-4 py-4 sm:px-5 sm:py-5 {className}">
		<div class="flex flex-wrap items-center gap-3">
			{#if label}
				<span class="text-xs font-bold uppercase tracking-wider text-text-muted">
					{label}
				</span>
			{/if}
			{@render children()}
		</div>
	</div>
{:else}
	<div class="flex flex-wrap items-center gap-3 {className}">
		{#if label}
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">
				{label}
			</span>
		{/if}
		{@render children()}
	</div>
{/if}
