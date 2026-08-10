<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import FilterBar from '$components/ui/FilterBar.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import { VALIDATOR_DOMAINS } from '$types';
	import type {
		Rank,
		ValidatorApplicationRow,
		ValidatorApplicationStatus,
		ValidatorApplicationOrigin,
		ValidatorDomain
	} from '$types';
	import { Check, X, UserCheck } from '@lucide/svelte';

	// SKI-99 page 1 — the candidacy inbox. Approving grants
	// `challenge_validator:{domain}` on the spot (SKI-82), so the row carries
	// the eligibility signals needed to decide without leaving the page.

	const RANK_ORDER: Rank[] = ['apprenti', 'ranger', 'artisan', 'maitre', 'doyen'];

	let rows = $state<ValidatorApplicationRow[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadError = $state<unknown>(null);
	let page = $state(1);
	const perPage = 25;

	let filterStatus = $state<ValidatorApplicationStatus>('pending');
	let filterDomain = $state<ValidatorDomain | ''>('');
	let filterOrigin = $state<ValidatorApplicationOrigin | ''>('');

	let acting = $state<string | null>(null);

	// Reject dialog
	let rejectTarget = $state<ValidatorApplicationRow | null>(null);
	let rejectReason = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	$effect(() => {
		// Re-read every filter so the effect tracks them, then reload.
		void filterStatus;
		void filterDomain;
		void filterOrigin;
		void page;
		void load();
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await adminApi.listValidatorApplications({
				status: filterStatus,
				domain: filterDomain === '' ? undefined : filterDomain,
				origin: filterOrigin === '' ? undefined : filterOrigin,
				page,
				per_page: perPage
			});
			rows = res.data;
			total = res.pagination.total;
		} catch (e) {
			loadError = e;
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function displayName(row: ValidatorApplicationRow): string {
		return row.user.display_name || row.user.username || row.user_id;
	}

	async function approve(row: ValidatorApplicationRow) {
		acting = row.id;
		try {
			await adminApi.approveValidatorApplication(row.id);
			toast.success(`${displayName(row)} est validateur ${row.domain}`);
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			acting = null;
		}
	}

	async function confirmReject() {
		const row = rejectTarget;
		if (!row || rejectReason.trim().length === 0) return;
		acting = row.id;
		try {
			await adminApi.rejectValidatorApplication(row.id, rejectReason.trim());
			toast.success('Candidature rejetée');
			rejectTarget = null;
			rejectReason = '';
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			acting = null;
		}
	}

	function rankMeetsFloor(rank: Rank, floor: Rank): boolean {
		return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(floor);
	}

	function statusVariant(
		status: ValidatorApplicationStatus
	): 'default' | 'primary' | 'success' | 'warning' | 'error' {
		if (status === 'accepted') return 'success';
		if (status === 'rejected') return 'error';
		if (status === 'withdrawn') return 'warning';
		return 'primary';
	}
</script>

<svelte:head>
	<title>Candidatures validateur — Admin Skilluv</title>
</svelte:head>

<FilterBar variant="boxed" class="mb-4">
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Statut</span>
		<Select
			items={[
				{ value: 'pending', label: 'En attente' },
				{ value: 'accepted', label: 'Acceptées' },
				{ value: 'rejected', label: 'Rejetées' },
				{ value: 'withdrawn', label: 'Retirées' }
			]}
			bind:value={filterStatus}
			size="sm"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Domaine</span>
		<Select
			items={[
				{ value: '', label: 'Tous' },
				...VALIDATOR_DOMAINS.map((d) => ({ value: d, label: d }))
			]}
			bind:value={filterDomain}
			size="sm"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Origine</span>
		<Select
			items={[
				{ value: '', label: 'Toutes' },
				{ value: 'candidacy', label: 'Candidature' },
				{ value: 'invitation', label: 'Invitation' }
			]}
			bind:value={filterOrigin}
			size="sm"
		/>
	</div>
</FilterBar>

{#if loading}
	<Skeleton class="h-64 w-full rounded-2xl" />
{:else if loadError}
	<PendingBackendNotice
		error={loadError}
		ticket="SKI-107"
		endpoint="GET /api/admin/validator-applications"
		description="Liste filtrée des candidatures et invitations, avec les stats live du candidat (rang, PRs validées sur le domaine, repos couverts, ancienneté)."
	/>
{:else if rows.length === 0}
	<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
		<p class="text-sm text-text-muted">Aucune candidature ne correspond à ces filtres.</p>
	</div>
{:else}
	<div class="grid gap-3">
		{#each rows as row (row.id)}
			<article class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<a
								href="/users/{row.user_id}"
								class="font-semibold text-text-primary transition-colors hover:text-accent"
							>
								{displayName(row)}
							</a>
							{#if row.user.username}
								<span class="font-mono text-xs text-text-muted">@{row.user.username}</span>
							{/if}
							<Badge variant="primary">{row.domain}</Badge>
							<Badge variant={statusVariant(row.status)}>{row.status}</Badge>
							<Badge variant="default">
								{row.origin === 'invitation' ? 'invitation' : 'candidature'}
							</Badge>
						</div>
						<p class="mt-1 font-mono text-xs text-text-muted">
							déposée le {new Date(row.created_at).toLocaleDateString('fr-FR')}
						</p>
						{#if row.reviewed_at}
							<!-- Traçabilité de la décision : `reviewed_at` + `admin_actor_id`
							     portés par la table validator_applications. La capability
							     elle-même n'écrit pas dans audit_log, donc c'est ici la seule
							     trace de qui a tranché. -->
							<p class="mt-0.5 font-mono text-xs text-text-muted">
								décidée le {new Date(row.reviewed_at).toLocaleString('fr-FR')}
								{#if row.admin_actor_id}
									par
									<a href="/users/{row.admin_actor_id}" class="text-primary hover:underline">
										admin
									</a>
								{/if}
							</p>
						{/if}
					</div>

					{#if row.status === 'pending'}
						<div class="flex gap-2">
							<Button
								size="sm"
								onclick={() => approve(row)}
								disabled={acting === row.id}
								loading={acting === row.id}
							>
								<Check size={14} strokeWidth={2.5} />
								Approuver
							</Button>
							<Button
								size="sm"
								variant="secondary"
								onclick={() => {
									rejectTarget = row;
									rejectReason = '';
								}}
								disabled={acting === row.id}
							>
								<X size={14} strokeWidth={2.5} />
								Rejeter
							</Button>
						</div>
					{/if}
				</div>

				{#if row.motivation}
					<p class="mt-3 rounded-xl bg-surface/40 p-3 text-sm text-text-muted">
						{row.motivation}
					</p>
				{/if}

				{#if row.live_stats}
					{@const s = row.live_stats}
					{@const t = s.thresholds}
					<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{@render statChip(
							'Rang',
							s.rank,
							rankMeetsFloor(s.rank, t.min_rank),
							`min. ${t.min_rank}`
						)}
						{@render statChip(
							'PRs validées',
							String(s.validated_prs_on_domain),
							s.validated_prs_on_domain >= t.min_merged_prs,
							`min. ${t.min_merged_prs}`
						)}
						{@render statChip(
							'Repos couverts',
							String(s.distinct_repos_covered),
							s.distinct_repos_covered >= t.min_repos_covered,
							`min. ${t.min_repos_covered}`
						)}
						{@render statChip(
							'Ancienneté',
							`${s.tenure_days} j`,
							s.tenure_days >= t.min_tenure_days,
							`min. ${t.min_tenure_days} j`
						)}
					</div>
					{#if row.origin === 'invitation'}
						<p class="mt-2 text-xs text-text-muted">
							Voie invitation : les seuils ci-dessus sont indicatifs, ils ne conditionnent pas
							l'accès.
						</p>
					{/if}
				{/if}
			</article>
		{/each}
	</div>

	<Pagination current={page} total={totalPages} onchange={(p) => (page = p)} />
{/if}

{#snippet statChip(label: string, value: string, ok: boolean, threshold: string)}
	<div
		class="rounded-xl border px-3 py-2 {ok
			? 'border-success/40 bg-success-soft'
			: 'border-border bg-surface/40'}"
	>
		<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
		<p class="mt-0.5 text-sm font-bold tabular-nums {ok ? 'text-success' : 'text-text-primary'}">
			{value}
		</p>
		<p class="text-[10px] text-text-muted">{threshold}</p>
	</div>
{/snippet}

<Modal
	open={rejectTarget !== null}
	title="Rejeter la candidature"
	onclose={() => (rejectTarget = null)}
>
	{#snippet children()}
		{#if rejectTarget}
			<div class="grid gap-4">
				<p class="text-sm text-text-muted">
					<span class="font-semibold text-text-primary">{displayName(rejectTarget)}</span>
					pour le domaine
					<span class="font-mono text-text-primary">{rejectTarget.domain}</span>. La raison est
					transmise au candidat et conservée sur la candidature.
				</p>
				<div>
					<label for="reject-reason" class="block text-sm font-medium text-text-primary">
						Raison *
					</label>
					<textarea
						id="reject-reason"
						bind:value={rejectReason}
						rows="4"
						placeholder="Ce qui manque, et ce qu'il faudrait pour recandidater."
						class="mt-1.5 w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
					></textarea>
				</div>
				<div class="flex justify-end gap-2">
					<Button variant="secondary" onclick={() => (rejectTarget = null)}>Annuler</Button>
					<Button
						variant="danger"
						onclick={confirmReject}
						disabled={rejectReason.trim().length === 0 || acting !== null}
					>
						<UserCheck size={14} strokeWidth={2} />
						Confirmer le rejet
					</Button>
				</div>
			</div>
		{/if}
	{/snippet}
</Modal>
