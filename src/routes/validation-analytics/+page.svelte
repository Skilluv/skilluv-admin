<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import ProjectChallengeStatsPanel from '$components/admin/ProjectChallengeStatsPanel.svelte';
	import { SLICE_STATUSES } from '$types';
	import type {
		CollusionMatrixRow,
		ProjectChallengeStats,
		ProjectListItem,
		SliceStatus,
		ValidatorStatsRow
	} from '$types';
	import { Download, ExternalLink, Info, TriangleAlert } from '@lucide/svelte';

	// SKI-100 — the dashboard that keeps Phase 1 dogfooding honest. Five
	// sections: global funnel, per-project health, per-validator activity,
	// validator×claimant concentration, and a pointer to the Prometheus
	// counters that live in Grafana rather than here.

	const WINDOWS = [
		{ value: 7, label: '7 jours' },
		{ value: 30, label: '30 jours' },
		{ value: 90, label: '90 jours' },
		{ value: 365, label: '1 an' }
	];

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

	/** Counters the ops Grafana board plots. Listed explicitly so the section
	 *  stays useful even before the board exists. */
	const PROMETHEUS_COUNTERS = [
		'skilluv_ingest_domain_source_total{source}',
		'skilluv_external_refresh_success_total',
		'skilluv_external_refresh_failure_total',
		'skilluv_ci_webhook_advanced_total',
		'skilluv_merge_bonus_awarded_total'
	];

	const grafanaUrl = env.PUBLIC_GRAFANA_URL ?? '';

	let windowDays = $state(90);
	let minCount = $state(5);

	// ─── Section 1 + 2: projects ────────────────────────────────────────
	let projects = $state<ProjectListItem[]>([]);
	let projectsLoading = $state(true);
	let selectedSlug = $state('');

	/** Per-project stats keyed by slug, used to build the cross-project
	 *  overview. There is no aggregate endpoint: the overview is the sum of
	 *  the curated projects' own stats, which is exact as long as every
	 *  challenge repo is flagged `curated_by_admin`. */
	let overview = $state<Record<string, ProjectChallengeStats>>({});
	let overviewLoading = $state(true);
	let overviewError = $state<unknown>(null);

	// ─── Section 3 + 4: validators ──────────────────────────────────────
	let validators = $state<ValidatorStatsRow[]>([]);
	let validatorsLoading = $state(true);
	let validatorsError = $state<unknown>(null);

	let matrix = $state<CollusionMatrixRow[]>([]);
	/** Ratio above which the backend flags a pair. Read from the payload so
	 *  the wording below never drifts from the rule actually applied. */
	let flagRatio = $state(0.5);
	let matrixLoading = $state(true);
	let matrixError = $state<unknown>(null);

	$effect(() => {
		void loadProjects();
	});

	$effect(() => {
		void windowDays;
		void loadValidators();
	});

	$effect(() => {
		void windowDays;
		void minCount;
		void loadMatrix();
	});

	async function loadProjects() {
		projectsLoading = true;
		try {
			const res = await adminApi.listAdminProjects({ curated_by_admin: true, per_page: 100 });
			projects = res.data.filter((p) => p.archived_at === null);
			if (!selectedSlug && projects.length > 0) selectedSlug = projects[0].slug;
		} catch (e) {
			toast.error(errorMessage(e));
			projects = [];
		} finally {
			projectsLoading = false;
		}
	}

	// Rebuilt whenever the project set or the window changes.
	$effect(() => {
		const list = projects;
		const w = windowDays;
		if (list.length === 0) {
			overview = {};
			overviewLoading = projectsLoading;
			return;
		}
		void loadOverview(list, w);
	});

	/** Nombre de requêtes de stats en vol simultanément.
	 *
	 *  L'agrégat de la section 1 demande une requête par projet curé, faute
	 *  d'endpoint global. En `Promise.all` brut, 50 projets déclenchaient 50
	 *  appels d'un coup au chargement de la page. On plafonne : c'est un peu
	 *  plus lent à 4 repos, franchement plus sain au-delà. */
	const STATS_CONCURRENCY = 4;

	/** Cache par `slug|fenêtre` : revenir sur une fenêtre déjà consultée ne
	 *  redéclenche rien. Les stats bougent à l'échelle de l'heure, pas de la
	 *  seconde — un aller-retour 90 j → 30 j → 90 j ne justifie pas de tout
	 *  recharger. */
	const statsCache = new Map<string, ProjectChallengeStats>();

	/** Exécute `fn` sur chaque item, `limit` en parallèle au plus. */
	async function mapLimit<T, R>(
		items: T[],
		limit: number,
		fn: (item: T) => Promise<R>
	): Promise<R[]> {
		const out: R[] = new Array(items.length);
		let next = 0;
		const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		});
		await Promise.all(workers);
		return out;
	}

	/** Projets dont les stats n'ont pas pu être chargées : la section reste
	 *  utilisable, mais elle doit dire qu'elle est incomplète plutôt que de
	 *  présenter une somme partielle comme un total. */
	let overviewPartial = $state<string[]>([]);

	async function loadOverview(list: ProjectListItem[], w: number) {
		overviewLoading = true;
		overviewError = null;
		try {
			const failed: string[] = [];
			// `allSettled` par item plutôt qu'un `Promise.all` global : un seul
			// projet en erreur ne doit pas vider tout l'agrégat.
			const results = await mapLimit(list, STATS_CONCURRENCY, async (p) => {
				const key = `${p.slug}|${w}`;
				const cached = statsCache.get(key);
				if (cached) return [p.slug, cached] as const;
				try {
					const res = await adminApi.getProjectChallengeStats(p.slug, w);
					statsCache.set(key, res.data);
					return [p.slug, res.data] as const;
				} catch {
					failed.push(p.slug);
					return null;
				}
			});
			overview = Object.fromEntries(results.filter((r) => r !== null));
			overviewPartial = failed;
			// Tout a échoué : c'est un vrai problème, pas une somme partielle.
			if (failed.length === list.length && list.length > 0) {
				overviewError = new Error("Aucune statistique de projet n'a pu être chargée.");
			}
		} catch (e) {
			overviewError = e;
			overview = {};
		} finally {
			overviewLoading = false;
		}
	}

	async function loadValidators() {
		validatorsLoading = true;
		validatorsError = null;
		try {
			const res = await adminApi.listValidatorStats(windowDays);
			validators = res.data.validators;
		} catch (e) {
			validatorsError = e;
			validators = [];
		} finally {
			validatorsLoading = false;
		}
	}

	async function loadMatrix() {
		matrixLoading = true;
		matrixError = null;
		try {
			const res = await adminApi.getValidatorCollusionMatrix(windowDays, minCount);
			matrix = res.data.matrix;
			flagRatio = res.data.flag_ratio_threshold;
		} catch (e) {
			matrixError = e;
			matrix = [];
		} finally {
			matrixLoading = false;
		}
	}

	// ─── Derived aggregates ─────────────────────────────────────────────

	const totals = $derived.by(() => {
		const acc = Object.fromEntries(SLICE_STATUSES.map((s) => [s, 0])) as Record<
			SliceStatus,
			number
		>;
		for (const stats of Object.values(overview)) {
			for (const s of SLICE_STATUSES) acc[s] += stats.slices[s] ?? 0;
		}
		return acc;
	});

	const totalSlices = $derived(SLICE_STATUSES.reduce((a, s) => a + totals[s], 0));
	const totalSuccess = $derived(totals.validated + totals.merged);
	const totalInFlight = $derived(
		totals.claimed + totals.in_progress + totals.submitted + totals.ci_green
	);

	const flaggedPairs = $derived(
		matrix.flatMap((row) =>
			row.top_targets.filter((t) => t.flagged).map((t) => ({ validator: row.validator, target: t }))
		)
	);

	// ─── CSV export ─────────────────────────────────────────────────────

	function csvCell(value: unknown): string {
		const s = value === null || value === undefined ? '' : String(value);
		return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}

	function download(name: string, lines: string[][]) {
		const csv = lines.map((l) => l.map(csvCell).join(';')).join('\n');
		// BOM so Excel opens the accented headers in UTF-8.
		const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportProjects() {
		const header = [
			'projet',
			...SLICE_STATUSES,
			'claim_vers_pr_h',
			'pr_vers_validation_h',
			'validation_vers_merge_h',
			'ratio_valide_merge',
			'domaine_via_label',
			'domaine_via_defaut'
		];
		const lines = [header];
		for (const p of projects) {
			const s = overview[p.slug];
			if (!s) continue;
			lines.push([
				p.slug,
				...SLICE_STATUSES.map((st) => String(s.slices[st] ?? 0)),
				String(s.avg_time_to_submit_hours ?? ''),
				String(s.avg_time_to_validate_hours ?? ''),
				String(s.avg_time_to_merge_hours ?? ''),
				String(s.validated_to_merged_ratio),
				String(s.domain_source_distribution.label),
				String(s.domain_source_distribution.project_default)
			]);
		}
		download(`skilluv-projets-${windowDays}j.csv`, lines);
	}

	function exportValidators() {
		const lines = [
			[
				'username',
				'validations',
				'approbations',
				'rejets',
				'taux_approbation',
				'pickup_vers_decision_h',
				'domaines'
			]
		];
		for (const v of validators) {
			lines.push([
				v.user.username ?? v.user.id,
				String(v.validations_count),
				String(v.approve_count),
				String(v.reject_count),
				String(v.approve_ratio),
				String(v.avg_pickup_to_decision_hours ?? ''),
				v.active_domains.map((d) => d.domain).join(' ')
			]);
		}
		download(`skilluv-validateurs-${windowDays}j.csv`, lines);
	}

	function exportMatrix() {
		const lines = [['validateur', 'claimant', 'validations', 'ratio', 'signale']];
		for (const row of matrix) {
			for (const t of row.top_targets) {
				lines.push([
					row.validator.username ?? row.validator.id,
					t.claimant_username ?? t.claimant_id,
					String(t.count),
					String(t.ratio),
					t.flagged ? 'oui' : 'non'
				]);
			}
		}
		download(`skilluv-collusion-${windowDays}j.csv`, lines);
	}

	function ratio(v: number): string {
		return `${Math.round(v * 100)} %`;
	}

	function hours(v: number | null): string {
		if (v === null) return '—';
		if (v < 48) return `${v.toFixed(1)} h`;
		return `${(v / 24).toFixed(1)} j`;
	}
</script>

<svelte:head>
	<title>Analytics validation — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-text-primary">Analytics validation</h1>
			<p class="mt-1 max-w-3xl text-sm text-text-muted">
				Santé du workflow challenge et concentration des validations. Aucune de ces mesures ne
				déclenche d'action automatique : elles servent à décider, pas à sanctionner.
			</p>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-text-muted">Fenêtre</span>
			<Select items={WINDOWS} bind:value={windowDays} size="sm" />
		</div>
	</div>

	<div
		class="mb-8 flex items-start gap-2 rounded-2xl border border-border bg-surface-elevated/60 p-4"
	>
		<span class="mt-0.5 shrink-0 text-text-muted"><Info size={15} strokeWidth={2} /></span>
		<p class="text-xs text-text-muted">
			<strong class="text-text-primary">Phase 1 dogfooding.</strong> Les ratios de concentration
			sont attendus anormalement hauts : le workflow est testé par une poignée de comptes tenus par
			les mêmes personnes. Un ratio élevé ici n'est un signal qu'une fois la communauté élargie.
		</p>
	</div>

	<!-- ── Section 1 — Vue d'ensemble ─────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
				1 — Vue d'ensemble
			</h2>
			{#if !overviewLoading && Object.keys(overview).length > 0}
				<Button variant="ghost" size="sm" onclick={exportProjects}>
					<Download size={13} strokeWidth={2} />
					Export CSV
				</Button>
			{/if}
		</div>

		{#if projectsLoading || overviewLoading}
			<Skeleton class="h-48 w-full rounded-2xl" />
		{:else if overviewError}
			<PendingBackendNotice
				error={overviewError}
				ticket="SKI-124"
				endpoint="GET /api/admin/projects/{'{'}slug{'}'}/stats"
				description="Agrégat cross-projet du cycle de vie des slices."
			/>
		{:else if projects.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
				<p class="text-sm text-text-muted">
					Aucun projet curé. L'agrégat se construit à partir des projets marqués
					<code class="font-mono">curated_by_admin</code>.
				</p>
			</div>
		{:else}
			<div class="mb-4 grid gap-4 sm:grid-cols-3">
				<StatCard label="Slices suivies" value={totalSlices} hint="{projects.length} projets curés" />
				<StatCard
					label="Succès challenge"
					value={totalSuccess}
					color="success"
					hint="{totals.validated} validées + {totals.merged} mergées"
				/>
				<StatCard
					label="En cours"
					value={totalInFlight}
					color="accent"
					hint="Claimée → CI verte"
				/>
			</div>
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<h3 class="mb-4 text-[11px] font-bold uppercase tracking-widest text-text-muted">
					Répartition par statut, tous projets
				</h3>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{#each SLICE_STATUSES as status (status)}
						{#snippet tile()}
							<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
								{STATUS_LABELS[status]}
							</p>
							<p
								class="mt-0.5 text-xl font-black tabular-nums {totals[status] === 0
									? 'text-text-muted'
									: 'text-text-primary'}"
							>
								{totals[status]}
							</p>
						{/snippet}
						{#if totals[status] > 0}
							<a
								href="/slices?status={status}"
								class="rounded-xl border border-border bg-surface/40 px-3 py-2.5 transition-colors hover:border-primary/50"
								aria-label="Voir les {totals[status]} slice(s) au statut {STATUS_LABELS[status]}"
							>
								{@render tile()}
							</a>
						{:else}
							<div class="rounded-xl border border-border bg-surface/40 px-3 py-2.5">
								{@render tile()}
							</div>
						{/if}
					{/each}
				</div>
				<p class="mt-3 text-xs text-text-muted">
					Somme des statistiques par projet — il n'existe pas d'endpoint d'agrégat global.
				</p>
				{#if overviewPartial.length > 0}
					<p class="mt-1 text-xs text-warning">
						Total incomplet : {overviewPartial.length} projet{overviewPartial.length > 1
							? 's'
							: ''} n'{overviewPartial.length > 1 ? 'ont' : 'a'} pas répondu ({overviewPartial.join(
							', '
						)}).
					</p>
				{/if}
			</div>
		{/if}
	</section>

	<!-- ── Section 2 — Par projet ─────────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
				2 — Par projet
			</h2>
			{#if projects.length > 0}
				<div class="flex items-center gap-2">
					<Select
						items={projects.map((p) => ({ value: p.slug, label: p.name }))}
						bind:value={selectedSlug}
						size="sm"
						searchable={projects.length > 8}
					/>
					{#if selectedSlug}
						<a
							href="/projects/{selectedSlug}"
							class="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary"
						>
							Fiche projet
							<ExternalLink size={11} strokeWidth={2} />
						</a>
					{/if}
				</div>
			{/if}
		</div>

		{#if projectsLoading}
			<Skeleton class="h-64 w-full rounded-2xl" />
		{:else if !selectedSlug}
			<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
				<p class="text-sm text-text-muted">Sélectionne un projet curé.</p>
			</div>
		{:else}
			<ProjectChallengeStatsPanel
				slug={selectedSlug}
				{windowDays}
				projectId={projects.find((p) => p.slug === selectedSlug)?.id}
			/>
		{/if}
	</section>

	<!-- ── Section 3 — Par validateur ─────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
				3 — Par validateur
			</h2>
			{#if validators.length > 0}
				<Button variant="ghost" size="sm" onclick={exportValidators}>
					<Download size={13} strokeWidth={2} />
					Export CSV
				</Button>
			{/if}
		</div>

		{#if validatorsLoading}
			<Skeleton class="h-48 w-full rounded-2xl" />
		{:else if validatorsError}
			<PendingBackendNotice
				error={validatorsError}
				ticket="SKI-108"
				endpoint="GET /api/admin/validators/stats"
				description="Activité individuelle des validateurs : volume, taux d'approbation, délai médian entre pick-up et décision, domaines actifs."
			/>
		{:else if validators.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
				<p class="text-sm text-text-muted">Aucune validation sur la fenêtre choisie.</p>
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
									Validateur
								</th>
								<th
									class="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Domaines
								</th>
								<th
									class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Validations
								</th>
								<th
									class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Approbations
								</th>
								<th
									class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Rejets
								</th>
								<th
									class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Taux
								</th>
								<th
									class="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-text-muted"
								>
									Pick-up → décision
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each validators as v (v.user.id)}
								<tr class="transition-colors hover:bg-surface-elevated-hover">
									<td class="px-4 py-3">
										<a
											href="/users/{v.user.id}"
											class="font-medium text-text-primary transition-colors hover:text-accent"
										>
											{v.user.display_name || v.user.username || v.user.id}
										</a>
										{#if v.user.username}
											<p class="font-mono text-xs text-text-muted">@{v.user.username}</p>
										{/if}
									</td>
									<td class="px-4 py-3">
										<div class="flex flex-wrap gap-1.5">
											{#each v.active_domains as d (d.domain)}
												<Badge variant="primary">{d.domain}</Badge>
											{/each}
										</div>
									</td>
									<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
										{v.validations_count}
									</td>
									<td class="px-4 py-3 text-right font-mono tabular-nums text-success">
										{v.approve_count}
									</td>
									<td class="px-4 py-3 text-right font-mono tabular-nums text-text-muted">
										{v.reject_count}
									</td>
									<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
										{ratio(v.approve_ratio)}
									</td>
									<td class="px-4 py-3 text-right font-mono tabular-nums text-text-primary">
										{hours(v.avg_pickup_to_decision_hours)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>

	<!-- ── Section 4 — Matrice collusion ──────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
				4 — Concentration validateur × claimant
			</h2>
			<div class="flex items-center gap-2">
				<div class="flex flex-col gap-1.5">
					<span class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
						Seuil de signalement
					</span>
					<Select
						items={[
							{ value: 3, label: '> 3 validations' },
							{ value: 5, label: '> 5 validations' },
							{ value: 10, label: '> 10 validations' }
						]}
						bind:value={minCount}
						size="sm"
					/>
				</div>
				{#if matrix.length > 0}
					<Button variant="ghost" size="sm" onclick={exportMatrix}>
						<Download size={13} strokeWidth={2} />
						Export CSV
					</Button>
				{/if}
			</div>
		</div>

		{#if matrixLoading}
			<Skeleton class="h-48 w-full rounded-2xl" />
		{:else if matrixError}
			<PendingBackendNotice
				error={matrixError}
				ticket="SKI-108"
				endpoint="GET /api/admin/validators/collusion-matrix"
				description="Pour chaque validateur, les claimants qu'il valide le plus souvent, avec le ratio sur son total de validations."
			/>
		{:else if matrix.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
				<p class="text-sm text-text-muted">Aucune paire validateur / claimant sur la fenêtre.</p>
			</div>
		{:else}
			{#if flaggedPairs.length > 0}
				<div
					class="mb-3 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-4"
				>
					<span class="mt-0.5 shrink-0 text-warning">
						<TriangleAlert size={15} strokeWidth={2} />
					</span>
					<p class="text-xs text-text-primary">
						{flaggedPairs.length} paire{flaggedPairs.length > 1 ? 's' : ''} au-dessus du seuil
						(ratio &gt; {Math.round(flagRatio * 100)} % et plus de {minCount} validations). À regarder, pas à sanctionner —
						voir la note Phase 1 en haut de page.
					</p>
				</div>
			{/if}
			<div class="grid gap-3">
				{#each matrix as row (row.validator.id)}
					<article class="rounded-2xl border border-border bg-surface-elevated p-5">
						<div class="mb-3 flex flex-wrap items-center gap-2">
							<a
								href="/users/{row.validator.id}"
								class="font-semibold text-text-primary transition-colors hover:text-accent"
							>
								{row.validator.username ? `@${row.validator.username}` : row.validator.id}
							</a>
							<span class="text-xs text-text-muted">valide surtout</span>
						</div>
						<div class="grid gap-2">
							{#each row.top_targets as t (t.claimant_id)}
								<div
									class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 {t.flagged
										? 'border-warning/40 bg-warning-soft'
										: 'border-border bg-surface/40'}"
								>
									<div class="flex items-center gap-2">
										<a
											href="/users/{t.claimant_id}"
											class="font-mono text-sm text-text-primary hover:text-accent"
										>
											{t.claimant_username ? `@${t.claimant_username}` : t.claimant_id}
										</a>
										{#if t.flagged}
											<Badge variant="warning">à vérifier</Badge>
										{/if}
									</div>
									<div class="flex items-center gap-4 font-mono text-xs tabular-nums">
										<span class="text-text-muted">
											{t.count} validation{t.count > 1 ? 's' : ''}
										</span>
										<span class={t.flagged ? 'text-warning' : 'text-text-primary'}>
											{Math.round(t.ratio * 100)} %
										</span>
									</div>
								</div>
							{/each}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<!-- ── Section 5 — Compteurs Prometheus ───────────────────────────── -->
	<section>
		<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
			5 — Compteurs Prometheus
		</h2>
		<div class="rounded-2xl border border-border bg-surface-elevated p-5">
			<p class="text-sm text-text-muted">
				Les séries temporelles d'ingestion, de refresh externe, de webhook CI et de bonus merge
				sont exposées par le backend et tracées côté ops, pas ici : cette page lit la base, pas
				Prometheus.
			</p>
			<ul class="mt-4 grid gap-1.5">
				{#each PROMETHEUS_COUNTERS as counter (counter)}
					<li class="font-mono text-xs text-text-primary">{counter}</li>
				{/each}
			</ul>
			<div class="mt-5">
				{#if grafanaUrl}
					<a
						href={grafanaUrl}
						target="_blank"
						rel="noopener"
						class="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm font-semibold text-text-primary transition-colors hover:border-text-muted hover:bg-surface-overlay"
					>
						Ouvrir le dashboard Grafana
						<ExternalLink size={14} strokeWidth={2} />
					</a>
				{:else}
					<p class="text-xs text-text-muted">
						Aucun dashboard configuré. Renseigner
						<code class="font-mono text-text-primary">PUBLIC_GRAFANA_URL</code> pour afficher le
						lien ici.
					</p>
				{/if}
			</div>
		</div>
	</section>
</div>
