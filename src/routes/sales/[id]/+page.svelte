<script lang="ts">
	import { page } from '$app/state';
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { salesApi, SALES_STAGES, SALES_ACTIVITY_KINDS, isClosed, stageWeight } from '$api/sales';
	import type {
		SalesActivity,
		SalesActivityKind,
		SalesOpportunity,
		SalesStage
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { ChevronRight, RefreshCw, Building2 } from '@lucide/svelte';

	const id = $derived(page.params.id as string);

	let loading = $state(true);
	let opportunity = $state<SalesOpportunity | null>(null);
	let activities = $state<SalesActivity[]>([]);

	let nextStage = $state<SalesStage | ''>('');
	let lostReason = $state('');
	let movingStage = $state(false);

	let actKind = $state<SalesActivityKind>('call');
	let actSummary = $state('');
	let actNextStep = $state('');
	let actDue = $state('');
	let recording = $state(false);
	let actTouched = $state(false);

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

	function fmtMoment(iso: string): string {
		return new Date(iso).toLocaleString(intlLocale(), {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}

	function stageVariant(s: SalesStage): 'success' | 'warning' | 'error' | 'primary' | 'default' {
		if (s === 'won') return 'success';
		if (s === 'lost') return 'error';
		if (s === 'negotiation') return 'warning';
		if (s === 'proposal' || s === 'qualified') return 'primary';
		return 'default';
	}

	$effect(() => {
		void load(id);
	});

	async function load(oppId: string) {
		loading = true;
		try {
			const res = await salesApi.opportunity(oppId);
			opportunity = res.data.opportunity;
			activities = res.data.activities;
			nextStage = '';
			lostReason = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	// The backend rejects a move to `lost` without a reason, so the form asks
	// for it before sending rather than letting the operator discover the rule
	// through a 400.
	const needsReason = $derived(nextStage === 'lost');
	const canMove = $derived(
		!movingStage &&
			nextStage !== '' &&
			nextStage !== opportunity?.stage &&
			(!needsReason || lostReason.trim().length > 0)
	);

	async function moveStage() {
		if (!canMove || nextStage === '') return;
		movingStage = true;
		try {
			const res = await salesApi.setStage(
				id,
				nextStage,
				needsReason ? lostReason.trim() : undefined
			);
			opportunity = res.data.opportunity;
			nextStage = '';
			lostReason = '';
			toast.success(i18n.t('admin.sales.stageChanged'));
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			movingStage = false;
		}
	}

	const summaryError = $derived(
		actTouched && actSummary.trim().length === 0 ? i18n.t('admin.sales.summaryRequired') : null
	);
	const canRecord = $derived(!recording && actSummary.trim().length > 0);

	async function record() {
		actTouched = true;
		if (!canRecord) return;
		recording = true;
		try {
			await salesApi.recordActivity(id, {
				kind: actKind,
				summary_md: actSummary.trim(),
				...(actNextStep.trim() ? { next_step: actNextStep.trim() } : {}),
				...(actDue ? { next_step_due_on: actDue } : {})
			});
			actSummary = '';
			actNextStep = '';
			actDue = '';
			actTouched = false;
			toast.success(i18n.t('admin.sales.activityAdded'));
			// Re-read rather than pushing locally: the id and the timestamp are
			// the server's, and a row rendered with a guessed time is worse
			// than one that takes a moment to appear.
			await load(id);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			recording = false;
		}
	}

	const stageOptions = $derived(
		SALES_STAGES.map((s) => ({
			value: s,
			label: i18n.t(`admin.sales.stages.${s}`),
			disabled: s === opportunity?.stage
		}))
	);

	const kindOptions = $derived(
		SALES_ACTIVITY_KINDS.map((k) => ({ value: k, label: i18n.t(`admin.sales.kinds.${k}`) }))
	);
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/sales" class="hover:text-text-primary">{i18n.t('admin.sales.navLabel')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{opportunity?.org_name ?? i18n.t('admin.sales.detailTitle')}</span>
	</nav>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-28 w-full" rounded="xl" />{/each}
		</div>
	{:else if opportunity}
		<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
					{i18n.t('admin.sales.detailTitle')}
				</p>
				<h1 class="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
					{opportunity.org_name}
				</h1>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<Badge variant={stageVariant(opportunity.stage)} size="md">
						{i18n.t(`admin.sales.stages.${opportunity.stage}`)}
					</Badge>
					{#if !isClosed(opportunity.stage)}
						<span class="text-[11px] text-text-muted">
							{Math.round(stageWeight(opportunity.stage) * 100)}%
						</span>
					{/if}
					{#if opportunity.estimated_value}
						<span class="font-mono text-sm">
							{opportunity.estimated_value}
							{opportunity.currency}
						</span>
					{/if}
				</div>
			</div>
			<Button variant="secondary" onclick={() => load(id)} {loading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.common.refreshBtn')}
			</Button>
		</div>

		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<dl class="grid gap-4 sm:grid-cols-2">
				<div>
					<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.sales.contactNameLabel')}
					</dt>
					<dd class="mt-1 text-sm">{opportunity.contact_name ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.sales.contactEmailLabel')}
					</dt>
					<dd class="mt-1 text-sm">{opportunity.contact_email ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.sales.productLabel')}
					</dt>
					<dd class="mt-1 text-sm">{opportunity.product_type ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-[10px] font-bold uppercase tracking-widest text-text-muted">
						{i18n.t('admin.sales.closeOnLabel')}
					</dt>
					<dd class="mt-1 text-sm">{fmtDay(opportunity.expected_close_on)}</dd>
				</div>
			</dl>

			{#if opportunity.lost_reason}
				<p class="mt-4 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
					{opportunity.lost_reason}
				</p>
			{/if}

			{#if opportunity.enterprise_id}
				<a
					href="/sales/enterprises/{opportunity.enterprise_id}"
					class="mt-4 inline-flex items-center gap-2 text-xs text-primary hover:underline"
				>
					<Building2 size={13} strokeWidth={2} />
					{i18n.t('admin.sales.enterpriseFileTitle')}
				</a>
			{:else}
				<p class="mt-4 text-xs text-text-muted">{i18n.t('admin.sales.noEnterprise')}</p>
			{/if}
		</section>

		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.stageChangeLabel')}
			</h2>
			<div class="flex flex-col gap-3">
				<Select
					items={stageOptions}
					bind:value={nextStage}
					placeholder={i18n.t('admin.sales.stageChangeLabel')}
					shape="rounded"
				/>
				{#if needsReason}
					<Input
						label={i18n.t('admin.sales.lostReasonLabel')}
						hint={i18n.t('admin.sales.lostReasonHint')}
						bind:value={lostReason}
						data-testid="lost-reason"
					/>
				{/if}
				<div>
					<Button
						variant="primary"
						size="sm"
						onclick={moveStage}
						disabled={!canMove}
						loading={movingStage}
						data-testid="move-stage"
					>
						{i18n.t('admin.sales.stageChangeLabel')}
					</Button>
				</div>
			</div>
		</section>

		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.activityTitle')}
			</h2>
			<div class="flex flex-col gap-3">
				<Select
					items={kindOptions}
					bind:value={actKind}
					placeholder={i18n.t('admin.sales.activityKindLabel')}
					shape="rounded"
				/>
				<Input
					label={i18n.t('admin.sales.activitySummaryLabel')}
					bind:value={actSummary}
					oninput={() => (actTouched = true)}
					error={summaryError ?? undefined}
					data-testid="activity-summary"
				/>
				<div class="grid gap-3 sm:grid-cols-2">
					<Input label={i18n.t('admin.sales.activityNextStepLabel')} bind:value={actNextStep} />
					<div class="flex flex-col gap-1.5">
						<label for="act-due" class="text-sm font-medium text-text-primary">
							{i18n.t('admin.sales.activityDueLabel')}
						</label>
						<input
							id="act-due"
							type="date"
							bind:value={actDue}
							class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
						/>
					</div>
				</div>
				<div>
					<Button
						variant="primary"
						size="sm"
						onclick={record}
						disabled={!canRecord}
						loading={recording}
						data-testid="record-activity"
					>
						{i18n.t('admin.sales.activityBtn')}
					</Button>
				</div>
			</div>
		</section>

		<section class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.activitiesTitle')}
			</h2>
			{#if activities.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.sales.emptyActivities')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each activities as a (a.id)}
						<li class="py-3">
							<div class="flex flex-wrap items-center gap-2">
								<Badge variant="default" size="sm">
									{i18n.t(`admin.sales.kinds.${a.kind}`)}
								</Badge>
								<span class="text-[11px] text-text-muted">{fmtMoment(a.happened_at)}</span>
							</div>
							<p class="mt-1.5 whitespace-pre-wrap text-sm">{a.summary_md}</p>
							{#if a.next_step}
								<p class="mt-1.5 text-xs text-text-muted">
									{i18n.t('admin.sales.cols.step')} : {a.next_step}
									{#if a.next_step_due_on}
										<span class="ms-1">({fmtDay(a.next_step_due_on)})</span>
									{/if}
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
