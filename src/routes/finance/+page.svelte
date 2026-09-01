<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { financeApi } from '$api/finance';
	import type {
		FinanceAdvance,
		FinanceGuaranteeClaim,
		FinancePartnership,
		FinanceReferral
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { ChevronRight, RefreshCw, Info } from '@lucide/svelte';

	type Tab = 'advances' | 'referrals' | 'claims' | 'partnerships';

	let tab = $state<Tab>('advances');
	let loading = $state(true);

	let advances = $state<FinanceAdvance[]>([]);
	let referrals = $state<FinanceReferral[]>([]);
	let claims = $state<FinanceGuaranteeClaim[]>([]);
	let partnerships = $state<FinancePartnership[]>([]);

	let busy = $state<string | null>(null);
	let writeOffTarget = $state<FinanceAdvance | null>(null);

	/** Per-referral decision drafts. Two referrals decided in one sitting must
	 *  not share an amount or a note. */
	let amountOf = $state<Record<string, string>>({});
	let premiumOf = $state<Record<string, string>>({});
	let noteOf = $state<Record<string, string>>({});

	// Open a partnership
	let pOrg = $state('');
	let pKind = $state('');
	let pCountries = $state('');
	let pCommission = $state('');
	let pBasis = $state('');
	let pRegistry = $state('');
	let opening = $state(false);

	// Honour a claim
	let cUser = $state('');
	let cInvoice = $state('');
	let cAmount = $state('');
	let cReason = $state('');
	let honouring = $state(false);

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	/** Shown as it arrived. Money that round-trips through a float stops
	 *  adding up, and this page is reconciled against. */
	function money(amount: string | null, cur: string | null): string {
		return amount === null ? '—' : `${amount} ${cur ?? ''}`.trim();
	}

	function statusVariant(s: string): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'disbursed' || s === 'repaid' || s === 'active' || s === 'paid') return 'success';
		if (s === 'approved' || s === 'requested' || s === 'draft' || s === 'pending') return 'warning';
		if (s === 'written_off' || s === 'refused') return 'error';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [a, r, c, p] = await Promise.all([
				financeApi.advances(),
				financeApi.referrals(),
				financeApi.guaranteeClaims(),
				financeApi.partnerships()
			]);
			// Server order is kept as it arrives. Each query sorts what is
			// waiting on a human to the top, and re-sorting here would put this
			// page's opinion over the one written next to the SQL.
			advances = a.data.advances;
			referrals = r.data.referrals;
			claims = c.data.claims;
			partnerships = p.data.partnerships;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	async function run(key: string, fn: () => Promise<void>) {
		if (busy) return;
		busy = key;
		try {
			await fn();
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busy = null;
		}
	}

	function disburse(a: FinanceAdvance) {
		void run(a.id, async () => {
			await financeApi.disburseAdvance(a.id);
			toast.success(i18n.t('admin.financeLine.disbursed'));
		});
	}

	function markRepaid(a: FinanceAdvance) {
		void run(a.id, async () => {
			await financeApi.markAdvanceRepaid(a.id);
			toast.success(i18n.t('admin.financeLine.repaid'));
		});
	}

	async function confirmWriteOff() {
		if (!writeOffTarget) return;
		const id = writeOffTarget.id;
		writeOffTarget = null;
		await run(id, async () => {
			await financeApi.writeOffAdvance(id);
			toast.success(i18n.t('admin.financeLine.writtenOff'));
		});
	}

	function decide(r: FinanceReferral, approved: boolean) {
		void run(r.id, async () => {
			// An approval carries the numbers the partner set; a refusal carries
			// neither, because there is nothing to carry.
			await financeApi.decideReferral(r.id, {
				approved,
				...(approved && (amountOf[r.id] ?? '').trim()
					? { approved_amount: amountOf[r.id].trim() }
					: {}),
				...(approved && (premiumOf[r.id] ?? '').trim()
					? { monthly_premium: premiumOf[r.id].trim() }
					: {}),
				...((noteOf[r.id] ?? '').trim() ? { note: noteOf[r.id].trim() } : {})
			});
			toast.success(i18n.t('admin.financeLine.decided'));
			delete amountOf[r.id];
			delete premiumOf[r.id];
			delete noteOf[r.id];
		});
	}

	function activate(p: FinancePartnership) {
		void run(p.id, async () => {
			await financeApi.activatePartnership(p.id);
			toast.success(i18n.t('admin.financeLine.activated'));
		});
	}

	const canOpen = $derived(
		!opening && pOrg.trim() !== '' && pKind.trim() !== '' && pCommission.trim() !== ''
	);

	async function openPartnership() {
		if (!canOpen) return;
		opening = true;
		try {
			await financeApi.openPartnership({
				partner_org: pOrg.trim(),
				kind: pKind.trim(),
				countries: pCountries
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean),
				commission_percent: pCommission.trim(),
				...(pBasis.trim() ? { regulatory_basis: pBasis.trim() } : {}),
				...(pRegistry.trim() ? { registry_url: pRegistry.trim() } : {})
			});
			toast.success(i18n.t('admin.financeLine.partnershipOpened'));
			pOrg = '';
			pKind = '';
			pCountries = '';
			pCommission = '';
			pBasis = '';
			pRegistry = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			opening = false;
		}
	}

	const canHonour = $derived(
		!honouring && cUser.trim() !== '' && cAmount.trim() !== '' && cReason.trim() !== ''
	);

	async function honour() {
		if (!canHonour) return;
		honouring = true;
		try {
			await financeApi.honourGuaranteeClaim({
				user_id: cUser.trim(),
				amount: cAmount.trim(),
				reason: cReason.trim(),
				...(cInvoice.trim() ? { invoice_id: cInvoice.trim() } : {})
			});
			toast.success(i18n.t('admin.financeLine.honoured'));
			cUser = '';
			cInvoice = '';
			cAmount = '';
			cReason = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			honouring = false;
		}
	}

	const awaitingDisbursal = $derived(advances.filter((a) => a.status === 'approved').length);
	const undecided = $derived(referrals.filter((r) => !r.decision).length);
	const unpaid = $derived(claims.filter((c) => c.paid_at === null).length);
	const drafts = $derived(partnerships.filter((p) => p.status === 'draft').length);
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.financeLine.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.financeLine.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.financeLine.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.financeLine.subtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.financeLine.queueNote')}</span>
	</p>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard
				label={i18n.t('admin.financeLine.stats.awaitingDisbursal')}
				value={awaitingDisbursal}
				color={awaitingDisbursal > 0 ? 'warning' : 'success'}
			/>
			<StatCard
				label={i18n.t('admin.financeLine.stats.undecided')}
				value={undecided}
				color={undecided > 0 ? 'warning' : 'success'}
			/>
			<StatCard
				label={i18n.t('admin.financeLine.stats.unpaid')}
				value={unpaid}
				color={unpaid > 0 ? 'warning' : 'success'}
			/>
			<StatCard label={i18n.t('admin.financeLine.stats.drafts')} value={drafts} />
		</div>

		<div class="mb-6">
			<SegmentedControl
				items={[
					{ value: 'advances', label: i18n.t('admin.financeLine.tabs.advances') },
					{ value: 'referrals', label: i18n.t('admin.financeLine.tabs.referrals') },
					{ value: 'claims', label: i18n.t('admin.financeLine.tabs.claims') },
					{ value: 'partnerships', label: i18n.t('admin.financeLine.tabs.partnerships') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'advances'}
			{#if advances.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.financeLine.emptyAdvances')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each advances as a (a.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<span class="font-mono text-sm">{money(a.advance_amount, a.currency)}</span>
								<Badge variant={statusVariant(a.status)} size="sm">{a.status}</Badge>
								<p class="mt-0.5 text-[11px] text-text-muted">
									<a href="/users/{a.user_id}" class="hover:text-primary">
										{a.username ?? a.user_id.slice(0, 8)}
									</a>
									· {fmtMoment(a.created_at)}
									{#if a.fee_amount}
										· {i18n.t('admin.financeLine.feeLabel')} {a.fee_amount}
									{/if}
									{#if a.disbursed_at}
										· {fmtMoment(a.disbursed_at)}
									{/if}
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								{#if a.status === 'approved'}
									<Button
										variant="primary"
										size="sm"
										onclick={() => disburse(a)}
										loading={busy === a.id}
										disabled={busy !== null}
									>
										{i18n.t('admin.financeLine.disburseBtn')}
									</Button>
								{/if}
								{#if a.status === 'disbursed'}
									<Button
										variant="secondary"
										size="sm"
										onclick={() => markRepaid(a)}
										disabled={busy !== null}
									>
										{i18n.t('admin.financeLine.repaidBtn')}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (writeOffTarget = a)}
										disabled={busy !== null}
									>
										{i18n.t('admin.financeLine.writeOffBtn')}
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'referrals'}
			{#if referrals.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.financeLine.emptyReferrals')}
				</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each referrals as r (r.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="text-sm">
										<a href="/users/{r.user_id}" class="font-medium hover:text-primary">
											{r.username ?? r.user_id.slice(0, 8)}
										</a>
										{#if r.partner_org}
											<span class="text-text-muted"> → {r.partner_org}</span>
										{/if}
									</p>
									<p class="mt-1 text-xs text-text-muted">{r.purpose}</p>
									<p class="mt-0.5 text-[11px] text-text-muted">
										{money(r.amount_requested, r.currency)} · {fmtMoment(r.created_at)}
									</p>
								</div>
								{#if r.decision}
									<Badge variant={statusVariant(r.decision)} size="sm">{r.decision}</Badge>
								{/if}
							</div>

							{#if !r.decision}
								<div class="flex flex-col gap-3 border-t border-border pt-3">
									<div class="grid gap-3 sm:grid-cols-2">
										<Input
											label={i18n.t('admin.financeLine.approvedAmountLabel')}
											value={amountOf[r.id] ?? ''}
											oninput={(e: Event) =>
												(amountOf[r.id] = (e.target as HTMLInputElement).value)}
										/>
										<Input
											label={i18n.t('admin.financeLine.premiumLabel')}
											value={premiumOf[r.id] ?? ''}
											oninput={(e: Event) =>
												(premiumOf[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Input
										label={i18n.t('admin.financeLine.decisionNoteLabel')}
										hint={i18n.t('admin.financeLine.decisionNoteHint')}
										value={noteOf[r.id] ?? ''}
										oninput={(e: Event) =>
											(noteOf[r.id] = (e.target as HTMLInputElement).value)}
									/>
									<div class="flex flex-wrap gap-2">
										<Button
											variant="primary"
											size="sm"
											onclick={() => decide(r, true)}
											loading={busy === r.id}
											disabled={busy !== null}
										>
											{i18n.t('admin.financeLine.approveBtn')}
										</Button>
										<Button
											variant="secondary"
											size="sm"
											onclick={() => decide(r, false)}
											disabled={busy !== null}
										>
											{i18n.t('admin.financeLine.refuseBtn')}
										</Button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'claims'}
			{#if claims.length === 0}
				<p class="mb-6 rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
					{i18n.t('admin.financeLine.emptyClaims')}
				</p>
			{:else}
				<ul class="mb-8 flex flex-col gap-2">
					{#each claims as c (c.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<span class="font-mono text-sm">{money(c.amount, c.currency)}</span>
								<Badge variant={statusVariant(c.status)} size="sm">{c.status}</Badge>
								<p class="mt-0.5 text-[11px] text-text-muted">
									<a href="/users/{c.user_id}" class="hover:text-primary">
										{c.username ?? c.user_id.slice(0, 8)}
									</a>
									· {fmtMoment(c.created_at)}
									{#if c.paid_at}
										· {i18n.t('admin.financeLine.paidOn')} {fmtMoment(c.paid_at)}
									{/if}
								</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.financeLine.newClaimTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.financeLine.newClaimHint')}</p>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-3">
						<Input label={i18n.t('admin.financeLine.userIdLabel')} bind:value={cUser} />
						<Input label={i18n.t('admin.financeLine.invoiceIdLabel')} bind:value={cInvoice} />
						<Input label={i18n.t('admin.financeLine.amountLabel')} bind:value={cAmount} />
					</div>
					<Input label={i18n.t('admin.financeLine.reasonLabel')} bind:value={cReason} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={honour}
							disabled={!canHonour}
							loading={honouring}
							data-testid="honour-claim"
						>
							{i18n.t('admin.financeLine.honourBtn')}
						</Button>
					</div>
				</div>
			</section>
		{:else}
			{#if partnerships.length === 0}
				<p class="mb-6 rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
					{i18n.t('admin.financeLine.emptyPartnerships')}
				</p>
			{:else}
				<ul class="mb-8 flex flex-col gap-2">
					{#each partnerships as p (p.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<span class="text-sm font-medium">{p.partner_org}</span>
								<Badge variant={statusVariant(p.status)} size="sm">
									{p.status === 'draft' ? i18n.t('admin.financeLine.draftBadge') : p.status}
								</Badge>
								<p class="mt-0.5 text-[11px] text-text-muted">
									{p.kind}
									{#if p.commission_percent}
										· {p.commission_percent}% {i18n.t('admin.financeLine.commissionLabel')}
									{/if}
									{#if p.countries.length > 0}
										· {p.countries.join(', ')}
									{/if}
								</p>
							</div>
							{#if p.status === 'draft'}
								<Button
									variant="primary"
									size="sm"
									onclick={() => activate(p)}
									loading={busy === p.id}
									disabled={busy !== null}
								>
									{i18n.t('admin.financeLine.activateBtn')}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.financeLine.newPartnershipTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.financeLine.partnerOrgLabel')} bind:value={pOrg} />
						<Input label={i18n.t('admin.financeLine.kindLabel')} bind:value={pKind} />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input
							label={i18n.t('admin.financeLine.countriesLabel')}
							hint={i18n.t('admin.financeLine.countriesHint')}
							bind:value={pCountries}
						/>
						<Input
							label={i18n.t('admin.financeLine.commissionPercentLabel')}
							bind:value={pCommission}
						/>
					</div>
					<Input
						label={i18n.t('admin.financeLine.regulatoryBasisLabel')}
						hint={i18n.t('admin.financeLine.regulatoryBasisHint')}
						bind:value={pBasis}
					/>
					<Input label={i18n.t('admin.financeLine.registryUrlLabel')} bind:value={pRegistry} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={openPartnership}
							disabled={!canOpen}
							loading={opening}
							data-testid="open-partnership"
						>
							{i18n.t('admin.financeLine.openPartnershipBtn')}
						</Button>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>

<ConfirmDangerousDialog
	open={writeOffTarget !== null}
	title={i18n.t('admin.financeLine.writeOffTitle')}
	description={writeOffTarget
		? `${writeOffTarget.advance_amount} ${writeOffTarget.currency ?? ''} — ${i18n.t('admin.financeLine.writeOffWarning')}`
		: ''}
	actionLabel={i18n.t('admin.financeLine.writeOffBtn')}
	requireReason={false}
	loading={busy !== null}
	onconfirm={() => confirmWriteOff()}
	onclose={() => (writeOffTarget = null)}
/>
