<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { Rank, UserBadgesResponse, UserBadgeItem } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { Award, ChevronsUp } from '@lucide/svelte';

	interface Props {
		userId: string;
		refreshKey?: number;
		onrankloaded?: (r: Rank) => void;
	}

	let { userId, refreshKey = 0, onrankloaded }: Props = $props();

	let data = $state<UserBadgesResponse | null>(null);
	let loading = $state(true);

	$effect(() => {
		// Re-run on userId change OR refreshKey bump.
		void refreshKey;
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await adminApi.getUserBadges(userId);
			data = res.data;
			onrankloaded?.(res.data.rank.rank);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(intlLocale(), {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	function rarityVariant(
		r: string
	): 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'error' {
		if (r === 'legendary') return 'warning';
		if (r === 'epic') return 'accent';
		if (r === 'rare') return 'primary';
		return 'default';
	}

	function renderItems(items: UserBadgeItem[]) {
		return items;
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center gap-2">
		<Award size={16} strokeWidth={2} class="text-primary" />
		<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.userEnrichment.badges.sectionTitle')}
		</h2>
	</div>
	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.badges.sectionHint')}
	</p>

	{#if loading}
		<Skeleton class="h-24 w-full" rounded="xl" />
	{:else if data}
		<div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-overlay p-4">
			<div class="rounded-xl bg-primary/15 p-2 text-primary">
				<ChevronsUp size={20} strokeWidth={2} />
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.userEnrichment.badges.rankLabel')}
				</span>
				<span class="text-lg font-semibold text-text-primary">
					{i18n.t(`admin.userEnrichment.rank.ranks.${data.rank.rank}`)}
				</span>
				<span class="text-xs text-text-muted">
					{i18n.t('admin.userEnrichment.badges.achievedAt')} {fmtDate(data.rank.achieved_at)}
					{#if data.rank.previous_rank}
						· {i18n.t('admin.userEnrichment.badges.previousRank')} :
						{i18n.t(`admin.userEnrichment.rank.ranks.${data.rank.previous_rank}`)}
					{/if}
				</span>
			</div>
			<Badge variant="primary" size="md">
				{data.total_badges} {i18n.t('admin.userEnrichment.badges.total')}
			</Badge>
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.userEnrichment.badges.skillPatches')} ({data.skill_patches.length})
				</span>
				{#if data.skill_patches.length === 0}
					<span class="text-xs text-text-muted">—</span>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each renderItems(data.skill_patches) as b}
							<li class="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5 text-xs">
								<div class="flex min-w-0 items-center gap-1.5">
									<Badge variant={rarityVariant(b.rarity)} size="sm">{b.rarity}</Badge>
									<span class="truncate text-text-primary">{b.display_name ?? b.rule_slug ?? '—'}</span>
								</div>
								<span class="text-text-muted">{fmtDate(b.earned_at)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.userEnrichment.badges.medals')} ({data.medals.length})
				</span>
				{#if data.medals.length === 0}
					<span class="text-xs text-text-muted">—</span>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each renderItems(data.medals) as b}
							<li class="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5 text-xs">
								<div class="flex min-w-0 items-center gap-1.5">
									<Badge variant={rarityVariant(b.rarity)} size="sm">{b.rarity}</Badge>
									<span class="truncate text-text-primary">{b.display_name ?? b.rule_slug ?? '—'}</span>
								</div>
								<span class="text-text-muted">{fmtDate(b.earned_at)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.userEnrichment.badges.guildCrests')} ({data.guild_crests.length})
				</span>
				{#if data.guild_crests.length === 0}
					<span class="text-xs text-text-muted">—</span>
				{:else}
					<ul class="flex flex-col gap-1.5">
						{#each renderItems(data.guild_crests) as b}
							<li class="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5 text-xs">
								<div class="flex min-w-0 items-center gap-1.5">
									<Badge variant={rarityVariant(b.rarity)} size="sm">{b.rarity}</Badge>
									<span class="truncate text-text-primary">{b.display_name ?? b.rule_slug ?? '—'}</span>
								</div>
								<span class="text-text-muted">{fmtDate(b.earned_at)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.userEnrichment.badges.sealsCount')} / {i18n.t(
						'admin.userEnrichment.badges.stampsCount'
					)}
				</span>
				<div class="flex gap-2">
					<Badge variant="default" size="md">
						{data.challenge_seals_count} {i18n.t('admin.userEnrichment.badges.sealsCount')}
					</Badge>
					<Badge variant="default" size="md">
						{data.event_stamps_count} {i18n.t('admin.userEnrichment.badges.stampsCount')}
					</Badge>
				</div>
			</div>
		</div>
	{/if}
</section>
