<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import Badge from '$components/ui/Badge.svelte';
	import FilterBar from '$components/ui/FilterBar.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { toast } from '$stores/toast.svelte';
	import { SLICE_STATUSES, VALIDATOR_DOMAINS } from '$types';
	import type { AdminSlice, ProjectListItem, SliceStatus, ValidatorDomain } from '$types';
	import { Search, Settings2, ExternalLink } from '@lucide/svelte';

	// SKI-112 — retrouver une slice quel que soit son statut.
	//
	// La liste publique `GET /api/slices` force `status='open'`, donc une slice
	// claimée, soumise ou en attente de validation n'était atteignable que par
	// son UUID — en pratique via psql. C'est précisément sur ces slices-là qu'on
	// a besoin d'agir : un override de rang se demande sur un challenge déjà
	// pris, un blocage se diagnostique sur une PR soumise depuis trois semaines.

	const STATUS_LABELS: Record<SliceStatus, string> = {
		draft: 'Brouillon',
		open: 'Ouverte',
		claimed: 'Claimée',
		in_progress: 'En cours',
		submitted: 'PR soumise',
		ci_green: 'CI verte',
		pending_validation: 'À valider',
		validated: 'Validée',
		merged: 'Mergée',
		closed: 'Fermée'
	};

	/** Statuts qui marquent un succès : mis en avant dans la liste. */
	const SUCCESS: SliceStatus[] = ['validated', 'merged'];

	const perPage = 25;

	let slices = $state<AdminSlice[]>([]);
	let total = $state(0);
	let totalPages = $state(1);
	let loading = $state(true);
	let loadError = $state<unknown>(null);

	let projects = $state<ProjectListItem[]>([]);

	// État des filtres, initialisé depuis l'URL pour que les deep-links des
	// compteurs (fiche projet, analytics) arrivent déjà filtrés — et que la page
	// reste partageable.
	let filterStatus = $state<SliceStatus | ''>(
		(($page.url.searchParams.get('status') ?? '') as SliceStatus | '') || ''
	);
	let filterProject = $state($page.url.searchParams.get('project_id') ?? '');
	let filterDomain = $state<ValidatorDomain | ''>(
		(($page.url.searchParams.get('domain') ?? '') as ValidatorDomain | '') || ''
	);
	let query = $state($page.url.searchParams.get('q') ?? '');
	let currentPage = $state(Number($page.url.searchParams.get('page') ?? '1') || 1);

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void loadProjects();
	});

	$effect(() => {
		// Toute modification de filtre relance la requête et réécrit l'URL.
		void filterStatus;
		void filterProject;
		void filterDomain;
		void query;
		void currentPage;
		void load();
	});

	async function loadProjects() {
		try {
			const res = await adminApi.listAdminProjects({ per_page: 100 });
			projects = res.data.filter((p) => p.archived_at === null);
		} catch {
			// Le sélecteur de projet est un confort : son échec ne doit pas
			// empêcher de lister les slices.
			projects = [];
		}
	}

	/** Réécrit la query string pour que la page reste partageable et
	 *  rechargeable après un changement de filtre.
	 *
	 *  Appelé **après** le chargement, et jamais avant : `replaceState` lève
	 *  « Cannot call replaceState before router is initialized » tant que
	 *  l'hydratation n'est pas finie. Placé avant le fetch, cette exception
	 *  empêchait la requête de partir du tout — la page restait vide sans
	 *  qu'aucune erreur ne soit visible. La synchronisation d'URL est un
	 *  confort : elle ne doit jamais bloquer les données. */
	function syncUrl() {
		if (!browser) return;
		const params = new URLSearchParams();
		if (filterStatus) params.set('status', filterStatus);
		if (filterProject) params.set('project_id', filterProject);
		if (filterDomain) params.set('domain', filterDomain);
		if (query.trim()) params.set('q', query.trim());
		if (currentPage > 1) params.set('page', String(currentPage));
		const qs = params.toString();
		try {
			replaceState(qs ? `?${qs}` : location.pathname, {});
		} catch {
			// Routeur pas encore initialisé (premier rendu) : l'URL est déjà la
			// bonne, elle vient d'être lue au montage. Rien à rattraper.
		}
	}

	async function load() {
		loading = true;
		loadError = null;
		try {
			const res = await adminApi.listAdminSlices({
				status: filterStatus ? [filterStatus] : undefined,
				project_id: filterProject || undefined,
				domain: filterDomain || undefined,
				q: query.trim() || undefined,
				page: currentPage,
				per_page: perPage
			});
			slices = res.data;
			total = res.pagination.total;
			totalPages = Math.max(1, res.pagination.total_pages);
		} catch (e) {
			loadError = e;
			slices = [];
			total = 0;
			toast.error(errorMessage(e));
		} finally {
			loading = false;
			syncUrl();
		}
	}

	function onQueryInput() {
		clearTimeout(searchTimer);
		// Debounce : la recherche est un ILIKE sur deux colonnes côté backend,
		// inutile de la déclencher à chaque frappe.
		searchTimer = setTimeout(() => {
			currentPage = 1;
		}, 300);
	}

	const projectName = $derived.by(() => {
		const byId = new Map(projects.map((p) => [p.id, p.name]));
		return (id: string) => byId.get(id) ?? id.slice(0, 8);
	});

	function statusVariant(s: SliceStatus): 'default' | 'primary' | 'success' | 'warning' {
		if (SUCCESS.includes(s)) return 'success';
		if (s === 'pending_validation' || s === 'ci_green') return 'warning';
		if (s === 'open') return 'primary';
		return 'default';
	}

	function age(iso: string): string {
		const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
		if (days < 1) return "aujourd'hui";
		if (days === 1) return 'hier';
		return `il y a ${days} j`;
	}
