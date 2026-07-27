<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { SkilluError } from '$api/client';
	import { adminApi, type KycEntry, type KycStatus, type KycLevel } from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import { ShieldCheck, ShieldX, FileText, Euro, ChevronRight, RefreshCw } from '@lucide/svelte';

	let queue = $state<KycEntry[]>([]);
	let loading = $state(true);
	let statusFilter = $state<'all' | KycStatus>('pending');

	// Decision modal
	let showDecide = $state(false);
	let deciding = $state(false);
	let target = $state<KycEntry | null>(null);
	let action = $state<'approve' | 'reject'>('approve');
	let level = $state<'basic' | 'full'>('basic');
	let reason = $state('');

	async function load() {
		loading = true;
		try {
			const res = await adminApi.listKycQueue();
			queue = res.data.queue;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loading = false;
		}
	}

	const filtered = $derived(
		statusFilter === 'all' ? queue : queue.filter((k) => k.status === statusFilter)
	);

	const counts = $derived({
		pending: queue.filter((k) => k.status === 'pending').length,
		approved: queue.filter((k) => k.status === 'approved').length,
		rejected: queue.filter((k) => k.status === 'rejected').length
	});

	function openDecide(entry: KycEntry, initialAction: 'approve' | 'reject') {
		target = entry;
		action = initialAction;
		level = entry.level === 'full' ? 'full' : 'basic';
		reason = '';
		showDecide = true;
	}

	async function submitDecide(e: SubmitEvent) {
		e.preventDefault();
		if (!target || deciding) return;
		if (action === 'reject' && !reason.trim()) {
			toast.error(i18n.t('admin.kyc.reasonRequired'));
			return;
		}
		deciding = true;
		try {
			await adminApi.decideKyc(target.enterprise_id, {
				action,
				level: action === 'approve' ? level : undefined,
				reason: action === 'reject' ? reason.trim() : undefined
			});
			toast.success(action === 'approve' ? i18n.t('admin.kyc.approvedToast') : i18n.t('admin.kyc.rejectedToast'));
			showDecide = false;
			target = null;
			await load();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			deciding = false;
		}
	}

	function statusVariant(s: KycStatus): 'default' | 'warning' | 'success' | 'error' {
		return s === 'pending' ? 'warning' : s === 'approved' ? 'success' : 'error';
	}

	function statusLabel(s: KycStatus): string {
		return s === 'pending'
			? i18n.t('admin.kyc.statusPending')
			: s === 'approved'
				? i18n.t('admin.kyc.statusApproved')
				: i18n.t('admin.kyc.statusRejected');
	}

	function levelVariant(l: KycLevel): 'default' | 'primary' | 'accent' {
		return l === 'full' ? 'accent' : l === 'basic' ? 'primary' : 'default';
	}

	// Intl formatters : la locale est un tag BCP-47, pas une chaîne UI.

	function fmtEur(cents: number): string {
		return new Intl.NumberFormat(intlLocale(), {
			style: 'currency',
			currency: 'EUR',
			maximumFractionDigits: 0
		}).format(cents / 100);
	}

	function fmtDate(iso: string): string {
		return new Intl.DateTimeFormat(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(iso));
	}

	// Auth enforced by hooks.server.ts — client re-check was racy on deep-links.
	onMount(() => void load());
</script>

