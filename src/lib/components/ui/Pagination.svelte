<script lang="ts">
	import { i18n } from '$lib/i18n';
	import Button from './Button.svelte';

	interface Props {
		current: number;
		total: number;
		onchange: (page: number) => void;
		/** Affichage compact (mobile) : masque le texte prev/next, garde juste les flèches */
		compact?: boolean;
	}

	let { current, total, onchange, compact = false }: Props = $props();

	function prev() {
		if (current > 1) onchange(current - 1);
	}

	function next() {
		if (current < total) onchange(current + 1);
	}
</script>

{#if total > 1}
	<div class="mt-8 flex items-center justify-center gap-2 sm:gap-4">
		<Button variant="ghost" size="sm" disabled={current <= 1} onclick={prev}>
			←{#if !compact}<span class="hidden sm:inline ml-1">{i18n.t('common.actions.previous')}</span>{/if}
		</Button>
		<span class="text-sm text-text-muted font-mono tabular-nums">
			{current} / {total}
		</span>
		<Button variant="ghost" size="sm" disabled={current >= total} onclick={next}>
			{#if !compact}<span class="hidden sm:inline mr-1">{i18n.t('common.actions.next')}</span>{/if}→
		</Button>
	</div>
{/if}
