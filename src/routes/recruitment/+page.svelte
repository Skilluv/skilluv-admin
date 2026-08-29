<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { recruitmentApi, MATCH_REASON_MIN } from '$api/recruitment';
	import type { RecruitmentCampaign } from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Input from '$components/ui/Input.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import { ChevronRight, RefreshCw, Info, UserPlus } from '@lucide/svelte';

	let loading = $state(true);
	let campaigns = $state<RecruitmentCampaign[]>([]);

	/** Per-campaign recruiter drafts. One shared field would carry an id from
	 *  one campaign onto the next. */
	let recruiterIds = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);

	let shortlistFor = $state<RecruitmentCampaign | null>(null);
	let talentId = $state('');
	let matchReason = $state('');
	let reasonTouched = $state(false);
	let shortlisting = $state(false);

	let feeId = $state('');
	let leftAt = $state('');
	let departureReason = $state('');
	let recordingDeparture = $state(false);

	function statusVariant(s: string): 'success' | 'warning' | 'primary' | 'default' {
		if (s === 'placed' || s === 'hired') return 'success';
		if (s === 'briefing') return 'warning';
		if (s === 'sourcing' || s === 'shortlisting') return 'primary';
		return 'default';
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await recruitmentApi.campaigns();
			campaigns = res.data.campaigns;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	async function assign(c: RecruitmentCampaign) {
		const id = (recruiterIds[c.id] ?? '').trim();
		if (id === '' || busy) return;
		busy = c.id;
		try {
			await recruitmentApi.assign(c.id, id);
			toast.success(i18n.t('admin.recruitment.assigned'));
			delete recruiterIds[c.id];
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			busy = null;
		}
	}

	function openShortlist(c: RecruitmentCampaign) {
		shortlistFor = c;
		talentId = '';
		matchReason = '';
		reasonTouched = false;
	}

	const reasonError = $derived(
		reasonTouched && matchReason.trim().length < MATCH_REASON_MIN
			? i18n.t('admin.recruitment.matchReasonTooShort', { n: MATCH_REASON_MIN })
			: null
	);

	const canShortlist = $derived(
		!shortlisting && talentId.trim() !== '' && matchReason.trim().length >= MATCH_REASON_MIN
	);

	async function shortlist() {
		reasonTouched = true;
		if (!canShortlist || !shortlistFor) return;
		shortlisting = true;
		try {
			await recruitmentApi.shortlist(shortlistFor.id, {
				talent_user_id: talentId.trim(),
				match_reason_md: matchReason.trim()
			});
			toast.success(i18n.t('admin.recruitment.shortlisted'));
			shortlistFor = null;
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			shortlisting = false;
		}
	}

	const canRecordDeparture = $derived(
		!recordingDeparture && feeId.trim() !== '' && leftAt !== '' && departureReason.trim() !== ''
	);

	async function recordDeparture() {
		if (!canRecordDeparture) return;
		recordingDeparture = true;
		try {
			const res = await recruitmentApi.recordDeparture(feeId.trim(), {
				// A departure is a moment, and the refund is prorated against
				// it — so this is an instant, not a bare day.
				left_at: new Date(leftAt).toISOString(),
				reason: departureReason.trim()
			});
			toast.success(
				i18n.t('admin.recruitment.departureRecorded', { amount: res.data.refund_amount })
			);
			feeId = '';
			leftAt = '';
			departureReason = '';
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			recordingDeparture = false;
		}
	}

	const unassignedCount = $derived(campaigns.filter((c) => c.unassigned).length);
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.recruitment.navLabel')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.recruitment.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
				{i18n.t('admin.recruitment.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.recruitment.subtitle')}
			</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<p class="mb-8 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs text-text-muted">
		<Info size={13} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.recruitment.respondNote')}</span>
	</p>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-24 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-3">
			<StatCard label={i18n.t('admin.recruitment.stats.open')} value={campaigns.length} />
			<StatCard
				label={i18n.t('admin.recruitment.stats.unassigned')}
				value={unassignedCount}
				color={unassignedCount > 0 ? 'warning' : 'success'}
			/>
		</div>

		{#if campaigns.length === 0}
			<p class="mb-8 rounded-xl border border-border bg-surface-overlay px-4 py-8 text-center text-sm text-text-muted">
				{i18n.t('admin.recruitment.empty')}
			</p>
		{:else}
			<ul class="mb-10 flex flex-col gap-3">
				{#each campaigns as c (c.id)}
					<li class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{c.title}</h3>
								<p class="mt-0.5 text-xs text-text-muted">
									{c.company_name} · {c.kind}
								</p>
							</div>
							<span class="flex flex-wrap items-center gap-2">
								<Badge variant={statusVariant(c.status)} size="sm">{c.status}</Badge>
								{#if c.unassigned}
									<Badge variant="warning" size="sm">
										{i18n.t('admin.recruitment.unassignedBadge')}
									</Badge>
								{/if}
								<span class="text-[11px] text-text-muted">
									{c.shortlisted}
									{i18n.t('admin.recruitment.cols.shortlisted')}
								</span>
							</span>
						</div>

						<div class="flex flex-wrap items-end gap-3 border-t border-border pt-3">
							<div class="min-w-56 flex-1">
								<Input
									label={i18n.t('admin.recruitment.recruiterIdLabel')}
									hint={c.unassigned ? i18n.t('admin.recruitment.assignHint') : undefined}
									value={recruiterIds[c.id] ?? ''}
									oninput={(e: Event) =>
										(recruiterIds[c.id] = (e.target as HTMLInputElement).value)}
								/>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onclick={() => assign(c)}
								disabled={(recruiterIds[c.id] ?? '').trim() === '' || busy !== null}
								loading={busy === c.id}
							>
								{i18n.t('admin.recruitment.assignBtn')}
							</Button>
							<Button variant="primary" size="sm" onclick={() => openShortlist(c)}>
								<UserPlus size={14} strokeWidth={2} />
								{i18n.t('admin.recruitment.shortlistBtn')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<section class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.recruitment.departureTitle')}
			</h2>
			<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.recruitment.departureHint')}</p>
			<div class="flex flex-col gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<Input label={i18n.t('admin.recruitment.feeIdLabel')} bind:value={feeId} />
					<div class="flex flex-col gap-1.5">
						<label for="left-at" class="text-sm font-medium text-text-primary">
							{i18n.t('admin.recruitment.leftAtLabel')}
						</label>
						<input
							id="left-at"
							type="datetime-local"
							bind:value={leftAt}
							class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
						/>
					</div>
				</div>
				<Input
					label={i18n.t('admin.recruitment.departureReasonLabel')}
					bind:value={departureReason}
				/>
				<div>
					<Button
						variant="primary"
						size="sm"
						onclick={recordDeparture}
						disabled={!canRecordDeparture}
						loading={recordingDeparture}
						data-testid="record-departure"
					>
						{i18n.t('admin.recruitment.departureBtn')}
					</Button>
				</div>
			</div>
		</section>
	{/if}
</div>

<Modal
	open={shortlistFor !== null}
	title={i18n.t('admin.recruitment.shortlistTitle')}
	onclose={() => (shortlistFor = null)}
	size="md"
>
	<div class="flex flex-col gap-4">
		{#if shortlistFor}
			<p class="text-xs text-text-muted">{shortlistFor.title} · {shortlistFor.company_name}</p>
		{/if}
		<Input label={i18n.t('admin.recruitment.talentIdLabel')} bind:value={talentId} />
		<Input
			label={i18n.t('admin.recruitment.matchReasonLabel')}
			hint={i18n.t('admin.recruitment.matchReasonHint', { n: MATCH_REASON_MIN })}
			bind:value={matchReason}
			oninput={() => (reasonTouched = true)}
			error={reasonError ?? undefined}
			data-testid="match-reason"
		/>
	</div>

	{#snippet actions()}
		<Button
			variant="secondary"
			size="sm"
			onclick={() => (shortlistFor = null)}
			disabled={shortlisting}
		>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={shortlist}
			disabled={!canShortlist}
			loading={shortlisting}
			data-testid="shortlist-submit"
		>
			{i18n.t('admin.recruitment.shortlistBtn')}
		</Button>
	{/snippet}
</Modal>
