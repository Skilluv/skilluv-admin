<script lang="ts">
	import { designApi } from '$api/design';
	import { errorMessage } from '$api/errors';
	import { SkilluError } from '$api/client';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { DesignProfile } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { Palette, ExternalLink } from '@lucide/svelte';

	// Skilluv Design — the design half of a user's record.
	//
	// Loaded on demand rather than on mount: the score is computed per
	// request (a fresh number is cheaper than explaining a stale one), and
	// most users on this panel are not designers. A 404 here means either
	// "no such profile" or "profile hidden" — the backend deliberately gives
	// the same answer to both, so the empty state says exactly that instead
	// of guessing.

	interface Props {
		/** The public profile is addressed by username, not by id. */
		username: string;
	}

	let { username }: Props = $props();

	let profile = $state<DesignProfile | null>(null);
	let loading = $state(false);
	let loaded = $state(false);
	let notFound = $state(false);

	// Reset when the page switches user — a stale profile under another name
	// would be a lie the UI tells silently.
	$effect(() => {
		void username;
		profile = null;
		loaded = false;
		notFound = false;
	});

	async function load() {
		if (loading) return;
		loading = true;
		notFound = false;
		try {
			const res = await designApi.profile(username);
			profile = res.data;
			loaded = true;
		} catch (e) {
			if (e instanceof SkilluError && e.status === 404) {
				notFound = true;
				loaded = true;
			} else {
				toast.error(errorMessage(e));
			}
		} finally {
			loading = false;
		}
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
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

	function subtypeLabel(s: string | null): string {
		if (!s) return '—';
		const key = `admin.design.subtypes.${s}`;
		const label = i18n.t(key);
		return label === key ? s : label;
	}

	/** Rounds are the number this profile exists to show: converging at four
	 *  is a better story than passing at one, so it is never hidden. */
	function roundsVariant(rounds: number | null): 'default' | 'primary' {
		return rounds !== null && rounds > 1 ? 'primary' : 'default';
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Palette size={16} strokeWidth={2} class="text-accent" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.design.profile.sectionTitle')}
			</h2>
		</div>
		<Button variant="secondary" size="sm" onclick={load} loading={loading}>
			<Palette size={14} strokeWidth={2} />
			{i18n.t('admin.design.profile.loadBtn')}
		</Button>
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.design.profile.sectionHint')}
	</p>

	{#if loading}
		<Skeleton class="h-40 w-full" rounded="xl" />
	{:else if notFound}
		<p class="text-sm text-text-muted">{i18n.t('admin.design.profile.notFound')}</p>
	{:else if loaded && profile}
		<!-- The score first, because it makes a list sortable; the breakdown
		     right behind it, because a score with no explanation is a number
		     somebody has to trust. -->
		<div class="mb-4 rounded-xl border border-border bg-surface-overlay p-4">
			<div class="flex flex-wrap items-center gap-3">
				<p class="text-3xl font-black text-primary">{profile.craft_score.score}</p>
				<div>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="accent">{profile.craft_score.tier_name}</Badge>
						<code class="font-mono text-[10px] text-text-muted">
							{profile.craft_score.tier_slug}
						</code>
						{#if profile.craft_score.capped}
							<Badge variant="warning">{i18n.t('admin.design.profile.capped')}</Badge>
						{/if}
					</div>
					{#if profile.craft_score.next_tier_at !== null}
						<p class="mt-1 text-xs text-text-muted">
							{i18n.t('admin.design.profile.nextTierAt')}: {profile.craft_score.next_tier_at}
						</p>
					{/if}
				</div>
			</div>
			{#if profile.craft_score.tier_description}
				<p class="mt-2 text-xs text-text-muted">{profile.craft_score.tier_description}</p>
			{/if}

			{#if profile.craft_score.breakdown.length > 0}
				<ul class="mt-3 flex flex-col gap-1">
					{#each profile.craft_score.breakdown as term (term.term)}
						<li class="flex flex-wrap items-baseline gap-2 text-xs">
							<code class="font-mono text-text-primary">{term.term}</code>
							<span class="text-text-muted">{term.measured}</span>
							<Badge variant={term.points > 0 ? 'success' : 'default'}>
								{term.points > 0 ? '+' : ''}{term.points}
							</Badge>
							<span class="text-text-muted">{term.explanation}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if profile.trades.length > 0}
			<div class="mb-4">
				<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.design.profile.tradesTitle')}
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each profile.trades as t (t.trade)}
						<Badge variant="design">{t.trade} · {t.validated}</Badge>
					{/each}
				</div>
			</div>
		{/if}

		{#if profile.artefacts.length > 0}
			<div class="mb-4">
				<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.design.profile.artefactsTitle')} ({profile.artefacts.length})
				</h3>
				<ul class="flex flex-col gap-2">
					{#each profile.artefacts as a (a.deliverable_id)}
						<li class="rounded-xl bg-surface-overlay px-3 py-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm text-text-primary">{a.title}</span>
								<Badge variant="design">{subtypeLabel(a.subtype)}</Badge>
								{#if a.trade}
									<span class="text-xs text-text-muted">{a.trade}</span>
								{/if}
								{#if a.rounds !== null}
									<Badge variant={roundsVariant(a.rounds)}>
										{a.rounds}
										{i18n.t('admin.design.profile.roundsLabel')}
									</Badge>
								{/if}
								{#if a.grid_average}
									<span class="text-xs text-text-muted">
										{i18n.t('admin.design.profile.gridAverage')}: {a.grid_average}
									</span>
								{/if}
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-3">
								<a
									href={a.artifact_url}
									target="_blank"
									rel="noopener nofollow"
									class="flex items-center gap-1 break-all text-xs text-primary hover:underline"
								>
									<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
									{a.artifact_url}
								</a>
								<span class="text-xs text-text-muted">{fmtDate(a.verified_at)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if profile.contests.length > 0}
			<div class="mb-4">
				<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.design.profile.contestsTitle')}
				</h3>
				<ul class="flex flex-col gap-1">
					{#each profile.contests as c (c.name)}
						<li class="flex flex-wrap items-center gap-2 text-xs">
							<span class="text-text-primary">{c.name}</span>
							<Badge variant={c.rank === 1 ? 'accent' : 'default'}>
								{c.rank === null ? '—' : `#${c.rank}`} / {c.entrants}
							</Badge>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if profile.attestations.length > 0}
			<div>
				<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.design.profile.attestationsTitle')}
				</h3>
				<ul class="flex flex-col gap-1">
					{#each profile.attestations as a (a.verification_code)}
						<li class="flex flex-wrap items-center gap-2 text-xs">
							<span class="text-text-primary">{a.title}</span>
							<Badge variant="default">{a.basis}</Badge>
							<code class="font-mono text-[10px] text-text-muted">{a.verification_code}</code>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if profile.artefacts.length === 0 && profile.trades.length === 0}
			<p class="text-sm text-text-muted">{i18n.t('admin.design.profile.emptyRecord')}</p>
		{/if}
	{/if}
</section>
