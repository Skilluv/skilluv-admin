<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { SkilluError } from '$api/client';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		EnterpriseAdmin,
		EnterpriseType,
		EnterpriseTypeConfig,
		AgencyClient
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import {
		ArrowLeft,
		ShieldCheck,
		ShieldOff,
		Building2,
		Users,
		Settings2,
		Info,
		AlertTriangle
	} from '@lucide/svelte';

	const TYPES: EnterpriseType[] = ['direct_hire', 'staffing_agency', 'remote_international'];

	let enterpriseId = $derived($page.params.id ?? '');
	let enterprise = $state<EnterpriseAdmin | null>(null);
	let typeConfig = $state<EnterpriseTypeConfig | null>(null);
	let agencyClients = $state<AgencyClient[]>([]);
	let loading = $state(true);
	let notFound = $state(false);

	// Change-type dialog
	let showChangeType = $state(false);
	let targetType = $state<EnterpriseType>('direct_hire');
	let changeReason = $state('');
	let changeTouched = $state(false);
	let changing = $state(false);
	let dryRunPreview = $state<{ will_reset_type_config: boolean; target_type: EnterpriseType } | null>(
		null
	);

	const reasonError = $derived.by(() => {
		if (!changeTouched) return null;
		const t = changeReason.trim();
		if (t.length === 0) return i18n.t('admin.confirmDialog.reasonRequired');
		if (t.length < 8) return i18n.t('admin.confirmDialog.reasonTooShort', { n: 8 });
		return null;
	});

	const canSubmit = $derived(
		!changing && reasonError === null && changeReason.trim().length >= 8
	);

	$effect(() => {
		if (enterpriseId) {
			void loadAll();
		}
	});

	async function loadAll() {
		loading = true;
		notFound = false;
		try {
			// Phase 6 gap-fix : GET /admin/enterprises/{id} existe désormais.
			// Plus de scan paginé de la liste.
			const [entRes, tcRes, clientsRes] = await Promise.all([
				adminApi.getAdminEnterprise(enterpriseId),
				adminApi.getEnterpriseTypeConfig(enterpriseId),
				adminApi.listEnterpriseAgencyClients(enterpriseId)
			]);
			enterprise = entRes.data.enterprise;
			typeConfig = tcRes.data;
			agencyClients = clientsRes.data.clients;
		} catch (e) {
			if (e instanceof SkilluError && e.status === 404) {
				notFound = true;
			} else {
				toast.error(errorMessage(e));
			}
		} finally {
			loading = false;
		}
	}

	function openChangeType() {
		if (!enterprise) return;
		targetType = enterprise.enterprise_type;
		changeReason = '';
		changeTouched = false;
		dryRunPreview = null;
		showChangeType = true;
	}

	async function submitDryRun() {
		if (!enterprise || changing) return;
		changing = true;
		try {
			const res = await adminApi.patchEnterpriseType(
				enterprise.id,
				{ enterprise_type: targetType, reason: changeReason.trim() || 'dry-run preview' },
				true
			);
			dryRunPreview = res.meta.dry_run_preview ?? null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			changing = false;
		}
	}

	async function submitChange() {
		changeTouched = true;
		if (!canSubmit || !enterprise) return;
		changing = true;
		try {
			await adminApi.patchEnterpriseType(
				enterprise.id,
				{ enterprise_type: targetType, reason: changeReason.trim() },
				false
			);
			toast.success(i18n.t('admin.enterprises.changeType.successToast'));
			showChangeType = false;
			dryRunPreview = null;
			await loadAll();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			changing = false;
		}
	}

	function fmtDate(iso: string): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString(
				i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US',
				{ day: '2-digit', month: 'short', year: 'numeric' }
			);
		} catch {
			return iso;
		}
	}

	const typeConfigJson = $derived(
		typeConfig ? JSON.stringify(typeConfig.type_config, null, 2) : '{}'
	);
	const typeConfigEmpty = $derived(
		!typeConfig || Object.keys(typeConfig.type_config).length === 0
	);
</script>

