<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import {
		dataApi,
		DATA_PURPOSES,
		DATA_LICENSEE_TYPES,
		DATA_PARTNER_TYPES
	} from '$api/data';
	import type {
		DataClientType,
		DataCohort,
		DataDeployment,
		DataLicence,
		DataPartnerType,
		DataPurpose,
		DataReport
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, ShieldCheck } from '@lucide/svelte';

	type Tab = 'cohorts' | 'reports' | 'licences' | 'deployments';

	let tab = $state<Tab>('cohorts');
	let loading = $state(true);

	let cohorts = $state<DataCohort[]>([]);
	let floor = $state(30);
	let reports = $state<DataReport[]>([]);
	let licences = $state<DataLicence[]>([]);
	let deployments = $state<DataDeployment[]>([]);

	// Commission a report
	let rcClientType = $state<DataClientType>('research_lab');
	let rcOrg = $state('');
	let rcTitle = $state('');
	let rcScope = $state('');
	let rcFee = $state('');
	let rcCurrency = $state('EUR');
	let commissioning = $state(false);

	/** Delivery drafts keyed by report id: two reports open at once must not
	 *  share a document URL. */
	let deliverUrl = $state<Record<string, string>>({});
	let deliverPurpose = $state<Record<string, DataPurpose>>({});
	let busyReport = $state<string | null>(null);

	// Open a licence
	let lcOrg = $state('');
	let lcType = $state<DataClientType>('university');
	let lcPurpose = $state<DataPurpose>('research_licensing');
	let lcContractPurpose = $state('');
	let lcStarts = $state('');
	let lcEnds = $state('');
	let lcFee = $state('');
	let lcShare = $state('');
	let opening = $state(false);

	let settleStart = $state<Record<string, string>>({});
	let settleEnd = $state<Record<string, string>>({});
	let busyLicence = $state<string | null>(null);

	// Provision a deployment
	let dpOrg = $state('');
	let dpType = $state<DataPartnerType>('university');
	let dpHost = $state('');
	let dpCountry = $state('');
	let dpSetup = $state('');
	let dpMonthly = $state('');
	let dpRecognition = $state('');
	let provisioning = $state(false);
	let busyDeployment = $state<string | null>(null);

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

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

	function money(amount: string | null, cur: string): string {
		return amount === null ? '—' : `${amount} ${cur}`;
	}

	function statusVariant(s: string): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'delivered' || s === 'signed' || s === 'live') return 'success';
		if (s === 'draft' || s === 'commissioned' || s === 'provisioned') return 'warning';
		if (s === 'cancelled') return 'error';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const [c, r, l, d] = await Promise.all([
				dataApi.cohorts(),
				dataApi.reports(),
				dataApi.licences(),
				dataApi.deployments()
			]);
			cohorts = c.data.cohorts;
			floor = c.data.floor;
			reports = r.data.reports;
			licences = l.data.licences;
			deployments = d.data.deployments;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	const canCommission = $derived(
		!commissioning &&
			rcOrg.trim() !== '' &&
			rcTitle.trim() !== '' &&
			rcScope.trim() !== '' &&
			rcFee.trim() !== ''
	);

	async function commission() {
		if (!canCommission) return;
		commissioning = true;
		try {
			await dataApi.commissionReport({
				client_type: rcClientType,
				client_org: rcOrg.trim(),
				title: rcTitle.trim(),
				scope_md: rcScope.trim(),
				fee: rcFee.trim(),
				currency: rcCurrency.trim() || 'EUR'
			});
			toast.success(i18n.t('admin.dataLine.commissioned'));
			rcOrg = '';
			rcTitle = '';
			rcScope = '';
			rcFee = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			commissioning = false;
		}
	}

	async function deliver(id: string) {
		const url = (deliverUrl[id] ?? '').trim();
		const purpose = deliverPurpose[id];
		if (url === '' || !purpose || busyReport) return;
		busyReport = id;
		try {
			const res = await dataApi.deliverReport(id, url, purpose);
			toast.success(
				i18n.t('admin.dataLine.delivered', { amount: res.data.revenue_booked })
			);
			delete deliverUrl[id];
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyReport = null;
		}
	}

	const canOpenLicence = $derived(
		!opening &&
			lcOrg.trim() !== '' &&
			lcContractPurpose.trim() !== '' &&
			lcStarts !== '' &&
			lcFee.trim() !== ''
	);

	async function openLicence() {
		if (!canOpenLicence) return;
		opening = true;
		try {
			await dataApi.openLicence({
				licensee_org: lcOrg.trim(),
				licensee_type: lcType,
				purpose: lcPurpose,
				contract_purpose_md: lcContractPurpose.trim(),
				starts_on: lcStarts,
				...(lcEnds ? { ends_on: lcEnds } : {}),
				total_fee: lcFee.trim(),
				...(lcShare.trim() ? { talents_share_percent: lcShare.trim() } : {})
			});
			toast.success(i18n.t('admin.dataLine.licenceOpened'));
			lcOrg = '';
			lcContractPurpose = '';
			lcStarts = '';
			lcEnds = '';
			lcFee = '';
			lcShare = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			opening = false;
		}
	}

	async function settle(id: string) {
		const start = settleStart[id] ?? '';
		const end = settleEnd[id] ?? '';
		if (start === '' || end === '' || busyLicence) return;
		busyLicence = id;
		try {
			const res = await dataApi.settleLicence(id, start, end);
			toast.success(
				i18n.t('admin.dataLine.settled', {
					people: res.data.people_paid,
					each: res.data.amount_each
				})
			);
			delete settleStart[id];
			delete settleEnd[id];
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyLicence = null;
		}
	}

	const canProvision = $derived(
		!provisioning && dpOrg.trim() !== '' && dpHost.trim() !== ''
	);

	async function provision() {
		if (!canProvision) return;
		provisioning = true;
		try {
			await dataApi.provisionDeployment({
				partner_org: dpOrg.trim(),
				partner_type: dpType,
				deployment_host: dpHost.trim(),
				...(dpCountry.trim() ? { country: dpCountry.trim() } : {}),
				...(dpSetup.trim() ? { setup_fee: dpSetup.trim() } : {}),
				...(dpMonthly.trim() ? { monthly_fee: dpMonthly.trim() } : {}),
				official_recognition_scope: dpRecognition
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			});
			toast.success(i18n.t('admin.dataLine.provisioned'));
			dpOrg = '';
			dpHost = '';
			dpCountry = '';
			dpSetup = '';
			dpMonthly = '';
			dpRecognition = '';
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			provisioning = false;
		}
	}

	async function goLive(id: string) {
		busyDeployment = id;
		try {
			const res = await dataApi.goLive(id);
			toast.success(
				i18n.t('admin.dataLine.wentLive', { amount: res.data.setup_fee_booked })
			);
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busyDeployment = null;
		}
	}

	const purposeOptions = $derived(DATA_PURPOSES.map((p) => ({ value: p, label: p })));
	const licenseeOptions = $derived(DATA_LICENSEE_TYPES.map((t) => ({ value: t, label: t })));
	const partnerOptions = $derived(DATA_PARTNER_TYPES.map((t) => ({ value: t, label: t })));

	/** Cohorts that clear the floor. The headline number an operator needs
	 *  before writing any contract at all. */
	const publishableCount = $derived(cohorts.filter((c) => c.publishable).length);
