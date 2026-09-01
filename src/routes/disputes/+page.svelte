<script lang="ts">
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { disputeQueueApi, type AwaitingDispute } from '$api/money';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { ChevronRight, RefreshCw, Scale } from '@lucide/svelte';

	let rows = $state<AwaitingDispute[]>([]);
	let loading = $state(true);
	let deciding = $state(false);

	/** The dispute a decision is being taken on, and which way it goes. */
	let target = $state<AwaitingDispute | null>(null);
	let inFavourOf = $state<'payer' | 'recipient'>('payer');

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleString(intlLocale(), {
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await disputeQueueApi.list();
			rows = res.data.disputes;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}

	function open(d: AwaitingDispute, side: 'payer' | 'recipient') {
		target = d;
		inFavourOf = side;
	}

	/**
	 * The note is required by the dialog and by the server.
	 *
	 * Both sides read it. The one who lost needs it more than the one who
	 * won, and a platform that decides without saying why earns the
	 * reputation of deciding in the dark.
	 */
	async function confirm(note: string) {
		if (!target) return;
		deciding = true;
		try {
			await disputeQueueApi.decide(target.id, inFavourOf, note);
			toast.success(i18n.t('admin.disputes.decided'));
			target = null;
			await load();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			deciding = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.disputes')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.disputes.label')}
			</p>
			<h1 class="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				{i18n.t('admin.disputes.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.disputes.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-32 w-full" rounded="xl" />{/each}
		</div>
	{:else if rows.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<Scale size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
			<p class="text-text-muted">{i18n.t('admin.disputes.empty')}</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each rows as d (d.id)}
				<article
					class="rounded-2xl border border-border bg-surface-elevated p-5 transition-colors hover:border-primary/40"
					data-testid="dispute-{d.id}"
				>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="text-lg font-bold">{d.amount} {d.currency}</p>
							<p class="mt-1 font-mono text-[10px] text-text-muted/70">{d.id}</p>
						</div>
						<span class="shrink-0 font-mono text-xs text-text-muted">{fmtDate(d.created_at)}</span>
					</div>

					<!-- Both accounts, side by side and equally weighted. An
					     operator reading only the complaint decides only the
					     complaint. -->
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div>
							<p class="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
								{i18n.t('admin.disputes.payerSays')}
							</p>
							<p class="text-sm">{d.reason}</p>
						</div>
						<div>
							<p class="mb-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
								{i18n.t('admin.disputes.recipientSays')}
							</p>
							<p class="text-sm">{d.recipient_response ?? '—'}</p>
						</div>
					</div>

					<div class="mt-4 flex flex-wrap gap-2">
						<Button variant="accent" size="sm" onclick={() => open(d, 'payer')}>
							{i18n.t('admin.disputes.refundPayer')}
						</Button>
						<Button variant="secondary" size="sm" onclick={() => open(d, 'recipient')}>
							{i18n.t('admin.disputes.payRecipient')}
						</Button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDangerousDialog
	open={target !== null}
	title={inFavourOf === 'payer'
		? i18n.t('admin.disputes.refundPayer')
		: i18n.t('admin.disputes.payRecipient')}
	description={target ? `${target.amount} ${target.currency}` : ''}
	actionLabel={i18n.t('admin.disputes.decide')}
	reasonPlaceholder={i18n.t('admin.disputes.notePlaceholder')}
	reasonHint={i18n.t('admin.disputes.noteHint')}
	requireReason={true}
	minReasonLength={10}
	loading={deciding}
	onconfirm={confirm}
	onclose={() => (target = null)}
/>
