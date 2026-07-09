<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$stores/toast.svelte';
	import { SkilluError } from '$api/client';
	import {
		adminApi,
		type SponsoredRequest,
		type SponsoredStatus
	} from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import {
		Megaphone,
		Check,
		X,
		MessageSquare,
		Link2,
		ChevronRight,
		RefreshCw,
		Euro,
		Calendar,
		Gauge
	} from '@lucide/svelte';

	let requests = $state<SponsoredRequest[]>([]);
	let loading = $state(true);
	let statusFilter = $state<'all' | SponsoredStatus>('pending');

	// Decide modal
	let showDecide = $state(false);
	let deciding = $state(false);
	let target = $state<SponsoredRequest | null>(null);
	let action = $state<'approve' | 'reject' | 'negotiate'>('approve');
	let adminNotes = $state('');

	// Link modal
	let showLink = $state(false);
	let linking = $state(false);
	let linkTarget = $state<SponsoredRequest | null>(null);
	let linkChallengeId = $state('');
	let sponsorLogoUrl = $state('');
	let sponsorBlurb = $state('');
	let sponsorVisibleUntil = $state('');
	let freeContactUntil = $state('');

	async function load() {
		loading = true;
		try {
			const res = await adminApi.listSponsoredRequests();
			requests = res.data.requests;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loading = false;
		}
	}

	const filtered = $derived(
		statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter)
	);

	const counts = $derived({
		pending: requests.filter((r) => r.status === 'pending').length,
		approved: requests.filter((r) => r.status === 'approved').length,
		negotiating: requests.filter((r) => r.status === 'negotiating').length,
		linked: requests.filter((r) => r.status === 'linked').length,
		rejected: requests.filter((r) => r.status === 'rejected').length
	});

	function openDecide(entry: SponsoredRequest, initialAction: 'approve' | 'reject' | 'negotiate') {
		target = entry;
		action = initialAction;
		adminNotes = '';
		showDecide = true;
	}

	function openLink(entry: SponsoredRequest) {
		linkTarget = entry;
		linkChallengeId = entry.challenge_id ?? '';
		sponsorLogoUrl = '';
		sponsorBlurb = '';
		// Défaut : visible 90 jours, contact libre 30 jours à partir d'aujourd'hui.
		const now = new Date();
		const visible = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
		const contact = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
		sponsorVisibleUntil = visible.toISOString().slice(0, 10);
		freeContactUntil = contact.toISOString().slice(0, 10);
		showLink = true;
	}

	async function submitDecide(e: SubmitEvent) {
		e.preventDefault();
		if (!target || deciding) return;
		deciding = true;
		try {
			await adminApi.decideSponsored(target.id, {
				action,
				admin_notes: adminNotes.trim() || undefined
			});
			toast.success(
				action === 'approve'
					? i18n.t('admin.sponsored.requestApproved')
					: action === 'reject'
						? i18n.t('admin.sponsored.requestRejected')
						: i18n.t('admin.sponsored.negotiationOpened')
			);
			showDecide = false;
			target = null;
			await load();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			deciding = false;
		}
	}

	async function submitLink(e: SubmitEvent) {
		e.preventDefault();
		if (!linkTarget || linking || !linkChallengeId.trim()) return;
		linking = true;
		try {
			await adminApi.linkSponsored(linkTarget.id, {
				challenge_id: linkChallengeId.trim(),
				sponsor_logo_url: sponsorLogoUrl.trim() || undefined,
				sponsor_blurb: sponsorBlurb.trim() || undefined,
				sponsor_visible_until: new Date(sponsorVisibleUntil).toISOString(),
				free_contact_until: new Date(freeContactUntil).toISOString()
			});
			toast.success(i18n.t('admin.sponsored.challengeLinked'));
			showLink = false;
			linkTarget = null;
			await load();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			linking = false;
		}
	}

	function statusVariant(s: SponsoredStatus): 'default' | 'warning' | 'primary' | 'success' | 'error' | 'accent' {
		switch (s) {
			case 'pending':
				return 'warning';
			case 'negotiating':
				return 'primary';
			case 'approved':
				return 'accent';
			case 'linked':
				return 'success';
			case 'rejected':
				return 'error';
		}
	}

	function statusLabel(s: SponsoredStatus): string {
		return {
			pending: i18n.t('admin.sponsored.statusPending'),
			approved: i18n.t('admin.sponsored.statusApproved'),
			negotiating: i18n.t('admin.sponsored.statusNegotiating'),
			linked: i18n.t('admin.sponsored.statusLinked'),
			rejected: i18n.t('admin.sponsored.statusRejected')
		}[s];
	}

	function intlLocale(): string {
		return i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US';
	}

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
			year: 'numeric'
		}).format(new Date(iso));
	}

	function difficultyLabel(d: number): string {
		return '★'.repeat(Math.max(1, Math.min(5, d)));
	}

	onMount(() => {
		if (!auth.isAuthenticated) {
			void goto('/auth/login?redirect=/sponsored-challenges');
			return;
		}
		void load();
	});
