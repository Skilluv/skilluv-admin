<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import { VALIDATOR_DOMAINS } from '$types';
	import type {
		ValidatorApplicationRow,
		ValidatorApplicationStatus,
		ValidatorDomain
	} from '$types';
	import { Plus, Search, UserPlus } from '@lucide/svelte';

	// SKI-99 page 2 — the admin-initiated path (SKI-82). An invitation does
	// NOT grant the capability: it creates a pending application the invitee
	// must accept. Until they do, the row stays `pending` here.

	interface UserHit {
		id: string;
		username: string;
		display_name: string;
		email: string;
	}

	let rows = $state<ValidatorApplicationRow[]>([]);
	let loading = $state(true);
	let loadError = $state<unknown>(null);
	let filterStatus = $state<ValidatorApplicationStatus | ''>('');

	// Invite dialog
	let showInvite = $state(false);
	let query = $state('');
	let searching = $state(false);
	let hits = $state<UserHit[]>([]);
	let selected = $state<UserHit | null>(null);
	let domain = $state<ValidatorDomain>('code');
	let notes = $state('');
	let inviting = $state(false);

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void filterStatus;
		void load();
	});

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await adminApi.listValidatorApplications({
				origin: 'invitation',
				status: filterStatus === '' ? undefined : filterStatus,
				per_page: 100
			});
			rows = res.data;
		} catch (e) {
			loadError = e;
			rows = [];
		} finally {
			loading = false;
		}
	}

	function onQueryInput() {
		clearTimeout(searchTimer);
		selected = null;
		const q = query.trim();
		if (q.length < 2) {
			hits = [];
			return;
		}
		// Debounced: the admin user list is a full-text scan backend-side and
		// firing it per keystroke is wasteful.
		searchTimer = setTimeout(() => void search(q), 250);
	}

	async function search(q: string) {
		searching = true;
		try {
			const res = await adminApi.listUsers({ q, per_page: 8 });
			hits = res.data as UserHit[];
		} catch (e) {
			toast.error(errorMessage(e));
			hits = [];
		} finally {
			searching = false;
		}
	}

	const canInvite = $derived(selected !== null && notes.trim().length > 0 && !inviting);

	async function invite() {
		if (!selected || !canInvite) return;
		inviting = true;
		try {
			await adminApi.inviteValidator({
				user_id: selected.id,
				domain,
				notes: notes.trim()
			});
			toast.success(`Invitation envoyée à @${selected.username}`);
			closeInvite();
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			inviting = false;
		}
	}

	function openInvite() {
		query = '';
		hits = [];
		selected = null;
		domain = 'code';
		notes = '';
		showInvite = true;
	}

	function closeInvite() {
		showInvite = false;
		clearTimeout(searchTimer);
	}

	function statusLabel(status: ValidatorApplicationStatus): string {
		if (status === 'pending') return "en attente d'acceptation";
		if (status === 'accepted') return 'acceptée';
		if (status === 'rejected') return 'refusée';
		return 'retirée';
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
	<title>Invitations validateur — Admin Skilluv</title>
</svelte:head>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div class="flex flex-col gap-1.5">
		<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Statut</span>
		<Select
			items={[
				{ value: '', label: 'Toutes' },
				{ value: 'pending', label: "En attente d'acceptation" },
				{ value: 'accepted', label: 'Acceptées' },
				{ value: 'rejected', label: 'Refusées' },
				{ value: 'withdrawn', label: 'Retirées' }
			]}
			bind:value={filterStatus}
			size="sm"
		/>
	</div>
	<Button onclick={openInvite}>
		<Plus size={16} strokeWidth={2} />
		Nouvelle invitation
	</Button>
</div>

{#if loading}
	<Skeleton class="h-64 w-full rounded-2xl" />
{:else if loadError}
	<PendingBackendNotice
		error={loadError}
		ticket="SKI-107"
		endpoint="GET /api/admin/validator-applications?origin=invitation"
		description="Historique des invitations envoyées et de leur acceptation. L'envoi d'une invitation fonctionne déjà — seul le suivi attend l'endpoint de lecture."
	/>
{:else if rows.length === 0}
	<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
		<p class="text-sm text-text-muted">Aucune invitation envoyée.</p>
	</div>
{:else}
	<div class="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-surface/40">
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Invité
						</th>
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Domaine
						</th>
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Statut
						</th>
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Notes
						</th>
						<th
							class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
						>
							Envoyée le
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each rows as row (row.id)}
						<tr class="transition-colors hover:bg-surface-elevated-hover">
							<td class="px-4 py-3">
								<a
									href="/users/{row.user_id}"
									class="font-medium text-text-primary transition-colors hover:text-accent"
								>
									{row.user.display_name || row.user.username || row.user_id}
								</a>
								{#if row.user.username}
									<p class="font-mono text-xs text-text-muted">@{row.user.username}</p>
								{/if}
							</td>
							<td class="px-4 py-3">
								<Badge variant="primary">{row.domain}</Badge>
							</td>
							<td class="px-4 py-3">
								<Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
							</td>
							<td class="max-w-sm px-4 py-3 text-xs text-text-muted">
								{row.motivation ?? '—'}
							</td>
							<td class="px-4 py-3 font-mono text-xs text-text-muted">
								{new Date(row.created_at).toLocaleDateString('fr-FR')}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<Modal open={showInvite} title="Inviter un validateur" size="lg" onclose={closeInvite}>
	{#snippet children()}
		<div class="grid gap-4">
			<div>
				<label for="invite-search" class="block text-sm font-medium text-text-primary">
					Utilisateur *
				</label>
				<div class="relative mt-1.5">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
						<Search size={15} strokeWidth={2} />
					</span>
					<input
						id="invite-search"
						type="text"
						bind:value={query}
						oninput={onQueryInput}
						placeholder="username ou email"
						autocomplete="off"
						class="w-full rounded-xl border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
					/>
				</div>

				{#if selected}
					<div
						class="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-text-primary">
								{selected.display_name || selected.username}
							</p>
							<p class="truncate font-mono text-xs text-text-muted">@{selected.username}</p>
						</div>
						<button
							type="button"
							class="text-xs text-text-muted transition-colors hover:text-text-primary"
							onclick={() => {
								selected = null;
								query = '';
								hits = [];
							}}
						>
							Changer
						</button>
					</div>
				{:else if searching}
					<p class="mt-2 text-xs text-text-muted">Recherche…</p>
				{:else if hits.length > 0}
					<ul
						class="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border"
					>
						{#each hits as hit (hit.id)}
							<li>
								<button
									type="button"
									class="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-surface-overlay"
									onclick={() => {
										selected = hit;
										hits = [];
									}}
								>
									<span class="text-sm text-text-primary">
										{hit.display_name || hit.username}
									</span>
									<span class="font-mono text-xs text-text-muted">
										@{hit.username} · {hit.email}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else if query.trim().length >= 2}
					<p class="mt-2 text-xs text-text-muted">Aucun utilisateur trouvé.</p>
				{/if}
			</div>

			<div>
				<span class="block text-sm font-medium text-text-primary">Domaine *</span>
				<Select
					items={VALIDATOR_DOMAINS.map((d) => ({ value: d, label: d }))}
					bind:value={domain}
					shape="rounded"
					class="mt-1.5 w-full sm:w-64"
				/>
			</div>

			<div>
				<label for="invite-notes" class="block text-sm font-medium text-text-primary">
					Notes *
				</label>
				<textarea
					id="invite-notes"
					bind:value={notes}
					rows="4"
					placeholder="Pourquoi cette personne, et sur quel périmètre. Visible dans l'invitation."
					class="mt-1.5 w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
				></textarea>
				<p class="mt-1 text-xs text-text-muted">
					L'invitation contourne les seuils de candidature ; la note est la trace de la décision.
				</p>
			</div>

			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={closeInvite}>Annuler</Button>
				<Button onclick={invite} disabled={!canInvite} loading={inviting}>
					<UserPlus size={15} strokeWidth={2} />
					Envoyer l'invitation
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>
