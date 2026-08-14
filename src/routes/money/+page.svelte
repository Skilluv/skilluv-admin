<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import {
		moneyApi,
		type MoneyOverview,
		type PaymentRow,
		type PayoutRow,
		type RouteRow,
		type MethodRow
	} from '$api/money';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Table from '$components/ui/Table.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, AlertTriangle } from '@lucide/svelte';

	type Tab = 'payments' | 'payouts' | 'routes' | 'methods';

	let tab = $state<Tab>('payments');
	let loading = $state(true);
	let overview = $state<MoneyOverview | null>(null);
	let payments = $state<PaymentRow[]>([]);
	let payouts = $state<PayoutRow[]>([]);
	let routes = $state<RouteRow[]>([]);
	let methods = $state<MethodRow[]>([]);
	let toggling = $state<string | null>(null);
	let undeliveredOnly = $state(false);

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString(intlLocale(), {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}

	/**
	 * Amounts arrive as decimal strings and are shown as they arrived.
	 *
	 * Intl.NumberFormat would mean parsing them into a float first, and a
	 * screen an operator reconciles against is the last place to introduce
	 * a rounding difference.
	 */
	function money(amount: string, currency: string): string {
		return `${amount} ${currency}`;
	}

	function statusVariant(s: string): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'succeeded' || s === 'paid') return 'success';
		if (s === 'pending' || s === 'processing') return 'warning';
		if (s === 'failed') return 'error';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [o, p, po, r, m] = await Promise.all([
				moneyApi.overview(),
				moneyApi.payments(undeliveredOnly ? { undelivered: true } : undefined),
				moneyApi.payouts(),
				moneyApi.routes(),
				moneyApi.methods()
			]);
			overview = o.data;
			payments = p.data.payments;
			payouts = po.data.payouts;
			routes = r.data.routes;
			methods = m.data.methods;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	async function toggleRoute(row: RouteRow) {
		toggling = row.id;
		try {
			await moneyApi.toggleRoute(row.id, !row.enabled, row.direction);
			row.enabled = !row.enabled;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			toggling = null;
		}
	}

	async function toggleMethod(row: MethodRow) {
		toggling = row.id;
		try {
			await moneyApi.toggleMethod(row.id, !row.enabled);
			row.enabled = !row.enabled;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			toggling = null;
		}
	}

	const paymentRows = $derived(payments.map((p) => p as unknown as Record<string, unknown>));
	const payoutRows = $derived(payouts.map((p) => p as unknown as Record<string, unknown>));
	const routeRows = $derived(routes.map((r) => r as unknown as Record<string, unknown>));
	const methodRows = $derived(methods.map((m) => m as unknown as Record<string, unknown>));