</script>

<svelte:head>
	<title>{i18n.t('admin.nav.sponsorings')} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.nav.sponsorings')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{i18n.t('admin.dashboard.revenueLabel')}</p>
			<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
				{i18n.t('admin.sponsored.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">{i18n.t('admin.sponsored.subtitle')}</p>
		</div>
		<Button variant="secondary" onclick={load} loading={loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	<div class="mb-6 flex flex-wrap items-center gap-4">
		<SegmentedControl
			items={[
				{ value: 'pending', label: `${statusLabel('pending')} (${counts.pending})` },
				{ value: 'negotiating', label: `${statusLabel('negotiating')} (${counts.negotiating})` },
				{ value: 'approved', label: `${statusLabel('approved')} (${counts.approved})` },
				{ value: 'linked', label: `${statusLabel('linked')} (${counts.linked})` },
				{ value: 'rejected', label: `${statusLabel('rejected')} (${counts.rejected})` },
				{ value: 'all', label: i18n.t('admin.common.all') }
			]}
			bind:value={statusFilter}
		/>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}
				<Skeleton class="h-32 w-full" rounded="xl" />
			{/each}
		</div>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<Megaphone size={32} strokeWidth={2} class="mx-auto mb-3 text-text-muted" />
			<p class="text-text-muted">{i18n.t('admin.sponsored.noRequest')}</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each filtered as r (r.id)}
				<div class="rounded-2xl border border-border bg-surface-elevated p-5">
					<div class="flex items-start gap-4">
						<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
							<Megaphone size={22} strokeWidth={2} />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 flex-wrap">
								<h2 class="text-lg font-bold truncate">{r.proposed_title}</h2>
								<Badge variant={statusVariant(r.status)} size="sm">{statusLabel(r.status)}</Badge>
								<Badge variant="default" size="sm">{r.skill_domain}</Badge>
							</div>
							<p class="mt-2 text-sm text-text-muted line-clamp-2">{r.brief}</p>
							<div class="mt-3 flex items-center gap-4 text-xs text-text-muted flex-wrap">
								<span class="flex items-center gap-1">
									<Euro size={12} strokeWidth={2} />
									{fmtEur(r.budget_eur_cents)}
								</span>
								<span class="flex items-center gap-1">
									<Calendar size={12} strokeWidth={2} />
									{r.duration_days} {i18n.t('admin.sponsored.daysSuffix')}
								</span>
								<span class="flex items-center gap-1">
									<Gauge size={12} strokeWidth={2} />
									<span class="text-accent">{difficultyLabel(r.difficulty)}</span>
								</span>
								<span>{fmtDate(r.created_at)}</span>
							</div>
							<p class="mt-2 font-mono text-[10px] text-text-muted/70 truncate">
								req: {r.id} · ent: {r.enterprise_id}
								{#if r.challenge_id}
									· ch: {r.challenge_id}
								{/if}
							</p>
						</div>
					</div>

					{#if r.status === 'pending' || r.status === 'negotiating'}
						<div class="mt-4 flex items-center gap-2 flex-wrap pt-4 border-t border-border">
							<Button variant="secondary" size="sm" onclick={() => openDecide(r, 'reject')}>
								<X size={14} strokeWidth={2} />
								{i18n.t('admin.common.reject')}
							</Button>
							{#if r.status === 'pending'}
								<Button variant="secondary" size="sm" onclick={() => openDecide(r, 'negotiate')}>
									<MessageSquare size={14} strokeWidth={2} />
									{i18n.t('admin.sponsored.negotiate')}
								</Button>
							{/if}
							<Button variant="accent" size="sm" onclick={() => openDecide(r, 'approve')}>
								<Check size={14} strokeWidth={2} />
								{i18n.t('admin.common.approve')}
							</Button>
						</div>
					{:else if r.status === 'approved'}
						<div class="mt-4 flex items-center gap-2 flex-wrap pt-4 border-t border-border">
							<Button variant="accent" size="sm" onclick={() => openLink(r)}>
								<Link2 size={14} strokeWidth={2} />
								{i18n.t('admin.sponsored.linkToChallenge')}
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
	title={action === 'approve'
		? i18n.t('admin.sponsored.approveTitle')
		: action === 'reject'
			? i18n.t('admin.sponsored.rejectTitle')
			: i18n.t('admin.sponsored.negotiateTitle')}
	onclose={() => (showDecide = false)}
>
	<form onsubmit={submitDecide} class="space-y-4">
		{#if target}
			<div class="rounded-xl border border-border bg-surface-overlay p-4">
				<p class="text-xs uppercase tracking-wider text-text-muted mb-1">
					{i18n.t('admin.sponsored.requestLabel')}
				</p>
				<p class="font-bold">{target.proposed_title}</p>
				<p class="text-xs text-text-muted mt-1">
					{fmtEur(target.budget_eur_cents)} · {target.duration_days} {i18n.t('admin.sponsored.daysSuffix')} · {target.skill_domain}
				</p>
			</div>
		{/if}

		<div>
			<label for="s-action" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.actionLabel')}
			</label>
			<Select
				items={[
					{ value: 'approve', label: i18n.t('admin.common.approve') },
					{ value: 'negotiate', label: i18n.t('admin.sponsored.negotiate') },
					{ value: 'reject', label: i18n.t('admin.common.reject') }
				]}
				bind:value={action}
				class="w-full"
			/>
		</div>

		<div>
			<label for="s-notes" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.internalNotes')}
				{#if action === 'reject' || action === 'negotiate'}
					<span class="text-text-muted normal-case font-normal">
						· {i18n.t('admin.common.recommended')}
					</span>
				{/if}
			</label>
			<textarea
				id="s-notes"
				bind:value={adminNotes}
				rows="4"
				placeholder={action === 'reject'
					? i18n.t('admin.sponsored.notesRejectPlaceholder')
					: action === 'negotiate'
						? i18n.t('admin.sponsored.notesNegotiatePlaceholder')
						: i18n.t('admin.sponsored.notesDefaultPlaceholder')}
				class="w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none"
			></textarea>
			<p class="mt-2 text-xs text-text-muted">{i18n.t('admin.sponsored.notesHint')}</p>
		</div>

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={() => (showDecide = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant={action === 'reject' ? 'danger' : 'accent'} loading={deciding}>
				{action === 'approve'
					? i18n.t('admin.common.approve')
					: action === 'reject'
						? i18n.t('admin.common.reject')
						: i18n.t('admin.sponsored.negotiate')}
			</Button>
		</div>
	</form>
</Modal>

<Modal
	open={showLink}
	size="lg"
	title={i18n.t('admin.sponsored.linkTitle')}
	onclose={() => (showLink = false)}
>
	<form onsubmit={submitLink} class="space-y-4">
		{#if linkTarget}
			<div class="rounded-xl border border-border bg-surface-overlay p-4">
				<p class="text-xs uppercase tracking-wider text-text-muted mb-1">
					{i18n.t('admin.sponsored.approvedRequestLabel')}
				</p>
				<p class="font-bold">{linkTarget.proposed_title}</p>
				<p class="text-xs text-text-muted mt-1">
					{fmtEur(linkTarget.budget_eur_cents)} · {linkTarget.duration_days} {i18n.t('admin.sponsored.daysSuffix')}
				</p>
			</div>
		{/if}

		<div>
			<label for="l-cid" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.common.challengeIdLabel')} *
			</label>
			<input
				id="l-cid"
				bind:value={linkChallengeId}
				required
				placeholder="uuid…"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 font-mono text-xs focus:border-primary focus:outline-none"
			/>
			<p class="mt-1 text-xs text-text-muted">{i18n.t('admin.sponsored.challengeIdHint')}</p>
		</div>

		<div>
			<label for="l-logo" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.sponsorLogo')}
			</label>
			<input
				id="l-logo"
				bind:value={sponsorLogoUrl}
				placeholder="https://cdn…/logo.svg"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
			/>
		</div>

		<div>
			<label for="l-blurb" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.sponsorBlurb')}
			</label>
			<textarea
				id="l-blurb"
				bind:value={sponsorBlurb}
				rows="3"
				placeholder={i18n.t('admin.sponsored.blurbPlaceholder')}
				class="w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none"
			></textarea>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="l-visible" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.sponsored.visibleUntil')} *
				</label>
				<input
					id="l-visible"
					type="date"
					bind:value={sponsorVisibleUntil}
					required
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
			<div>
				<label for="l-contact" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.sponsored.freeContactUntil')} *
				</label>
				<input
					id="l-contact"
					type="date"
					bind:value={freeContactUntil}
					required
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
		</div>
		<p class="text-xs text-text-muted">{i18n.t('admin.sponsored.visibilityHint')}</p>

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={() => (showLink = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={linking}>
				<Link2 size={14} strokeWidth={2} />
				{i18n.t('admin.sponsored.linkBtn')}
			</Button>
		</div>
	</form>
</Modal>
