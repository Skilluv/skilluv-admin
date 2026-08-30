<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { contractsApi, PRODUCT_STATUSES, statusNeedsReason } from '$api/contracts';
	import { servicingApi, actionsFor } from '$api/servicing';
	import type {
		EnterpriseProduct,
		EnterpriseProductRenewal,
		EnterpriseProductStatus,
		ProductRegistryRow
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, Info, AlertTriangle } from '@lucide/svelte';

	type Tab = 'register' | 'renewals' | 'company';

	let tab = $state<Tab>('register');
	let loading = $state(true);
	let horizon = $state(60);
	let renewals = $state<EnterpriseProductRenewal[]>([]);

	// The register: every product any company holds, with the id of the row it
	// came from. `source_id` is the `{id}` twenty-one write routes take, and
	// until SKI-354 nothing served it — which is why this tab is the first one
	// and the renewals list is no longer the entry point.
	let registry = $state<ProductRegistryRow[]>([]);
	let registryTotal = $state(0);
	let registryPage = $state(1);
	let registryLoading = $state(true);
	let filterStatus = $state('');
	let filterQuery = $state('');
	let expanded = $state<string | null>(null);
	let servicing = $state<string | null>(null);

	/** Per-row servicing drafts, keyed by the registry row id rather than the
	 *  source id: one company can hold two products of the same kind, and the
	 *  register row is what the operator is looking at. */
	let memberUser = $state<Record<string, string>>({});
	let memberRole = $state<Record<string, string>>({});
	let memberShare = $state<Record<string, string>>({});
	let msTitle = $state<Record<string, string>>({});
	let msCriteria = $state<Record<string, string>>({});
	let msValue = $state<Record<string, string>>({});
	let expertUser = $state<Record<string, string>>({});
	let synthesis = $state<Record<string, string>>({});
	let billMonth = $state<Record<string, string>>({});
	let endReason = $state<Record<string, string>>({});
	let cancelReason = $state<Record<string, string>>({});
	let informEmail = $state<Record<string, string>>({});
	let informOrientation = $state<Record<string, string>>({});
	let matrixUrl = $state<Record<string, string>>({});
	let retentionMonths = $state<Record<string, string>>({});
	let retentionStill = $state<Record<string, boolean>>({});

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

	$effect(() => {
		void loadRegistry(registryPage, filterStatus, filterQuery);
	});

	async function loadRegistry(page: number, status: string, q: string) {
		registryLoading = true;
		try {
			const res = await contractsApi.registry({
				page,
				per_page: 20,
				...(status ? { status } : {}),
				...(q.trim() ? { q: q.trim() } : {})
			});
			registry = res.data;
			registryTotal = res.pagination.total;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			registryLoading = false;
		}
	}

	/** Runs one servicing action and reloads the register.
	 *
	 *  Every one of these takes `source_id`, not the register row's own id:
	 *  the register row is the pointer, the source row is the thing. */
	// `unknown` rather than `void`: every servicing call returns its own
	// response shape and none of them is read here — the register is reloaded
	// instead. Typing the callback `Promise<void>` refused them all.
	async function service(rowId: string, fn: () => Promise<unknown>) {
		if (servicing) return;
		servicing = rowId;
		try {
			await fn();
			toast.success(i18n.t('admin.contracts.serviced'));
			await loadRegistry(registryPage, filterStatus, filterQuery);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			servicing = null;
		}
	}

	function sourceId(r: ProductRegistryRow): string {
		return r.source_id ?? '';
	}



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