<svelte:head>
	<title>{i18n.t('admin.nav.kycEnterprises')} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.kycEnterprises')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{i18n.t('admin.kyc.complianceLabel')}</p>
			<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
				{i18n.t('admin.kyc.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.kyc.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} loading={loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<div class="mb-6 flex flex-wrap items-center gap-4">
		<SegmentedControl
			items={[
				{ value: 'pending', label: `${i18n.t('admin.common.pending')} (${counts.pending})` },
				{ value: 'approved', label: `${i18n.t('admin.common.approved')} (${counts.approved})` },
				{ value: 'rejected', label: `${i18n.t('admin.common.rejected')} (${counts.rejected})` },
				{ value: 'all', label: i18n.t('admin.common.all') }
			]}
			bind:value={statusFilter}
		/>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}
				<Skeleton class="h-24 w-full" rounded="xl" />
			{/each}
		</div>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<ShieldCheck size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
			<p class="text-text-muted">{i18n.t('admin.kyc.noFile')}</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each filtered as k (k.enterprise_id)}
				<div
					class="flex items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-5 hover:border-primary/40 transition-colors"
				>
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary uppercase">
						{k.company_name.charAt(0)}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2 flex-wrap">
							<h2 class="text-lg font-bold truncate">{k.company_name}</h2>
							<Badge variant={statusVariant(k.status)} size="sm">{statusLabel(k.status)}</Badge>
							<Badge variant={levelVariant(k.level)} size="sm">
								{i18n.t('admin.common.level')} {k.level}
							</Badge>
						</div>
						<div class="mt-1 flex items-center gap-4 text-xs text-text-muted flex-wrap">
							<span class="flex items-center gap-1">
								<FileText size={12} strokeWidth={2} />
								{k.documents_count} {i18n.t('admin.kyc.documents')}
							</span>
							<span class="flex items-center gap-1">
								<Euro size={12} strokeWidth={2} />
								{fmtEur(k.monthly_spend_eur_cents)} / {i18n.t('admin.kyc.perMonth')}
							</span>
							<span class="font-mono">{fmtDate(k.updated_at)}</span>
						</div>
						<p class="mt-1 font-mono text-[10px] text-text-muted/70 truncate">{k.enterprise_id}</p>
					</div>
					{#if k.status === 'pending'}
						<div class="flex items-center gap-2 shrink-0">
							<Button variant="secondary" size="sm" onclick={() => openDecide(k, 'reject')}>
								<ShieldX size={14} strokeWidth={2} />
								{i18n.t('admin.common.reject')}
							</Button>
							<Button variant="accent" size="sm" onclick={() => openDecide(k, 'approve')}>
								<ShieldCheck size={14} strokeWidth={2} />
								{i18n.t('admin.common.approve')}
							</Button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<Modal
	open={showDecide}
	title={action === 'approve' ? i18n.t('admin.kyc.approveTitle') : i18n.t('admin.kyc.rejectTitle')}
	onclose={() => (showDecide = false)}
>
	<form onsubmit={submitDecide} class="space-y-4">
		{#if target}
			<div class="rounded-xl border border-border bg-surface-overlay p-4">
				<p class="text-xs uppercase tracking-wider text-text-muted mb-1">
					{i18n.t('admin.kyc.enterpriseLabel')}
				</p>
				<p class="font-bold">{target.company_name}</p>
				<p class="font-mono text-xs text-text-muted mt-1">{target.enterprise_id}</p>
			</div>
		{/if}

		{#if action === 'approve'}
			<div>
				<label class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted" for="k-level">
					{i18n.t('admin.kyc.grantedLevel')}
				</label>
				<Select
					items={[
						{ value: 'basic', label: i18n.t('admin.kyc.basicOption') },
						{ value: 'full', label: i18n.t('admin.kyc.fullOption') }
					]}
					bind:value={level}
					class="w-full"
				/>
				<p class="mt-2 text-xs text-text-muted">{i18n.t('admin.kyc.levelHint')}</p>
			</div>
		{:else}
			<div>
				<label for="k-reason" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.kyc.rejectionReason')} *
				</label>
				<textarea
					id="k-reason"
					bind:value={reason}
					required
					rows="4"
					placeholder={i18n.t('admin.kyc.reasonPlaceholder')}
					class="w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none"
				></textarea>
				<p class="mt-2 text-xs text-text-muted">{i18n.t('admin.kyc.reasonHint')}</p>
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={() => (showDecide = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant={action === 'approve' ? 'accent' : 'danger'} loading={deciding}>
				{action === 'approve' ? i18n.t('admin.common.approve') : i18n.t('admin.common.reject')}
			</Button>
		</div>
	</form>
</Modal>
