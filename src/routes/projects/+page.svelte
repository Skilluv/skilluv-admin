<script lang="ts">
	import { onMount } from 'svelte';
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import FilterBar from '$components/ui/FilterBar.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ProjectFormModal from '$components/admin/ProjectFormModal.svelte';
	import { toast } from '$stores/toast.svelte';
	import type {
		ProjectListItem,
		ProjectDetail,
		ProjectCreateBody,
		ProjectPatchBody,
		ProjectListFilters,
		PartnershipLevel
	} from '$types';
	import { Plus, Pencil, Archive, ExternalLink } from '@lucide/svelte';

	let projects = $state<ProjectListItem[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let page = $state(1);
	const perPage = 20;

	// Filters
	const filters = $state<ProjectListFilters>({
		is_flagship: undefined,
		curated_by_admin: undefined,
		partnership_level: undefined,
		include_archived: false
	});
	// Svelte-friendly filter values (empty string → undefined)
	let filterFlagship = $state<'all' | 'true' | 'false'>('all');
	let filterCurated = $state<'all' | 'true' | 'false'>('all');
	let filterLevel = $state<'all' | '1' | '2' | '3'>('all');

	// Form itself lives in <ProjectFormModal>; page keeps ownership of the
	// open flag + which project is being edited (as its full detail).
	let showForm = $state(false);
	let editing = $state<ProjectDetail | null>(null);
	let submitting = $state(false);

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	function applyFilters() {
		filters.is_flagship = filterFlagship === 'all' ? undefined : filterFlagship === 'true';
		filters.curated_by_admin = filterCurated === 'all' ? undefined : filterCurated === 'true';
		filters.partnership_level =
			filterLevel === 'all' ? undefined : (Number(filterLevel) as PartnershipLevel);
	}

	async function loadProjects() {
		loading = true;
		applyFilters();
		try {
			const res = await adminApi.listAdminProjects({
				...filters,
				page,
				per_page: perPage
			});
			projects = res.data;
			total = res.pagination.total;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editing = null;
		showForm = true;
	}

	async function openEdit(p: ProjectListItem) {
		try {
			const res = await adminApi.getAdminProject(p.slug);
			editing = res.data;
			showForm = true;
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function archive(slug: string) {
		if (!confirm(`Archiver le projet "${slug}" ?`)) return;
		try {
			await adminApi.archiveAdminProject(slug);
			toast.success('Projet archivé');
			await loadProjects();
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function submit(body: ProjectCreateBody | ProjectPatchBody) {
		submitting = true;
		try {
			if (editing) {
				await adminApi.patchAdminProject(editing.slug, body as ProjectPatchBody);
				toast.success('Projet mis à jour');
			} else {
				await adminApi.createAdminProject(body as ProjectCreateBody);
				toast.success('Projet créé');
			}
			showForm = false;
			editing = null;
			await loadProjects();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			submitting = false;
		}
	}

	onMount(loadProjects);

	$effect(() => {
		// Reload when filters change (page reset)
		const _ = filterFlagship + filterCurated + filterLevel + String(filters.include_archived);
		void _;
		page = 1;
		loadProjects();
	});
</script>

<svelte:head>
	<title>Projets — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-text-primary">Projets</h1>
			<p class="mt-1 text-sm text-text-muted">
				Partenaires OSS curés, flagships Skilluv et projets communautaires modérés. Le repo
				GitHub et les labels curés d'un projet pilotent l'ingestion des challenges.
			</p>
		</div>
		<Button onclick={openCreate}>
			<Plus size={16} strokeWidth={2} />
			Nouveau projet
		</Button>
	</div>

	<FilterBar variant="boxed" class="mb-4">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Flagship</span>
			<Select
				items={[
					{ value: 'all', label: 'Tous' },
					{ value: 'true', label: 'Flagship uniquement' },
					{ value: 'false', label: 'Non-flagship' }
				]}
				bind:value={filterFlagship}
				size="sm"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Curation</span>
			<Select
				items={[
					{ value: 'all', label: 'Tous' },
					{ value: 'true', label: 'Curated' },
					{ value: 'false', label: 'Non curated' }
				]}
				bind:value={filterCurated}
				size="sm"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Partenariat</span>
			<Select
				items={[
					{ value: 'all', label: 'Tous' },
					{ value: '1', label: 'Niveau 1' },
					{ value: '2', label: 'Niveau 2' },
					{ value: '3', label: 'Niveau 3' }
				]}
				bind:value={filterLevel}
				size="sm"
			/>
		</div>
		<label class="flex items-center gap-2 self-end pb-1 text-sm text-text-primary">
			<input type="checkbox" bind:checked={filters.include_archived} class="accent-primary" />
			Inclure archivés
		</label>
	</FilterBar>

	{#if loading}
		<Skeleton class="h-64 w-full rounded-2xl" />
	{:else if projects.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
			<p class="text-sm text-text-muted">Aucun projet ne correspond aux filtres.</p>
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
								Projet
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Type
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Repo
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Niveau
							</th>
							<th
								class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Créé le
							</th>
							<th
								class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each projects as p (p.id)}
							<tr class="transition-colors hover:bg-surface-elevated-hover" class:opacity-50={p.archived_at !== null}>
								<td class="px-4 py-3">
									<a
										href="/projects/{p.slug}"
										class="font-semibold text-text-primary transition-colors hover:text-accent"
									>
										{p.name}
									</a>
									<div class="font-mono text-xs text-text-muted">{p.slug}</div>
									{#if p.description}
										<div class="mt-1 line-clamp-1 text-xs text-text-muted">{p.description}</div>
									{/if}
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-wrap gap-1">
										{#if p.is_flagship}
											<Badge variant="success">Flagship</Badge>
										{/if}
										{#if p.curated_by_admin}
											<Badge variant="primary">Curated</Badge>
										{/if}
										{#if !p.is_flagship && !p.curated_by_admin}
											<Badge variant="default">User</Badge>
										{/if}
										{#if p.archived_at}
											<Badge variant="warning">Archivé</Badge>
										{/if}
									</div>
								</td>
								<td class="max-w-xs truncate px-4 py-3">
									{#if p.repo_url}
										<a
											href={p.repo_url}
											target="_blank"
											rel="noopener"
											class="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
										>
											{p.repo_url.replace('https://github.com/', '')}
											<ExternalLink size={11} strokeWidth={2} />
										</a>
									{:else}
										<span class="text-text-muted">—</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-text-primary">
									{#if p.skilluv_partnership_level}
										Niveau {p.skilluv_partnership_level}
									{:else}
										<span class="text-text-muted">—</span>
									{/if}
								</td>
								<td class="px-4 py-3 font-mono text-xs text-text-muted">
									{new Date(p.created_at).toLocaleDateString('fr-FR')}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex justify-end gap-1">
										<button
											type="button"
											onclick={() => openEdit(p)}
											class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
											aria-label="Éditer {p.slug}"
										>
											<Pencil size={16} strokeWidth={2} />
										</button>
										{#if !p.archived_at}
											<button
												type="button"
												onclick={() => archive(p.slug)}
												class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-error"
												aria-label="Archiver {p.slug}"
											>
												<Archive size={16} strokeWidth={2} />
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<p class="mt-4 text-xs text-text-muted">
			{total} projet{total > 1 ? 's' : ''} au total
		</p>
		<Pagination
			current={page}
			total={totalPages}
			onchange={(p) => {
				page = p;
				loadProjects();
			}}
		/>
	{/if}
</div>

<ProjectFormModal
	open={showForm}
	{editing}
	{submitting}
	onclose={() => (showForm = false)}
	onsubmit={submit}
/>
