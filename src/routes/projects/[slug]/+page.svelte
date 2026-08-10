<script lang="ts">
	import { page } from '$app/stores';
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { SkilluError } from '$api/client';
	import { toast } from '$stores/toast.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ProjectFormModal from '$components/admin/ProjectFormModal.svelte';
	import ProjectChallengeStatsPanel from '$components/admin/ProjectChallengeStatsPanel.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import type {
		AdminSlice,
		ProjectDetail,
		ProjectIngestReport,
		ProjectPatchBody,
		ProjectCreateBody,
		SliceIngestionMode
	} from '$types';
	import {
		ArrowLeft,
		ExternalLink,
		Pencil,
		Settings2,
		FolderGit2,
		RefreshCw
	} from '@lucide/svelte';

	const WINDOWS = [
		{ value: 7, label: '7 jours' },
		{ value: 30, label: '30 jours' },
		{ value: 90, label: '90 jours' },
		{ value: 365, label: '1 an' }
	];

	const MODE_LABELS: Record<SliceIngestionMode, string> = {
		auto: 'Auto',
		curator_review: 'Revue curateur',
		manual_only: 'Manuel'
	};

	let slug = $derived($page.params.slug ?? '');

	let project = $state<ProjectDetail | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let slices = $state<AdminSlice[]>([]);
	let slicesLoading = $state(true);
	let slicesTotal = $state(0);

	let auditEntries = $state<
		{ id: string; action: string; created_at: string; metadata: unknown; actor_id: string | null }[]
	>([]);

	let windowDays = $state(90);

	let showForm = $state(false);
	let submitting = $state(false);

	// SKI-110 — forçage d'ingestion. Le poller tourne à l'heure ; après avoir
	// saisi une config on veut savoir tout de suite si elle est bonne.
	let ingesting = $state(false);
	let ingestReport = $state<ProjectIngestReport | null>(null);
	let ingestError = $state<unknown>(null);

	$effect(() => {
		if (slug) void loadProject(slug);
	});

	async function loadProject(s: string) {
		loading = true;
		notFound = false;
		try {
			const res = await adminApi.getAdminProject(s);
			project = res.data;
			// Both of these hang off the project id, so they can only start
			// once the detail resolved.
			void loadSlices(res.data.id);
			void loadAudit(res.data.id);
		} catch (e) {
			if (e instanceof SkilluError && e.status === 404) {
				notFound = true;
			} else {
				toast.error(errorMessage(e));
			}
			project = null;
		} finally {
			loading = false;
		}
	}

	/** Only `status='open'` slices come back from the public list endpoint —
	 *  enough to reach the config page of a slice that is still claimable,
	 *  which is when the sensitivity and rank overrides actually matter. */
	async function loadSlices(projectId: string) {
		slicesLoading = true;
		try {
			const res = await adminApi.listOpenSlices({ project_id: projectId, per_page: 50 });
			slices = res.data;
			slicesTotal = res.pagination.total;
		} catch (e) {
			toast.error(errorMessage(e));
			slices = [];
		} finally {
			slicesLoading = false;
		}
	}

	async function loadAudit(projectId: string) {
		try {
			const res = await adminApi.auditLogGeneric({
				target_type: 'project',
				target_id: projectId,
				per_page: 20
			});
			auditEntries = res.data as typeof auditEntries;
		} catch {
			// The audit trail is context, not the point of the page: a failure
			// here must not blank out the project.
			auditEntries = [];
		}
	}

	async function submit(body: ProjectCreateBody | ProjectPatchBody) {
		if (!project) return;
		submitting = true;
		try {
			await adminApi.patchAdminProject(project.slug, body as ProjectPatchBody);
			toast.success('Projet mis à jour');
			showForm = false;
			await loadProject(project.slug);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			submitting = false;
		}
	}

	async function triggerIngest() {
		if (!project || ingesting) return;
		ingesting = true;
		ingestError = null;
		ingestReport = null;
		try {
			const res = await adminApi.triggerProjectIngest(project.slug);
			ingestReport = res.data;
			toast.success(
				`${res.data.slices_created} slice(s) créée(s) sur ${res.data.issues_seen} issue(s) vue(s)`
			);
			// De nouvelles slices changent la liste et les stats sous la page.
			void loadSlices(project.id);
		} catch (e) {
			ingestError = e;
			// Un 404 = endpoint pas encore déployé : le panneau l'explique déjà,
			// un toast d'erreur en plus serait du bruit non actionnable.
			if (!(e instanceof SkilluError && (e.status === 404 || e.status === 405))) {
				toast.error(errorMessage(e));
			}
		} finally {
			ingesting = false;
		}
	}

	const githubRepo = $derived(
		project?.github_repo_owner && project?.github_repo_name
			? `${project.github_repo_owner}/${project.github_repo_name}`
			: null
	);

	/** The backend accepts the five challenge fields on write but does not
	 *  echo them on read yet, so an absent value here means "unknown", not
	 *  "unset". Say which one it is rather than showing a misleading dash. */
	const challengeConfigReadable = $derived(
		project !== null &&
			(project.curated_labels !== undefined ||
				project.slice_ingestion_mode !== undefined ||
				project.github_repo_owner !== undefined ||
				project.skill_domains !== undefined)
	);
