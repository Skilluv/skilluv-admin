<script lang="ts">
	import { i18n } from '$lib/i18n';

	interface Props {
		/** URL du replay (vidéo ou timelapse) */
		src: string;
		/** Poster/thumbnail */
		poster?: string;
		/** Titre du challenge */
		title?: string;
		/** Durée originale du challenge en secondes */
		originalDuration?: number;
	}

	let { src, poster, title, originalDuration }: Props = $props();

	let video: HTMLVideoElement;
	let playing = $state(false);
	let progress = $state(0);
	let currentTime = $state(0);
	let duration = $state(0);
	let speed = $state(1);

	const speeds = [0.5, 1, 2, 4, 8];

	function togglePlay() {
		if (!video) return;
		if (playing) {
			video.pause();
		} else {
			video.play();
		}
	}

	function handleTimeUpdate() {
		if (!video) return;
		currentTime = video.currentTime;
		duration = video.duration || 0;
		progress = duration > 0 ? (currentTime / duration) * 100 : 0;
	}

	function seek(e: MouseEvent) {
		if (!video || !duration) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		video.currentTime = pct * duration;
	}

	function setSpeed(s: number) {
		speed = s;
		if (video) video.playbackRate = s;
	}

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
	<!-- Video -->
	<div class="relative aspect-video bg-black">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			{src}
			{poster}
			preload="metadata"
			class="h-full w-full object-contain"
			ontimeupdate={handleTimeUpdate}
			onplay={() => (playing = true)}
			onpause={() => (playing = false)}
			onended={() => { playing = false; progress = 100; }}
		></video>

		<!-- Play overlay -->
		{#if !playing}
			<button
				class="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40"
				onclick={togglePlay}
				aria-label="Play"
			>
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-accent/90 text-2xl text-accent-fg shadow-lg">
					▶
				</div>
			</button>
		{/if}
	</div>

	<!-- Controls -->
	<div class="flex items-center gap-3 px-4 py-3">
		<!-- Play/Pause -->
		<button
			class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text-primary"
			onclick={togglePlay}
			aria-label={playing ? 'Pause' : 'Play'}
		>
			{playing ? '⏸' : '▶'}
		</button>

		<!-- Progress bar -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative h-1.5 flex-1 cursor-pointer rounded-full bg-surface-overlay"
			onclick={seek}
		>
			<div
				class="h-full rounded-full bg-accent transition-all duration-100"
				style="width: {progress}%"
			></div>
		</div>

		<!-- Time -->
		<span class="min-w-[4rem] text-xs text-text-muted">
			{formatTime(currentTime)} / {formatTime(duration)}
		</span>

		<!-- Speed -->
		<div class="flex items-center gap-1">
			{#each speeds as s}
				<button
					class="rounded px-1.5 py-0.5 text-xs transition-colors
						{speed === s ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-primary'}"
					onclick={() => setSpeed(s)}
				>{s}x</button>
			{/each}
		</div>
	</div>

	<!-- Info bar -->
	{#if title || originalDuration}
		<div class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted">
			{#if title}
				<span class="font-medium">{title}</span>
			{/if}
			{#if originalDuration}
				<span>{i18n.locale === 'fr' ? 'Durée originale' : 'Original duration'}: {formatTime(originalDuration)}</span>
			{/if}
		</div>
	{/if}
</div>
