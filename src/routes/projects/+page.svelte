<script lang="ts">
	import { onMount } from 'svelte';
	import { adminApi } from '$api/admin';
	import { SkilluError } from '$api/client';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
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
	import { Plus, Pencil, Archive } from '@lucide/svelte';

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
			toast.error(e instanceof SkilluError ? e.message : 'Erreur de chargement des projets');
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
			toast.error(e instanceof SkilluError ? e.message : 'Erreur de chargement du projet');
		}
	}

	async function archive(slug: string) {
		if (!confirm(`Archiver le projet "${slug}" ?`)) return;
		try {
			await adminApi.archiveAdminProject(slug);
			toast.success('Projet archivé');
			await loadProjects();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : 'Erreur lors de l\'archivage');
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
			toast.error(e instanceof SkilluError ? e.message : 'Erreur lors de la sauvegarde');
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

<div class="mx-auto max-w-7xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Projets</h1>
			<p class="text-sm text-neutral-500">
				Gestion des partenaires OSS curés, des flagships Skilluv et des projets communautaires
				modérés.
			</p>
		</div>
		<Button onclick={openCreate}>
			<Plus class="h-4 w-4" />
			Nouveau projet
		</Button>
	</div>

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
		<div>
			<label for="filter-flagship" class="block text-xs font-medium text-neutral-600">
				Flagship
			</label>
			<select
				id="filter-flagship"
				bind:value={filterFlagship}
				class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
			>
				<option value="all">Tous</option>
				<option value="true">Flagship uniquement</option>
				<option value="false">Non-flagship</option>
			</select>
		</div>
		<div>
			<label for="filter-curated" class="block text-xs font-medium text-neutral-600">
				Curated by admin
			</label>
			<select
				id="filter-curated"
				bind:value={filterCurated}
				class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
			>
				<option value="all">Tous</option>
				<option value="true">Curated</option>
				<option value="false">Non curated</option>
			</select>
		</div>
		<div>
			<label for="filter-level" class="block text-xs font-medium text-neutral-600">
				Niveau partenariat
			</label>
			<select
				id="filter-level"
				bind:value={filterLevel}
				class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
			>
				<option value="all">Tous</option>
				<option value="1">Niveau 1</option>
				<option value="2">Niveau 2</option>
				<option value="3">Niveau 3</option>
			</select>
		</div>
		<label class="flex items-center gap-2 self-end text-sm">
			<input type="checkbox" bind:checked={filters.include_archived} />
			Inclure archivés
		</label>
	</div>

	<!-- Table -->
	{#if loading}
		<Skeleton class="h-32 w-full" />
	{:else if projects.length === 0}
		<div class="rounded-lg border border-neutral-200 bg-white p-12 text-center">
			<p class="text-neutral-500">Aucun projet ne correspond aux filtres.</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
			<table class="min-w-full divide-y divide-neutral-200">
				<thead class="bg-neutral-50">
					<tr>
						<th class="px-4 py-2 text-left text-xs font-medium uppercase text-neutral-500">Nom</th>
						<th class="px-4 py-2 text-left text-xs font-medium uppercase text-neutral-500">Type</th>
						<th class="px-4 py-2 text-left text-xs font-medium uppercase text-neutral-500">Repo</th>
						<th class="px-4 py-2 text-left text-xs font-medium uppercase text-neutral-500">Niveau</th>
						<th class="px-4 py-2 text-left text-xs font-medium uppercase text-neutral-500">Créé le</th>
						<th class="px-4 py-2 text-right text-xs font-medium uppercase text-neutral-500">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-neutral-200">
					{#each projects as p (p.id)}
						<tr class:opacity-50={p.archived_at !== null}>
							<td class="px-4 py-3">
								<div class="font-medium">{p.name}</div>
								<div class="font-mono text-xs text-neutral-500">{p.slug}</div>
								{#if p.description}
									<div class="mt-1 line-clamp-1 text-xs text-neutral-600">{p.description}</div>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-col gap-1">
									{#if p.is_flagship}
										<Badge variant="success">Flagship</Badge>
									{/if}
									{#if p.curated_by_admin}
										<Badge variant="primary">Curated</Badge>
									{/if}
									{#if !p.is_flagship && !p.curated_by_admin}
										<span class="text-xs text-neutral-500">User</span>
									{/if}
									{#if p.archived_at}
										<Badge variant="warning">Archivé</Badge>
									{/if}
								</div>
							</td>
							<td class="max-w-xs truncate px-4 py-3 text-xs">
								{#if p.repo_url}
									<a
										href={p.repo_url}
										target="_blank"
										rel="noopener"
										class="text-blue-600 hover:underline"
									>
										{p.repo_url.replace('https://github.com/', '')}
									</a>
								{:else}
									<span class="text-neutral-400">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-sm">
								{#if p.skilluv_partnership_level}
									Niveau {p.skilluv_partnership_level}
								{:else}
									<span class="text-neutral-400">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-xs text-neutral-500">
								{new Date(p.created_at).toLocaleDateString('fr-FR')}
							</td>
							<td class="px-4 py-3 text-right">
								<div class="flex justify-end gap-1">
									<button
										type="button"
										onclick={() => openEdit(p)}
										class="rounded p-1 hover:bg-neutral-100"
										aria-label="Éditer"
									>
										<Pencil class="h-4 w-4" />
									</button>
									{#if !p.archived_at}
										<button
											type="button"
											onclick={() => archive(p.slug)}
											class="rounded p-1 hover:bg-neutral-100"
											aria-label="Archiver"
										>
											<Archive class="h-4 w-4" />
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-4 flex items-center justify-between text-sm">
			<span class="text-neutral-500">
				{total} projet{total > 1 ? 's' : ''} au total
			</span>
			<div class="flex gap-2">
				<Button
					variant="secondary"
					disabled={page === 1}
					onclick={() => {
						page--;
						loadProjects();
					}}
				>
					Précédent
				</Button>
				<Button
					variant="secondary"
					disabled={page * perPage >= total}
					onclick={() => {
						page++;
						loadProjects();
					}}
				>
					Suivant
				</Button>
			</div>
		</div>
	{/if}
</div>

<ProjectFormModal
	open={showForm}
	{editing}
	{submitting}
	onclose={() => (showForm = false)}
	onsubmit={submit}
/>
