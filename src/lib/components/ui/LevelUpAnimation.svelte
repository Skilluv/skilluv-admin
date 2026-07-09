<script lang="ts">
	import { i18n } from '$lib/i18n';
	import type { Title } from '$types';

	interface Props {
		show: boolean;
		newTitle: Title;
		goldenStars?: number;
		onclose: () => void;
	}

	let { show, newTitle, goldenStars = 0, onclose }: Props = $props();

	const titleGlows: Record<Title, string> = {
		apprenti: 'from-zinc-400 to-zinc-600',
		artisan: 'from-blue-400 to-blue-600',
		maitre: 'from-orange-400 to-amber-600',
		legende: 'from-yellow-300 to-amber-500'
	};

	const titleEmojis: Record<Title, string> = {
		apprenti: '☆',
		artisan: '◆',
		maitre: '★',
		legende: '✦'
	};

	$effect(() => {
		if (show) {
			setTimeout(onclose, 4000);
		}
	});
</script>

{#if show}
	<div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 animate-[fade-in_300ms_ease-out]">
		<div class="flex flex-col items-center text-center animate-[slide-up_500ms_ease-out]">
			<!-- Emoji -->
			<div class="mb-4 text-7xl animate-[fragment-burst_600ms_ease-out]">
				{titleEmojis[newTitle]}
			</div>

			<!-- Title ring -->
			<div class="relative mb-6">
				<div class="absolute inset-0 rounded-full bg-gradient-to-br {titleGlows[newTitle]} opacity-30 blur-xl animate-[pulse-glow_1.5s_ease-in-out_infinite]"></div>
				<div class="relative rounded-2xl border-2 border-white/20 bg-surface-elevated px-8 py-4">
					<p class="mb-1 text-sm text-text-muted uppercase tracking-widest">
						{i18n.locale === 'fr' ? 'Nouveau titre' : 'New title'}
					</p>
					<p class="bg-gradient-to-r {titleGlows[newTitle]} bg-clip-text text-4xl font-bold text-transparent">
						{i18n.t(`common.titles.${newTitle}`)}
					</p>
					{#if goldenStars > 0}
						<p class="mt-2 text-2xl text-yellow-400">
							{'★'.repeat(goldenStars)}
						</p>
					{/if}
				</div>
			</div>

			<!-- Message -->
			<p class="text-lg text-text-muted animate-[fade-in_800ms_ease-out]">
				{i18n.locale === 'fr' ? 'Continue comme ça !' : 'Keep going!'}
			</p>

			<!-- Dismiss -->
			<button
				class="mt-6 text-sm text-text-muted hover:text-text-primary transition-colors"
				onclick={onclose}
			>
				{i18n.locale === 'fr' ? 'Continuer' : 'Continue'}
			</button>
		</div>
	</div>
{/if}
