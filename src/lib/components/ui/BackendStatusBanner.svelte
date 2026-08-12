<script lang="ts">
	import { onDestroy } from 'svelte';
	import { AlertTriangle, RefreshCw } from '@lucide/svelte';
	import { backendStatus, nextBackoffSeconds } from '$stores/backendStatus.svelte';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';

	// Countdown until the next automatic probe. Updated by a 1s ticker while
	// `isDown` is true so the user sees the wait explicitly instead of a
	// silent spinner.
	let countdownSeconds = $state(0);
	let probing = $state(false);
	let tickerId: ReturnType<typeof setInterval> | null = null;
	let probeTimerId: ReturnType<typeof setTimeout> | null = null;

	async function probe() {
		if (probing) return;
		probing = true;
		try {
			const res = await fetch('/api/health', { credentials: 'include' });
			if (res.ok) {
				backendStatus.markUp();
				toast.success(i18n.t('admin.backendStatus.reconnected'));
				return;
			}
			// Non-2xx still means the backend answered — network is fine, it's
			// just returning an error page. Treat as "up" so the user isn't
			// blocked; the failing API call will surface its own error.
			backendStatus.markUp();
		} catch {
			backendStatus.failedProbes += 1;
			schedule();
		} finally {
			probing = false;
		}
	}

	function schedule() {
		const secs = nextBackoffSeconds(backendStatus.failedProbes);
		countdownSeconds = secs;
		backendStatus.nextProbeAt = Date.now() + secs * 1000;
		if (probeTimerId) clearTimeout(probeTimerId);
		probeTimerId = setTimeout(probe, secs * 1000);
	}

	$effect(() => {
		if (backendStatus.isDown) {
			// Kick off a probe right away, then let schedule() handle backoff.
			if (backendStatus.nextProbeAt === 0) probe();
			// Ticker for the visible countdown.
			if (!tickerId) {
				tickerId = setInterval(() => {
					const remaining = Math.max(0, Math.ceil((backendStatus.nextProbeAt - Date.now()) / 1000));
					countdownSeconds = remaining;
				}, 1000);
			}
		} else {
			// Cleanup when the store flips back to up (either via a request
			// succeeding or the probe succeeding).
			if (tickerId) {
				clearInterval(tickerId);
				tickerId = null;
			}
			if (probeTimerId) {
				clearTimeout(probeTimerId);
				probeTimerId = null;
			}
			countdownSeconds = 0;
		}
	});

	onDestroy(() => {
		if (tickerId) clearInterval(tickerId);
		if (probeTimerId) clearTimeout(probeTimerId);
	});
</script>

{#if backendStatus.isDown}
	<div
		role="alert"
		aria-live="polite"
		class="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-3 border-b border-error/40 bg-error/15 px-4 py-2 text-sm text-error backdrop-blur"
	>
		<AlertTriangle size={16} strokeWidth={2} class="shrink-0" />
		<span class="min-w-0 flex-1 text-center sm:flex-none">
			{#if probing || countdownSeconds === 0}
				{i18n.t('admin.backendStatus.bannerNow')}
			{:else}
				{i18n.t('admin.backendStatus.banner', { seconds: countdownSeconds })}
			{/if}
		</span>
		<button
			type="button"
			class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-error/40 px-3 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-50"
			onclick={probe}
			disabled={probing}
		>
			<RefreshCw size={12} strokeWidth={2} class={probing ? 'animate-spin' : ''} />
			{probing ? i18n.t('admin.backendStatus.probing') : i18n.t('admin.backendStatus.retryNow')}
		</button>
	</div>
{/if}
