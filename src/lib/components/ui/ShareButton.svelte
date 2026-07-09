<script lang="ts">
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';

	interface Props {
		url: string;
		title: string;
		text?: string;
	}

	let { url, title, text = '' }: Props = $props();
	let showMenu = $state(false);

	const fullUrl = $derived(typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url);

	function shareX() {
		window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(fullUrl)}`, '_blank', 'width=550,height=420');
		showMenu = false;
	}

	function shareLinkedIn() {
		window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(fullUrl)}`, '_blank', 'width=550,height=420');
		showMenu = false;
	}

	function shareFacebook() {
		window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`, '_blank', 'width=550,height=420');
		showMenu = false;
	}

	async function copyLink() {
		await navigator.clipboard.writeText(fullUrl);
		toast.success(i18n.locale === 'fr' ? 'Lien copié !' : 'Link copied!');
		showMenu = false;
	}

	async function nativeShare() {
		if (navigator.share) {
			await navigator.share({ title, text, url: fullUrl });
		} else {
			showMenu = !showMenu;
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		class="flex items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text-primary"
		onclick={nativeShare}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
		</svg>
		{i18n.locale === 'fr' ? 'Partager' : 'Share'}
	</button>

	{#if showMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onclick={() => (showMenu = false)} onkeydown={() => {}}></div>
		<div class="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-border bg-surface-elevated p-2 shadow-lg animate-[slide-up_150ms_ease-out]">
			<button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-overlay hover:text-text-primary" onclick={shareX}>
				X / Twitter
			</button>
			<button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-overlay hover:text-text-primary" onclick={shareLinkedIn}>
				LinkedIn
			</button>
			<button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-overlay hover:text-text-primary" onclick={shareFacebook}>
				Facebook
			</button>
			<hr class="my-1 border-border" />
			<button class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-overlay hover:text-text-primary" onclick={copyLink}>
				{i18n.locale === 'fr' ? 'Copier le lien' : 'Copy link'}
			</button>
		</div>
	{/if}
</div>
