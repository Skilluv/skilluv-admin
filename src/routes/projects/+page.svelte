<script lang="ts">
	import { onMount } from 'svelte';
	import { adminApi } from '$api/admin';
	import { SkilluError } from '$api/client';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { toast } from '$stores/toast.svelte';
	import type {
		ProjectListItem,
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

	// Form state (shared create + edit)
	let showForm = $state(false);
	let editing = $state<ProjectListItem | null>(null);
	let submitting = $state(false);
	const form = $state({
		slug: '',
		name: '',
		description: '',
		repo_url: '',
		demo_url: '',
		tech_stack: '', // comma-separated
		is_oss: true,
		looking_for_contributors: false,
		owner_type: 'user' as 'user' | 'guild',
		owner_id: '', // UUID string
		curated_by_admin: true,
		is_flagship: false,
		flagship_steward_user_id: '',
		skilluv_partnership_level: '' as '' | '1' | '2' | '3',
		skilluv_editorial_notes: ''
	});

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

	function resetForm() {
		form.slug = '';
		form.name = '';
		form.description = '';
		form.repo_url = '';
		form.demo_url = '';
		form.tech_stack = '';
		form.is_oss = true;
		form.looking_for_contributors = false;
		form.owner_type = 'user';
		form.owner_id = '';
		form.curated_by_admin = true;
		form.is_flagship = false;
		form.flagship_steward_user_id = '';
		form.skilluv_partnership_level = '';
		form.skilluv_editorial_notes = '';
	}

	function openCreate() {
		resetForm();
		editing = null;
		showForm = true;
	}

	async function openEdit(p: ProjectListItem) {
		editing = p;
		try {
			const res = await adminApi.getAdminProject(p.slug);
			const d = res.data;
			form.slug = d.slug;
			form.name = d.name;
			form.description = d.description ?? '';
			form.repo_url = d.repo_url ?? '';
			form.demo_url = d.demo_url ?? '';
			form.tech_stack = (d.tech_stack ?? []).join(', ');
			form.is_oss = d.is_oss;
			form.looking_for_contributors = d.looking_for_contributors;
			form.owner_type = d.owner_type;
			form.owner_id = d.owner_id;
			form.curated_by_admin = d.curated_by_admin;
			form.is_flagship = d.is_flagship;
			form.flagship_steward_user_id = d.flagship_steward_user_id ?? '';
			form.skilluv_partnership_level = d.skilluv_partnership_level
				? (String(d.skilluv_partnership_level) as '1' | '2' | '3')
				: '';
			form.skilluv_editorial_notes = d.skilluv_editorial_notes ?? '';
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

	function techStackFromForm(): string[] {
		return form.tech_stack
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	function partnershipLevelFromForm(): PartnershipLevel | null {
		if (!form.skilluv_partnership_level) return null;
		return Number(form.skilluv_partnership_level) as PartnershipLevel;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;

		// Flagship validation (mirrors backend)
		if (form.is_flagship && !form.flagship_steward_user_id.trim()) {
			toast.error('Un projet flagship nécessite un steward (UUID user).');
			return;
		}

		submitting = true;
		try {
			if (editing) {
				const body: ProjectPatchBody = {
					name: form.name.trim(),
					description: form.description.trim() || null,
					repo_url: form.repo_url.trim() || null,
					demo_url: form.demo_url.trim() || null,
					tech_stack: techStackFromForm(),
					is_oss: form.is_oss,
					looking_for_contributors: form.looking_for_contributors,
					curated_by_admin: form.curated_by_admin,
					is_flagship: form.is_flagship,
					flagship_steward_user_id: form.flagship_steward_user_id.trim() || null,
					skilluv_partnership_level: partnershipLevelFromForm(),
					skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null
				};
				await adminApi.patchAdminProject(editing.slug, body);
				toast.success('Projet mis à jour');
			} else {
				const body: ProjectCreateBody = {
					slug: form.slug.trim(),
					name: form.name.trim(),
					description: form.description.trim() || null,
					repo_url: form.repo_url.trim() || null,
					demo_url: form.demo_url.trim() || null,
					tech_stack: techStackFromForm(),
					is_oss: form.is_oss,
					looking_for_contributors: form.looking_for_contributors,
					owner_type: form.owner_type,
					owner_id: form.owner_id.trim(),
					curated_by_admin: form.curated_by_admin,
					is_flagship: form.is_flagship,
					flagship_steward_user_id: form.flagship_steward_user_id.trim() || null,
					skilluv_partnership_level: partnershipLevelFromForm(),
					skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null
				};
				await adminApi.createAdminProject(body);
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

<!-- Create / Edit modal -->
<Modal
	open={showForm}
	title={editing ? `Éditer ${editing.slug}` : 'Nouveau projet'}
	size="xl"
	onclose={() => (showForm = false)}
>
	{#snippet children()}
	<form onsubmit={submit} class="grid gap-4">
		{#if !editing}
			<div>
				<label for="slug" class="block text-sm font-medium">Slug *</label>
				<input
					id="slug"
					type="text"
					required
					bind:value={form.slug}
					placeholder="sqlx, hello-africa, wax-icons"
					pattern="^[a-z0-9-]+$"
					class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
				/>
				<p class="mt-1 text-xs text-neutral-500">Minuscules, chiffres, tirets. Immuable après création.</p>
			</div>
		{/if}
		<div>
			<label for="name" class="block text-sm font-medium">Nom *</label>
			<input
				id="name"
				type="text"
				required
				bind:value={form.name}
				class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
			/>
		</div>
		<div>
			<label for="description" class="block text-sm font-medium">Description</label>
			<textarea
				id="description"
				bind:value={form.description}
				rows="3"
				class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
			></textarea>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="repo_url" class="block text-sm font-medium">URL Repo</label>
				<input
					id="repo_url"
					type="url"
					bind:value={form.repo_url}
					placeholder="https://github.com/launchbadge/sqlx"
					class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
				/>
			</div>
			<div>
				<label for="demo_url" class="block text-sm font-medium">URL Démo</label>
				<input
					id="demo_url"
					type="url"
					bind:value={form.demo_url}
					class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
				/>
			</div>
		</div>
		<div>
			<label for="tech_stack" class="block text-sm font-medium">Tech Stack (séparé par virgules)</label>
			<input
				id="tech_stack"
				type="text"
				bind:value={form.tech_stack}
				placeholder="Rust, Axum, PostgreSQL"
				class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
			/>
		</div>

		{#if !editing}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="owner_type" class="block text-sm font-medium">Owner type</label>
					<select
						id="owner_type"
						bind:value={form.owner_type}
						class="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
					>
						<option value="user">User</option>
						<option value="guild">Guild</option>
					</select>
				</div>
				<div>
					<label for="owner_id" class="block text-sm font-medium">Owner UUID *</label>
					<input
						id="owner_id"
						type="text"
						required
						bind:value={form.owner_id}
						placeholder="UUID admin pour OSS partners"
						class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
					/>
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={form.is_oss} />
				Open source
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={form.looking_for_contributors} />
				Cherche contributeurs
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={form.curated_by_admin} />
				Curated by admin
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={form.is_flagship} />
				Flagship
			</label>
		</div>

		{#if form.is_flagship}
			<div>
				<label for="steward_id" class="block text-sm font-medium">Steward UUID *</label>
				<input
					id="steward_id"
					type="text"
					required
					bind:value={form.flagship_steward_user_id}
					placeholder="Requis pour flagships"
					class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
				/>
			</div>
		{/if}

		<div>
			<label for="partnership_level" class="block text-sm font-medium">
				Niveau partenariat OSS
			</label>
			<select
				id="partnership_level"
				bind:value={form.skilluv_partnership_level}
				class="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm"
			>
				<option value="">Aucun (non-partenaire)</option>
				<option value="1">Niveau 1 — curation unilatérale</option>
				<option value="2">Niveau 2 — partenariat léger (email + label)</option>
				<option value="3">Niveau 3 — MoU formel</option>
			</select>
		</div>

		<div>
			<label for="notes" class="block text-sm font-medium">
				Notes éditoriales internes (non publiques)
			</label>
			<textarea
				id="notes"
				bind:value={form.skilluv_editorial_notes}
				rows="3"
				placeholder="Contexte de curation, sensibilité culturelle, guide pour mentors, etc."
				class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
			></textarea>
		</div>

		<div class="flex justify-end gap-2">
			<Button type="button" variant="secondary" onclick={() => (showForm = false)}>Annuler</Button>
			<Button type="submit" disabled={submitting}>
				{submitting ? 'Sauvegarde...' : editing ? 'Mettre à jour' : 'Créer'}
			</Button>
		</div>
	</form>
	{/snippet}
</Modal>
