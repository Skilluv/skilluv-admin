<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	interface Props {
		open: boolean;
		title?: string;
		onclose: () => void;
		children: Snippet;
		actions?: Snippet;
		/** Taille du conteneur — utile pour les formulaires denses (bounty
		 *  creation, list edit, etc.) qui ont besoin de plus de largeur que
		 *  la valeur par défaut. */
		size?: 'sm' | 'md' | 'lg' | 'xl';
	}

	let { open, title, onclose, children, actions, size = 'md' }: Props = $props();

	const maxWidths: Record<NonNullable<Props['size']>, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-2xl'
	};

	// Portal action : téléporte le noeud dans document.body à la connexion,
	// le restaure/supprime à la déconnexion. Évite que la modale hérite d'un
	// `transform` ancêtre (PageTransition, animations GSAP, etc.) qui
	// casserait le `position: fixed` (spec CSS : un ancêtre transformé devient
	// le containing block des descendants fixed).
	function portal(node: HTMLElement) {
		if (typeof document !== 'undefined') {
			document.body.appendChild(node);
		}
		return {
			destroy() {
				node.remove();
			}
		};
	}

	// Verrouille le scroll de la page derrière la modale et compense la
	// largeur de la scrollbar pour éviter le "layout shift" à l'ouverture.
	$effect(() => {
		if (!open || typeof document === 'undefined') return;

		const body = document.body;
		const html = document.documentElement;
		const scrollbarWidth = window.innerWidth - html.clientWidth;

		const prevBodyOverflow = body.style.overflow;
		const prevBodyPadding = body.style.paddingRight;

		body.style.overflow = 'hidden';
		if (scrollbarWidth > 0) {
			body.style.paddingRight = `${scrollbarWidth}px`;
		}

		return () => {
			body.style.overflow = prevBodyOverflow;
			body.style.paddingRight = prevBodyPadding;
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		use:portal
		class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 animate-[fade-in_150ms_ease-out]"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label={title}
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
	>
		<div class="flex max-h-[calc(100vh-2rem)] w-full {maxWidths[size]} flex-col rounded-2xl border border-border bg-surface-elevated shadow-lg animate-[slide-up_200ms_ease-out]">
			{#if title}
				<div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
					<h2 class="text-lg font-semibold">{title}</h2>
					<button class="text-text-muted hover:text-text-primary" onclick={onclose} aria-label="Fermer"><X size={18} strokeWidth={2} /></button>
				</div>
			{/if}

			<div class="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
				{@render children()}
			</div>

			{#if actions}
				<div class="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
					{@render actions()}
				</div>
			{/if}
		</div>
	</div>
{/if}
