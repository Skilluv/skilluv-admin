<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { contractsApi, PRODUCT_STATUSES, statusNeedsReason } from '$api/contracts';
	import type {
		EnterpriseProduct,
		EnterpriseProductRenewal,
		EnterpriseProductStatus
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Info, AlertTriangle } from '@lucide/svelte';

	type Tab = 'renewals' | 'company';

	let tab = $state<Tab>('renewals');
	let loading = $state(true);
	let horizon = $state(60);
	let renewals = $state<EnterpriseProductRenewal[]>([]);

	let enterpriseId = $state('');
	let products = $state<EnterpriseProduct[]>([]);
	let productsLoading = $state(false);
	let loadedFor = $state('');

	// Record an engagement
	let newType = $state('');
	let newRenews = $state('');
	let newValue = $state('');
	let newCurrency = $state('EUR');
	let newNotes = $state('');
	let recording = $state(false);

	/** Per-product drafts. Two engagements open at once must not share a
	 *  cancellation reason. */
	let statusDraft = $state<Record<string, EnterpriseProductStatus>>({});
	let reasonDraft = $state<Record<string, string>>({});
	let pushDraft = $state<Record<string, string>>({});
	let kindDraft = $state<Record<string, string>>({});
	let amountDraft = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	function money(amount: string | null, cur: string | null): string {
		return amount === null ? '—' : `${amount} ${cur ?? ''}`.trim();
	}

	/** A renewal date already behind us. Not a stale row: it means the
	 *  engagement is still active and nobody asked. */
	function isOverdue(iso: string): boolean {
		return new Date(iso).getTime() < Date.now();
	}

	function statusVariant(s: string): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'active') return 'success';
		if (s === 'pending') return 'warning';
		if (s === 'cancelled' || s === 'lapsed') return 'error';
		return 'default';
	}

	$effect(() => {
		void loadRenewals(horizon);
	});

	async function loadRenewals(days: number) {
		loading = true;
		try {
			const res = await contractsApi.renewals({ within_days: days });
			renewals = res.data.renewals;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	async function loadProducts() {
		const id = enterpriseId.trim();
		if (id === '') return;
		productsLoading = true;
		try {
			const res = await contractsApi.productsOf(id);
			products = res.data.products;
			loadedFor = id;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			productsLoading = false;
		}
	}

	const canRecord = $derived(!recording && loadedFor !== '' && newType.trim() !== '');

	async function record() {
		if (!canRecord) return;
		recording = true;
		try {
			await contractsApi.recordProduct(loadedFor, {
				product_type: newType.trim(),
				...(newRenews ? { renews_at: new Date(newRenews).toISOString() } : {}),
				...(newValue.trim() ? { contract_value: newValue.trim() } : {}),
				...(newCurrency.trim() ? { currency: newCurrency.trim() } : {}),
				...(newNotes.trim() ? { notes: newNotes.trim() } : {})
			});
			toast.success(i18n.t('admin.contracts.recorded'));
			newType = '';
			newRenews = '';
			newValue = '';
			newNotes = '';
			await loadProducts();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			recording = false;
		}
	}

	function canApplyStatus(p: EnterpriseProduct): boolean {
		const next = statusDraft[p.id];
		if (!next || busy) return false;
		// The backend refuses a cancellation with no reason. Asking here means
		// the rule is learned from a form rather than from a 400.
		return !statusNeedsReason(next) || (reasonDraft[p.id] ?? '').trim().length > 0;
	}

	async function applyStatus(p: EnterpriseProduct) {
		if (!canApplyStatus(p)) return;
		busy = p.id;
		try {
			const next = statusDraft[p.id];
			await contractsApi.setStatus(p.id, {
				status: next,
				...(statusNeedsReason(next) ? { reason: (reasonDraft[p.id] ?? '').trim() } : {}),
				...(pushDraft[p.id] ? { renews_at: new Date(pushDraft[p.id]).toISOString() } : {})
			});
			toast.success(i18n.t('admin.contracts.statusSet'));
			delete statusDraft[p.id];
			delete reasonDraft[p.id];
			delete pushDraft[p.id];
			await loadProducts();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busy = null;
		}
	}

	async function grant(p: EnterpriseProduct) {
		const kind = (kindDraft[p.id] ?? '').trim();
		if (kind === '' || busy) return;
		busy = p.id;
		try {
			const amount = (amountDraft[p.id] ?? '').trim();
			// Sent only when the operator typed one. A flag with an amount and
			// an amount-carrying kind without one are both refused, so an
			// empty string must not be forwarded as a value.
			await contractsApi.grantEntitlement(p.id, {
				kind,
				...(amount ? { granted: amount } : {})
			});
			toast.success(i18n.t('admin.contracts.granted'));
			delete kindDraft[p.id];
			delete amountDraft[p.id];
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busy = null;
		}
	}

	const horizonItems = $derived([
		{ value: 30, label: i18n.t('admin.contracts.days30') },
		{ value: 60, label: i18n.t('admin.contracts.days60') },
		{ value: 90, label: i18n.t('admin.contracts.days90') },
		{ value: 365, label: i18n.t('admin.contracts.days365') }
	]);

	const statusOptions = $derived(PRODUCT_STATUSES.map((s) => ({ value: s, label: s })));
	const renewalRows = $derived(renewals.map((r) => r as unknown as Record<string, unknown>));
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.contracts.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.contracts.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.contracts.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.contracts.subtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={() => loadRenewals(horizon)} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.contracts.registerNote')}</span>
	</p>

	<div class="mb-6">
		<SegmentedControl
			items={[
				{ value: 'renewals', label: i18n.t('admin.contracts.tabs.renewals') },
				{ value: 'company', label: i18n.t('admin.contracts.tabs.company') }
			]}
			bind:value={tab}
		/>
	</div>

	{#if tab === 'renewals'}
		<div class="mb-4 flex flex-wrap items-center gap-3">
			<span class="text-xs font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.contracts.windowLabel')}
			</span>
			<SegmentedControl items={horizonItems} bind:value={horizon} />
		</div>
		<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.contracts.overdueNote')}</p>

		{#if loading}
			<Skeleton class="h-32 w-full" rounded="xl" />
		{:else}
			<Table
				columns={[
					{ key: 'company', label: i18n.t('admin.contracts.cols.company') },
					{ key: 'product', label: i18n.t('admin.contracts.cols.product'), width: '28%' },
					{
						key: 'value',
						label: i18n.t('admin.contracts.cols.value'),
						align: 'right',
						width: '16%'
					},
					{
						key: 'renews',
						label: i18n.t('admin.contracts.cols.renews'),
						align: 'right',
						width: '20%'
					}
				]}
				rows={renewalRows}
				emptyLabel={i18n.t('admin.contracts.emptyRenewals')}
			>
				{#snippet cell(row, col)}
					{@const r = row as unknown as EnterpriseProductRenewal}
					{#if col.key === 'company'}
						<span class="text-sm font-medium">{r.company_name}</span>
					{:else if col.key === 'product'}
						<span class="text-sm">{r.product_label}</span>
						<p class="font-mono text-[10px] text-text-muted">{r.product_type}</p>
					{:else if col.key === 'value'}
						<span class="font-mono text-sm">{money(r.contract_value, r.currency)}</span>
					{:else if col.key === 'renews'}
						{#if isOverdue(r.renews_at)}
							<span class="inline-flex items-center gap-1 text-xs text-error">
								<AlertTriangle size={11} strokeWidth={2} />
								{fmtMoment(r.renews_at)}
							</span>
							<Badge variant="error" size="sm">
								{i18n.t('admin.contracts.overdueBadge')}
							</Badge>
						{:else}
							<span class="text-xs text-text-muted">{fmtMoment(r.renews_at)}</span>
						{/if}
					{/if}
				{/snippet}
			</Table>
		{/if}
	{:else}
		<div class="mb-6 flex flex-wrap items-end gap-3">
			<div class="min-w-64 flex-1">
				<Input label={i18n.t('admin.contracts.enterpriseIdLabel')} bind:value={enterpriseId} />
			</div>
			<Button
				variant="primary"
				size="sm"
				onclick={loadProducts}
				disabled={enterpriseId.trim() === '' || productsLoading}
				loading={productsLoading}
				data-testid="load-products"
			>
				{i18n.t('admin.contracts.loadBtn')}
			</Button>
		</div>

		{#if loadedFor !== ''}
			{#if products.length === 0}
				<p class="mb-6 rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.contracts.emptyProducts')}
				</p>
			{:else}
				<ul class="mb-8 flex flex-col gap-4">
					{#each products as p (p.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">{p.product_label}</h3>
									<p class="mt-0.5 font-mono text-[11px] text-text-muted">{p.product_type}</p>
									<p class="mt-0.5 text-[11px] text-text-muted">
										{i18n.t('admin.contracts.cols.started')} {fmtMoment(p.started_at)}
										{#if p.renews_at}
											· {i18n.t('admin.contracts.cols.renews')} {fmtMoment(p.renews_at)}
										{/if}
									</p>
									{#if p.ended_reason}
										<p class="mt-1 text-[11px] text-error">{p.ended_reason}</p>
									{/if}
								</div>
								<span class="flex items-center gap-2">
									<span class="font-mono text-sm">
										{money(p.contract_value, p.currency)}
									</span>
									<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
								</span>
							</div>

							<div class="flex flex-col gap-3 border-t border-border pt-3">
								<p class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
									{i18n.t('admin.contracts.statusTitle')}
								</p>
								<div class="flex flex-wrap items-end gap-3">
									<div class="w-40">
										<Select
											items={statusOptions}
											value={statusDraft[p.id] ?? ''}
											onchange={(v: string) =>
												(statusDraft[p.id] = v as EnterpriseProductStatus)}
											placeholder={i18n.t('admin.contracts.statusLabel')}
											shape="rounded"
										/>
									</div>
									{#if statusDraft[p.id] && statusNeedsReason(statusDraft[p.id])}
										<div class="min-w-56 flex-1">
											<Input
												label={i18n.t('admin.contracts.reasonLabel')}
												hint={i18n.t('admin.contracts.reasonHint')}
												value={reasonDraft[p.id] ?? ''}
												oninput={(e: Event) =>
													(reasonDraft[p.id] = (e.target as HTMLInputElement).value)}
											/>
										</div>
									{/if}
									{#if statusDraft[p.id] === 'active'}
										<div class="flex flex-col gap-1.5">
											<label
												for="push-{p.id}"
												class="text-xs font-medium text-text-primary"
											>
												{i18n.t('admin.contracts.pushRenewalLabel')}
											</label>
											<input
												id="push-{p.id}"
												type="date"
												value={pushDraft[p.id] ?? ''}
												oninput={(e) =>
													(pushDraft[p.id] = (e.target as HTMLInputElement).value)}
												class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm"
											/>
										</div>
									{/if}
									<Button
										variant="secondary"
										size="sm"
										onclick={() => applyStatus(p)}
										disabled={!canApplyStatus(p)}
										loading={busy === p.id}
									>
										{i18n.t('admin.contracts.statusBtn')}
									</Button>
								</div>

								<p class="mt-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
									{i18n.t('admin.contracts.entitlementTitle')}
								</p>
								<p class="text-[11px] text-text-muted">
									{i18n.t('admin.contracts.entitlementHint')}
								</p>
								<div class="flex flex-wrap items-end gap-3">
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.kindLabel')}
											value={kindDraft[p.id] ?? ''}
											oninput={(e: Event) =>
												(kindDraft[p.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="w-32">
										<Input
											label={i18n.t('admin.contracts.grantedLabel')}
											value={amountDraft[p.id] ?? ''}
											oninput={(e: Event) =>
												(amountDraft[p.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => grant(p)}
										disabled={(kindDraft[p.id] ?? '').trim() === '' || busy !== null}
									>
										{i18n.t('admin.contracts.grantBtn')}
									</Button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.contracts.recordTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<Input label={i18n.t('admin.contracts.productTypeLabel')} bind:value={newType} />
					<div class="flex flex-col gap-1.5">
						<label for="new-renews" class="text-sm font-medium text-text-primary">
							{i18n.t('admin.contracts.renewsAtLabel')}
						</label>
						<input
							id="new-renews"
							type="date"
							bind:value={newRenews}
							class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm"
						/>
						<p class="text-xs text-text-muted">{i18n.t('admin.contracts.renewsAtHint')}</p>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.contracts.valueLabel')} bind:value={newValue} />
						<Input label={i18n.t('admin.contracts.currencyLabel')} bind:value={newCurrency} />
					</div>
					<Input label={i18n.t('admin.contracts.notesLabel')} bind:value={newNotes} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={record}
							disabled={!canRecord}
							loading={recording}
							data-testid="record-product"
						>
							{i18n.t('admin.contracts.recordBtn')}
						</Button>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>