</script>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.money')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.money.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				{i18n.t('admin.money.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.money.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		{#if overview}
			<!-- Every one of these should be zero or near it. They are shown
			     together because an operator opening this page is asking one
			     question: is anything stuck. -->
			<div class="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard
					label={i18n.t('admin.money.stats.undelivered')}
					value={overview.paid_but_undelivered}
					color={overview.paid_but_undelivered > 0 ? 'error' : 'success'}
					hint={i18n.t('admin.money.stats.undeliveredHint')}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.drift')}
					value={overview.ledger_snapshot_drift}
					color={overview.ledger_snapshot_drift > 0 ? 'error' : 'success'}
					hint={i18n.t('admin.money.stats.driftHint')}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.paymentsPending')}
					value={overview.payments_pending}
					color={overview.payments_pending > 0 ? 'warning' : 'default'}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.payoutsPending')}
					value={overview.payouts_pending}
					color={overview.payouts_pending > 0 ? 'warning' : 'default'}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.payoutsFailed')}
					value={overview.payouts_failed_today}
					color={overview.payouts_failed_today > 0 ? 'error' : 'default'}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.disputes')}
					value={overview.disputes_awaiting_decision}
					color={overview.disputes_awaiting_decision > 0 ? 'warning' : 'default'}
				/>
				<StatCard
					label={i18n.t('admin.money.stats.notifications')}
					value={overview.notifications_abandoned}
					color={overview.notifications_abandoned > 0 ? 'warning' : 'default'}
				/>
			</div>

			<section class="mb-10 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.money.positions')}
				</h2>
				{#if overview.provider_positions.length === 0}
					<p class="text-sm text-text-muted">{i18n.t('admin.money.noPositions')}</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each overview.provider_positions as pos (pos.account_code + pos.currency)}
							<li class="flex items-center justify-between py-2 text-sm">
								<span class="font-mono text-xs text-text-muted">{pos.account_code}</span>
								<span class="font-bold text-primary">{money(pos.balance, pos.currency)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<div class="mb-6 flex flex-wrap items-center gap-4">
			<SegmentedControl
				items={[
					{ value: 'payments', label: i18n.t('admin.money.tabs.payments') },
					{ value: 'payouts', label: i18n.t('admin.money.tabs.payouts') },
					{ value: 'routes', label: i18n.t('admin.money.tabs.routes') },
					{ value: 'methods', label: i18n.t('admin.money.tabs.methods') }
				]}
				bind:value={tab}
			/>
			{#if tab === 'payments'}
				<label class="flex items-center gap-2 text-xs text-text-muted">
					<input
						type="checkbox"
						bind:checked={undeliveredOnly}
						onchange={load}
						data-testid="undelivered-filter"
						class="h-4 w-4 rounded"
					/>
					{i18n.t('admin.money.stats.undelivered')}
				</label>
			{/if}
		</div>

		{#if tab === 'payments'}
			<Table
				columns={[
					{ key: 'subject', label: i18n.t('admin.money.cols.subject') },
					{ key: 'amount', label: i18n.t('admin.money.cols.amount'), align: 'right', width: '14%' },
					{ key: 'route', label: i18n.t('admin.money.cols.route'), width: '16%' },
					{ key: 'status', label: i18n.t('admin.money.cols.status'), width: '14%' },
					{ key: 'refs', label: i18n.t('admin.money.cols.refs'), width: '22%' },
					{ key: 'when', label: i18n.t('admin.money.cols.when'), align: 'right', width: '14%' }
				]}
				rows={paymentRows}
				emptyLabel={i18n.t('admin.money.emptyPayments')}
			>
				{#snippet cell(row, col)}
					{@const p = row as unknown as PaymentRow}
					{#if col.key === 'subject'}
						<span class="text-sm">{p.subject_type}</span>
						<code class="ms-2 font-mono text-[10px] text-text-muted">{p.subject_id}</code>
					{:else if col.key === 'amount'}
						<span class="font-mono text-sm">{money(p.amount, p.currency)}</span>
					{:else if col.key === 'route'}
						<span class="text-xs text-text-muted">
							{p.provider} · {p.operator ?? p.method}
						</span>
					{:else if col.key === 'status'}
						<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
						{#if p.status === 'succeeded' && !p.fulfilled_at}
							<!-- Money taken and nothing given. The customer is the
							     only person who currently knows. -->
							<span
								class="ms-1 inline-flex items-center gap-1 text-[10px] text-error"
								data-testid="undelivered-flag"
							>
								<AlertTriangle size={11} strokeWidth={2} />
								{i18n.t('admin.money.undelivered')}
							</span>
						{/if}
						{#if p.failure_reason}
							<p class="mt-1 text-[10px] text-text-muted">{p.failure_reason}</p>
						{/if}
					{:else if col.key === 'refs'}
						<p class="truncate font-mono text-[10px] text-text-muted">
							{p.provider_reference ?? '—'}
						</p>
						<p class="truncate font-mono text-[10px] text-text-muted/70">
							{p.merchant_reference ?? '—'}
						</p>
					{:else if col.key === 'when'}
						<span class="text-xs text-text-muted">{fmtDate(p.created_at)}</span>
					{/if}
				{/snippet}
			</Table>
		{:else if tab === 'payouts'}
			<Table
				columns={[
					{ key: 'user', label: i18n.t('admin.money.cols.user') },
					{ key: 'amount', label: i18n.t('admin.money.cols.amount'), align: 'right', width: '14%' },
					{ key: 'route', label: i18n.t('admin.money.cols.route'), width: '18%' },
					{ key: 'status', label: i18n.t('admin.money.cols.status'), width: '16%' },
					{ key: 'checks', label: i18n.t('admin.money.cols.checks'), align: 'right', width: '10%' },
					{ key: 'when', label: i18n.t('admin.money.cols.when'), align: 'right', width: '14%' }
				]}
				rows={payoutRows}
				emptyLabel={i18n.t('admin.money.emptyPayouts')}
			>
				{#snippet cell(row, col)}
					{@const p = row as unknown as PayoutRow}
					{#if col.key === 'user'}
						<a href={`/users/${p.user_id}`} class="font-mono text-xs hover:text-primary">
							{p.user_id}
						</a>
						<p class="text-[10px] text-text-muted">{p.destination_masked ?? '—'}</p>
					{:else if col.key === 'amount'}
						<span class="font-mono text-sm">{money(p.amount, p.currency)}</span>
					{:else if col.key === 'route'}
						<span class="text-xs text-text-muted">{p.provider} · {p.rail}</span>
					{:else if col.key === 'status'}
						<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
						{#if p.failure_reason}
							<p class="mt-1 text-[10px] text-text-muted">{p.failure_reason}</p>
						{/if}
					{:else if col.key === 'checks'}
						<!-- A high count on a still-pending payout is the signal
						     that it will not resolve itself. -->
						<span
							class="font-mono text-xs {p.status === 'pending' && p.check_count > 10
								? 'text-error'
								: 'text-text-muted'}"
						>
							{p.check_count}
						</span>
					{:else if col.key === 'when'}
						<span class="text-xs text-text-muted">{fmtDate(p.settled_at ?? p.created_at)}</span>
					{/if}
				{/snippet}
			</Table>
		{:else if tab === 'routes'}
			<p class="mb-3 text-xs text-text-muted">{i18n.t('admin.money.routesHint')}</p>
			<Table
				columns={[
					{ key: 'corridor', label: i18n.t('admin.money.cols.corridor') },
					{ key: 'provider', label: i18n.t('admin.money.cols.provider'), width: '18%' },
					{ key: 'priority', label: i18n.t('admin.money.cols.priority'), align: 'right', width: '10%' },
					{ key: 'state', label: i18n.t('admin.money.cols.state'), align: 'right', width: '18%' }
				]}
				rows={routeRows}
				emptyLabel={i18n.t('admin.money.emptyRoutes')}
			>
				{#snippet cell(row, col)}
					{@const r = row as unknown as RouteRow}
					{#if col.key === 'corridor'}
						<Badge variant={r.direction === 'in' ? 'primary' : 'accent'} size="sm">
							{i18n.t(`admin.money.direction.${r.direction}`)}
						</Badge>
						<span class="ms-2 text-sm">{r.country ?? '*'} · {r.currency} · {r.method}</span>
						{#if r.notes}
							<p class="mt-1 text-[10px] text-text-muted">{r.notes}</p>
						{/if}
					{:else if col.key === 'provider'}
						<span class="text-sm text-text-muted">{r.provider}</span>
					{:else if col.key === 'priority'}
						<span class="font-mono text-xs text-text-muted">{r.priority}</span>
					{:else if col.key === 'state'}
						<Button
							variant={r.enabled ? 'secondary' : 'accent'}
							size="sm"
							loading={toggling === r.id}
							onclick={() => toggleRoute(r)}
							data-testid="toggle-route-{r.id}"
						>
							{r.enabled ? i18n.t('admin.money.close') : i18n.t('admin.money.open')}
						</Button>
					{/if}
				{/snippet}
			</Table>
		{:else}
			<p class="mb-3 text-xs text-text-muted">{i18n.t('admin.money.methodsHint')}</p>
			<Table
				columns={[
					{ key: 'operator', label: i18n.t('admin.money.cols.operator') },
					{ key: 'where', label: i18n.t('admin.money.cols.where'), width: '16%' },
					{ key: 'mode', label: i18n.t('admin.money.cols.mode'), width: '20%' },
					{ key: 'state', label: i18n.t('admin.money.cols.state'), align: 'right', width: '18%' }
				]}
				rows={methodRows}
				emptyLabel={i18n.t('admin.money.emptyMethods')}
			>
				{#snippet cell(row, col)}
					{@const m = row as unknown as MethodRow}
					{#if col.key === 'operator'}
						<span class="text-sm font-medium">{m.label}</span>
						<code class="ms-2 font-mono text-[10px] text-text-muted">{m.operator}</code>
					{:else if col.key === 'where'}
						<span class="text-xs text-text-muted">{m.country} · {m.currency}</span>
					{:else if col.key === 'mode'}
						<span class="text-xs text-text-muted">{m.provider} · {m.provider_mode}</span>
						{#if m.supports_inline}
							<Badge variant="success" size="sm">{i18n.t('admin.money.inline')}</Badge>
						{/if}
					{:else if col.key === 'state'}
						<Button
							variant={m.enabled ? 'secondary' : 'accent'}
							size="sm"
							loading={toggling === m.id}
							onclick={() => toggleMethod(m)}
							data-testid="toggle-method-{m.id}"
						>
							{m.enabled ? i18n.t('admin.money.close') : i18n.t('admin.money.open')}
						</Button>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{/if}
</div>