</script>

<svelte:head>
	<title>{project?.name ?? slug} — Projets — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<a
		href="/projects"
		class="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
	>
		<ArrowLeft size={15} strokeWidth={2} />
		Tous les projets
	</a>

	{#if loading}
		<Skeleton class="h-96 w-full rounded-2xl" />
	{:else if notFound}
		<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
			<p class="text-sm text-text-muted">
				Aucun projet avec le slug <code class="font-mono text-text-primary">{slug}</code>.
			</p>
		</div>
	{:else if project}
		<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="text-2xl font-bold text-text-primary">{project.name}</h1>
					{#if project.is_flagship}
						<Badge variant="success">Flagship</Badge>
					{/if}
					{#if project.curated_by_admin}
						<Badge variant="primary">Curated</Badge>
					{/if}
					{#if project.archived_at}
						<Badge variant="warning">Archivé</Badge>
					{/if}
				</div>
				<p class="mt-1 font-mono text-xs text-text-muted">{project.slug}</p>
				{#if project.description}
					<p class="mt-2 max-w-2xl text-sm text-text-muted">{project.description}</p>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="secondary" onclick={triggerIngest} loading={ingesting}>
					<RefreshCw size={15} strokeWidth={2} />
					Forcer l'ingestion
				</Button>
				<Button variant="secondary" onclick={() => (showForm = true)}>
					<Pencil size={15} strokeWidth={2} />
					Éditer
				</Button>
			</div>
		</div>

		<!-- ── Configuration challenge ──────────────────────────────────── -->
		<section class="mb-8">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				Configuration challenge
			</h2>
			<div class="grid gap-4 rounded-2xl border border-border bg-surface-elevated p-5 sm:grid-cols-2">
				<div>
					<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
						Repo ingéré
					</p>
					{#if githubRepo}
						<a
							href="https://github.com/{githubRepo}"
							target="_blank"
							rel="noopener"
							class="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline"
						>
							<FolderGit2 size={14} strokeWidth={2} />
							{githubRepo}
							<ExternalLink size={11} strokeWidth={2} />
						</a>
					{:else if challengeConfigReadable}
						<p class="mt-1 text-sm text-text-muted">Aucun repo câblé</p>
					{:else}
						<p class="mt-1 text-sm text-text-muted">Non exposé par l'API</p>
					{/if}
				</div>

				<div>
					<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
						Mode d'ingestion
					</p>
					{#if project.slice_ingestion_mode}
						<p class="mt-1 text-sm text-text-primary">
							{MODE_LABELS[project.slice_ingestion_mode]}
						</p>
					{:else}
						<p class="mt-1 text-sm text-text-muted">Non exposé par l'API</p>
					{/if}
				</div>

				<div>
					<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
						Labels curés
					</p>
					{#if project.curated_labels?.length}
						<div class="mt-1.5 flex flex-wrap gap-1.5">
							{#each project.curated_labels as label (label)}
								<span
									class="rounded-lg bg-surface-overlay px-2 py-0.5 font-mono text-xs text-text-primary"
								>
									{label}
								</span>
							{/each}
						</div>
					{:else if challengeConfigReadable}
						<p class="mt-1 text-sm text-text-muted">Aucun label</p>
					{:else}
						<p class="mt-1 text-sm text-text-muted">Non exposé par l'API</p>
					{/if}
				</div>

				<div>
					<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Domaines</p>
					{#if project.skill_domains?.length}
						<div class="mt-1.5 flex flex-wrap gap-1.5">
							{#each project.skill_domains as domain (domain)}
								<Badge variant="default">{domain}</Badge>
							{/each}
						</div>
					{:else if challengeConfigReadable}
						<p class="mt-1 text-sm text-text-muted">Aucun domaine</p>
					{:else}
						<p class="mt-1 text-sm text-text-muted">Non exposé par l'API</p>
					{/if}
				</div>

				{#if !challengeConfigReadable}
					<p class="text-xs text-text-muted sm:col-span-2">
						<code class="font-mono">GET /api/admin/projects/{'{'}slug{'}'}</code> ne renvoie pas
						encore les cinq champs P26 v2 ; ils sont bien acceptés en écriture. Suivi
						dans <code class="font-mono">SKI-109</code>.
					</p>
				{/if}
			</div>
		</section>

		<!-- ── Compte-rendu d'ingestion forcée ──────────────────────────── -->
		{#if ingestReport}
			<section class="mb-8">
				<div class="rounded-2xl border border-border bg-surface-elevated p-5">
					<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
						Dernière ingestion forcée
					</h2>
					<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
						<div class="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
							<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
								Issues vues
							</p>
							<p class="mt-0.5 text-xl font-black tabular-nums text-text-primary">
								{ingestReport.issues_seen}
							</p>
						</div>
						<div
							class="rounded-xl border px-3 py-2.5 {ingestReport.slices_created > 0
								? 'border-success/40 bg-success-soft'
								: 'border-border bg-surface/40'}"
						>
							<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
								Slices créées
							</p>
							<p
								class="mt-0.5 text-xl font-black tabular-nums {ingestReport.slices_created > 0
									? 'text-success'
									: 'text-text-muted'}"
							>
								{ingestReport.slices_created}
							</p>
						</div>
						<div class="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
							<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
								Déjà connues
							</p>
							<p class="mt-0.5 text-xl font-black tabular-nums text-text-muted">
								{ingestReport.slices_skipped_existing}
							</p>
						</div>
					</div>
					<p class="mt-3 text-xs text-text-muted">
						Mode <span class="font-mono text-text-primary">{ingestReport.mode}</span>
						{#if ingestReport.labels_matched.length > 0}
							— labels retenus
							{#each ingestReport.labels_matched as label (label)}
								<span class="ml-1 rounded-md bg-surface-overlay px-1.5 py-0.5 font-mono">
									{label}
								</span>
							{/each}
						{:else}
							— aucun label curé n'a matché.
						{/if}
					</p>
					{#if ingestReport.issues_seen > 0 && ingestReport.slices_created === 0 && ingestReport.slices_skipped_existing === 0}
						<p class="mt-2 text-xs text-warning">
							Des issues ont été lues mais aucune n'a produit de slice : les labels curés ne
							correspondent probablement à rien sur ce repo.
						</p>
					{/if}
				</div>
			</section>
		{:else if ingestError}
			<section class="mb-8">
				<PendingBackendNotice
					error={ingestError}
					ticket="SKI-110"
					endpoint="POST /api/admin/projects/{'{'}slug{'}'}/ingest"
					description="Déclenchement manuel d'une passe d'ingestion sur ce projet, au lieu d'attendre le poller horaire. En attendant, il faut attendre le prochain tick."
				/>
			</section>
		{/if}

		<!-- ── Santé du workflow ────────────────────────────────────────── -->
		<section class="mb-8">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
					Santé du workflow
				</h2>
				<Select items={WINDOWS} bind:value={windowDays} size="sm" />
			</div>
			<ProjectChallengeStatsPanel {slug} {windowDays} />
		</section>

		<!-- ── Slices ouvertes ──────────────────────────────────────────── -->
		<section class="mb-8">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				Slices ouvertes
			</h2>
			{#if slicesLoading}
				<Skeleton class="h-40 w-full rounded-2xl" />
			{:else if slices.length === 0}
				<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
					<p class="text-sm text-text-muted">
						Aucune slice ouverte. Les slices claimées ou déjà en validation ne sont pas listées
						ici.
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
										Domaine
									</th>
									<th
										class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
									>
										Garde-fous
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
										<td class="px-4 py-3">
											<p class="font-medium text-text-primary">{s.title}</p>
											{#if s.external_ref}
												<p class="font-mono text-xs text-text-muted">{s.external_ref}</p>
											{/if}
										</td>
										<td class="px-4 py-3">
											<Badge variant="default">{s.primary_domain}</Badge>
										</td>
										<td class="px-4 py-3">
											<div class="flex flex-wrap gap-1.5">
												{#if s.min_rank}
													<Badge variant="accent">rang ≥ {s.min_rank}</Badge>
												{/if}
												{#each s.required_orientation_slugs ?? [] as slugName (slugName)}
													<Badge variant="primary">{slugName}</Badge>
												{/each}
												{#if !s.min_rank && (s.required_orientation_slugs ?? []).length === 0}
													<span class="text-xs text-text-muted">Aucune restriction</span>
												{/if}
											</div>
										</td>
										<td class="px-4 py-3 text-right">
											<a
												href="/slices/{s.id}/config"
												class="inline-flex items-center gap-1.5 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
												aria-label="Configurer la slice {s.title}"
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
				{#if slicesTotal > slices.length}
					<p class="mt-2 text-xs text-text-muted">
						{slices.length} slices affichées sur {slicesTotal} ouvertes.
					</p>
				{/if}
			{/if}
		</section>

		<!-- ── Journal d'audit ──────────────────────────────────────────── -->
		<section>
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				Journal d'audit
			</h2>
			{#if auditEntries.length === 0}
				<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
					<p class="text-sm text-text-muted">Aucune entrée d'audit pour ce projet.</p>
				</div>
			{:else}
				<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-elevated">
					{#each auditEntries as entry (entry.id)}
						<li class="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
							<span class="font-mono text-xs text-text-primary">{entry.action}</span>
							<span class="font-mono text-xs text-text-muted">
								{new Date(entry.created_at).toLocaleString('fr-FR')}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<ProjectFormModal
	open={showForm}
	editing={project}
	{submitting}
	onclose={() => (showForm = false)}
	onsubmit={submit}
/>
