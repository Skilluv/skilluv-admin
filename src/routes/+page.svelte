<script lang="ts">
	import { adminApi } from '$api/admin';
	import type {
		DashboardOverview,
		DashboardFinancial,
		DashboardModerationQueue,
		DashboardHealth
	} from '$api/admin';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import { i18n } from '$lib/i18n';
	import {
		Users as UsersIcon,
		Trophy,
		FileCheck2,
		Radio,
		Flag,
		ShieldCheck,
		Megaphone,
		UserX,
		TrendingUp,
		Building2,
		Euro,
		Handshake,
		Database,
		AlertTriangle
	} from '@lucide/svelte';

	let stats = $state<{
		users: { total: number; active_30d: number; banned: number };
		challenges: { total: number; published: number; draft: number; archived: number };
		submissions: { total: number; today: number };
		websocket: { connections: number };
	} | null>(null);

	let moderation = $state<{
		banned_users: number;
		reports: { pending: number; resolved: number; dismissed: number; total: number };
		recent_bans_30d: number;
		admin_actions_today: number;
	} | null>(null);

	let overview = $state<DashboardOverview | null>(null);
	let financial = $state<DashboardFinancial | null>(null);
	let modQueue = $state<DashboardModerationQueue | null>(null);
	let health = $state<DashboardHealth | null>(null);

	let loading = $state(true);

	$effect(() => { loadDashboard(); });

	async function loadDashboard() {
		loading = true;
		const results = await Promise.allSettled([
			adminApi.stats(),
			adminApi.moderationDashboard(),
			adminApi.dashboardOverview(),
			adminApi.dashboardFinancial(),
			adminApi.dashboardModerationQueue(),
			adminApi.dashboardHealth()
		]);
		if (results[0].status === 'fulfilled') stats = results[0].value.data;
		if (results[1].status === 'fulfilled') moderation = results[1].value.data;
		if (results[2].status === 'fulfilled') overview = results[2].value.data;
		if (results[3].status === 'fulfilled') financial = results[3].value.data;
		if (results[4].status === 'fulfilled') modQueue = results[4].value.data;
		if (results[5].status === 'fulfilled') health = results[5].value.data;
		loading = false;
	}

	function intlLocale(): string {
		return i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US';
	}

	function fmtEur(cents: number, currency = 'EUR'): string {
		return new Intl.NumberFormat(intlLocale(), {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(cents / 100);
	}

	function fmtNum(n: number): string {
		return new Intl.NumberFormat(intlLocale()).format(n);
	}

	function fmtPct(n: number): string {
		return `${n.toFixed(1)}%`;
	}

	const dbLoad = $derived(
		health ? Math.round(((health.database.pool_size - health.database.pool_idle) / Math.max(1, health.database.pool_size)) * 100) : 0
	);
</script>

<svelte:head>
	<title>{i18n.t('admin.dashboard.title')} — Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8 space-y-10">
	<h1 class="text-2xl font-bold">{i18n.t('admin.dashboard.title')}</h1>

	{#if loading}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _}
				<Skeleton class="h-24 w-full" rounded="xl" />
			{/each}
		</div>
	{:else}
		<!-- Business overview -->
		{#if overview}
			<section>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
						{i18n.t('admin.dashboard.businessOverview')}
					</h2>
					<Badge variant="accent" size="sm">{i18n.t('admin.dashboard.revenueLabel')}</Badge>
				</div>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Euro size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.mrr')}
						</div>
						<p class="mt-1 text-3xl font-black text-accent">{fmtEur(overview.mrr_eur_cents)}</p>
						<p class="text-xs text-text-muted">
							{overview.paying_enterprises} / {overview.enterprises_total} {i18n.t('admin.dashboard.payingEnterprises')}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Handshake size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.hiresThisMonth')}
						</div>
						<p class="mt-1 text-3xl font-black">{fmtNum(overview.hires_this_month)}</p>
						<p class="text-xs text-text-muted">
							{i18n.t('admin.dashboard.hiresHint')}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<TrendingUp size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.signupsToday')}
						</div>
						<p class="mt-1 text-3xl font-black">{fmtNum(overview.signups_today)}</p>
						<p class="text-xs text-text-muted">
							<span class={overview.refund_rate_pct_30d > 5 ? 'text-warning' : 'text-text-muted'}>
								{fmtPct(overview.refund_rate_pct_30d)} {i18n.t('admin.dashboard.refunds30d')}
							</span>
						</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Financial -->
		{#if financial}
			<section>
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.dashboard.financialMonth')}
				</h2>
				<div class="grid gap-4 lg:grid-cols-[1fr_2fr]">
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="text-xs text-text-muted">
							{i18n.t('admin.dashboard.revenueIncTax')}
						</p>
						<p class="mt-1 text-3xl font-black text-accent">
							{fmtEur(financial.month_revenue_ttc_cents, financial.primary_currency)}
						</p>
						<p class="mt-1 text-xs text-text-muted">
							{financial.month_invoices_count} {i18n.t('admin.dashboard.invoicesIssued')}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="mb-3 text-xs uppercase tracking-wider text-text-muted">
							{i18n.t('admin.dashboard.purchasesBreakdown')}
						</p>
						{#if financial.purchases_breakdown.length === 0}
							<p class="py-6 text-center text-sm text-text-muted">
								{i18n.t('admin.dashboard.noPurchases')}
							</p>
						{:else}
							<ul class="divide-y divide-border">
								{#each financial.purchases_breakdown as row}
									<li class="flex items-center justify-between py-2 text-sm">
										<span class="font-mono text-xs text-text-muted truncate">{row.session_group}</span>
										<div class="flex items-center gap-4 shrink-0">
											<span class="text-text-muted text-xs">{fmtNum(row.purchases)} × </span>
											<span class="font-bold text-primary">{fmtNum(row.credits_total)}</span>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			</section>
		{/if}

		<!-- Platform (technical) -->
		{#if stats}
			<section>
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.dashboard.platform')}
				</h2>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<UsersIcon size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.users')}
						</div>
						<p class="mt-1 text-2xl font-bold">{fmtNum(stats.users.total)}</p>
						<p class="text-xs text-text-muted">{stats.users.active_30d} {i18n.t('admin.dashboard.activeUsers')}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Trophy size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.challenges')}
						</div>
						<p class="mt-1 text-2xl font-bold">{stats.challenges.published}</p>
						<p class="text-xs text-text-muted">{stats.challenges.draft} {i18n.t('admin.dashboard.drafts')}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<FileCheck2 size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.submissions')}
						</div>
						<p class="mt-1 text-2xl font-bold">{fmtNum(stats.submissions.total)}</p>
						<p class="text-xs text-text-muted">{stats.submissions.today} {i18n.t('admin.dashboard.today')}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Radio size={14} strokeWidth={2} />
							WebSocket
						</div>
						<p class="mt-1 text-2xl font-bold">{stats.websocket.connections}</p>
						<p class="text-xs text-text-muted">{i18n.t('admin.dashboard.wsConnections')}</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Moderation queue (aggregated across domains) -->
		{#if modQueue}
			<section>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
						{i18n.t('admin.dashboard.moderationQueue')}
					</h2>
					<Badge variant="warning" size="sm">
						{modQueue.reports_pending + modQueue.kyc_pending + modQueue.sponsored_requests_pending}
						{i18n.t('admin.dashboard.toReview')}
					</Badge>
				</div>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<a href="/reports" class="rounded-xl border border-border bg-surface-elevated p-4 hover:border-primary/40 transition-colors">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Flag size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.pendingReports')}
						</div>
						<p class="mt-1 text-2xl font-bold {modQueue.reports_pending > 0 ? 'text-warning' : ''}">
							{modQueue.reports_pending}
						</p>
					</a>
					<a href="/enterprise-kyc" class="rounded-xl border border-border bg-surface-elevated p-4 hover:border-primary/40 transition-colors">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<ShieldCheck size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.kycPending')}
						</div>
						<p class="mt-1 text-2xl font-bold {modQueue.kyc_pending > 0 ? 'text-warning' : ''}">
							{modQueue.kyc_pending}
						</p>
					</a>
					<a href="/sponsored-challenges" class="rounded-xl border border-border bg-surface-elevated p-4 hover:border-primary/40 transition-colors">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Megaphone size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.sponsoringsPending')}
						</div>
						<p class="mt-1 text-2xl font-bold {modQueue.sponsored_requests_pending > 0 ? 'text-warning' : ''}">
							{modQueue.sponsored_requests_pending}
						</p>
					</a>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<UserX size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.bans30d')}
						</div>
						<p class="mt-1 text-2xl font-bold">{modQueue.banned_last_30d}</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Legacy moderation KPIs (kept for admin actions/resolved counts) -->
		{#if moderation}
			<section>
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.dashboard.moderation')}
				</h2>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="text-xs text-text-muted">{i18n.t('admin.dashboard.actionsToday')}</p>
						<p class="mt-1 text-2xl font-bold">{moderation.admin_actions_today}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="text-xs text-text-muted">{i18n.t('admin.dashboard.totalReports')}</p>
						<p class="mt-1 text-2xl font-bold">{moderation.reports.total}</p>
						<p class="text-xs text-success">{moderation.reports.resolved} {i18n.t('admin.dashboard.resolved')}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="text-xs text-text-muted">
							{i18n.t('admin.dashboard.bannedTotal')}
						</p>
						<p class="mt-1 text-2xl font-bold">{moderation.banned_users}</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<p class="text-xs text-text-muted">
							{i18n.t('admin.dashboard.dismissed')}
						</p>
						<p class="mt-1 text-2xl font-bold">{moderation.reports.dismissed}</p>
					</div>
				</div>
			</section>
		{/if}

		<!-- Health -->
		{#if health}
			<section>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
						{i18n.t('admin.dashboard.infraHealth')}
					</h2>
					{#if health.recent_error_events_30m > 0}
						<Badge variant="error" size="sm">
							<AlertTriangle size={12} strokeWidth={2} />
							{health.recent_error_events_30m} {i18n.t('admin.dashboard.errorsCountLabel')}
						</Badge>
					{:else}
						<Badge variant="success" size="sm">
							{i18n.t('admin.dashboard.nominal')}
						</Badge>
					{/if}
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Database size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.dbPool')}
						</div>
						<p class="mt-1 text-2xl font-bold {dbLoad > 80 ? 'text-warning' : ''}">
							{health.database.pool_size - health.database.pool_idle}/{health.database.pool_size}
						</p>
						<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
							<div
								class="h-full transition-all {dbLoad > 80 ? 'bg-warning' : 'bg-primary'}"
								style="width: {dbLoad}%"
							></div>
						</div>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<Radio size={14} strokeWidth={2} />
							WebSocket
						</div>
						<p class="mt-1 text-2xl font-bold">{health.websocket.connections}</p>
						<p class="text-xs text-text-muted">
							{health.websocket.users} {i18n.t('admin.dashboard.wsUsers')} · {health.websocket.rooms} {i18n.t('admin.dashboard.wsRooms')}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-elevated p-4">
						<div class="flex items-center gap-2 text-xs text-text-muted">
							<AlertTriangle size={14} strokeWidth={2} />
							{i18n.t('admin.dashboard.errors30m')}
						</div>
						<p class="mt-1 text-2xl font-bold {health.recent_error_events_30m > 0 ? 'text-error' : ''}">
							{health.recent_error_events_30m}
						</p>
					</div>
				</div>
			</section>
		{/if}

		<div class="flex flex-wrap gap-3 pt-4 border-t border-border">
			<Button variant="accent" href="/reports">{i18n.t('admin.dashboard.viewReports')}</Button>
			<Button variant="secondary" href="/enterprise-kyc">
				<ShieldCheck size={14} strokeWidth={2} />
				{i18n.t('admin.nav.kycEnterprises')}
			</Button>
			<Button variant="secondary" href="/sponsored-challenges">
				<Megaphone size={14} strokeWidth={2} />
				{i18n.t('admin.nav.sponsorings')}
			</Button>
			<Button variant="secondary" href="/challenges">{i18n.t('admin.dashboard.manageChallenges')}</Button>
			<Button variant="secondary" href="/community">{i18n.t('admin.dashboard.reviewCommunity')}</Button>
			<Button variant="secondary" href="/tenants">
				<Building2 size={14} strokeWidth={2} />
				{i18n.t('admin.nav.tenantsLabel')}
			</Button>
		</div>
	{/if}
</div>
