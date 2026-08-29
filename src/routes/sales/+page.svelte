<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { salesApi, isClosed } from '$api/sales';
	import type {
		RevenuePillar,
		RevenueStream,
		SalesOpportunity,
		SalesOverdueStep,
		SalesRenewal,
		SalesStage
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Table from '$components/ui/Table.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Plus } from '@lucide/svelte';

	type Tab = 'pipeline' | 'overdue' | 'renewals' | 'revenue';

	let tab = $state<Tab>('pipeline');
	let loading = $state(true);

	let opportunities = $state<SalesOpportunity[]>([]);
	let weightedValue = $state<string>('0');
	let weightedNote = $state<string>('');
	let overdue = $state<SalesOverdueStep[]>([]);
	let renewals = $state<SalesRenewal[]>([]);
	let renewalWindow = $state(90);
	let streams = $state<RevenueStream[]>([]);
	let pillars = $state<RevenuePillar[]>([]);
	let liveStreams = $state(0);
	let plannedStreams = $state(0);
	let revenueWindow = $state(365);

	let showNew = $state(false);
	let creating = $state(false);
	let orgName = $state('');
	let contactName = $state('');
	let contactEmail = $state('');
	let productType = $state('');
	let estimatedValue = $state('');
	let currency = $state('EUR');
	let expectedCloseOn = $state('');
	let newTouched = $state(false);

	/**
	 * Dates arrive in two shapes and must not be formatted the same way.
	 *
	 * `expected_close_on` and `next_step_due_on` are `DATE` columns — a day,
	 * with no time and no zone. Passing them through a timezone-aware
	 * formatter moves them across midnight for anybody east or west of the
	 * server, which on a "due today" list is the difference between overdue
	 * and not.
	 */
	function fmtDay(day: string | null): string {
		if (!day) return '—';
		const [y, m, d] = day.split('-').map(Number);
		if (!y || !m || !d) return day;
		return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	/** Shown as it arrived. See the money note in `types/business.ts`. */
	function money(amount: string | null, cur: string): string {
		return amount === null ? '—' : `${amount} ${cur}`;
	}

	function stageVariant(s: SalesStage): 'success' | 'warning' | 'error' | 'primary' | 'default' {
		if (s === 'won') return 'success';
		if (s === 'lost') return 'error';
		if (s === 'negotiation') return 'warning';
		if (s === 'proposal' || s === 'qualified') return 'primary';
		return 'default';
	}

	/** A step whose date has passed. The backend already filters the overdue
	 *  list to these, so this only decides colour on the pipeline tab. */
	function isLate(due: string | null): boolean {
		if (!due) return false;
		return due <= new Date().toISOString().slice(0, 10);
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [p, o, r, s, bp] = await Promise.all([
				salesApi.pipeline(),
				salesApi.overdue(),
				salesApi.renewals({ within_days: renewalWindow }),
				salesApi.revenueStreams({ days: revenueWindow }),
				salesApi.revenueByPillar({ days: revenueWindow })
			]);
			opportunities = p.data.opportunities;
			weightedValue = p.data.weighted_value;
			weightedNote = p.data.weighted_value_note;
			overdue = o.data.overdue;
			renewals = r.data.renewals;
			streams = s.data.streams;
			liveStreams = s.data.live_streams;
			plannedStreams = s.data.planned_streams;
			pillars = bp.data.pillars;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	async function reloadRenewals() {
		try {
			const r = await salesApi.renewals({ within_days: renewalWindow });
			renewals = r.data.renewals;
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}

	async function reloadRevenue() {
		try {
			const [s, bp] = await Promise.all([
				salesApi.revenueStreams({ days: revenueWindow }),
				salesApi.revenueByPillar({ days: revenueWindow })
			]);
			streams = s.data.streams;
			liveStreams = s.data.live_streams;
			plannedStreams = s.data.planned_streams;
			pillars = bp.data.pillars;
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}

	const orgError = $derived(
		newTouched && orgName.trim().length === 0 ? i18n.t('admin.sales.orgRequired') : null
	);
	const canCreate = $derived(!creating && orgName.trim().length > 0);

	function openNew() {
		orgName = '';
		contactName = '';
		contactEmail = '';
		productType = '';
		estimatedValue = '';
		currency = 'EUR';
		expectedCloseOn = '';
		newTouched = false;
		showNew = true;
	}

	async function create() {
		newTouched = true;
		if (!canCreate) return;
		creating = true;
		try {
			// Blank optional fields are omitted rather than sent as empty
			// strings: the backend stores what it is given, and an empty
			// contact reads as "we know there is none" instead of "nobody
			// filled it in".
			await salesApi.openOpportunity({
				org_name: orgName.trim(),
				...(contactName.trim() ? { contact_name: contactName.trim() } : {}),
				...(contactEmail.trim() ? { contact_email: contactEmail.trim() } : {}),
				...(productType.trim() ? { product_type: productType.trim() } : {}),
				...(estimatedValue.trim() ? { estimated_value: estimatedValue.trim() } : {}),
				currency: currency.trim() || 'EUR',
				...(expectedCloseOn ? { expected_close_on: expectedCloseOn } : {})
			});
			toast.success(i18n.t('admin.sales.created'));
			showNew = false;
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			creating = false;
		}
	}

	const openCount = $derived(opportunities.filter((o) => !isClosed(o.stage)).length);
	const renewingSoon = $derived(renewals.length);

	const windowItems = $derived([
		{ value: 30, label: i18n.t('admin.sales.days30') },
		{ value: 90, label: i18n.t('admin.sales.days90') },
		{ value: 180, label: i18n.t('admin.sales.days180') },
		{ value: 365, label: i18n.t('admin.sales.days365') }
	]);

	const opportunityRows = $derived(
		opportunities.map((o) => o as unknown as Record<string, unknown>)
	);
	const overdueRows = $derived(overdue.map((o) => o as unknown as Record<string, unknown>));
	const renewalRows = $derived(renewals.map((r) => r as unknown as Record<string, unknown>));
	const streamRows = $derived(streams.map((s) => s as unknown as Record<string, unknown>));
</script>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.sales.navLabel')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.sales.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				{i18n.t('admin.sales.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.sales.subtitle')}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="primary" onclick={openNew}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.sales.newBtn')}
			</Button>
			<Button variant="secondary" onclick={load} {loading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.common.refreshBtn')}
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard label={i18n.t('admin.sales.stats.open')} value={openCount} />
			<StatCard
				label={i18n.t('admin.sales.stats.weighted')}
				value={weightedValue}
				hint={weightedNote}
			/>
			<StatCard
				label={i18n.t('admin.sales.stats.overdue')}
				value={overdue.length}
				color={overdue.length > 0 ? 'warning' : 'success'}
			/>
			<StatCard label={i18n.t('admin.sales.stats.renewing')} value={renewingSoon} />
		</div>

		<div class="mb-6 flex flex-wrap items-center gap-4">
			<SegmentedControl
				items={[
					{ value: 'pipeline', label: i18n.t('admin.sales.tabs.pipeline') },
					{ value: 'overdue', label: i18n.t('admin.sales.tabs.overdue') },
					{ value: 'renewals', label: i18n.t('admin.sales.tabs.renewals') },
					{ value: 'revenue', label: i18n.t('admin.sales.tabs.revenue') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'pipeline'}
			<Table
				columns={[
					{ key: 'org', label: i18n.t('admin.sales.cols.org') },
					{ key: 'contact', label: i18n.t('admin.sales.cols.contact'), width: '22%' },
					{ key: 'stage', label: i18n.t('admin.sales.cols.stage'), width: '14%' },
					{
						key: 'value',
						label: i18n.t('admin.sales.cols.value'),
						align: 'right',
						width: '14%'
					},
					{ key: 'close', label: i18n.t('admin.sales.cols.close'), align: 'right', width: '16%' }
				]}
				rows={opportunityRows}
				emptyLabel={i18n.t('admin.sales.emptyPipeline')}
			>
				{#snippet cell(row, col)}
					{@const o = row as unknown as SalesOpportunity}
					{#if col.key === 'org'}
						<a
							href="/sales/{o.id}"
							class="text-sm font-medium text-text-primary hover:text-primary"
						>
							{o.org_name}
						</a>
						{#if o.product_type}
							<span class="ms-2 text-[11px] text-text-muted">{o.product_type}</span>
						{/if}
					{:else if col.key === 'contact'}
						{#if o.contact_name || o.contact_email}
							<span class="text-xs text-text-muted">
								{o.contact_name ?? ''}{o.contact_name && o.contact_email ? ' · ' : ''}{o.contact_email ??
									''}
							</span>
						{:else}
							<span class="text-xs text-text-muted">—</span>
						{/if}
					{:else if col.key === 'stage'}
						<Badge variant={stageVariant(o.stage)} size="sm">
							{i18n.t(`admin.sales.stages.${o.stage}`)}
						</Badge>
						{#if o.stage === 'lost' && o.lost_reason}
							<p class="mt-1 text-[10px] text-text-muted">{o.lost_reason}</p>
						{/if}
					{:else if col.key === 'value'}
						<span class="font-mono text-sm">{money(o.estimated_value, o.currency)}</span>
					{:else if col.key === 'close'}
						<span class="text-xs {isLate(o.expected_close_on) && !isClosed(o.stage) ? 'text-warning' : 'text-text-muted'}">
							{fmtDay(o.expected_close_on)}
						</span>
					{/if}
				{/snippet}
			</Table>
		{:else if tab === 'overdue'}
			<Table
				columns={[
					{ key: 'org', label: i18n.t('admin.sales.cols.org'), width: '26%' },
					{ key: 'step', label: i18n.t('admin.sales.cols.step') },
					{ key: 'due', label: i18n.t('admin.sales.cols.due'), align: 'right', width: '18%' }
				]}
				rows={overdueRows}
				emptyLabel={i18n.t('admin.sales.emptyOverdue')}
			>
				{#snippet cell(row, col)}
					{@const s = row as unknown as SalesOverdueStep}
					{#if col.key === 'org'}
						<a
							href="/sales/{s.opportunity_id}"
							class="text-sm font-medium text-text-primary hover:text-primary"
						>
							{s.org_name}
						</a>
					{:else if col.key === 'step'}
						<span class="text-sm">{s.next_step ?? '—'}</span>
					{:else if col.key === 'due'}
						<span class="text-xs text-warning">{fmtDay(s.due_on)}</span>
					{/if}
				{/snippet}
			</Table>
		{:else if tab === 'renewals'}
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span class="text-xs font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.sales.windowLabel')}
				</span>
				<SegmentedControl
					items={windowItems}
					bind:value={renewalWindow}
					onchange={reloadRenewals}
				/>
			</div>
			<Table
				columns={[
					{ key: 'product', label: i18n.t('admin.sales.cols.product') },
					{
						key: 'value',
						label: i18n.t('admin.sales.cols.value'),
						align: 'right',
						width: '18%'
					},
					{ key: 'renews', label: i18n.t('admin.sales.cols.renews'), align: 'right', width: '20%' }
				]}
				rows={renewalRows}
				emptyLabel={i18n.t('admin.sales.emptyRenewals')}
			>
				{#snippet cell(row, col)}
					{@const r = row as unknown as SalesRenewal}
					{#if col.key === 'product'}
						<span class="text-sm">{r.product}</span>
						{#if r.enterprise_id}
							<a
								href="/sales/enterprises/{r.enterprise_id}"
								class="ms-2 font-mono text-[10px] text-text-muted hover:text-primary"
							>
								{r.enterprise_id.slice(0, 8)}
							</a>
						{:else}
							<span class="ms-2 text-[10px] text-text-muted">
								{i18n.t('admin.sales.notLinked')}
							</span>
						{/if}
					{:else if col.key === 'value'}
						<span class="font-mono text-sm">{money(r.value, r.currency)}</span>
					{:else if col.key === 'renews'}
						<span class="text-xs text-text-muted">{fmtMoment(r.renews_at)}</span>
					{/if}
				{/snippet}
			</Table>
		{:else}
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<span class="text-xs font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.sales.revenueWindow')}
				</span>
				<SegmentedControl items={windowItems} bind:value={revenueWindow} onchange={reloadRevenue} />
			</div>

			<div class="mb-6 grid grid-cols-2 gap-3">
				<StatCard
					label={i18n.t('admin.sales.liveStreams')}
					value={liveStreams}
					color={liveStreams > 0 ? 'success' : 'default'}
				/>
				<StatCard
					label={i18n.t('admin.sales.plannedStreams')}
					value={plannedStreams}
					hint={i18n.t('admin.sales.plannedHint')}
				/>
			</div>

			{#if pillars.length > 0}
				<section class="mb-8 rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.sales.byPillar')}
					</h2>
					<ul class="divide-y divide-border">
						{#each pillars as p (p.pillar)}
							<li class="flex items-center justify-between gap-3 py-2 text-sm">
								<span>{p.pillar}</span>
								<span class="text-end">
									<span class="font-bold text-primary">{p.total}</span>
									<span class="ms-2 text-[11px] text-text-muted">
										{i18n.t('admin.sales.recurringOnly')} {p.recurring}
									</span>
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<Table
				columns={[
					{ key: 'stream', label: i18n.t('admin.sales.cols.stream') },
					{ key: 'pillar', label: i18n.t('admin.sales.cols.pillar'), width: '18%' },
					{
						key: 'amount',
						label: i18n.t('admin.sales.cols.amount'),
						align: 'right',
						width: '16%'
					},
					{
						key: 'entries',
						label: i18n.t('admin.sales.cols.entries'),
						align: 'right',
						width: '12%'
					}
				]}
				rows={streamRows}
				emptyLabel={i18n.t('admin.sales.emptyStreams')}
			>
				{#snippet cell(row, col)}
					{@const s = row as unknown as RevenueStream}
					{#if col.key === 'stream'}
						<span class="text-sm">{s.label}</span>
						<Badge variant={s.is_live ? 'success' : 'default'} size="sm">
							{s.is_live ? i18n.t('admin.sales.live') : i18n.t('admin.sales.planned')}
						</Badge>
						{#if s.recurring}
							<span class="ms-2 text-[10px] text-text-muted">
								{i18n.t('admin.sales.cols.recurring')}
							</span>
						{/if}
						<p class="mt-1 text-[11px] text-text-muted">{s.description}</p>
					{:else if col.key === 'pillar'}
						<span class="text-xs text-text-muted">{s.pillar}</span>
					{:else if col.key === 'amount'}
						<span class="font-mono text-sm">{s.amount}</span>
					{:else if col.key === 'entries'}
						<span class="font-mono text-xs text-text-muted">{s.entries}</span>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{/if}
</div>

<Modal
	open={showNew}
	title={i18n.t('admin.sales.newDialogTitle')}
	onclose={() => (showNew = false)}
	size="md"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.sales.orgLabel')}
			hint={i18n.t('admin.sales.orgHint')}
			bind:value={orgName}
			oninput={() => (newTouched = true)}
			error={orgError ?? undefined}
			data-testid="sales-org"
		/>
		<div class="grid gap-4 sm:grid-cols-2">
			<Input label={i18n.t('admin.sales.contactNameLabel')} bind:value={contactName} />
			<Input label={i18n.t('admin.sales.contactEmailLabel')} bind:value={contactEmail} />
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<Input label={i18n.t('admin.sales.productLabel')} bind:value={productType} />
			<Input label={i18n.t('admin.sales.valueLabel')} bind:value={estimatedValue} />
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<Input label={i18n.t('admin.sales.currencyLabel')} bind:value={currency} />
			<div class="flex flex-col gap-1.5">
				<label for="sales-close" class="text-sm font-medium text-text-primary">
					{i18n.t('admin.sales.closeOnLabel')}
				</label>
				<input
					id="sales-close"
					type="date"
					bind:value={expectedCloseOn}
					class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
				/>
			</div>
		</div>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showNew = false)} disabled={creating}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={create}
			disabled={!canCreate}
			loading={creating}
			data-testid="sales-create"
		>
			{i18n.t('admin.sales.createBtn')}
		</Button>
	{/snippet}
</Modal>