</script>

<svelte:head>
	<title>Slices — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-text-primary">Slices</h1>
		<p class="mt-1 max-w-3xl text-sm text-text-muted">
			Tous statuts confondus, contrairement au catalogue public qui ne montre que les slices
			ouvertes. C'est ici qu'on retrouve un challenge bloqué en validation ou claimé par quelqu'un
			qui n'avance plus.
		</p>
	</div>

	<FilterBar variant="boxed" class="mb-4">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Statut</span>
			<Select
				items={[
					{ value: '', label: 'Tous' },
					...SLICE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))
				]}
				bind:value={filterStatus}
				onchange={() => (currentPage = 1)}
				size="sm"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Projet</span>
			<Select
				items={[
					{ value: '', label: 'Tous' },
					...projects.map((p) => ({ value: p.id, label: p.name }))
				]}
				bind:value={filterProject}
				onchange={() => (currentPage = 1)}
				size="sm"
				searchable={projects.length > 8}
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
				onchange={() => (currentPage = 1)}
				size="sm"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="slice-search" class="text-xs font-bold uppercase tracking-wider text-text-muted">
				Recherche
			</label>
			<div class="relative">
				<span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
					<Search size={14} strokeWidth={2} />
				</span>
				<input
					id="slice-search"
					type="text"
					bind:value={query}
					oninput={onQueryInput}
					placeholder="titre ou référence"
					class="h-8 w-56 rounded-full border border-border bg-surface-elevated py-1 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
				/>
			</div>
		</div>
	</FilterBar>

	{#if loading}
		<Skeleton class="h-64 w-full rounded-2xl" />
	{:else if loadError}
		<div class="rounded-2xl border border-error/40 bg-surface-elevated p-8 text-center">
			<p class="text-sm text-text-muted">{errorMessage(loadError)}</p>
		</div>
	{:else if slices.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
			<p class="text-sm text-text-muted">
				{filterStatus || filterProject || filterDomain || query.trim()
					? 'Aucune slice ne correspond à ces filtres.'
					: 'Aucune slice ingérée pour le moment.'}
			</p>
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
								Titre
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Projet
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Statut
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Garde-fous
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Màj
							</th>
							<th
								class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Config
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each slices as s (s.id)}
							<tr class="transition-colors hover:bg-surface-elevated-hover">
								<td class="max-w-md px-4 py-3">
									<p class="truncate font-medium text-text-primary">{s.title}</p>
									<div class="mt-0.5 flex items-center gap-2">
										{#if s.external_ref}
											<a
												href={s.external_ref}
												target="_blank"
												rel="noopener"
												class="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
											>
												{s.external_ref.replace('https://github.com/', '')}
												<ExternalLink size={10} strokeWidth={2} />
											</a>
										{/if}
										{#if s.submitted_pr_url}
											<a
												href={s.submitted_pr_url}
												target="_blank"
												rel="noopener"
												class="inline-flex items-center gap-1 font-mono text-xs text-text-muted hover:text-text-primary"
											>
												PR
												<ExternalLink size={10} strokeWidth={2} />
											</a>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3">
									<a
										href="/slices?project_id={s.project_id}"
										class="text-xs text-text-muted transition-colors hover:text-text-primary"
									>
										{projectName(s.project_id)}
									</a>
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-wrap items-center gap-1.5">
										<Badge variant={statusVariant(s.status)}>{STATUS_LABELS[s.status]}</Badge>
										<Badge variant="default">{s.primary_domain}</Badge>
									</div>
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-wrap gap-1.5">
										{#if s.min_rank}
											<Badge variant="accent">rang ≥ {s.min_rank}</Badge>
										{/if}
										{#each s.required_orientation_slugs ?? [] as slug (slug)}
											<Badge variant="primary">{slug}</Badge>
										{/each}
										{#if !s.min_rank && (s.required_orientation_slugs ?? []).length === 0}
											<span class="text-xs text-text-muted">—</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 font-mono text-xs text-text-muted">{age(s.updated_at)}</td>
								<td class="px-4 py-3 text-right">
									<a
										href="/slices/{s.id}/config"
										class="inline-flex items-center rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
										aria-label="Configurer {s.title}"
									>
										<Settings2 size={16} strokeWidth={2} />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<p class="mt-4 text-xs text-text-muted">
			{total} slice{total > 1 ? 's' : ''} au total
		</p>
		<Pagination
			current={currentPage}
			total={totalPages}
			onchange={(p) => (currentPage = p)}
		/>
	{/if}
</div>