{#snippet registerTab()}
	<p class="mb-4 flex items-start gap-2 text-xs text-text-muted">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.contracts.registerHint')}</span>
	</p>

	<div class="mb-5 flex flex-wrap items-end gap-3">
		<div class="w-40">
			<Select
				items={[{ value: '', label: i18n.t('admin.common.all') }, ...statusOptions]}
				bind:value={filterStatus}
				placeholder={i18n.t('admin.contracts.statusLabel')}
				shape="rounded"
				onchange={() => {
					registryPage = 1;
					void loadRegistry(1, filterStatus, filterQuery);
				}}
			/>
		</div>
		<div class="min-w-56 flex-1">
			<Input
				label={i18n.t('admin.contracts.searchLabel')}
				hint={i18n.t('admin.contracts.searchHint')}
				bind:value={filterQuery}
			/>
		</div>
		<Button
			variant="secondary"
			size="sm"
			onclick={() => {
				registryPage = 1;
				void loadRegistry(1, filterStatus, filterQuery);
			}}
		>
			{i18n.t('admin.common.filter')}
		</Button>
	</div>

	{#if registryLoading}
		<Skeleton class="h-40 w-full" rounded="xl" />
	{:else if registry.length === 0}
		<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
			{i18n.t('admin.contracts.emptyRegistry')}
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each registry as r (r.id)}
				{@const actions = actionsFor(r.source_table)}
				<li class="rounded-xl border border-border bg-surface-elevated px-4 py-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<span class="text-sm font-medium">{r.company_name}</span>
							<Badge variant={statusVariant(r.status)} size="sm">{r.status}</Badge>
							<p class="mt-0.5 text-xs text-text-muted">
								{r.product_label}
								<code class="ms-2 font-mono text-[10px]">{r.product_type}</code>
							</p>
							<p class="mt-0.5 text-[11px] text-text-muted">
								{money(r.contract_value, r.currency)}
								{#if r.renews_at}· {fmtMoment(r.renews_at)}{/if}
								{#if r.source_table}
									· <code class="font-mono">{r.source_table}</code>
								{/if}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							{#if r.source_id === null}
								<!-- Recorded by hand with no source row. The CHECK only
								     guarantees the pair travels together, not that it is
								     present, so there is genuinely nothing to act on. -->
								<span class="text-[11px] text-text-muted">
									{i18n.t('admin.contracts.noSource')}
								</span>
							{:else if actions.length === 0}
								<!-- A product line that registers itself but whose actions
								     this app has no entry for. Said out loud rather than
								     rendering an empty row. -->
								<span class="text-[11px] text-warning">
									{i18n.t('admin.contracts.noActions')}
								</span>
							{:else}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (expanded = expanded === r.id ? null : r.id)}
								>
									{expanded === r.id
										? i18n.t('admin.contracts.hideActions')
										: i18n.t('admin.contracts.showActions')}
								</Button>
							{/if}
						</div>
					</div>

					{#if expanded === r.id && r.source_id}
						<div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
							{#if actions.includes('start')}
								<div class="flex flex-wrap items-center gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={() =>
											service(r.id, () => servicingApi.startEngagement(sourceId(r)))}
										loading={servicing === r.id}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.startBtn')}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onclick={() =>
											service(r.id, () => servicingApi.staffFromStudio(sourceId(r)))}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.staffBtn')}
									</Button>
									<span class="text-[11px] text-text-muted">
										{i18n.t('admin.contracts.startHint')}
									</span>
								</div>
							{/if}

							{#if actions.includes('addMember')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.memberUserLabel')}
											value={memberUser[r.id] ?? ''}
											oninput={(e: Event) =>
												(memberUser[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="w-28">
										<Input
											label={i18n.t('admin.contracts.memberRoleLabel')}
											value={memberRole[r.id] ?? ''}
											oninput={(e: Event) =>
												(memberRole[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="w-24">
										<Input
											label={i18n.t('admin.contracts.memberShareLabel')}
											value={memberShare[r.id] ?? ''}
											oninput={(e: Event) =>
												(memberShare[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										disabled={(memberUser[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.addEngagementMember(sourceId(r), {
													user_id: memberUser[r.id].trim(),
													role: (memberRole[r.id] ?? '').trim(),
													share_percent: (memberShare[r.id] ?? '').trim()
												})
											)}
									>
										{i18n.t('admin.contracts.addMemberBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('addMilestone')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-36 flex-1">
										<Input
											label={i18n.t('admin.contracts.milestoneTitleLabel')}
											value={msTitle[r.id] ?? ''}
											oninput={(e: Event) =>
												(msTitle[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.criteriaLabel')}
											value={msCriteria[r.id] ?? ''}
											oninput={(e: Event) =>
												(msCriteria[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="w-24">
										<Input
											label={i18n.t('admin.contracts.valuePercentLabel')}
											value={msValue[r.id] ?? ''}
											oninput={(e: Event) =>
												(msValue[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										disabled={(msTitle[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.addMilestone(sourceId(r), {
													title: msTitle[r.id].trim(),
													acceptance_criteria: (msCriteria[r.id] ?? '').trim(),
													value_percent: (msValue[r.id] ?? '').trim()
												})
											)}
									>
										{i18n.t('admin.contracts.addMilestoneBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('sign')}
								<div class="flex flex-wrap items-end gap-2">
									<Button
										variant="primary"
										size="sm"
										onclick={() =>
											service(r.id, () => servicingApi.signSponsorship(sourceId(r)))}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.signBtn')}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onclick={() =>
											service(r.id, () => servicingApi.honourSponsorship(sourceId(r)))}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.honourBtn')}
									</Button>
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.cancelReasonLabel')}
											value={cancelReason[r.id] ?? ''}
											oninput={(e: Event) =>
												(cancelReason[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="ghost"
										size="sm"
										disabled={(cancelReason[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.cancelSponsorship(
													sourceId(r),
													cancelReason[r.id].trim()
												)
											)}
									>
										{i18n.t('admin.contracts.cancelBtn')}
									</Button>
								</div>
								<p class="text-[11px] text-text-muted">
									{i18n.t('admin.contracts.signHint')}
								</p>
							{/if}

							{#if actions.includes('invite')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.expertLabel')}
											value={expertUser[r.id] ?? ''}
											oninput={(e: Event) =>
												(expertUser[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										disabled={(expertUser[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.inviteExpert(sourceId(r), expertUser[r.id].trim())
											)}
									>
										{i18n.t('admin.contracts.inviteExpertBtn')}
									</Button>
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.synthesisLabel')}
											value={synthesis[r.id] ?? ''}
											oninput={(e: Event) =>
												(synthesis[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="primary"
										size="sm"
										disabled={servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.deliverConsultation(
													sourceId(r),
													(synthesis[r.id] ?? '').trim() || undefined
												)
											)}
									>
										{i18n.t('admin.contracts.deliverBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('billMonth')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="flex flex-col gap-1.5">
										<label for="bill-{r.id}" class="text-xs font-medium text-text-primary">
											{i18n.t('admin.contracts.billMonthLabel')}
										</label>
										<input
											id="bill-{r.id}"
											type="date"
											value={billMonth[r.id] ?? ''}
											oninput={(e) =>
												(billMonth[r.id] = (e.target as HTMLInputElement).value)}
											class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm"
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										disabled={!billMonth[r.id] || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.billPlacementMonth(sourceId(r), billMonth[r.id])
											)}
									>
										{i18n.t('admin.contracts.billBtn')}
									</Button>
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.endReasonLabel')}
											value={endReason[r.id] ?? ''}
											oninput={(e: Event) =>
												(endReason[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="ghost"
										size="sm"
										disabled={(endReason[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.endPlacement(sourceId(r), endReason[r.id].trim())
											)}
									>
										{i18n.t('admin.contracts.endBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('inform')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.employeeEmailLabel')}
											value={informEmail[r.id] ?? ''}
											oninput={(e: Event) =>
												(informEmail[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<div class="min-w-32 flex-1">
										<Input
											label={i18n.t('admin.contracts.orientationLabel')}
											value={informOrientation[r.id] ?? ''}
											oninput={(e: Event) =>
												(informOrientation[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										disabled={(informEmail[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.informEmployee(sourceId(r), {
													employee_email: informEmail[r.id].trim(),
													orientation_slug: (informOrientation[r.id] ?? '').trim()
												})
											)}
									>
										{i18n.t('admin.contracts.informBtn')}
									</Button>
									<div class="min-w-40 flex-1">
										<Input
											label={i18n.t('admin.contracts.matrixLabel')}
											value={matrixUrl[r.id] ?? ''}
											oninput={(e: Event) =>
												(matrixUrl[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<Button
										variant="primary"
										size="sm"
										disabled={(matrixUrl[r.id] ?? '').trim() === '' || servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.deliverAudit(sourceId(r), {
													matrix_url: matrixUrl[r.id].trim()
												})
											)}
									>
										{i18n.t('admin.contracts.deliverAuditBtn')}
									</Button>
								</div>
								<p class="text-[11px] text-text-muted">
									{i18n.t('admin.contracts.informHint')}
								</p>
							{/if}

							{#if actions.includes('openSubmissions')}
								<div>
									<Button
										variant="primary"
										size="sm"
										onclick={() =>
											service(r.id, () =>
												servicingApi.openCampaignForSubmissions(sourceId(r))
											)}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.openSubmissionsBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('activateAmbassadors')}
								<div>
									<Button
										variant="primary"
										size="sm"
										onclick={() =>
											service(r.id, () =>
												servicingApi.activateAmbassadorProgram(sourceId(r))
											)}
										disabled={servicing !== null}
									>
										{i18n.t('admin.contracts.activateAmbassadorsBtn')}
									</Button>
								</div>
							{/if}

							{#if actions.includes('retention')}
								<div class="flex flex-wrap items-end gap-2">
									<div class="w-28">
										<Input
											label={i18n.t('admin.contracts.monthsLabel')}
											type="number"
											value={retentionMonths[r.id] ?? ''}
											oninput={(e: Event) =>
												(retentionMonths[r.id] = (e.target as HTMLInputElement).value)}
										/>
									</div>
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={retentionStill[r.id] ?? true}
											onchange={(e) =>
												(retentionStill[r.id] = (e.target as HTMLInputElement).checked)}
											class="h-4 w-4 rounded"
										/>
										{i18n.t('admin.contracts.stillThereLabel')}
									</label>
									<Button
										variant="secondary"
										size="sm"
										disabled={(retentionMonths[r.id] ?? '').trim() === '' ||
											servicing !== null}
										onclick={() =>
											service(r.id, () =>
												servicingApi.recordRetention(sourceId(r), {
													months: Number(retentionMonths[r.id]),
													still_there: retentionStill[r.id] ?? true
												})
											)}
									>
										{i18n.t('admin.contracts.recordRetentionBtn')}
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="mt-4 flex items-center justify-between text-xs text-text-muted">
			<Button
				variant="ghost"
				size="sm"
				disabled={registryPage === 1}
				onclick={() => {
					registryPage -= 1;
					void loadRegistry(registryPage, filterStatus, filterQuery);
				}}
			>
				{i18n.t('admin.engagement.common.prevPage')}
			</Button>
			<span>{registryTotal} · {registryPage}</span>
			<Button
				variant="ghost"
				size="sm"
				disabled={registry.length < 20}
				onclick={() => {
					registryPage += 1;
					void loadRegistry(registryPage, filterStatus, filterQuery);
				}}
			>
				{i18n.t('admin.engagement.common.nextPage')}
			</Button>
		</div>
	{/if}
{/snippet}

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
				{ value: 'register', label: i18n.t('admin.contracts.tabs.register') },
				{ value: 'renewals', label: i18n.t('admin.contracts.tabs.renewals') },
				{ value: 'company', label: i18n.t('admin.contracts.tabs.company') }
			]}
			bind:value={tab}
		/>
	</div>

	{#if tab === 'register'}
		{@render registerTab()}
	{:else if tab === 'renewals'}
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
