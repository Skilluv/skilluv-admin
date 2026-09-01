<script lang="ts">
	import { engagementApi } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { UserVouching, VouchingBreakReport } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { HeartHandshake } from '@lucide/svelte';

	// SKI-46 — reputation staking. The list endpoint returns live vouchings
	// only (not broken, not expired), which is exactly the actionable set:
	// there is nothing to break in an already-broken one.
	//
	// Breaking is gated by a moderation capability, not by role='admin'.

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let vouchings = $state<UserVouching[]>([]);
	let loading = $state(true);
	let breakTarget = $state<UserVouching | null>(null);
	let breaking = $state(false);
	let lastReport = $state<VouchingBreakReport | null>(null);

	$effect(() => {
		void userId;
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await engagementApi.getUserVouchings(userId);
			vouchings = res.data.vouchings;
		} catch (e) {
			vouchings = [];
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	async function confirmBreak(reason: string) {
		if (!breakTarget || breaking) return;
		breaking = true;
		try {
			const res = await engagementApi.breakVouching(breakTarget.id, reason);
			lastReport = res.data;
			toast.success(i18n.t('admin.engagement.vouchings.brokenToast'));
			breakTarget = null;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			breaking = false;
		}
	}

	function stakeLabel(kind: string): string {
		const key = `admin.engagement.vouchings.atStake.${kind}`;
		const label = i18n.t(key);
		return label === key ? kind : label;
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString(intlLocale(), {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center gap-2">
		<HeartHandshake size={16} strokeWidth={2} class="text-accent" />
		<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.engagement.vouchings.sectionTitle')}
		</h2>
		{#if !loading && vouchings.length > 0}
			<span class="text-xs text-text-muted">
				{vouchings.length}
				{i18n.t('admin.engagement.vouchings.countLabel')}
			</span>
		{/if}
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.engagement.vouchings.sectionHint')}
	</p>

	{#if lastReport}
		<div class="mb-4 rounded-xl border border-border bg-surface-overlay p-4 text-xs">
			<p class="mb-2 uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.vouchings.reportTitle')}
			</p>
			<div class="mb-2 flex flex-wrap gap-2">
				<Badge variant={lastReport.penalty_applied ? 'error' : 'default'}>
					{lastReport.penalty_applied
						? i18n.t('admin.engagement.vouchings.reportPenaltyApplied')
						: i18n.t('admin.engagement.vouchings.reportNoPenalty')}
				</Badge>
			</div>
			<dl class="grid grid-cols-2 gap-1 text-text-muted">
				<dt>{i18n.t('admin.engagement.vouchings.reportRankBefore')}</dt>
				<dd class="font-mono text-text-primary">{lastReport.voucher_rank_before}</dd>
				<dt>{i18n.t('admin.engagement.vouchings.reportRankEffective')}</dt>
				<dd class="font-mono text-text-primary">{lastReport.voucher_rank_effective}</dd>
				{#if lastReport.penalty_until}
					<dt>{i18n.t('admin.engagement.vouchings.reportPenaltyUntil')}</dt>
					<dd class="font-mono text-text-primary">{fmtDate(lastReport.penalty_until)}</dd>
				{/if}
			</dl>
		</div>
	{/if}

	{#if loading}
		<Skeleton class="h-24 w-full" rounded="xl" />
	{:else if vouchings.length === 0}
		<p class="text-sm text-text-muted">{i18n.t('admin.engagement.vouchings.empty')}</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each vouchings as v (v.id)}
				<li class="rounded-xl border border-border bg-surface-overlay p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<a
									href={`/users/${v.voucher_id}`}
									class="text-sm font-medium text-primary hover:underline"
								>
									{v.voucher_display_name}
								</a>
								<Badge variant={v.at_stake_kind === 'rank_temporary' ? 'warning' : 'default'}>
									{stakeLabel(v.at_stake_kind)}
								</Badge>
							</div>
							<p class="mt-1 text-xs text-text-muted">
								{i18n.t('admin.engagement.vouchings.activeUntilLabel')}
								<span class="font-mono text-text-primary">{fmtDate(v.active_until)}</span>
							</p>
							<p class="mt-2 text-sm {v.statement ? 'text-text-primary' : 'text-text-muted'}">
								{v.statement || i18n.t('admin.engagement.vouchings.noStatement')}
							</p>
						</div>
						<Button variant="danger" size="sm" onclick={() => (breakTarget = v)}>
							{i18n.t('admin.engagement.vouchings.breakBtn')}
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<ConfirmDangerousDialog
	open={breakTarget !== null}
	title={i18n.t('admin.engagement.vouchings.breakDialogTitle')}
	description={breakTarget
		? `${i18n.t('admin.engagement.vouchings.voucherLabel')}: ${breakTarget.voucher_display_name}`
		: ''}
	actionLabel={i18n.t('admin.engagement.vouchings.breakBtn')}
	reasonHint={i18n.t('admin.engagement.vouchings.breakReasonHint')}
	minReasonLength={8}
	loading={breaking}
	onconfirm={confirmBreak}
	onclose={() => (breakTarget = null)}
/>
