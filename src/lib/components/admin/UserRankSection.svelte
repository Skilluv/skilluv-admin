<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type { Rank, UserRankHistoryEntry } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { History, ChevronsUp, AlertTriangle } from '@lucide/svelte';

	interface Props {
		userId: string;
		currentRank?: Rank;
		refreshKey?: number;
		onchange?: () => void;
	}

	let { userId, currentRank = 'apprenti', refreshKey = 0, onchange }: Props = $props();

	const RANKS: Rank[] = ['apprenti', 'ranger', 'artisan', 'maitre', 'doyen'];

	let history = $state<UserRankHistoryEntry[]>([]);
	let loading = $state(true);

	let showForce = $state(false);
	let targetRank = $state<Rank>('apprenti');
	let forceReason = $state('');
	let forceTouched = $state(false);
	let forcing = $state(false);
	let dryRunPeers = $state<number | null>(null);

	const reasonError = $derived.by(() => {
		if (!forceTouched) return null;
		const t = forceReason.trim();
		if (t.length === 0) return i18n.t('admin.confirmDialog.reasonRequired');
		if (t.length < 8) return i18n.t('admin.confirmDialog.reasonTooShort', { n: 8 });
		return null;
	});
	const canSubmit = $derived(
		!forcing && reasonError === null && forceReason.trim().length >= 8 && targetRank !== currentRank
	);

	$effect(() => {
		void refreshKey;
		void loadHistory();
	});

	async function loadHistory() {
		loading = true;
		try {
			const res = await adminApi.getUserRankHistory(userId);
			history = res.data.history;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function openForce() {
		targetRank = currentRank;
		forceReason = '';
		forceTouched = false;
		dryRunPeers = null;
		showForce = true;
	}

	async function submitDryRun() {
		if (forcing || targetRank === currentRank) return;
		forcing = true;
		try {
			const res = await adminApi.overrideUserRank(
				userId,
				{ new_rank: targetRank, reason: forceReason.trim() || 'preview' },
				true
			);
			// The dry-run response has a discriminated shape
			if ('would_override' in res.data) {
				dryRunPeers = res.data.would_override.peers_at_new_rank;
			}
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			forcing = false;
		}
	}

	async function submitForce() {
		forceTouched = true;
		if (!canSubmit) return;
		forcing = true;
		try {
			await adminApi.overrideUserRank(
				userId,
				{ new_rank: targetRank, reason: forceReason.trim() },
				false
			);
			toast.success(i18n.t('admin.userEnrichment.rank.forceDialog.successToast'));
			showForce = false;
			dryRunPeers = null;
			await loadHistory();
			onchange?.();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			forcing = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(
				i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US',
				{ day: '2-digit', month: 'short', year: 'numeric' }
			);
		} catch {
			return iso;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<History size={16} strokeWidth={2} class="text-primary" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.userEnrichment.rank.sectionTitle')}
			</h2>
		</div>
		<Button variant="secondary" size="sm" onclick={openForce}>
			<ChevronsUp size={14} strokeWidth={2} />
			{i18n.t('admin.userEnrichment.rank.forceRankBtn')}
		</Button>
	</div>
	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.rank.sectionHint')}
	</p>

	<div class="mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface-overlay p-3">
		<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
			{i18n.t('admin.userEnrichment.rank.currentLabel')}
		</span>
		<Badge variant="primary" size="md">
			{i18n.t(`admin.userEnrichment.rank.ranks.${currentRank}`)}
		</Badge>
	</div>

	<div class="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
		{i18n.t('admin.userEnrichment.rank.historyTitle')}
	</div>
	{#if loading}
		<Skeleton class="h-16 w-full" rounded="xl" />
	{:else if history.length === 0}
		<p class="rounded-xl border border-border bg-surface-overlay px-4 py-4 text-center text-sm text-text-muted">
			{i18n.t('admin.userEnrichment.rank.historyEmpty')}
		</p>
	{:else}
		<ol class="flex flex-col gap-1.5">
			{#each history as h, idx (idx)}
				<li class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-overlay px-3 py-2 text-xs">
					<div class="flex items-center gap-2">
						{#if h.from_rank}
							<Badge variant="default" size="sm">
								{i18n.t(`admin.userEnrichment.rank.ranks.${h.from_rank}`)}
							</Badge>
							<span class="text-text-muted">→</span>
						{/if}
						<Badge variant="primary" size="sm">
							{i18n.t(`admin.userEnrichment.rank.ranks.${h.to_rank}`)}
						</Badge>
						{#if h.reason}
							<span class="min-w-0 truncate text-text-muted">— {h.reason}</span>
						{/if}
					</div>
					<span class="text-text-muted">{fmtDate(h.achieved_at)}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<Modal
	open={showForce}
	title={i18n.t('admin.userEnrichment.rank.forceDialog.title')}
	onclose={() => (showForce = false)}
	size="md"
>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.userEnrichment.rank.forceDialog.currentRank')}
			</span>
			<Badge variant="primary" size="md">
				{i18n.t(`admin.userEnrichment.rank.ranks.${currentRank}`)}
			</Badge>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{i18n.t('admin.userEnrichment.rank.forceDialog.newRank')}
			</span>
			<Select
				items={RANKS.map((r) => ({
					value: r,
					label: i18n.t(`admin.userEnrichment.rank.ranks.${r}`)
				}))}
				bind:value={targetRank}
				shape="rounded"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="force-reason" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.userEnrichment.rank.forceDialog.reason')}
			</label>
			<textarea
				id="force-reason"
				bind:value={forceReason}
				oninput={() => (forceTouched = true)}
				rows="2"
				placeholder={i18n.t('admin.userEnrichment.rank.forceDialog.reasonPlaceholder')}
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if reasonError}
				<p class="text-xs text-error">{reasonError}</p>
			{/if}
		</div>
		{#if dryRunPeers !== null}
			<div class="flex items-center gap-2 rounded-xl border border-info bg-info-soft px-3 py-2 text-xs text-info">
				<AlertTriangle size={12} strokeWidth={2} />
				<span>
					{dryRunPeers} {i18n.t('admin.userEnrichment.rank.forceDialog.dryRunPeers')}
				</span>
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={() => (showForce = false)} disabled={forcing}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="secondary"
			size="sm"
			onclick={submitDryRun}
			disabled={forcing || targetRank === currentRank}
			loading={forcing}
		>
			{i18n.t('admin.userEnrichment.rank.forceDialog.dryRunBtn')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitForce} disabled={!canSubmit} loading={forcing}>
			{i18n.t('admin.userEnrichment.rank.forceDialog.submit')}
		</Button>
	{/snippet}
</Modal>
