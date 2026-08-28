<script lang="ts">
	import { engagementApi, TIMELINE_EVENT_TYPES } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { TimelineEvent, TimelineEventType, TimelineBackfillResult } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { History, RefreshCw } from '@lucide/svelte';

	// SKI-39 — profile timeline. Read is the public endpoint (scoped by
	// profile visibility, so a hidden profile 404s even here); the backfill
	// is admin-gated and idempotent.

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	const PAGE_SIZE = 25;

	let events = $state<TimelineEvent[]>([]);
	let total = $state(0);
	let offset = $state(0);
	let filterType = $state<TimelineEventType | ''>('');
	let loading = $state(true);
	let loadingMore = $state(false);
	let unavailable = $state(false);

	let showBackfill = $state(false);
	let backfilling = $state(false);
	let lastBackfill = $state<TimelineBackfillResult | null>(null);

	// Refetch from scratch whenever the user or the type filter changes.
	// `offset` is deliberately not a dependency — paging appends instead.
	$effect(() => {
		void userId;
		void filterType;
		void reload();
	});

	async function reload() {
		loading = true;
		offset = 0;
		try {
			const res = await engagementApi.getUserTimeline(userId, {
				event_type: filterType === '' ? undefined : filterType,
				limit: PAGE_SIZE,
				offset: 0
			});
			events = res.data.events;
			total = res.data.total;
			offset = res.data.events.length;
			unavailable = false;
		} catch (e) {
			// A hidden or banned profile answers 404 — that is a state to
			// state, not an error to shout about.
			unavailable = true;
			events = [];
			total = 0;
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || events.length >= total) return;
		loadingMore = true;
		try {
			const res = await engagementApi.getUserTimeline(userId, {
				event_type: filterType === '' ? undefined : filterType,
				limit: PAGE_SIZE,
				offset
			});
			events = [...events, ...res.data.events];
			offset += res.data.events.length;
			total = res.data.total;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loadingMore = false;
		}
	}

	async function confirmBackfill() {
		if (backfilling) return;
		backfilling = true;
		try {
			const res = await engagementApi.backfillUserTimeline(userId);
			lastBackfill = res.data;
			if (res.data.rows_inserted === 0) {
				toast.info(i18n.t('admin.engagement.timeline.backfillNoopToast'));
			} else {
				toast.success(
					i18n.t('admin.engagement.timeline.backfillDoneToast', {
						count: res.data.rows_inserted
					})
				);
			}
			showBackfill = false;
			await reload();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			backfilling = false;
		}
	}

	function eventLabel(t: string): string {
		const key = `admin.engagement.timeline.events.${t}`;
		const label = i18n.t(key);
		// `t()` echoes the key back when a translation is missing — a new
		// backend event type must show its raw slug, not a dotted path.
		return label === key ? t : label;
	}

	function eventVariant(t: string): 'primary' | 'accent' | 'success' | 'default' {
		if (t === 'rank_promoted' || t === 'capability_granted') return 'accent';
		if (t === 'deliverable_verified' || t === 'attestation_received') return 'success';
		if (t === 'signup') return 'primary';
		return 'default';
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(intlLocale());
		} catch {
			return iso;
		}
	}

	/** Metadata is free-form JSONB; render it as compact key: value pairs
	 *  rather than a JSON blob nobody reads. */
	function metaPairs(meta: Record<string, unknown>): [string, string][] {
		return Object.entries(meta ?? {}).map(([k, v]) => [
			k,
			typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
		]);
	}

	const backfillRows = $derived(
		lastBackfill
			? (Object.entries(lastBackfill.detail) as [string, number][]).filter(([, n]) => n > 0)
			: []
	);
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<History size={16} strokeWidth={2} class="text-accent" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.timeline.sectionTitle')}
			</h2>
			{#if !loading && !unavailable}
				<span class="text-xs text-text-muted">
					{total}
					{i18n.t('admin.engagement.timeline.totalLabel')}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<Select
				size="sm"
				shape="rounded"
				items={[
					{ value: '', label: i18n.t('admin.engagement.timeline.filterTypeAll') },
					...TIMELINE_EVENT_TYPES.map((t) => ({ value: t, label: eventLabel(t) }))
				]}
				bind:value={filterType}
			/>
			<Button variant="secondary" size="sm" onclick={() => (showBackfill = true)}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.engagement.timeline.backfillBtn')}
			</Button>
		</div>
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.engagement.timeline.sectionHint')}
	</p>

	{#if lastBackfill}
		<div class="mb-4 rounded-xl border border-border bg-surface-overlay p-4 text-xs">
			<p class="mb-2 uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.timeline.backfillReportTitle')}
			</p>
			<p class="mb-2">
				<Badge variant={lastBackfill.rows_inserted > 0 ? 'success' : 'default'}>
					{i18n.t('admin.engagement.timeline.backfillRowsInserted')}: {lastBackfill.rows_inserted}
				</Badge>
			</p>
			{#if backfillRows.length > 0}
				<ul class="flex flex-wrap gap-2">
					{#each backfillRows as [kind, count] (kind)}
						<li class="rounded-lg bg-surface-elevated px-2 py-1 text-text-muted">
							{eventLabel(kind)}: <span class="font-mono text-text-primary">{count}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if loading}
		<Skeleton class="h-32 w-full" rounded="xl" />
	{:else if events.length === 0}
		<p class="text-sm text-text-muted">{i18n.t('admin.engagement.timeline.empty')}</p>
	{:else}
		<ol class="relative flex flex-col gap-3 border-s border-border ps-4">
			{#each events as ev (ev.id)}
				<li class="relative">
					<span
						class="absolute -start-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-accent"
						aria-hidden="true"
					></span>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant={eventVariant(ev.event_type)}>{eventLabel(ev.event_type)}</Badge>
						<span class="font-mono text-xs text-text-muted">{fmtDate(ev.event_at)}</span>
					</div>
					{#if metaPairs(ev.metadata).length > 0}
						<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
							{#each metaPairs(ev.metadata) as [k, v] (k)}
								<span>{k}: <span class="font-mono text-text-primary">{v}</span></span>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ol>

		{#if events.length < total}
			<div class="mt-4">
				<Button variant="ghost" size="sm" onclick={loadMore} loading={loadingMore}>
					{i18n.t('admin.engagement.timeline.loadMoreBtn')}
				</Button>
			</div>
		{/if}
	{/if}
</section>

<ConfirmDangerousDialog
	open={showBackfill}
	title={i18n.t('admin.engagement.timeline.backfillDialogTitle')}
	description={i18n.t('admin.engagement.timeline.backfillDialogDescription')}
	actionLabel={i18n.t('admin.engagement.timeline.backfillBtn')}
	requireReason={false}
	loading={backfilling}
	onconfirm={() => confirmBackfill()}
	onclose={() => (showBackfill = false)}
/>
