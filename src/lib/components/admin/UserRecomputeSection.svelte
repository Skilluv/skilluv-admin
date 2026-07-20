<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		RecomputeProofsBody,
		RecomputeProofsReport,
		RecomputeProofsDryRunPreview
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import { RefreshCw, Info } from '@lucide/svelte';

	interface Props {
		userId: string;
		onchange?: () => void;
	}

	let { userId, onchange }: Props = $props();

	type Scope = 'all' | 'capabilities' | 'badges' | 'ranks';

	let showDialog = $state(false);
	let scope = $state<Scope>('all');
	let reason = $state('');
	let submitting = $state(false);

	let dryRunPreview = $state<RecomputeProofsDryRunPreview | null>(null);
	let lastReport = $state<RecomputeProofsReport | null>(null);

	function openDialog() {
		scope = 'all';
		reason = '';
		dryRunPreview = null;
		lastReport = null;
		showDialog = true;
	}

	function buildBody(): RecomputeProofsBody {
		return {
			scope,
			reason: reason.trim() || undefined
		};
	}

	async function submitDryRun() {
		if (submitting) return;
		submitting = true;
		lastReport = null;
		try {
			const res = await adminApi.recomputeUserProofs(userId, buildBody(), true);
			dryRunPreview = res.data as RecomputeProofsDryRunPreview;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			submitting = false;
		}
	}

	async function submitRun() {
		if (submitting) return;
		submitting = true;
		try {
			const res = await adminApi.recomputeUserProofs(userId, buildBody(), false);
			lastReport = res.data as RecomputeProofsReport;
			dryRunPreview = null;
			toast.success(i18n.t('admin.userEnrichment.recompute.runSuccessToast'));
			onchange?.();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			submitting = false;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<RefreshCw size={16} strokeWidth={2} class="text-primary" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.userEnrichment.recompute.sectionTitle')}
			</h2>
		</div>
		<Button variant="secondary" size="sm" onclick={openDialog}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.userEnrichment.recompute.runBtn')}
		</Button>
	</div>
	<p class="text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.recompute.sectionHint')}
	</p>
</section>

<Modal
	open={showDialog}
	title={i18n.t('admin.userEnrichment.recompute.dialogTitle')}
	onclose={() => (showDialog = false)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<p class="flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.userEnrichment.recompute.dialogDescription')}</span>
		</p>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{i18n.t('admin.userEnrichment.recompute.scopeLabel')}
			</span>
			<Select
				items={[
					{ value: 'all', label: i18n.t('admin.userEnrichment.recompute.scopeAll') },
					{ value: 'capabilities', label: i18n.t('admin.userEnrichment.recompute.scopeCapabilities') },
					{ value: 'badges', label: i18n.t('admin.userEnrichment.recompute.scopeBadges') },
					{ value: 'ranks', label: i18n.t('admin.userEnrichment.recompute.scopeRanks') }
				]}
				bind:value={scope}
				shape="rounded"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="recompute-reason" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.userEnrichment.recompute.dialogReasonPlaceholder')}
			</label>
			<textarea
				id="recompute-reason"
				bind:value={reason}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>

		{#if dryRunPreview}
			<div class="rounded-xl border border-info bg-info-soft p-3 text-xs">
				<p class="mb-2 font-semibold uppercase tracking-wider text-info">
					{i18n.t('admin.userEnrichment.recompute.dryRunLabel')}
				</p>
				<ul class="flex flex-col gap-1">
					<li>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.dryRunCurrentRank')}
						</span>
						{#if dryRunPreview.current_state.rank}
							<Badge variant="primary" size="sm">
								{i18n.t(`admin.userEnrichment.rank.ranks.${dryRunPreview.current_state.rank}`)}
							</Badge>
						{:else}
							<span class="text-text-muted">—</span>
						{/if}
					</li>
					<li>
						{dryRunPreview.current_state.capabilities_active_count}
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.dryRunCapsCount')}
						</span>
					</li>
					<li>
						{dryRunPreview.current_state.badges_active_count}
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.dryRunBadgesCount')}
						</span>
					</li>
				</ul>
			</div>
		{/if}

		{#if lastReport}
			<div class="rounded-xl border border-success bg-success-soft p-3 text-xs">
				<p class="mb-2 font-semibold uppercase tracking-wider text-success">
					{i18n.t('admin.userEnrichment.recompute.reportTitle')}
				</p>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<div>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.reportRankBefore')}:
						</span>
						<Badge variant="default" size="sm">
							{i18n.t(`admin.userEnrichment.rank.ranks.${lastReport.recomputed.rank_before}`)}
						</Badge>
					</div>
					<div>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.reportRankAfter')}:
						</span>
						<Badge variant="primary" size="sm">
							{i18n.t(`admin.userEnrichment.rank.ranks.${lastReport.recomputed.rank_after}`)}
						</Badge>
					</div>
					<div>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.reportCapsAdded')}:
						</span>
						{lastReport.recomputed.capabilities_added.length}
						{#if lastReport.recomputed.capabilities_added.length > 0}
							<span class="text-text-muted">
								({lastReport.recomputed.capabilities_added.join(', ')})
							</span>
						{/if}
					</div>
					<div>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.reportBadgesAdded')}:
						</span>
						{lastReport.recomputed.badges_added.length}
					</div>
					<div>
						<span class="text-text-muted">
							{i18n.t('admin.userEnrichment.recompute.reportBadgesRevoked')}:
						</span>
						{lastReport.recomputed.badges_removed.length}
					</div>
					{#if lastReport.recomputed.errors.length > 0}
						<div class="sm:col-span-2">
							<span class="text-warning">
								{i18n.t('admin.userEnrichment.recompute.reportErrors')}:
							</span>
							{lastReport.recomputed.errors.join('; ')}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (showDialog = false)} disabled={submitting}>
			{i18n.t('admin.common.close')}
		</Button>
		<Button variant="secondary" size="sm" onclick={submitDryRun} loading={submitting} disabled={submitting}>
			{i18n.t('admin.userEnrichment.recompute.dryRunBtn')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitRun} loading={submitting} disabled={submitting}>
			{i18n.t('admin.userEnrichment.recompute.runBtn')}
		</Button>
	{/snippet}
</Modal>