</script>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.dataLine.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.dataLine.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.dataLine.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.dataLine.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<ShieldCheck size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.dataLine.consentNote')}</span>
	</p>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-3">
			<StatCard
				label={i18n.t('admin.dataLine.floorLabel')}
				value={floor}
				hint={i18n.t('admin.dataLine.floorHint')}
			/>
			<StatCard
				label={i18n.t('admin.dataLine.publishable')}
				value="{publishableCount}/{cohorts.length}"
				color={publishableCount > 0 ? 'success' : 'warning'}
			/>
		</div>

		<div class="mb-6">
			<SegmentedControl
				items={[
					{ value: 'cohorts', label: i18n.t('admin.dataLine.tabs.cohorts') },
					{ value: 'reports', label: i18n.t('admin.dataLine.tabs.reports') },
					{ value: 'licences', label: i18n.t('admin.dataLine.tabs.licences') },
					{ value: 'deployments', label: i18n.t('admin.dataLine.tabs.deployments') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'cohorts'}
			<ul class="flex flex-col gap-2">
				{#each cohorts as c (c.purpose)}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
						<span class="text-sm">{c.purpose}</span>
						<span class="flex items-center gap-3">
							<span class="font-mono text-sm">
								{c.people}
								<span class="text-[11px] text-text-muted">
									{i18n.t('admin.dataLine.peopleLabel')}
								</span>
							</span>
							<Badge variant={c.publishable ? 'success' : 'warning'} size="sm">
								{c.publishable
									? i18n.t('admin.dataLine.publishable')
									: i18n.t('admin.dataLine.belowFloor')}
							</Badge>
						</span>
					</li>
				{/each}
			</ul>
		{:else if tab === 'reports'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.dataLine.commissionTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Select
							items={licenseeOptions}
							bind:value={rcClientType}
							placeholder={i18n.t('admin.dataLine.clientTypeLabel')}
							shape="rounded"
						/>
						<Input label={i18n.t('admin.dataLine.clientOrgLabel')} bind:value={rcOrg} />
					</div>
					<Input label={i18n.t('admin.dataLine.reportTitleLabel')} bind:value={rcTitle} />
					<Input label={i18n.t('admin.dataLine.scopeLabel')} bind:value={rcScope} />
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.feeLabel')} bind:value={rcFee} />
						<Input label={i18n.t('admin.dataLine.currencyLabel')} bind:value={rcCurrency} />
					</div>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={commission}
							disabled={!canCommission}
							loading={commissioning}
							data-testid="commission-report"
						>
							{i18n.t('admin.dataLine.commissionBtn')}
						</Button>
					</div>
				</div>
			</section>

			{#if reports.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.dataLine.emptyReports')}
				</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each reports as r (r.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">{r.title}</h3>
									<p class="mt-0.5 text-xs text-text-muted">
										{r.client_org} · {r.client_type} · {fmtMoment(r.created_at)}
									</p>
								</div>
								<span class="flex items-center gap-2">
									<span class="font-mono text-sm">{money(r.fee, r.currency)}</span>
									<Badge variant={statusVariant(r.status)} size="sm">{r.status}</Badge>
								</span>
							</div>
							<p class="mb-3 whitespace-pre-wrap text-xs text-text-muted">{r.scope_md}</p>

							{#if r.delivered_at}
								<p class="text-xs text-text-muted">
									{i18n.t('admin.dataLine.deliverTitle')} · {fmtMoment(r.delivered_at)}
									{#if r.document_url}
										<a
											href={r.document_url}
											target="_blank"
											rel="noopener nofollow"
											class="ms-2 text-primary hover:underline"
										>
											{r.document_url}
										</a>
									{/if}
								</p>
							{:else}
								<div class="flex flex-col gap-3 border-t border-border pt-3">
									<Input
										label={i18n.t('admin.dataLine.documentUrlLabel')}
										hint={i18n.t('admin.dataLine.documentUrlHint')}
										value={deliverUrl[r.id] ?? ''}
										oninput={(e: Event) =>
											(deliverUrl[r.id] = (e.target as HTMLInputElement).value)}
									/>
									<div>
										<p class="mb-1.5 text-sm font-medium text-text-primary">
											{i18n.t('admin.dataLine.purposeLabel')}
										</p>
										<Select
											items={purposeOptions}
											value={deliverPurpose[r.id] ?? ''}
											onchange={(v: string) =>
												(deliverPurpose[r.id] = v as DataPurpose)}
											placeholder={i18n.t('admin.dataLine.selectLabel')}
											shape="rounded"
										/>
										<p class="mt-1.5 text-xs text-text-muted">
											{i18n.t('admin.dataLine.purposeHint')}
										</p>
									</div>
									<div>
										<Button
											variant="primary"
											size="sm"
											onclick={() => deliver(r.id)}
											disabled={(deliverUrl[r.id] ?? '').trim() === '' ||
												!deliverPurpose[r.id] ||
												busyReport !== null}
											loading={busyReport === r.id}
										>
											{i18n.t('admin.dataLine.deliverBtn')}
										</Button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'licences'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.dataLine.openLicenceTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.licenseeOrgLabel')} bind:value={lcOrg} />
						<Select
							items={licenseeOptions}
							bind:value={lcType}
							placeholder={i18n.t('admin.dataLine.licenseeTypeLabel')}
							shape="rounded"
						/>
					</div>
					<Select
						items={purposeOptions}
						bind:value={lcPurpose}
						placeholder={i18n.t('admin.dataLine.cols.purpose')}
						shape="rounded"
					/>
					<Input
						label={i18n.t('admin.dataLine.contractPurposeLabel')}
						bind:value={lcContractPurpose}
					/>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="lc-starts" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.dataLine.startsOnLabel')}
							</label>
							<input
								id="lc-starts"
								type="date"
								bind:value={lcStarts}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="lc-ends" class="text-sm font-medium text-text-primary">
								{i18n.t('admin.dataLine.endsOnLabel')}
							</label>
							<input
								id="lc-ends"
								type="date"
								bind:value={lcEnds}
								class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
							/>
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.totalFeeLabel')} bind:value={lcFee} />
						<Input
							label={i18n.t('admin.dataLine.shareLabel')}
							hint={i18n.t('admin.dataLine.shareHint')}
							bind:value={lcShare}
						/>
					</div>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={openLicence}
							disabled={!canOpenLicence}
							loading={opening}
							data-testid="open-licence"
						>
							{i18n.t('admin.dataLine.openLicenceBtn')}
						</Button>
					</div>
				</div>
			</section>

			{#if licences.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.dataLine.emptyLicences')}
				</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each licences as l (l.id)}
						<li class="rounded-2xl border border-border bg-surface-elevated p-5">
							<div class="mb-2 flex flex-wrap items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">{l.licensee_org}</h3>
									<p class="mt-0.5 text-xs text-text-muted">
										{l.licensee_type} · {l.purpose} · {fmtDay(l.starts_on)} → {fmtDay(
											l.ends_on
										)}
									</p>
								</div>
								<span class="flex items-center gap-2">
									<span class="font-mono text-sm">{money(l.total_fee, l.currency)}</span>
									<Badge variant={statusVariant(l.status)} size="sm">{l.status}</Badge>
								</span>
							</div>
							<p class="mb-3 text-xs text-text-muted">
								{i18n.t('admin.dataLine.cols.share')} : {l.talents_share_percent}%
							</p>

							<div class="flex flex-wrap items-end gap-3 border-t border-border pt-3">
								<div class="flex flex-col gap-1.5">
									<label
										for="settle-start-{l.id}"
										class="text-xs font-medium text-text-primary"
									>
										{i18n.t('admin.dataLine.periodStartLabel')}
									</label>
									<input
										id="settle-start-{l.id}"
										type="date"
										value={settleStart[l.id] ?? ''}
										oninput={(e) =>
											(settleStart[l.id] = (e.target as HTMLInputElement).value)}
										class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
									/>
								</div>
								<div class="flex flex-col gap-1.5">
									<label
										for="settle-end-{l.id}"
										class="text-xs font-medium text-text-primary"
									>
										{i18n.t('admin.dataLine.periodEndLabel')}
									</label>
									<input
										id="settle-end-{l.id}"
										type="date"
										value={settleEnd[l.id] ?? ''}
										oninput={(e) =>
											(settleEnd[l.id] = (e.target as HTMLInputElement).value)}
										class="h-10 rounded-xl border border-border bg-surface-elevated px-3 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
									/>
								</div>
								<Button
									variant="primary"
									size="sm"
									onclick={() => settle(l.id)}
									disabled={!settleStart[l.id] || !settleEnd[l.id] || busyLicence !== null}
									loading={busyLicence === l.id}
								>
									{i18n.t('admin.dataLine.settleBtn')}
								</Button>
							</div>
							<p class="mt-2 text-[11px] text-text-muted">
								{i18n.t('admin.dataLine.settleHint')}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.dataLine.provisionTitle')}
				</h2>
				<div class="flex flex-col gap-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.partnerOrgLabel')} bind:value={dpOrg} />
						<Select
							items={partnerOptions}
							bind:value={dpType}
							placeholder={i18n.t('admin.dataLine.partnerTypeLabel')}
							shape="rounded"
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.hostLabel')} bind:value={dpHost} />
						<Input label={i18n.t('admin.dataLine.countryLabel')} bind:value={dpCountry} />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.dataLine.setupFeeLabel')} bind:value={dpSetup} />
						<Input label={i18n.t('admin.dataLine.monthlyFeeLabel')} bind:value={dpMonthly} />
					</div>
					<Input
						label={i18n.t('admin.dataLine.recognitionLabel')}
						hint={i18n.t('admin.dataLine.recognitionHint')}
						bind:value={dpRecognition}
					/>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={provision}
							disabled={!canProvision}
							loading={provisioning}
							data-testid="provision-deployment"
						>
							{i18n.t('admin.dataLine.provisionBtn')}
						</Button>
					</div>
				</div>
			</section>

			{#if deployments.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.dataLine.emptyDeployments')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each deployments as d (d.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="min-w-0">
								<span class="text-sm font-medium">{d.partner_org}</span>
								<Badge variant={statusVariant(d.status)} size="sm">{d.status}</Badge>
								<p class="mt-0.5 text-[11px] text-text-muted">
									{d.deployment_host} · {d.partner_type}{d.country ? ` · ${d.country}` : ''}
									{#if d.launched_on}
										· {i18n.t('admin.dataLine.cols.launched')} {fmtDay(d.launched_on)}
									{/if}
								</p>
								{#if d.official_recognition_scope.length > 0}
									<p class="mt-0.5 text-[11px] text-text-muted">
										{d.official_recognition_scope.join(', ')}
									</p>
								{/if}
							</div>
							<span class="flex items-center gap-3">
								<span class="font-mono text-xs">{money(d.monthly_fee, d.currency)}</span>
								{#if !d.launched_on}
									<Button
										variant="primary"
										size="sm"
										onclick={() => goLive(d.id)}
										loading={busyDeployment === d.id}
										disabled={busyDeployment !== null}
									>
										{i18n.t('admin.dataLine.goLiveBtn')}
									</Button>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>
