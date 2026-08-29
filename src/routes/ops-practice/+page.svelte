<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { opsApi, OPS_ATTESTATION_BASES } from '$api/ops';
	import type { OpsAttestationBasis, OpsOverdueAction } from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ChevronRight, RefreshCw, AlertTriangle } from '@lucide/svelte';

	type Tab = 'overdue' | 'verify' | 'attestations';

	let tab = $state<Tab>('overdue');
	let loading = $state(true);
	let overdue = $state<OpsOverdueAction[]>([]);

	let objectiveId = $state('');
	let verifyingObjective = $state(false);

	let costId = $state('');
	let sloMet = $state(true);
	let verifyingCost = $state(false);

	let afUser = $state('');
	let afBasis = $state<OpsAttestationBasis>('ops_infra_shipped');
	let afDeliverable = $state('');
	let afTitle = $state('');
	let afEvidence = $state('');
	let attestingArtefact = $state(false);

	let ftUser = $state('');
	let ftReason = $state('');
	let attestingFeatured = $state(false);

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

	function severityVariant(s: string): 'error' | 'warning' | 'default' {
		if (s === 'sev1' || s === 'critical') return 'error';
		if (s === 'sev2' || s === 'high') return 'warning';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await opsApi.overdueActions();
			overdue = res.data.overdue;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	/**
	 * A verification and an attestation are two different outcomes.
	 *
	 * The route answers both, and reporting only the first would tell an
	 * operator the work was recognised when the domain declined to recognise
	 * it. So the message names which of the two actually happened.
	 */
	function reportVerification(attestationIssued: boolean) {
		toast.success(
			i18n.t(
				attestationIssued
					? 'admin.opsPractice.verifiedWithAttestation'
					: 'admin.opsPractice.verifiedNoAttestation'
			)
		);
	}

	async function verifyObjective() {
		if (objectiveId.trim() === '' || verifyingObjective) return;
		verifyingObjective = true;
		try {
			const res = await opsApi.verifyObjective(objectiveId.trim());
			reportVerification(res.data.attestation_issued);
			objectiveId = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			verifyingObjective = false;
		}
	}

	async function verifyCost() {
		if (costId.trim() === '' || verifyingCost) return;
		verifyingCost = true;
		try {
			const res = await opsApi.verifyCostWork(costId.trim(), sloMet);
			reportVerification(res.data.attestation_issued);
			costId = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			verifyingCost = false;
		}
	}

	const canAttestArtefact = $derived(
		!attestingArtefact &&
			afUser.trim() !== '' &&
			afDeliverable.trim() !== '' &&
			afTitle.trim() !== '' &&
			afEvidence.trim() !== ''
	);

	async function attestArtefact() {
		if (!canAttestArtefact) return;
		attestingArtefact = true;
		try {
			await opsApi.attestArtefact({
				user_id: afUser.trim(),
				basis: afBasis,
				deliverable_id: afDeliverable.trim(),
				title: afTitle.trim(),
				evidence_url: afEvidence.trim()
			});
			toast.success(i18n.t('admin.opsPractice.issued'));
			afUser = '';
			afDeliverable = '';
			afTitle = '';
			afEvidence = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			attestingArtefact = false;
		}
	}

	const canAttestFeatured = $derived(
		!attestingFeatured && ftUser.trim() !== '' && ftReason.trim() !== ''
	);

	async function attestFeatured() {
		if (!canAttestFeatured) return;
		attestingFeatured = true;
		try {
			await opsApi.attestFeatured({ user_id: ftUser.trim(), reason: ftReason.trim() });
			toast.success(i18n.t('admin.opsPractice.issued'));
			ftUser = '';
			ftReason = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			attestingFeatured = false;
		}
	}

	const basisOptions = $derived(OPS_ATTESTATION_BASES.map((b) => ({ value: b, label: b })));
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.opsPractice.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.opsPractice.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.opsPractice.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.opsPractice.subtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-20 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8">
			<StatCard
				label={i18n.t('admin.opsPractice.overdueStat')}
				value={overdue.length}
				color={overdue.length > 0 ? 'error' : 'success'}
			/>
		</div>

		<div class="mb-6">
			<SegmentedControl
				items={[
					{ value: 'overdue', label: i18n.t('admin.opsPractice.tabs.overdue') },
					{ value: 'verify', label: i18n.t('admin.opsPractice.tabs.verify') },
					{ value: 'attestations', label: i18n.t('admin.opsPractice.tabs.attestations') }
				]}
				bind:value={tab}
			/>
		</div>

		{#if tab === 'overdue'}
			{#if overdue.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
					{i18n.t('admin.opsPractice.emptyOverdue')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each overdue as a (a.incident_id + a.action)}
						<li class="rounded-xl border border-border bg-surface-elevated px-4 py-3">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div class="min-w-0">
									<span class="text-sm font-medium">{a.incident}</span>
									<Badge variant={severityVariant(a.severity)} size="sm">{a.severity}</Badge>
									<p class="mt-1 text-xs text-text-muted">{a.action}</p>
								</div>
								<span class="flex items-center gap-2 text-xs text-error">
									<AlertTriangle size={12} strokeWidth={2} />
									{fmtDay(a.due_on)}
								</span>
							</div>
							{#if a.owner}
								<p class="mt-1 text-[11px] text-text-muted">
									{i18n.t('admin.opsPractice.cols.owner')} :
									<a href="/users/{a.owner}" class="font-mono hover:text-primary">
										{a.owner.slice(0, 8)}
									</a>
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'verify'}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.opsPractice.verifyObjectiveTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">
					{i18n.t('admin.opsPractice.verifyObjectiveHint')}
				</p>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-64 flex-1">
						<Input
							label={i18n.t('admin.opsPractice.objectiveIdLabel')}
							bind:value={objectiveId}
						/>
					</div>
					<Button
						variant="primary"
						size="sm"
						onclick={verifyObjective}
						disabled={objectiveId.trim() === '' || verifyingObjective}
						loading={verifyingObjective}
					>
						{i18n.t('admin.opsPractice.verifyBtn')}
					</Button>
				</div>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.opsPractice.verifyCostTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.opsPractice.sloNote')}</p>
				<div class="flex flex-col gap-3">
					<Input label={i18n.t('admin.opsPractice.costIdLabel')} bind:value={costId} />
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={sloMet}
							class="h-4 w-4 rounded"
							data-testid="slo-met"
						/>
						{i18n.t('admin.opsPractice.sloLabel')}
					</label>
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={verifyCost}
							disabled={costId.trim() === '' || verifyingCost}
							loading={verifyingCost}
						>
							{i18n.t('admin.opsPractice.verifyBtn')}
						</Button>
					</div>
				</div>
			</section>
		{:else}
			<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.opsPractice.artefactTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.opsPractice.artefactHint')}</p>
				<div class="flex flex-col gap-4">
					<Select
						items={basisOptions}
						bind:value={afBasis}
						placeholder={i18n.t('admin.opsPractice.basisLabel')}
						shape="rounded"
					/>
					<div class="grid gap-4 sm:grid-cols-2">
						<Input label={i18n.t('admin.opsPractice.userIdLabel')} bind:value={afUser} />
						<Input
							label={i18n.t('admin.opsPractice.deliverableIdLabel')}
							bind:value={afDeliverable}
						/>
					</div>
					<Input label={i18n.t('admin.opsPractice.artefactTitleLabel')} bind:value={afTitle} />
					<Input label={i18n.t('admin.opsPractice.evidenceUrlLabel')} bind:value={afEvidence} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={attestArtefact}
							disabled={!canAttestArtefact}
							loading={attestingArtefact}
						>
							{i18n.t('admin.opsPractice.issueBtn')}
						</Button>
					</div>
				</div>
			</section>

			<section class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					{i18n.t('admin.opsPractice.featuredTitle')}
				</h2>
				<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.opsPractice.featuredHint')}</p>
				<div class="flex flex-col gap-4">
					<Input label={i18n.t('admin.opsPractice.userIdLabel')} bind:value={ftUser} />
					<Input label={i18n.t('admin.opsPractice.reasonLabel')} bind:value={ftReason} />
					<div>
						<Button
							variant="primary"
							size="sm"
							onclick={attestFeatured}
							disabled={!canAttestFeatured}
							loading={attestingFeatured}
						>
							{i18n.t('admin.opsPractice.issueBtn')}
						</Button>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>
