<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type {
		AiReviewerGroup,
		Capability,
		CodeReviewerGroup,
		DesignReviewerGroup,
		PlainCapability,
		UserCapability,
		ValidatorDomain
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import CapabilityBadge from '$components/ui/CapabilityBadge.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { ShieldPlus, X, Info } from '@lucide/svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	// Every grantable capability, in the order migration 0229's CHECK lists
	// them. That constraint is the authority: a value missing here is a
	// capability nobody can be granted from this panel, which is how design
	// review rights stayed unassignable while the backend already accepted
	// them.
	const PLAIN_CAPABILITIES: PlainCapability[] = [
		'challenger',
		'mentor',
		'project_steward',
		'pr_reviewer',
		'bounty_funder',
		'issue_proposer',
		'jury_tournament',
		'admin',
		'enterprise_recruiter',
		'community_moderator',
		'forum_moderator',
		'plagiarism_reviewer',
		'kyc_reviewer',
		'community_curator',
		'verified_apprentice',
		'apprentice_verifier'
	];

	const VALIDATOR_DOMAINS: ValidatorDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'ops',
		'ai',
		'soft_skills'
	];

	const CODE_REVIEWER_GROUPS: CodeReviewerGroup[] = [
		'web',
		'mobile',
		'systems',
		'blockchain',
		'compilers',
		'data',
		'scientific',
		'devtools-media',
		'all'
	];

	const AI_REVIEWER_GROUPS: AiReviewerGroup[] = ['data', 'ml', 'llm-nlp', 'cv', 'safety', 'all'];

	/** The thirteen design families plus the wildcard. `design_reviewer:all`
	 *  is the one that unlocks the whole critique queue — worth knowing before
	 *  granting it. */
	const DESIGN_REVIEWER_GROUPS: DesignReviewerGroup[] = [
		'product',
		'web',
		'mobile',
		'motion',
		'brand',
		'illustration',
		'dataviz',
		'ux-writing',
		'marketing',
		'game',
		'3d-viz',
		'immersive',
		'service',
		'all'
	];

	const ALL_CAPABILITIES: Capability[] = [
		...PLAIN_CAPABILITIES,
		...VALIDATOR_DOMAINS.map((d) => `challenge_validator:${d}` as Capability),
		...CODE_REVIEWER_GROUPS.map((g) => `code_reviewer:${g}` as Capability),
		...AI_REVIEWER_GROUPS.map((g) => `ai_reviewer:${g}` as Capability),
		...DESIGN_REVIEWER_GROUPS.map((g) => `design_reviewer:${g}` as Capability)
	];

	/** Label for the grant dropdown. Scoped capabilities render as
	 *  "<family> — <scope>" with the scope verbatim: it is the same slug that
	 *  sits on `orientations.reviewer_group`, and translating it would
	 *  decouple the label from the value being granted. */
	function capabilityLabel(c: Capability): string {
		const colon = c.indexOf(':');
		if (colon === -1) return i18n.t(`admin.capabilities.names.${c}`);
		const family = c.slice(0, colon);
		const scope = c.slice(colon + 1);
		return `${i18n.t(`admin.capabilities.families.${family}`)} — ${scope}`;
	}

	/** One description per family for the scoped capabilities, rather than
	 *  forty-five near-identical strings per locale. The scope is appended so
	 *  the sentence still names what is actually being granted. */
	function capabilityDescription(c: Capability): string {
		const colon = c.indexOf(':');
		if (colon === -1) return i18n.t(`admin.capabilities.descriptions.${c}`);
		const family = c.slice(0, colon);
		const scope = c.slice(colon + 1);
		return i18n.t(`admin.capabilities.familyDescriptions.${family}`, { scope });
	}

	let active = $state<UserCapability[]>([]);
	let loading = $state(true);

	let showGrant = $state(false);
	let granting = $state(false);
	let grantCapability = $state<Capability | ''>('');
	let grantReason = $state('');
	let grantExpiresAt = $state('');
	let grantTouched = $state(false);

	let revokeTarget = $state<Capability | null>(null);
	let revoking = $state(false);

	const activeSet = $derived(new Set(active.map((c) => c.capability)));

	const grantOptions = $derived(
		ALL_CAPABILITIES.map((c) => ({
			value: c,
			label: capabilityLabel(c),
			disabled: activeSet.has(c)
		}))
	);

	const grantReasonError = $derived.by(() => {
		if (!grantTouched) return null;
		const trimmed = grantReason.trim();
		if (trimmed.length === 0) return i18n.t('admin.confirmDialog.reasonRequired');
		if (trimmed.length < 8)
			return i18n.t('admin.confirmDialog.reasonTooShort', { n: 8 });
		return null;
	});

	const canSubmitGrant = $derived(
		!granting && grantCapability !== '' && grantReasonError === null && grantReason.trim().length >= 8
	);

	$effect(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await adminApi.listUserCapabilities(userId);
			active = res.data.capabilities;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function openGrant() {
		grantCapability = '';
		grantReason = '';
		grantExpiresAt = '';
		grantTouched = false;
		showGrant = true;
	}

	async function submitGrant() {
		grantTouched = true;
		if (!canSubmitGrant || grantCapability === '') return;
		granting = true;
		try {
			await adminApi.grantCapability(userId, {
				capability: grantCapability,
				granted_reason: grantReason.trim(),
				expires_at: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : undefined
			});
			toast.success(i18n.t('admin.capabilities.grantSuccess'));
			showGrant = false;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			granting = false;
		}
	}

	function requestRevoke(cap: Capability) {
		revokeTarget = cap;
	}

	async function confirmRevoke() {
		if (!revokeTarget || revoking) return;
		revoking = true;
		const cap = revokeTarget;
		try {
			await adminApi.revokeCapability(userId, cap);
			toast.success(i18n.t('admin.capabilities.revokeSuccess'));
			revokeTarget = null;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			revoking = false;
		}
	}

	function fmtExpires(iso: string | null): string | null {
		if (!iso) return null;
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
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<ShieldPlus size={16} strokeWidth={2} class="text-primary" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.capabilities.sectionTitle')}
			</h2>
		</div>
		<Button variant="primary" size="sm" onclick={openGrant} disabled={loading}>
			<ShieldPlus size={14} strokeWidth={2} />
			{i18n.t('admin.capabilities.grantBtn')}
		</Button>
	</div>

	<p class="mb-4 text-xs text-text-muted">{i18n.t('admin.capabilities.sectionHint')}</p>

	{#if loading}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-10 w-full" rounded="xl" />
			<Skeleton class="h-10 w-full" rounded="xl" />
		</div>
	{:else if active.length === 0}
		<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
			{i18n.t('admin.capabilities.empty')}
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each active as cap (cap.capability)}
				<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-overlay px-3 py-2">
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<CapabilityBadge capability={cap.capability} size="md" />
						{#if cap.expires_at}
							<span class="text-xs text-warning">
								{i18n.t('admin.capabilities.expiresAtLabel')} : {fmtExpires(cap.expires_at)}
							</span>
						{/if}
						{#if cap.granted_reason && cap.granted_reason !== 'unspecified'}
							<span class="min-w-0 text-xs text-text-muted truncate">
								{i18n.t('admin.capabilities.grantedByLabel')} {cap.granted_reason}
							</span>
						{/if}
					</div>
					<Button variant="ghost" size="sm" onclick={() => requestRevoke(cap.capability)}>
						<X size={14} strokeWidth={2} />
						{i18n.t('admin.capabilities.revokeBtn')}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="mt-3 flex items-start gap-2 text-xs text-text-muted">
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.capabilities.historyDeferred')}</span>
	</p>
</section>

<Modal
	open={showGrant}
	title={i18n.t('admin.capabilities.grantDialogTitle')}
	onclose={() => (showGrant = false)}
	size="md"
>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<label for="cap-select" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.capabilities.grantCapabilityLabel')}
			</label>
			<Select
				items={grantOptions}
				bind:value={grantCapability}
				placeholder={i18n.t('admin.capabilities.grantCapabilityLabel')}
				shape="rounded"
				searchable
			/>
			{#if grantCapability !== ''}
				<p class="text-xs text-text-muted">
					{capabilityDescription(grantCapability)}
				</p>
			{/if}
		</div>

		<Input
			label={i18n.t('admin.capabilities.grantReasonLabel')}
			placeholder={i18n.t('admin.capabilities.grantReasonPlaceholder')}
			hint={i18n.t('admin.capabilities.grantReasonHint')}
			bind:value={grantReason}
			oninput={() => (grantTouched = true)}
			error={grantReasonError ?? undefined}
			data-testid="grant-cap-reason"
		/>

		<div class="flex flex-col gap-1.5">
			<label for="cap-expires" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.capabilities.grantExpiresLabel')}
			</label>
			<input
				id="cap-expires"
				type="datetime-local"
				bind:value={grantExpiresAt}
				class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
			/>
			<p class="text-xs text-text-muted">{i18n.t('admin.capabilities.grantExpiresHint')}</p>
		</div>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showGrant = false)} disabled={granting}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitGrant}
			disabled={!canSubmitGrant}
			loading={granting}
			data-testid="grant-cap-submit"
		>
			{i18n.t('admin.capabilities.grantSubmitBtn')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={revokeTarget !== null}
	title={i18n.t('admin.capabilities.revokeDialogTitle')}
	description={revokeTarget
		? i18n.t(`admin.capabilities.names.${revokeTarget}`) +
			' — ' +
			i18n.t('admin.capabilities.revokeDialogDescription')
		: ''}
	actionLabel={i18n.t('admin.capabilities.revokeBtn')}
	requireReason={false}
	loading={revoking}
	onconfirm={() => confirmRevoke()}
	onclose={() => (revokeTarget = null)}
/>
