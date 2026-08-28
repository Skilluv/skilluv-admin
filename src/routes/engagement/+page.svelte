<script lang="ts">
	import { untrack } from 'svelte';
	import { engagementApi, TALENT_OFFER_TYPES } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type {
		CohortListEntry,
		CohortMember,
		CohortMilestone,
		TalentOfferListing,
		TalentOfferType
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import { GraduationCap, RefreshCw, Info, Users, Flag } from '@lucide/svelte';

	// SKI-40 (cohorts) + SKI-45 (reverse marketplace).
	//
	// Both surfaces are read-only here, and deliberately so: the backend
	// exposes no admin override for either. A cohort is edited by its
	// organizer, an offer by its author. What an operator gets is what a
	// visitor gets — which is enough to answer "what is happening on the
	// platform" without inventing powers the API does not grant.

	type Tab = 'cohorts' | 'offers';
	let tab = $state<Tab>('cohorts');

	const PAGE_SIZE = 25;

	// --- Cohorts ---
	let cohorts = $state<CohortListEntry[]>([]);
	let cohortsLoading = $state(true);
	let cohortOrientation = $state('');
	let cohortWindow = $state<'all' | 'upcoming'>('all');
	let cohortOffset = $state(0);

	let detailId = $state<string | null>(null);
	let detailEntry = $state<CohortListEntry | null>(null);
	let detailMembers = $state<CohortMember[]>([]);
	let detailMilestones = $state<CohortMilestone[]>([]);
	let detailLoading = $state(false);

	// --- Talent offers ---
	let offers = $state<TalentOfferListing[]>([]);
	let offersLoading = $state(true);
	let offerType = $state<TalentOfferType | ''>('');
	let offerSkill = $state('');
	let offerPrice = $state<'all' | 'free'>('all');
	let offerOffset = $state(0);

	// Only the tab switch triggers a fetch. Without `untrack`, every filter
	// the loaders read would become a dependency and a text input would fire
	// one request per keystroke — the filters are applied by their own
	// handlers instead.
	$effect(() => {
		const current = tab;
		untrack(() => {
			if (current === 'cohorts') void loadCohorts();
			else void loadOffers();
		});
	});

	async function loadCohorts() {
		cohortsLoading = true;
		try {
			const res = await engagementApi.listCohorts({
				orientation: cohortOrientation.trim() || undefined,
				upcoming_only: cohortWindow === 'upcoming' ? true : undefined,
				limit: PAGE_SIZE,
				offset: cohortOffset
			});
			cohorts = res.data.cohorts;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			cohortsLoading = false;
		}
	}

	async function loadOffers() {
		offersLoading = true;
		try {
			const res = await engagementApi.browseTalentOffers({
				offer_type: offerType === '' ? undefined : offerType,
				skill: offerSkill.trim() || undefined,
				free_only: offerPrice === 'free' ? true : undefined,
				limit: PAGE_SIZE,
				offset: offerOffset
			});
			offers = res.data.offers;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			offersLoading = false;
		}
	}

	async function openDetail(entry: CohortListEntry) {
		detailId = entry.cohort.id;
		detailEntry = entry;
		detailMembers = [];
		detailMilestones = [];
		detailLoading = true;
		try {
			// Members and milestones are independent reads; the cohort itself
			// is already in hand from the listing, so it is not refetched.
			const [members, milestones] = await Promise.all([
				engagementApi.getCohortMembers(entry.cohort.id),
				engagementApi.getCohortMilestones(entry.cohort.id)
			]);
			detailMembers = members.data.members;
			detailMilestones = milestones.data.milestones;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		detailId = null;
		detailEntry = null;
	}

	function resetCohortPaging() {
		cohortOffset = 0;
		void loadCohorts();
	}

	function resetOfferPaging() {
		offerOffset = 0;
		void loadOffers();
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

	/** Prices are stored in cents of the platform currency. Rendered with the
	 *  locale's own grouping so a four-digit hourly rate stays readable. */
	function fmtPrice(cents: number | null): string {
		if (cents === null) return i18n.t('admin.engagement.talentOffers.free');
		const amount = cents / 100;
		return `${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${i18n.t('admin.engagement.talentOffers.perHour')}`;
	}

	function offerTypeLabel(t: string): string {
		const key = `admin.engagement.talentOffers.types.${t}`;
		const label = i18n.t(key);
		return label === key ? t : label;
	}

	const cohortColumns = [
		{ key: 'name', label: i18n.t('admin.engagement.cohorts.table.name') },
		{ key: 'orientation', label: i18n.t('admin.engagement.cohorts.table.orientation'), width: '160px' },
		{ key: 'window', label: i18n.t('admin.engagement.cohorts.table.window'), width: '200px' },
		{ key: 'members', label: i18n.t('admin.engagement.cohorts.table.members'), width: '150px' },
		{ key: 'status', label: i18n.t('admin.engagement.cohorts.table.status'), width: '120px' }
	];

	const offerColumns = [
		{ key: 'talent', label: i18n.t('admin.engagement.talentOffers.table.talent') },
		{ key: 'type', label: i18n.t('admin.engagement.talentOffers.table.type'), width: '160px' },
		{ key: 'skill', label: i18n.t('admin.engagement.talentOffers.table.skill'), width: '150px' },
		{ key: 'availability', label: i18n.t('admin.engagement.talentOffers.table.availability'), width: '120px' },
		{ key: 'price', label: i18n.t('admin.engagement.talentOffers.table.price'), width: '140px' },
		{ key: 'created', label: i18n.t('admin.engagement.talentOffers.table.created'), width: '140px' }
	];

	const cohortRows = $derived(cohorts as unknown as Record<string, unknown>[]);
	const offerRows = $derived(offers as unknown as Record<string, unknown>[]);
</script>

<svelte:head>
	<title>{i18n.t('admin.engagement.cohorts.title')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<div class="mb-6 flex items-start gap-3">
		<GraduationCap size={24} strokeWidth={2} class="mt-1 text-accent" />
		<div>
			<h1 class="text-2xl font-black tracking-tight">
				{i18n.t('admin.engagement.cohorts.title')}
			</h1>
			<p class="mt-1 text-sm text-text-muted">
				{i18n.t('admin.engagement.cohorts.subtitle')}
			</p>
		</div>
	</div>

	<div class="mb-6">
		<SegmentedControl
			size="md"
			items={[
				{ value: 'cohorts', label: i18n.t('admin.engagement.cohorts.tabCohorts') },
				{ value: 'offers', label: i18n.t('admin.engagement.cohorts.tabTalentOffers') }
			]}
			bind:value={tab}
		/>
	</div>

	{#if tab === 'cohorts'}
		<p
			class="mb-4 flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-xs text-info"
		>
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.engagement.cohorts.privateHint')}</span>
		</p>

		<div class="mb-4 flex flex-wrap items-end gap-3">
			<Input
				label={i18n.t('admin.engagement.cohorts.filterOrientation')}
				placeholder={i18n.t('admin.engagement.cohorts.filterOrientationPlaceholder')}
				bind:value={cohortOrientation}
				onblur={resetCohortPaging}
				class="w-56 font-mono"
			/>
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.engagement.cohorts.filterWindow')}
				</span>
				<Select
					items={[
						{ value: 'all', label: i18n.t('admin.engagement.cohorts.filterWindowAll') },
						{ value: 'upcoming', label: i18n.t('admin.engagement.cohorts.filterWindowUpcoming') }
					]}
					bind:value={cohortWindow}
					onchange={resetCohortPaging}
					shape="rounded"
				/>
			</div>
			<Button variant="primary" size="sm" onclick={resetCohortPaging} loading={cohortsLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.engagement.common.refreshBtn')}
			</Button>
		</div>

		{#if cohortsLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else}
			<Table
				columns={cohortColumns}
				rows={cohortRows}
				emptyLabel={i18n.t('admin.engagement.cohorts.empty')}
			>
				{#snippet cell(row, col)}
					{@const e = row as unknown as CohortListEntry}
					{#if col.key === 'name'}
						<button
							type="button"
							onclick={() => openDetail(e)}
							class="text-start text-sm font-medium text-primary hover:underline"
						>
							{e.cohort.name}
						</button>
						<p class="font-mono text-[10px] text-text-muted">{e.cohort.slug}</p>
					{:else if col.key === 'orientation'}
						{#if e.orientation_slug}
							<code class="font-mono text-xs text-text-muted">{e.orientation_slug}</code>
						{:else}
							<span class="text-text-muted">—</span>
						{/if}
					{:else if col.key === 'window'}
						<span class="text-xs text-text-muted">
							{fmtDate(e.cohort.starts_at)} → {fmtDate(e.cohort.ends_at)}
						</span>
					{:else if col.key === 'members'}
						<span class="text-xs">
							{e.member_count} / {e.cohort.max_members}
						</span>
						<span class="ms-1 text-xs text-text-muted">
							({e.seats_left} {i18n.t('admin.engagement.cohorts.seatsLeft')})
						</span>
					{:else if col.key === 'status'}
						{#if e.cohort.archived_at}
							<Badge variant="default">{i18n.t('admin.engagement.cohorts.archivedBadge')}</Badge>
						{:else}
							<Badge variant="success">{i18n.t('admin.engagement.cohorts.activeBadge')}</Badge>
						{/if}
					{/if}
				{/snippet}
			</Table>

			<div class="mt-4 flex items-center justify-between">
				<Button
					variant="ghost"
					size="sm"
					disabled={cohortOffset === 0}
					onclick={() => {
						cohortOffset = Math.max(0, cohortOffset - PAGE_SIZE);
						void loadCohorts();
					}}
				>
					{i18n.t('admin.engagement.common.prevPage')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={cohorts.length < PAGE_SIZE}
					onclick={() => {
						cohortOffset += PAGE_SIZE;
						void loadCohorts();
					}}
				>
					{i18n.t('admin.engagement.common.nextPage')}
				</Button>
			</div>
		{/if}
	{:else}
		<p
			class="mb-4 flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-xs text-info"
		>
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.engagement.talentOffers.hint')}</span>
		</p>

		<div class="mb-4 flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.engagement.talentOffers.filterType')}
				</span>
				<Select
					items={[
						{ value: '', label: i18n.t('admin.engagement.talentOffers.filterTypeAll') },
						...TALENT_OFFER_TYPES.map((t) => ({ value: t, label: offerTypeLabel(t) }))
					]}
					bind:value={offerType}
					onchange={resetOfferPaging}
					shape="rounded"
				/>
			</div>
			<Input
				label={i18n.t('admin.engagement.talentOffers.filterSkill')}
				placeholder={i18n.t('admin.engagement.talentOffers.filterSkillPlaceholder')}
				bind:value={offerSkill}
				onblur={resetOfferPaging}
				class="w-56 font-mono"
			/>
			<div class="flex flex-col gap-1.5">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.engagement.talentOffers.filterPrice')}
				</span>
				<Select
					items={[
						{ value: 'all', label: i18n.t('admin.engagement.talentOffers.filterPriceAll') },
						{ value: 'free', label: i18n.t('admin.engagement.talentOffers.filterPriceFree') }
					]}
					bind:value={offerPrice}
					onchange={resetOfferPaging}
					shape="rounded"
				/>
			</div>
			<Button variant="primary" size="sm" onclick={resetOfferPaging} loading={offersLoading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.engagement.common.refreshBtn')}
			</Button>
		</div>

		{#if offersLoading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else}
			<Table
				columns={offerColumns}
				rows={offerRows}
				emptyLabel={i18n.t('admin.engagement.talentOffers.empty')}
			>
				{#snippet cell(row, col)}
					{@const o = row as unknown as TalentOfferListing}
					{#if col.key === 'talent'}
						<a href={`/users/${o.user_id}`} class="text-sm text-primary hover:underline">
							{o.display_name}
						</a>
						<p class="font-mono text-[10px] text-text-muted">@{o.username} · {o.rank}</p>
					{:else if col.key === 'type'}
						<Badge variant="primary">{offerTypeLabel(o.offer_type)}</Badge>
					{:else if col.key === 'skill'}
						{#if o.skill_slug}
							<code class="font-mono text-xs text-text-muted">{o.skill_slug}</code>
						{:else}
							<span class="text-text-muted">—</span>
						{/if}
					{:else if col.key === 'availability'}
						<span class="text-xs">
							{o.availability_hours} {i18n.t('admin.engagement.talentOffers.hoursPerWeek')}
						</span>
					{:else if col.key === 'price'}
						<Badge variant={o.price_cents_per_hour === null ? 'success' : 'accent'}>
							{fmtPrice(o.price_cents_per_hour)}
						</Badge>
					{:else if col.key === 'created'}
						<span class="text-xs text-text-muted">{fmtDate(o.created_at)}</span>
					{/if}
				{/snippet}
			</Table>

			<div class="mt-4 flex items-center justify-between">
				<Button
					variant="ghost"
					size="sm"
					disabled={offerOffset === 0}
					onclick={() => {
						offerOffset = Math.max(0, offerOffset - PAGE_SIZE);
						void loadOffers();
					}}
				>
					{i18n.t('admin.engagement.common.prevPage')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={offers.length < PAGE_SIZE}
					onclick={() => {
						offerOffset += PAGE_SIZE;
						void loadOffers();
					}}
				>
					{i18n.t('admin.engagement.common.nextPage')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<Modal
	open={detailId !== null}
	title={detailEntry
		? `${i18n.t('admin.engagement.cohorts.detailTitle')} — ${detailEntry.cohort.name}`
		: i18n.t('admin.engagement.cohorts.detailTitle')}
	size="xl"
	onclose={closeDetail}
>
	{#if detailEntry}
		<div class="flex flex-col gap-5">
			<div class="flex flex-wrap gap-2">
				<Badge variant="primary">{detailEntry.cohort.slug}</Badge>
				{#if detailEntry.orientation_slug}
					<Badge variant="default">{detailEntry.orientation_slug}</Badge>
				{/if}
				<Badge variant={detailEntry.cohort.archived_at ? 'default' : 'success'}>
					{detailEntry.cohort.archived_at
						? i18n.t('admin.engagement.cohorts.archivedBadge')
						: i18n.t('admin.engagement.cohorts.activeBadge')}
				</Badge>
				{#if detailEntry.cohort.is_public}
					<Badge variant="accent">{i18n.t('admin.engagement.cohorts.publicBadge')}</Badge>
				{/if}
			</div>

			{#if detailEntry.cohort.description}
				<p class="whitespace-pre-wrap text-sm text-text-muted">
					{detailEntry.cohort.description}
				</p>
			{/if}

			<p class="text-xs text-text-muted">
				{fmtDate(detailEntry.cohort.starts_at)} → {fmtDate(detailEntry.cohort.ends_at)} ·
				{detailEntry.member_count} / {detailEntry.cohort.max_members}
			</p>

			{#if detailLoading}
				<Skeleton class="h-32 w-full" rounded="xl" />
			{:else}
				<div>
					<h3 class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
						<Users size={13} strokeWidth={2} />
						{i18n.t('admin.engagement.cohorts.membersTitle')} ({detailMembers.length})
					</h3>
					{#if detailMembers.length === 0}
						<p class="text-sm text-text-muted">
							{i18n.t('admin.engagement.cohorts.membersEmpty')}
						</p>
					{:else}
						<ul class="flex flex-col gap-1.5">
							{#each detailMembers as m (m.user_id)}
								<li class="flex flex-wrap items-center gap-2 rounded-lg bg-surface-overlay px-3 py-2">
									<a href={`/users/${m.user_id}`} class="text-sm text-primary hover:underline">
										{m.display_name}
									</a>
									<Badge variant={m.role === 'organizer' ? 'accent' : 'default'}>
										{m.role === 'organizer'
											? i18n.t('admin.engagement.cohorts.roleOrganizer')
											: i18n.t('admin.engagement.cohorts.roleMember')}
									</Badge>
									<span class="text-xs text-text-muted">
										{i18n.t('admin.engagement.cohorts.joinedAt')} {fmtDate(m.joined_at)}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div>
					<h3 class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
						<Flag size={13} strokeWidth={2} />
						{i18n.t('admin.engagement.cohorts.milestonesTitle')} ({detailMilestones.length})
					</h3>
					{#if detailMilestones.length === 0}
						<p class="text-sm text-text-muted">
							{i18n.t('admin.engagement.cohorts.milestonesEmpty')}
						</p>
					{:else}
						<ul class="flex flex-col gap-1.5">
							{#each detailMilestones as ms (ms.id)}
								<li class="rounded-lg bg-surface-overlay px-3 py-2">
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-sm text-text-primary">{ms.title}</span>
										<span class="text-xs text-text-muted">
											{i18n.t('admin.engagement.cohorts.targetDate')}: {ms.target_date}
										</span>
									</div>
									{#if ms.description}
										<p class="mt-1 text-xs text-text-muted">{ms.description}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={closeDetail}>
			{i18n.t('admin.engagement.cohorts.closeDetail')}
		</Button>
	{/snippet}
</Modal>
