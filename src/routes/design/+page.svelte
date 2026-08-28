<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		designApi,
		BRIEF_FEEDBACK_MIN,
		PLAGIARISM_DECISION_MIN,
		FEATURED_REASON_MIN,
		mondayOf
	} from '$api/design';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type {
		AdminSlice,
		DesignAutoCheck,
		DesignBriefProposal,
		DesignReviewRound,
		DesignTiersResponse,
		DesignReviewVerdict,
		FeaturedCard,
		FeaturedTalent,
		PlagiarismCase,
		SkillDomain
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import Select from '$components/ui/Select.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Palette, RefreshCw, Info, ExternalLink, Star } from '@lucide/svelte';

	// Skilluv Design — the four queues a curator works, plus the ladder
	// (SKI-205, SKI-233, SKI-312).
	//
	// SKI-205 asks for an `/api/admin/design/*` family. Most of it was built
	// somewhere else and on purpose: a design contest is a tournament, a
	// design mission is a mission, and an entry copied into a design contest
	// is the same plagiarism case as one copied into a security contest. The
	// header below says where each of those lives, so nobody looks for a
	// tab that is deliberately on another page.

	type Tab = 'queue' | 'briefs' | 'plagiarism' | 'featured' | 'ladder';

	const TABS: Tab[] = ['queue', 'briefs', 'plagiarism', 'featured', 'ladder'];

	const TAB_LABEL_KEY: Record<Tab, string> = {
		queue: 'admin.design.tabQueue',
		briefs: 'admin.design.tabBriefs',
		plagiarism: 'admin.design.tabPlagiarism',
		featured: 'admin.design.tabFeatured',
		ladder: 'admin.design.tabLadder'
	};

	function tabFromUrl(url: URL): Tab {
		const t = url.searchParams.get('tab');
		return TABS.includes(t as Tab) ? (t as Tab) : 'queue';
	}

	let tab = $state<Tab>(tabFromUrl($page.url));

	const t = (k: string, params?: Record<string, string | number>) => i18n.t(k, params);

	// --- Review queue ---
	let slices = $state<AdminSlice[]>([]);
	let queueLoading = $state(true);
	let limit = $state(25);

	// --- Critique trail ---
	let trailSlice = $state<AdminSlice | null>(null);
	let rounds = $state<DesignReviewRound[]>([]);
	let checks = $state<DesignAutoCheck[]>([]);
	let trailLoading = $state(false);

	// --- Craft score ladder ---
	let ladder = $state<DesignTiersResponse | null>(null);
	let ladderLoading = $state(false);

	// --- Brief queue ---
	let briefs = $state<DesignBriefProposal[]>([]);
	let briefsLoading = $state(false);
	let openBrief = $state<DesignBriefProposal | null>(null);
	let briefBusy = $state(false);
	let briefToReject = $state<DesignBriefProposal | null>(null);

	// --- Plagiarism ---
	let cases = $state<PlagiarismCase[]>([]);
	let casesLoading = $state(false);
	let caseToDecide = $state<PlagiarismCase | null>(null);
	let caseUpheld = $state(true);
	let caseDecision = $state('');
	let caseBusy = $state(false);

	// --- Featured ---
	const DOMAINS: SkillDomain[] = ['code', 'design', 'game', 'security'];
	let featuredDomain = $state<SkillDomain>('design');
	let featuredNow = $state<FeaturedTalent | null>(null);
	let featuredRecent = $state<FeaturedTalent[]>([]);
	let featuredLoading = $state(false);
	let featureOpen = $state(false);
	let featureBusy = $state(false);
	let featureUserId = $state('');
	let featureWeek = $state(mondayOf(new Date()));
	let featureReason = $state('');
	let featureDeliverable = $state('');
	let card = $state<FeaturedCard | null>(null);
	let cardLoading = $state(false);

	$effect(() => {
		const current = tab;
		untrack(() => void loadTab(current));
	});

	// The featured tab reloads when the domain changes, which is the only
	// filter on this page whose change is worth a round trip on its own.
	$effect(() => {
		const d = featuredDomain;
		untrack(() => {
			if (tab === 'featured') void loadFeatured(d);
		});
	});

	async function loadTab(current: Tab) {
		switch (current) {
			case 'queue':
				return loadQueue();
			case 'briefs':
				return loadBriefs();
			case 'plagiarism':
				return loadCases();
			case 'featured':
				return loadFeatured(featuredDomain);
			case 'ladder':
				return loadLadder();
		}
	}

	function switchTab(next: Tab) {
		tab = next;
		void goto(next === 'queue' ? '/design' : `/design?tab=${next}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function loadQueue() {
		queueLoading = true;
		try {
			const res = await designApi.reviewQueue({ limit });
			slices = res.data.slices;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			queueLoading = false;
		}
	}

	async function loadLadder() {
		if (ladder) return;
		ladderLoading = true;
		try {
			const res = await designApi.tiers();
			ladder = res.data;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			ladderLoading = false;
		}
	}

	/**
	 * The trail and the automated checks together.
	 *
	 * Together because they answer one question — why does this artefact
	 * look the way it does — and reading the critiques without the checks
	 * hides the half of the story a machine wrote. The checks are advisory:
	 * a reviewer who overruled one was doing their job.
	 */
	async function openTrail(slice: AdminSlice) {
		trailSlice = slice;
		rounds = [];
		checks = [];
		trailLoading = true;
		try {
			const [trail, auto] = await Promise.allSettled([
				designApi.reviewHistory(slice.id),
				designApi.autoChecks(slice.id)
			]);
			if (trail.status === 'fulfilled') rounds = trail.value.data.rounds;
			else toast.error(errorMessage(trail.reason));
			// A slice with no check run answers with an empty list, not an
			// error — so a rejection here is a real failure and is surfaced,
			// but it must not cost the operator the critique trail.
			if (auto.status === 'fulfilled') checks = auto.value.data.checks;
		} finally {
			trailLoading = false;
		}
	}

	async function loadBriefs() {
		briefsLoading = true;
		try {
			const res = await designApi.briefQueue({ limit: 50 });
			briefs = res.data.briefs;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			briefsLoading = false;
		}
	}

	async function publishBrief(b: DesignBriefProposal) {
		briefBusy = true;
		try {
			await designApi.publishBrief(b.id);
			toast.success(t('admin.design.briefs.published'));
			openBrief = null;
			await loadBriefs();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			briefBusy = false;
		}
	}

	async function rejectBrief(feedback: string) {
		if (!briefToReject) return;
		briefBusy = true;
		try {
			await designApi.rejectBrief(briefToReject.id, feedback);
			toast.success(t('admin.design.briefs.rejected'));
			briefToReject = null;
			openBrief = null;
			await loadBriefs();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			briefBusy = false;
		}
	}

	async function loadCases() {
		casesLoading = true;
		try {
			const res = await designApi.plagiarismQueue({ limit: 50 });
			cases = res.data;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			casesLoading = false;
		}
	}

	function openDecide(c: PlagiarismCase, upheld: boolean) {
		caseToDecide = c;
		caseUpheld = upheld;
		caseDecision = '';
	}

	async function decideCase() {
		if (!caseToDecide) return;
		caseBusy = true;
		try {
			await designApi.decidePlagiarism(caseToDecide.id, caseUpheld, caseDecision.trim());
			toast.success(t('admin.design.plagiarism.decided'));
			caseToDecide = null;
			await loadCases();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			caseBusy = false;
		}
	}

	async function loadFeatured(domain: SkillDomain) {
		featuredLoading = true;
		card = null;
		try {
			const [now, recent] = await Promise.all([
				designApi.featuredThisWeek(domain),
				designApi.featuredRecent(domain, { limit: 12 })
			]);
			featuredNow = now.data.featured;
			featuredRecent = recent.data.featured;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			featuredLoading = false;
		}
	}

	async function feature() {
		featureBusy = true;
		try {
			await designApi.feature({
				skill_domain: featuredDomain,
				week_of: featureWeek,
				user_id: featureUserId.trim(),
				reason_md: featureReason.trim(),
				deliverable_id: featureDeliverable.trim() || undefined
			});
			toast.success(t('admin.design.featured.featured'));
			featureOpen = false;
			featureUserId = '';
			featureReason = '';
			featureDeliverable = '';
			await loadFeatured(featuredDomain);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			featureBusy = false;
		}
	}

	async function loadCard(f: FeaturedTalent) {
		cardLoading = true;
		try {
			const res = await designApi.featuredCard(f.skill_domain, f.week_of);
			card = res.data.card;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			cardLoading = false;
		}
	}

	async function copyCard() {
		if (!card) return;
		try {
			await navigator.clipboard.writeText(`${card.headline}\n\n${card.body}\n${card.profile_url}`);
			toast.success(t('admin.design.featured.copied'));
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	// ── Labels ───────────────────────────────────────────────────

	function verdictVariant(v: DesignReviewVerdict): 'success' | 'warning' | 'error' | 'default' {
		if (v === 'approve') return 'success';
		if (v === 'iterate') return 'warning';
		if (v === 'reject') return 'error';
		return 'default';
	}

	function checkVariant(severity: string): 'error' | 'warning' | 'default' {
		if (severity === 'error') return 'error';
		if (severity === 'warning') return 'warning';
		return 'default';
	}

	function subtypeLabel(s: string | null | undefined): string {
		if (!s) return '—';
		const key = `admin.design.subtypes.${s}`;
		const label = t(key);
		return label === key ? s : label;
	}

	function verdictLabel(v: string): string {
		const key = `admin.design.verdicts.${v}`;
		const label = t(key);
		return label === key ? v : label;
	}

	function reasonLabel(r: string | null): string {
		if (!r) return '—';
		const key = `admin.design.blockingReasons.${r}`;
		const label = t(key);
		return label === key ? r : label;
	}

	function caseStatusLabel(s: string): string {
		if (s === 'open') return t('admin.design.plagiarism.statusOpen');
		if (s === 'upheld') return t('admin.design.plagiarism.statusUpheld');
		if (s === 'dismissed') return t('admin.design.plagiarism.statusDismissed');
		return s;
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString(intlLocale());
		} catch {
			return iso;
		}
	}

	function fmtDay(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString(intlLocale());
		} catch {
			return iso;
		}
	}

	/** Days a slice has been waiting for a critique. The queue is ordered
	 *  oldest-first, so this is the column that says whether it is healthy. */
	function waitingDays(iso: string): number {
		const ms = Date.now() - new Date(iso).getTime();
		return Math.max(0, Math.floor(ms / 86_400_000));
	}

	/** Grid scores are free-form JSON so a family grid can be revised without
	 *  a migration. Rendered as flat pairs rather than parsed into a shape
	 *  this app would then have to keep in sync with `review_grids`. */
	function gridPairs(grid: Record<string, unknown> | null): [string, string][] {
		if (!grid) return [];
		return Object.entries(grid).map(([k, v]) => [
			k,
			typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
		]);
	}

	const queueColumns = $derived([
		{ key: 'title', label: t('admin.design.queue.table.slice') },
		{ key: 'subtype', label: t('admin.design.queue.table.subtype'), width: '160px' },
		{ key: 'difficulty', label: t('admin.design.queue.table.difficulty'), width: '110px' },
		{ key: 'designer', label: t('admin.design.queue.table.designer'), width: '150px' },
		{ key: 'waiting', label: t('admin.design.queue.table.waiting'), width: '150px' },
		{
			key: 'actions',
			label: t('admin.common.actions'),
			align: 'right' as const,
			width: '150px'
		}
	]);

	const queueRows = $derived(slices as unknown as Record<string, unknown>[]);

	const domainItems = $derived(
		DOMAINS.map((d) => ({ value: d, label: t(`common.domains.${d}`) }))
	);

	const caseDecisionLength = $derived(caseDecision.trim().length);
	const caseDecisionTooShort = $derived(caseDecisionLength < PLAGIARISM_DECISION_MIN);
	const featureReasonTooShort = $derived(featureReason.trim().length < FEATURED_REASON_MIN);
</script>

<svelte:head>
	<title>{t('admin.design.title')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<div class="mb-6 flex items-start gap-3">
		<Palette size={24} strokeWidth={2} class="mt-1 text-accent" />
		<div>
			<h1 class="text-2xl font-black tracking-tight">{t('admin.design.title')}</h1>
			<p class="mt-1 text-sm text-text-muted">{t('admin.design.subtitle')}</p>
		</div>
	</div>

	<p
		class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-xs text-text-muted"
	>
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.design.pendingBackendNotice')}</span>
	</p>

	<div class="mb-6">
		<SegmentedControl
			size="md"
			items={TABS.map((value) => ({ value, label: t(TAB_LABEL_KEY[value]) }))}
			value={tab}
			onchange={(v: Tab) => switchTab(v)}
		/>
	</div>

	{#if tab === 'queue'}
		<p class="mb-4 text-xs text-text-muted">{t('admin.design.queue.hint')}</p>

		<div class="mb-4 flex flex-wrap items-end gap-3">
			<Input
				label={t('admin.design.queue.limitLabel')}
				type="number"
				step="1"
				min="1"
				max="100"
				bind:value={limit as unknown as string}
				class="w-28"
			/>
			<Button variant="primary" size="sm" onclick={loadQueue} loading={queueLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{t('admin.design.queue.refreshBtn')}
			</Button>
		</div>

		{#if queueLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else}
			<Table
				columns={queueColumns}
				rows={queueRows}
				emptyLabel={t('admin.design.queue.empty')}
			>
				{#snippet cell(row, col)}
					{@const s = row as unknown as AdminSlice}
					{#if col.key === 'title'}
						<span class="text-sm font-medium text-text-primary">{s.title}</span>
						<p class="font-mono text-[10px] text-text-muted">{s.id}</p>
					{:else if col.key === 'subtype'}
						<Badge variant="design">{subtypeLabel(s.design_subtype)}</Badge>
					{:else if col.key === 'difficulty'}
						<span class="text-xs">{s.difficulty}/5</span>
					{:else if col.key === 'designer'}
						{#if s.claimed_by_user_id}
							<a
								href={`/users/${s.claimed_by_user_id}`}
								class="font-mono text-xs text-primary hover:underline"
							>
								{s.claimed_by_user_id.slice(0, 8)}…
							</a>
						{:else}
							<span class="text-text-muted">—</span>
						{/if}
					{:else if col.key === 'waiting'}
						{@const days = waitingDays(s.updated_at)}
						<Badge variant={days >= 7 ? 'error' : days >= 3 ? 'warning' : 'default'}>
							{days}
							{t('admin.design.queue.daysWaiting')}
						</Badge>
					{:else if col.key === 'actions'}
						<div class="flex justify-end">
							<Button variant="ghost" size="sm" onclick={() => openTrail(s)}>
								{t('admin.design.queue.viewTrailBtn')}
							</Button>
						</div>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{:else if tab === 'briefs'}
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<p class="max-w-3xl text-xs text-text-muted">{t('admin.design.briefs.hint')}</p>
			<Button variant="secondary" size="sm" onclick={loadBriefs} loading={briefsLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{t('admin.common.refreshBtn')}
			</Button>
		</div>

		{#if briefsLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if briefs.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.design.briefs.empty')}</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each briefs as b (b.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="design">{subtypeLabel(b.design_subtype)}</Badge>
							<Badge variant={b.format === 'contest' ? 'accent' : 'default'}>
								{b.format === 'contest'
									? t('admin.design.briefs.formatContest')
									: t('admin.design.briefs.formatIndividual')}
							</Badge>
							<span class="text-sm font-medium text-text-primary">{b.title}</span>
						</div>

						<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
							<span>
								{t('admin.design.briefs.author')}:
								{#if b.author_username}
									<a href={`/users/${b.author_username}`} class="text-primary hover:underline">
										{b.author_username}
									</a>
								{:else}
									—
								{/if}
							</span>
							{#if b.orientation_slug}
								<span>{t('admin.design.briefs.orientation')}: {b.orientation_slug}</span>
							{/if}
							<span>{t('admin.design.briefs.difficulty')}: {b.difficulty}/5</span>
							{#if b.expected_rounds}
								<span>
									{t('admin.design.briefs.expectedRounds')}: {b.expected_rounds}
								</span>
							{/if}
							{#if b.estimated_hours}
								<span>
									{t('admin.design.briefs.estimatedHours')}: {b.estimated_hours}
								</span>
							{/if}
							<span class="font-mono text-[10px]">{fmtDate(b.created_at)}</span>
						</div>

						<div class="mt-4 flex flex-wrap gap-2">
							<Button variant="ghost" size="sm" onclick={() => (openBrief = b)}>
								{t('admin.design.briefs.read')}
							</Button>
							<Button
								variant="primary"
								size="sm"
								onclick={() => publishBrief(b)}
								loading={briefBusy}
							>
								{t('admin.design.briefs.publish')}
							</Button>
							<Button variant="ghost" size="sm" onclick={() => (briefToReject = b)}>
								{t('admin.design.briefs.reject')}
							</Button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{:else if tab === 'plagiarism'}
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<p class="max-w-3xl text-xs text-text-muted">{t('admin.design.plagiarism.hint')}</p>
			<Button variant="secondary" size="sm" onclick={loadCases} loading={casesLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{t('admin.common.refreshBtn')}
			</Button>
		</div>

		{#if casesLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else if cases.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
				<p class="text-sm text-text-muted">{t('admin.design.plagiarism.empty')}</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each cases as c (c.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant={c.status === 'open' ? 'warning' : 'default'}>
								{caseStatusLabel(c.status)}
							</Badge>
							<span class="text-sm text-text-primary">
								{t('admin.design.plagiarism.accused')}:
								{#if c.accused_username}
									<a
										href={`/users/${c.accused_username}`}
										class="text-primary hover:underline"
									>
										{c.accused_username}
									</a>
								{:else}
									{t('admin.design.plagiarism.accountGone')}
								{/if}
							</span>
							<span class="text-xs text-text-muted">
								{t('admin.design.plagiarism.raisedBy')}:
								{c.raised_by_username ?? t('admin.design.plagiarism.accountGone')}
							</span>
							<span class="font-mono text-[10px] text-text-muted">{fmtDate(c.raised_at)}</span>
						</div>

						{#if c.upheld_against_accused > 0}
							<p class="mt-2 text-xs text-warning">
								{t('admin.design.plagiarism.priorUpheld', {
									n: c.upheld_against_accused
								})}
								<span class="text-text-muted">
									— {t('admin.design.plagiarism.priorHint')}
								</span>
							</p>
						{/if}

						<div class="mt-3">
							<p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
								{t('admin.design.plagiarism.reason')}
							</p>
							<p class="mt-1 whitespace-pre-wrap text-sm text-text-primary">{c.reason_md}</p>
						</div>

						<a
							href={c.evidence_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-2 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{c.evidence_url}
						</a>

						<div class="mt-3">
							<p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
								{t('admin.design.plagiarism.response')}
							</p>
							{#if c.response_md}
								<p class="mt-1 whitespace-pre-wrap text-sm text-text-primary">
									{c.response_md}
								</p>
								<p class="mt-1 font-mono text-[10px] text-text-muted">
									{fmtDate(c.responded_at)}
								</p>
							{:else}
								<p class="mt-1 text-sm text-text-muted">
									{t('admin.design.plagiarism.noResponse')}
									<span class="font-mono text-[10px]">
										({t('admin.design.plagiarism.respondBy')}
										{fmtDate(c.respond_by)})
									</span>
								</p>
							{/if}
						</div>

						{#if c.decision_md}
							<div class="mt-3 rounded-xl bg-surface-overlay p-3">
								<p class="whitespace-pre-wrap text-sm text-text-primary">{c.decision_md}</p>
								<p class="mt-1 font-mono text-[10px] text-text-muted">
									{fmtDate(c.decided_at)}
								</p>
							</div>
						{:else}
							<div class="mt-4 flex flex-wrap gap-2">
								<Button variant="danger" size="sm" onclick={() => openDecide(c, true)}>
									{t('admin.design.plagiarism.uphold')}
								</Button>
								<Button variant="secondary" size="sm" onclick={() => openDecide(c, false)}>
									{t('admin.design.plagiarism.dismiss')}
								</Button>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	{:else if tab === 'featured'}
		<p class="mb-4 max-w-3xl text-xs text-text-muted">{t('admin.design.featured.hint')}</p>

		<div class="mb-5 flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{t('admin.design.featured.domainLabel')}
				</span>
				<Select items={domainItems} bind:value={featuredDomain} shape="rounded" />
			</label>
			<Button variant="primary" size="sm" onclick={() => (featureOpen = true)}>
				<Star size={14} strokeWidth={2} />
				{t('admin.design.featured.feature')}
			</Button>
		</div>

		{#if featuredLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.design.featured.thisWeek')}
				</h2>
				{#if featuredNow}
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="accent">
							{t('admin.design.featured.weekOf')}
							{fmtDay(featuredNow.week_of)}
						</Badge>
						{#if featuredNow.username}
							<a
								href={`/users/${featuredNow.username}`}
								class="text-sm font-medium text-primary hover:underline"
							>
								{featuredNow.display_name ?? featuredNow.username}
							</a>
						{/if}
					</div>
					<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">
						{featuredNow.reason_md}
					</p>
					<div class="mt-3">
						<Button
							variant="secondary"
							size="sm"
							onclick={() => featuredNow && loadCard(featuredNow)}
							loading={cardLoading}
						>
							{t('admin.design.featured.loadCard')}
						</Button>
					</div>
				{:else}
					<p class="text-sm text-text-muted">{t('admin.design.featured.nobody')}</p>
				{/if}
			</section>

			{#if card}
				<section class="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 class="text-sm font-semibold uppercase tracking-wider text-accent">
							{t('admin.design.featured.card')}
						</h2>
						<Button variant="ghost" size="sm" onclick={copyCard}>
							{t('admin.design.featured.copy')}
						</Button>
					</div>
					<p class="mb-2 text-xs text-text-muted">{t('admin.design.featured.cardHint')}</p>
					<p class="text-base font-bold text-text-primary">{card.headline}</p>
					<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">{card.body}</p>
					<a
						href={card.profile_url}
						target="_blank"
						rel="noopener nofollow"
						class="mt-3 flex items-center gap-1 break-all text-xs text-primary hover:underline"
					>
						<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
						{t('admin.design.featured.profileUrl')}
					</a>
					{#if card.deliverable_url}
						<a
							href={card.deliverable_url}
							target="_blank"
							rel="noopener nofollow"
							class="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
						>
							<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
							{t('admin.design.featured.deliverableUrl')}
						</a>
					{/if}
				</section>
			{/if}

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.design.featured.recent')}
				</h2>
				{#if featuredRecent.length === 0}
					<p class="text-sm text-text-muted">{t('admin.design.featured.noRecent')}</p>
				{:else}
					<ul class="space-y-1.5">
						{#each featuredRecent as f (f.week_of)}
							<li class="rounded-xl bg-surface-overlay px-3 py-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-xs text-text-muted">{fmtDay(f.week_of)}</span>
									{#if f.username}
										<a
											href={`/users/${f.username}`}
											class="text-sm text-primary hover:underline"
										>
											{f.display_name ?? f.username}
										</a>
									{/if}
									<Button variant="ghost" size="sm" onclick={() => loadCard(f)}>
										{t('admin.design.featured.loadCard')}
									</Button>
								</div>
								<p class="mt-1 whitespace-pre-wrap text-xs text-text-muted">{f.reason_md}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{:else}
		<p class="mb-4 text-xs text-text-muted">{t('admin.design.ladder.hint')}</p>

		{#if ladderLoading}
			<Skeleton class="h-64 w-full" rounded="xl" />
		{:else if ladder}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="mb-3 flex flex-wrap items-center gap-2">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.design.ladder.tiersTitle')}
					</h2>
					<Badge variant="primary">
						{t('admin.design.ladder.capLabel')}: {ladder.cap}
					</Badge>
				</div>
				<ul class="flex flex-col gap-2">
					{#each ladder.tiers as tier (tier.slug)}
						<li class="rounded-xl bg-surface-overlay px-4 py-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-medium text-text-primary">{tier.name}</span>
								<code class="font-mono text-[10px] text-text-muted">{tier.slug}</code>
								<Badge variant="accent">
									{tier.min_score}{tier.max_score === null ? '+' : `–${tier.max_score}`}
								</Badge>
							</div>
							{#if tier.description}
								<p class="mt-1 text-xs text-text-muted">{tier.description}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{t('admin.design.ladder.weightsTitle')}
				</h2>
				<ul class="flex flex-col gap-2">
					{#each ladder.weights as w (w.term)}
						<li class="rounded-xl bg-surface-overlay px-4 py-3">
							<div class="flex flex-wrap items-center gap-2">
								<code class="font-mono text-xs text-text-primary">{w.term}</code>
								<Badge variant="primary">×{w.weight}</Badge>
								<Badge variant="default">{w.kind}</Badge>
							</div>
							{#if w.explanation}
								<p class="mt-1 text-xs text-text-muted">{w.explanation}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<!-- ── Critique trail + automated checks ───────────────────────── -->
<Modal
	open={trailSlice !== null}
	title={trailSlice
		? `${t('admin.design.trail.title')} — ${trailSlice.title}`
		: t('admin.design.trail.title')}
	size="xl"
	onclose={() => (trailSlice = null)}
>
	{#if trailLoading}
		<Skeleton class="h-40 w-full" rounded="xl" />
	{:else}
		<section class="mb-5">
			<h3 class="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
				{t('admin.design.checks.title')}
			</h3>
			<p class="mb-2 text-xs text-text-muted">{t('admin.design.checks.hint')}</p>
			{#if checks.length === 0}
				<p class="text-sm text-text-muted">{t('admin.design.checks.empty')}</p>
			{:else}
				<ul class="space-y-1.5">
					{#each checks as c, i (i)}
						<li class="flex flex-wrap items-center gap-2 rounded-xl bg-surface-overlay px-3 py-2">
							<Badge variant="default">
								{t('admin.design.checks.round')}
								{c.round}
							</Badge>
							<Badge variant={checkVariant(c.severity)}>{c.check_type}</Badge>
							<span class="text-xs text-text-primary">{c.message}</span>
							<span class="font-mono text-[10px] text-text-muted">{fmtDate(c.ran_at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if rounds.length === 0}
			<p class="text-sm text-text-muted">{t('admin.design.trail.empty')}</p>
		{:else}
			<ol class="flex flex-col gap-4">
				{#each rounds as r (r.round)}
					<li class="rounded-xl border border-border bg-surface-overlay p-4">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<Badge variant="default">
								{t('admin.design.trail.roundLabel')}
								{r.round}
							</Badge>
							<Badge variant={verdictVariant(r.decision)}>{verdictLabel(r.decision)}</Badge>
							{#if r.blocking_reason}
								<Badge variant="warning">{reasonLabel(r.blocking_reason)}</Badge>
							{/if}
							<span class="font-mono text-[10px] text-text-muted">{fmtDate(r.decided_at)}</span>
						</div>

						{#if r.reviewed_artifact_url}
							<a
								href={r.reviewed_artifact_url}
								target="_blank"
								rel="noopener nofollow"
								class="mb-2 flex items-center gap-1 break-all text-xs text-primary hover:underline"
							>
								<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
								{r.reviewed_artifact_url}
							</a>
						{/if}

						{#if r.reviewed_artifact_notes_md}
							<p class="mb-2 whitespace-pre-wrap text-xs text-text-muted">
								{r.reviewed_artifact_notes_md}
							</p>
						{/if}

						{#if r.reason}
							<p class="whitespace-pre-wrap text-sm text-text-primary">{r.reason}</p>
						{/if}

						{#if gridPairs(r.grid_scores).length > 0}
							<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
								{#each gridPairs(r.grid_scores) as [k, v] (k)}
									<span>{k}: <span class="font-mono text-text-primary">{v}</span></span>
								{/each}
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	{/if}

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (trailSlice = null)}>
			{t('admin.common.close')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Read a brief ────────────────────────────────────────────── -->
<Modal
	open={openBrief !== null}
	title={openBrief?.title ?? ''}
	size="xl"
	onclose={() => (openBrief = null)}
>
	{#if openBrief}
		<p class="whitespace-pre-wrap text-sm text-text-primary">{openBrief.brief_md}</p>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (openBrief = null)}>
			{t('admin.common.close')}
		</Button>
		{#if openBrief}
			<Button
				variant="primary"
				size="sm"
				onclick={() => openBrief && publishBrief(openBrief)}
				loading={briefBusy}
			>
				{t('admin.design.briefs.publish')}
			</Button>
		{/if}
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={briefToReject !== null}
	title={t('admin.design.briefs.rejectTitle')}
	description={t('admin.design.briefs.rejectHint')}
	actionLabel={t('admin.design.briefs.reject')}
	minReasonLength={BRIEF_FEEDBACK_MIN}
	loading={briefBusy}
	onconfirm={rejectBrief}
	onclose={() => (briefToReject = null)}
/>

<!-- ── Decide a plagiarism case ────────────────────────────────── -->
<Modal
	open={caseToDecide !== null}
	title={t('admin.design.plagiarism.decideTitle')}
	size="xl"
	onclose={() => (caseToDecide = null)}
>
	<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.design.plagiarism.decideHint')}</span>
	</p>

	<div class="mb-4">
		<Badge variant={caseUpheld ? 'error' : 'success'}>
			{caseUpheld
				? t('admin.design.plagiarism.uphold')
				: t('admin.design.plagiarism.dismiss')}
		</Badge>
	</div>

	<div class="flex flex-col gap-1.5">
		<label for="plagiarism-decision" class="text-sm font-medium text-text-primary">
			{t('admin.common.reason')}
		</label>
		<textarea
			id="plagiarism-decision"
			bind:value={caseDecision}
			rows="8"
			class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
		></textarea>
		<p class="text-xs {caseDecisionTooShort ? 'text-warning' : 'text-text-muted'}">
			<span class="font-mono">({caseDecisionLength}/{PLAGIARISM_DECISION_MIN})</span>
		</p>
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (caseToDecide = null)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant={caseUpheld ? 'danger' : 'primary'}
			size="sm"
			onclick={decideCase}
			loading={caseBusy}
			disabled={caseDecisionTooShort}
		>
			{t('admin.common.save')}
		</Button>
	{/snippet}
</Modal>

<!-- ── Feature somebody ────────────────────────────────────────── -->
<Modal
	open={featureOpen}
	title={t('admin.design.featured.featureTitle')}
	size="lg"
	onclose={() => (featureOpen = false)}
>
	<div class="grid gap-4 sm:grid-cols-2">
		<Input label={t('admin.design.featured.userIdLabel')} bind:value={featureUserId} />
		<Input
			label={t('admin.design.featured.weekLabel')}
			type="date"
			bind:value={featureWeek}
		/>
		<Input
			label={t('admin.design.featured.deliverableLabel')}
			bind:value={featureDeliverable}
			hint={t('admin.design.featured.deliverableHint')}
			class="sm:col-span-2"
		/>
	</div>

	<div class="mt-4 flex flex-col gap-1.5">
		<label for="feature-reason" class="text-sm font-medium text-text-primary">
			{t('admin.design.featured.reasonLabel')}
		</label>
		<textarea
			id="feature-reason"
			bind:value={featureReason}
			rows="5"
			class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
		></textarea>
		<p class="text-xs {featureReasonTooShort ? 'text-warning' : 'text-text-muted'}">
			{t('admin.design.featured.reasonHint')}
		</p>
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (featureOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={feature}
			loading={featureBusy}
			disabled={featureReasonTooShort || featureUserId.trim().length === 0}
		>
			{t('admin.design.featured.feature')}
		</Button>
	{/snippet}
</Modal>
