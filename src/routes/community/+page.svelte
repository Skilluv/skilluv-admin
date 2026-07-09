<script lang="ts">
	import { adminApi } from '$api/admin';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { i18n } from '$lib/i18n';
	import type { Challenge } from '$types';

	interface CommunityEntry {
		challenge: Challenge;
		creator: { id: string; username: string; display_name: string };
	}

	let entries = $state<CommunityEntry[]>([]);
	let loading = $state(true);

	$effect(() => { loadReview(); });

	async function loadReview() {
		loading = true;
		try {
			const res = await adminApi.communityReview();
			entries = res.data.challenges as CommunityEntry[];
		} catch { /* silent */ }
		loading = false;
	}

	async function approve(id: string) {
		try {
			await adminApi.approveCommunity(id);
			entries = entries.filter((e) => e.challenge.id !== id);
		} catch { /* silent */ }
	}

	async function reject(id: string) {
		const feedback = prompt(i18n.t('admin.community.rejectFeedback'));
		if (!feedback) return;
		try {
			await adminApi.rejectCommunity(id, feedback);
			entries = entries.filter((e) => e.challenge.id !== id);
		} catch { /* silent */ }
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.community.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<h1 class="mb-6 text-2xl font-bold">{i18n.t('admin.community.title')}</h1>
	<p class="mb-6 text-text-muted">{i18n.t('admin.community.subtitle')}</p>

	{#if loading}
		<div class="flex flex-col gap-3">{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}</div>
	{:else if entries.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-16 text-center">
			<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay text-success">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M20 6 9 17l-5-5" />
				</svg>
			</div>
			<p class="text-base text-text-muted">{i18n.t('admin.community.empty')}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each entries as { challenge, creator }}
				<div class="rounded-2xl border border-border bg-surface-elevated p-5">
					<div class="mb-2 flex items-center gap-2">
						<Badge variant={challenge.skill_domain as any}>{challenge.skill_domain}</Badge>
						<Badge variant={challenge.tone === 'fun' ? 'warning' : 'default'}>{challenge.tone}</Badge>
						<span class="text-xs text-text-muted">{i18n.t('admin.community.by')} {creator.display_name} (@{creator.username})</span>
					</div>
					<h3 class="mb-1 text-lg font-semibold">{challenge.title}</h3>
					<p class="mb-2 text-sm text-text-muted">{challenge.description}</p>
					<details class="mb-3">
						<summary class="cursor-pointer text-xs text-primary">{i18n.t('admin.community.viewInstructions')}</summary>
						<pre class="mt-2 whitespace-pre-wrap rounded-xl bg-surface p-3 font-sans text-xs text-text-muted">{challenge.instructions}</pre>
					</details>
					<div class="flex gap-2">
						<Button variant="primary" size="sm" onclick={() => approve(challenge.id)}>{i18n.t('admin.community.approveBtn')}</Button>
						<Button variant="ghost" size="sm" onclick={() => reject(challenge.id)}>{i18n.t('admin.community.rejectBtn')}</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
