<script lang="ts">
	import { page } from '$app/stores';
	import { missionsApi, ARBITRATION_REASON_MIN } from '$api/missions';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { AdminMissionDetail, MissionStatus, SkillDomain } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { Briefcase, ChevronRight, ExternalLink, Info, Scale } from '@lucide/svelte';

	// One mission, and the one decision somebody outside it can take
	// (SKI-162, SKI-249).
	//
	// Everything else on this page is read-only on purpose. A mission
	// belongs to the enterprise that posted it and the person who took it,
	// and both already have every action they need. What neither has is a
	// way out of the case where they disagree and neither will move.

	const slug = $derived($page.params.slug ?? '');

	let data = $state<AdminMissionDetail | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	const t = (k: string, params?: Record<string, string | number>) => i18n.t(k, params);

	$effect(() => {
		const current = slug;
		if (current) void load(current);
	});

	async function load(missionSlug: string) {
		loading = true;
		notFound = false;
		try {
			const res = await missionsApi.detail(missionSlug);
			data = res.data;
		} catch (e) {
			notFound = true;
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	// ── Arbitration ──────────────────────────────────────────────

	let arbitrateOpen = $state(false);
	let arbitrating = $state(false);
	let outcome = $state<'accepted' | 'cancelled'>('accepted');
	let reason = $state('');

	const reasonLength = $derived(reason.trim().length);
	const reasonTooShort = $derived(reasonLength < ARBITRATION_REASON_MIN);

	/** Only a mission with work in it can be arbitrated. Stated in the UI
	 *  rather than discovered from a 409: the operator finds out before
	 *  writing eighty characters, not after. */
	const arbitrable = $derived(
		data !== null &&
			!data.arbitration &&
			(data.mission.status === 'in_progress' || data.mission.status === 'delivered')
	);

	async function arbitrate() {
		if (!data) return;
		arbitrating = true;
		try {
			const res = await missionsApi.arbitrate(slug, outcome, reason.trim());
			data = res.data;
			toast.success(t('admin.missions.arbitrate.done'));
			arbitrateOpen = false;
			reason = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			arbitrating = false;
		}
	}

	// ── Labels ───────────────────────────────────────────────────

	function statusLabel(s: string): string {
		return t(`admin.missions.statuses.${s}`);
	}

	function statusVariant(s: MissionStatus): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'closed') return 'success';
		if (s === 'in_progress' || s === 'delivered') return 'warning';
		if (s === 'cancelled') return 'error';
		return 'default';
	}

	function domainVariant(d: SkillDomain): 'code' | 'design' | 'game' | 'security' {
		return d;
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleString(intlLocale(), {
				dateStyle: 'short',
				timeStyle: 'short'
			});
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>{data?.mission.title ?? t('admin.missions.navLabel')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-10">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/missions" class="hover:text-text-primary">{t('admin.missions.navLabel')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="truncate text-text-primary">{data?.mission.title ?? slug}</span>
	</nav>

	{#if loading}
		<Skeleton class="h-96 w-full" rounded="xl" />
	{:else if notFound || !data}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<Briefcase size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
			<p class="text-sm text-text-muted">{t('admin.missions.detail.notFound')}</p>
			<div class="mt-4 flex justify-center">
				<Button variant="ghost" size="sm" href="/missions">
					{t('admin.missions.detail.back')}
				</Button>
			</div>
		</div>
	{:else}
		{@const m = data.mission}

		<header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<div class="mb-3 flex flex-wrap items-center gap-2">
					<Badge variant={domainVariant(m.skill_domain)}>
						{t(`common.domains.${m.skill_domain}`)}
					</Badge>
					<Badge variant={statusVariant(m.status)}>{statusLabel(m.status)}</Badge>
					<Badge variant="default">{m.mission_type_slug}</Badge>
					{#if m.awaiting_decision}
						<Badge variant="error">{t('admin.missions.awaiting')}</Badge>
					{/if}
					{#if m.arbitrated}
						<Badge variant="primary">{t('admin.missions.arbitrated')}</Badge>
					{/if}
				</div>
				<h1 class="text-2xl font-black tracking-tight sm:text-3xl">{m.title}</h1>
				<p class="mt-2 text-sm text-text-muted">
					{m.enterprise_name}
					{#if m.assigned_username}
						·
						<a href={`/users/${m.assigned_username}`} class="text-primary hover:underline">
							{m.assigned_username}
						</a>
					{:else}
						· {t('admin.missions.unassigned')}
					{/if}
				</p>
			</div>

			{#if arbitrable}
				<Button variant="danger" size="md" onclick={() => (arbitrateOpen = true)}>
					<Scale size={16} strokeWidth={2} />
					{t('admin.missions.arbitrate.open')}
				</Button>
			{/if}
		</header>

		{#if !data.arbitration && !arbitrable}
			<p
				class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-xs text-text-muted"
			>
				<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
				<span>{t('admin.missions.arbitrate.onlyOpen')}</span>
			</p>
		{/if}

		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<!-- ── Hand-ins ────────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.missions.detail.rounds')}
					</h2>
					{#if data.rounds.length === 0}
						<p class="text-sm text-text-muted">{t('admin.missions.detail.noRounds')}</p>
					{:else}
						<ol class="space-y-3">
							{#each data.rounds as r (r.round)}
								<li class="rounded-xl border border-border bg-surface-overlay p-4">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<Badge variant="default">
											{t('admin.missions.detail.round')}
											{r.round}
										</Badge>
										{#if r.decision}
											<Badge
												variant={r.decision === 'accepted' ? 'success' : 'warning'}
											>
												{r.decision}
											</Badge>
										{:else}
											<Badge variant="error">
												{t('admin.missions.detail.pendingDecision')}
											</Badge>
										{/if}
										{#if r.beyond_agreed_rounds}
											<Badge variant="warning">
												{t('admin.missions.detail.beyondAgreedRounds')}
											</Badge>
										{/if}
										<span class="font-mono text-[10px] text-text-muted">
											{fmtDate(r.delivered_at)}
										</span>
										{#if r.delivered_by}
											<span class="text-[10px] text-text-muted">
												{t('admin.missions.detail.deliveredBy')}
												{r.delivered_by}
											</span>
										{/if}
									</div>

									{#if r.artifact_url}
										<a
											href={r.artifact_url}
											target="_blank"
											rel="noopener nofollow"
											class="flex items-center gap-1 break-all text-xs text-primary hover:underline"
										>
											<ExternalLink size={12} strokeWidth={2} class="shrink-0" />
											{r.artifact_url}
										</a>
									{/if}

									{#if r.notes_md}
										<p class="mt-2 whitespace-pre-wrap text-sm text-text-primary">
											{r.notes_md}
										</p>
									{/if}

									{#if r.decision_reason}
										<p class="mt-2 whitespace-pre-wrap text-xs text-text-muted">
											{t('admin.missions.detail.decisionReason')}: {r.decision_reason}
										</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</section>

				<!-- ── Arbitration ─────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.missions.detail.arbitration')}
					</h2>
					{#if data.arbitration}
						<div class="flex flex-wrap items-center gap-2">
							<Badge
								variant={data.arbitration.outcome === 'accepted' ? 'success' : 'error'}
							>
								{data.arbitration.outcome === 'accepted'
									? t('admin.missions.arbitrate.accepted')
									: t('admin.missions.arbitrate.cancelled')}
							</Badge>
							{#if data.arbitration.arbiter}
								<span class="text-xs text-text-muted">
									{t('admin.missions.detail.arbiter')}: {data.arbitration.arbiter}
								</span>
							{/if}
							<span class="font-mono text-[10px] text-text-muted">
								{fmtDate(data.arbitration.decided_at)}
							</span>
						</div>
						<p class="mt-3 whitespace-pre-wrap text-sm text-text-primary">
							{data.arbitration.reason_md}
						</p>
					{:else}
						<p class="text-sm text-text-muted">{t('admin.missions.detail.noArbitration')}</p>
					{/if}
				</section>
			</div>

			<div class="space-y-6">
				<!-- ── Contract ────────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.missions.detail.contract')}
					</h2>
					<p class="mb-3 text-xs text-text-muted">{t('admin.missions.detail.ipTermsHint')}</p>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.missions.detail.ipTerms')}
					</p>
					<p class="mt-1 whitespace-pre-wrap text-sm text-text-primary">{data.ip_terms}</p>
					<div class="mt-3">
						<Badge variant={data.nda_required ? 'warning' : 'default'}>
							{data.nda_required
								? t('admin.missions.detail.ndaRequired')
								: t('admin.missions.detail.ndaNotRequired')}
						</Badge>
					</div>
				</section>

				<!-- ── Invoices ────────────────────────────────── -->
				<section class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
						{t('admin.missions.detail.invoices')}
					</h2>
					{#if data.invoices.length === 0}
						<p class="text-sm text-text-muted">{t('admin.missions.detail.noInvoices')}</p>
					{:else}
						<ul class="space-y-2">
							{#each data.invoices as inv (inv.id)}
								<li class="rounded-xl bg-surface-overlay px-3 py-2">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span class="text-sm text-text-primary">{inv.label}</span>
										<span class="font-mono text-sm text-text-primary">
											{inv.amount}
											{inv.currency}
										</span>
									</div>
									<div class="mt-1 flex flex-wrap items-center gap-2">
										<Badge variant="default">{inv.status}</Badge>
										{#if inv.captured_at}
											<span class="text-[10px] text-text-muted">
												{t('admin.missions.detail.captured')}
												{fmtDate(inv.captured_at)}
											</span>
										{/if}
										{#if inv.released_at}
											<span class="text-[10px] text-success">
												{t('admin.missions.detail.released')}
												{fmtDate(inv.released_at)}
											</span>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{/if}
</div>

<!-- ── Arbitrate ───────────────────────────────────────────────── -->
<Modal
	open={arbitrateOpen}
	title={t('admin.missions.arbitrate.title')}
	size="xl"
	onclose={() => (arbitrateOpen = false)}
>
	<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.missions.arbitrate.hint')}</span>
	</p>

	<label class="flex flex-col gap-1.5">
		<span class="text-sm font-medium text-text-primary">
			{t('admin.missions.arbitrate.outcomeLabel')}
		</span>
		<Select
			items={[
				{ value: 'accepted', label: t('admin.missions.arbitrate.accepted') },
				{ value: 'cancelled', label: t('admin.missions.arbitrate.cancelled') }
			]}
			bind:value={outcome}
			shape="rounded"
		/>
	</label>

	<div class="mt-4 flex flex-col gap-1.5">
		<label for="arbitration-reason" class="text-sm font-medium text-text-primary">
			{t('admin.missions.arbitrate.reasonLabel')}
		</label>
		<textarea
			id="arbitration-reason"
			bind:value={reason}
			rows="8"
			class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
		></textarea>
		<p class="text-xs {reasonTooShort ? 'text-warning' : 'text-text-muted'}">
			{t('admin.missions.arbitrate.reasonHint')}
			<span class="font-mono">({reasonLength}/{ARBITRATION_REASON_MIN})</span>
		</p>
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (arbitrateOpen = false)}>
			{t('admin.common.cancel')}
		</Button>
		<Button
			variant="danger"
			size="sm"
			onclick={arbitrate}
			loading={arbitrating}
			disabled={reasonTooShort}
		>
			{t('admin.missions.arbitrate.submit')}
		</Button>
	{/snippet}
</Modal>