<svelte:head>
	<title>
		{enterprise ? enterprise.company_name : i18n.t('admin.enterprises.detailTitle')} — Admin Skilluv
	</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6">
		<Button variant="ghost" size="sm" onclick={() => goto('/enterprises')}>
			<ArrowLeft size={14} strokeWidth={2} />
			{i18n.t('admin.enterprises.backToList')}
		</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-4">
			<Skeleton class="h-24 w-full" rounded="xl" />
			<Skeleton class="h-32 w-full" rounded="xl" />
			<Skeleton class="h-40 w-full" rounded="xl" />
		</div>
	{:else if notFound}
		<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
			<p class="text-sm text-text-muted">{i18n.t('admin.enterprises.detail.loading404')}</p>
		</div>
	{:else if enterprise && typeConfig}
		<!-- Section : Overview -->
		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-4 flex items-start justify-between gap-4">
				<div class="flex items-start gap-3">
					<div class="rounded-xl bg-primary/15 p-2 text-primary">
						<Building2 size={20} strokeWidth={2} />
					</div>
					<div>
						<h1 class="text-xl font-bold text-text-primary">{enterprise.company_name}</h1>
						<code class="font-mono text-xs text-text-muted">{enterprise.slug}</code>
					</div>
				</div>
				<Button variant="primary" size="sm" onclick={openChangeType}>
					<Settings2 size={14} strokeWidth={2} />
					{i18n.t('admin.enterprises.detail.changeTypeBtn')}
				</Button>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<div class="flex flex-col gap-1">
					<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
						{i18n.t('admin.enterprises.detail.typeLabel')}
					</span>
					<Badge variant="primary" size="md">
						{i18n.t(`admin.enterprises.types.${enterprise.enterprise_type}`)}
					</Badge>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
						{i18n.t('admin.enterprises.detail.verifiedLabel')}
					</span>
					{#if enterprise.verified}
						<span class="inline-flex items-center gap-1 text-sm text-success">
							<ShieldCheck size={14} strokeWidth={2} />
							{i18n.t('admin.enterprises.verifiedYes')}
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 text-sm text-text-muted">
							<ShieldOff size={14} strokeWidth={2} />
							{i18n.t('admin.enterprises.verifiedNo')}
						</span>
					{/if}
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
						{i18n.t('admin.enterprises.detail.industryLabel')}
					</span>
					<span class="text-sm text-text-primary">{enterprise.industry ?? '—'}</span>
				</div>
				<div class="flex flex-col gap-1">
					<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
						{i18n.t('admin.enterprises.detail.createdAtLabel')}
					</span>
					<span class="text-sm text-text-primary">{fmtDate(enterprise.created_at)}</span>
				</div>
			</div>
		</section>

		<!-- Section : type_config -->
		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-3 flex items-center gap-2">
				<Settings2 size={16} strokeWidth={2} class="text-primary" />
				<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.enterprises.detail.sectionTypeConfig')}
				</h2>
			</div>
			{#if typeConfigEmpty}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
					{i18n.t('admin.enterprises.detail.typeConfigEmpty')}
				</p>
			{:else}
				<details class="rounded-xl border border-border bg-surface-overlay p-3">
					<summary class="cursor-pointer text-xs font-medium uppercase tracking-wider text-primary">
						JSON
					</summary>
					<pre class="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-text-primary">{typeConfigJson}</pre>
				</details>
			{/if}
		</section>

		<!-- Section : agency clients -->
		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-3 flex items-center gap-2">
				<Users size={16} strokeWidth={2} class="text-primary" />
				<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.enterprises.detail.sectionAgencyClients')}
				</h2>
			</div>
			{#if enterprise.enterprise_type !== 'staffing_agency'}
				<p class="mb-3 flex items-start gap-2 rounded-xl border border-info bg-info-soft p-3 text-xs text-info">
					<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
					<span>{i18n.t('admin.enterprises.detail.agencyClientsOnlyStaffingHint')}</span>
				</p>
			{/if}
			{#if agencyClients.length === 0}
				<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
					{i18n.t('admin.enterprises.detail.agencyClientsEmpty')}
				</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each agencyClients as c (c.id)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-overlay px-3 py-2">
							<div class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="font-medium text-text-primary">{c.client_name}</span>
								{#if c.client_contact_email}
									<span class="text-xs text-text-muted">
										{i18n.t('admin.enterprises.detail.agencyClientContact')}: {c.client_contact_email}
									</span>
								{/if}
								{#if c.notes}
									<span class="text-xs text-text-muted">
										{i18n.t('admin.enterprises.detail.agencyClientNotes')}: {c.notes}
									</span>
								{/if}
							</div>
							{#if c.active}
								<Badge variant="success" size="sm">
									{i18n.t('admin.enterprises.detail.agencyClientActive')}
								</Badge>
							{:else}
								<Badge variant="default" size="sm">
									{i18n.t('admin.enterprises.detail.agencyClientInactive')}
								</Badge>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<Modal
	open={showChangeType}
	title={i18n.t('admin.enterprises.changeType.title')}
	onclose={() => (showChangeType = false)}
	size="md"
>
	<div class="flex flex-col gap-4">
		{#if enterprise}
			<div class="flex flex-col gap-1">
				<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
					{i18n.t('admin.enterprises.changeType.currentTypeLabel')}
				</span>
				<Badge variant="primary" size="md">
					{i18n.t(`admin.enterprises.types.${enterprise.enterprise_type}`)}
				</Badge>
			</div>
		{/if}

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{i18n.t('admin.enterprises.changeType.targetTypeLabel')}
			</span>
			<Select
				items={TYPES.map((t) => ({
					value: t,
					label: i18n.t(`admin.enterprises.types.${t}`)
				}))}
				bind:value={targetType}
				shape="rounded"
			/>
			<p class="text-xs text-text-muted">
				{i18n.t(`admin.enterprises.typeDescriptions.${targetType}`)}
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="change-reason" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.enterprises.changeType.reasonLabel')}
			</label>
			<textarea
				id="change-reason"
				bind:value={changeReason}
				oninput={() => (changeTouched = true)}
				rows="2"
				placeholder={i18n.t('admin.enterprises.changeType.reasonPlaceholder')}
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if reasonError}
				<p class="text-xs text-error">{reasonError}</p>
			{/if}
		</div>

		{#if dryRunPreview}
			<div class="rounded-xl border border-info bg-info-soft p-3 text-xs">
				<p class="mb-2 font-semibold uppercase tracking-wider text-info">
					{i18n.t('admin.enterprises.changeType.dryRunPreviewLabel')}
				</p>
				{#if dryRunPreview.will_reset_type_config}
					<p class="flex items-start gap-2 text-warning">
						<AlertTriangle size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
						<span>{i18n.t('admin.enterprises.changeType.dryRunResetWarning')}</span>
					</p>
				{:else}
					<p class="text-text-muted">
						{i18n.t('admin.enterprises.changeType.dryRunNoReset')}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button
			variant="ghost"
			size="sm"
			onclick={() => (showChangeType = false)}
			disabled={changing}
		>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="secondary" size="sm" onclick={submitDryRun} disabled={changing} loading={changing}>
			{i18n.t('admin.enterprises.changeType.dryRunBtn')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitChange}
			disabled={!canSubmit}
			loading={changing}
		>
			{i18n.t('admin.enterprises.changeType.submit')}
		</Button>
	{/snippet}
</Modal>
