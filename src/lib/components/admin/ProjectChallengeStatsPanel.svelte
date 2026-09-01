<script lang="ts">
	import { adminApi } from '$api/admin';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import StatCard from '$components/ui/StatCard.svelte';
	import PendingBackendNotice from './PendingBackendNotice.svelte';
	import { SLICE_STATUSES } from '$types';
	import type { ProjectChallengeStats, SliceStatus } from '$types';

	// SKI-124 — workflow health for one repo. Reused by the project detail page
	// and by section 2 of the validation analytics dashboard (SKI-100), which
	// is why it owns its own fetch: the two callers only pick the project and
	// the window.

	interface Props {
		slug: string;
		windowDays?: number;
		/** Quand il est fourni, chaque compteur du funnel devient un lien vers
		 *  `/slices` filtré sur ce projet et ce statut. Sans lui, le dashboard
		 *  dit *combien* de slices sont dans un état sans permettre de voir
		 *  *lesquelles* — c'est le trou que SKI-112 ferme. */
		projectId?: string;
		/** Notified on every successful load so a parent can offer CSV export
		 *  of exactly what is on screen. */
		onload?: (stats: ProjectChallengeStats) => void;
	}

	let { slug, windowDays = 90, projectId, onload }: Props = $props();

	let stats = $state<ProjectChallengeStats | null>(null);
	let loading = $state(true);
	let error = $state<unknown>(null);

	const STATUS_LABELS: Record<SliceStatus, string> = {
		draft: 'Brouillon',
		open: 'Ouverte',
		claimed: 'Claimée',
		in_progress: 'En cours',
		submitted: 'PR soumise',
		ci_green: 'CI verte',
		pending_validation: 'À valider',
		in_iteration: 'En itération',
		validated: 'Validée',
		merged: 'Mergée',
		closed: 'Fermée'
	};

	/** The lifecycle states that mean "a challenge succeeded". `validated` is
	 *  the Skilluv success; `merged` is the upstream bonus on top of it. */
	const SUCCESS_STATUSES: SliceStatus[] = ['validated', 'merged'];

	$effect(() => {
		void load(slug, windowDays);
	});

	async function load(s: string, w: number) {
		loading = true;
		error = null;
		try {
			const res = await adminApi.getProjectChallengeStats(s, w);
			stats = res.data;
			onload?.(res.data);
		} catch (e) {
			error = e;
			stats = null;
		} finally {
			loading = false;
		}
	}

	function hours(v: number | null | undefined): string {
		if (v === null || v === undefined) return '—';
		if (v < 48) return `${v.toFixed(1)} h`;
		return `${(v / 24).toFixed(1)} j`;
	}

	function percent(v: number | null | undefined): string {
		if (v === null || v === undefined) return '—';
		return `${Math.round(v * 100)} %`;
	}

	const totalSlices = $derived(
		stats ? SLICE_STATUSES.reduce((acc, s) => acc + (stats!.slices[s] ?? 0), 0) : 0
	);
	const enrichmentTotal = $derived(
		stats
			? stats.domain_source_distribution.label + stats.domain_source_distribution.project_default
			: 0
	);
</script>

{#if loading}
	<Skeleton class="h-64 w-full rounded-2xl" />
{:else if error}
	<PendingBackendNotice
		{error}
		ticket="SKI-124"
		endpoint="GET /api/admin/projects/{slug}/stats"
		description="Santé du workflow sur ce repo : répartition des slices par statut, délais moyens et alignement validation / merge."
	/>
{:else if stats}
	<div class="grid gap-4">
		<!-- Funnel -->
		<div class="rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
					Cycle de vie des slices
				</h3>
				<span class="font-mono text-xs text-text-muted">
					{totalSlices} slice{totalSlices > 1 ? 's' : ''} — tous statuts, hors fenêtre
				</span>
			</div>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
				{#each SLICE_STATUSES as status (status)}
					{@const count = stats.slices[status] ?? 0}
					{@const tone = SUCCESS_STATUSES.includes(status)
						? 'border-success/40 bg-success-soft'
						: 'border-border bg-surface/40'}
					{@const value = SUCCESS_STATUSES.includes(status)
						? 'text-success'
						: count === 0
							? 'text-text-muted'
							: 'text-text-primary'}
					{#snippet tile()}
						<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">
							{STATUS_LABELS[status]}
						</p>
						<p class="mt-0.5 text-xl font-black tabular-nums {value}">{count}</p>
					{/snippet}
					{#if projectId && count > 0}
						<a
							href="/slices?project_id={projectId}&status={status}"
							class="rounded-xl border px-3 py-2.5 transition-colors hover:border-primary/50 {tone}"
							aria-label="Voir les {count} slice(s) au statut {STATUS_LABELS[status]}"
						>
							{@render tile()}
						</a>
					{:else}
						<div class="rounded-xl border px-3 py-2.5 {tone}">{@render tile()}</div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Timings + alignement -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Claim → PR"
				value={hours(stats.avg_time_to_submit_hours)}
				hint="Moyenne sur {stats.window_days} j"
			/>
			<StatCard
				label="PR → validation"
				value={hours(stats.avg_time_to_validate_hours)}
				hint="Moyenne sur {stats.window_days} j"
			/>
			<StatCard
				label="Validation → merge"
				value={hours(stats.avg_time_to_merge_hours)}
				hint="Bonus upstream, hors parcours Skilluv"
			/>
			<StatCard
				label="Validé → mergé"
				value={percent(stats.validated_to_merged_ratio)}
				color="primary"
				hint="Part de nos validations confirmées par le mainteneur"
			/>
		</div>

		<!-- Adoption du template mainteneur -->
		<div class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h3 class="text-[11px] font-bold uppercase tracking-widest text-text-muted">
				Origine du domaine des slices
			</h3>
			<p class="mt-1 text-xs text-text-muted">
				Part des issues qui portent un label <code class="font-mono">domain:*</code> plutôt que de
				retomber sur le domaine par défaut du projet — mesure l'adoption du template côté
				mainteneur.
			</p>
			{#if enrichmentTotal === 0}
				<p class="mt-4 text-sm text-text-muted">Aucune slice ingérée sur ce projet.</p>
			{:else}
				{@const labelShare = stats.domain_source_distribution.label / enrichmentTotal}
				<div class="mt-4 flex items-center gap-4">
					<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-overlay">
						<div class="h-full rounded-full bg-primary" style="width: {labelShare * 100}%"></div>
					</div>
					<span class="font-mono text-sm tabular-nums text-text-primary">
						{Math.round(labelShare * 100)} %
					</span>
				</div>
				<div class="mt-3 flex gap-6 text-xs text-text-muted">
					<span>
						<span class="font-mono text-text-primary">
							{stats.domain_source_distribution.label}
						</span>
						via label
					</span>
					<span>
						<span class="font-mono text-text-primary">
							{stats.domain_source_distribution.project_default}
						</span>
						via défaut projet
					</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
