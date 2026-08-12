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
	import TagInput from '$components/ui/TagInput.svelte';
	import PendingBackendNotice from '$components/admin/PendingBackendNotice.svelte';
	import type { AdminSlice, Rank, SliceConfigBody } from '$types';
	import { ArrowLeft, ExternalLink, Info } from '@lucide/svelte';

	// SKI-98 partie 2 — per-slice override of the two claim gates:
	//   * `required_orientation_slugs` (SKI-79, sensitivity)
	//   * `min_rank` (SKI-78, rank floor)
	// Both are normally derived algorithmically from the issue's labels; this
	// page is the manual escape hatch, and every change is audited.

	const RANKS: Rank[] = ['apprenti', 'ranger', 'artisan', 'maitre', 'doyen'];

	let sliceId = $derived($page.params.id ?? '');

	let slice = $state<AdminSlice | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let orientationSlugs = $state<string[]>([]);
	let minRank = $state<Rank | ''>('');
	let note = $state('');
	let saving = $state(false);
	let saveError = $state<unknown>(null);

	let auditEntries = $state<{ id: string; action: string; created_at: string }[]>([]);

	$effect(() => {
		if (sliceId) void loadSlice(sliceId);
	});

	async function loadSlice(id: string) {
		loading = true;
		notFound = false;
		saveError = null;
		try {
			const res = await adminApi.getSlice(id);
			const s = res.data.slice;
			slice = s;
			orientationSlugs = [...(s.required_orientation_slugs ?? [])];
			minRank = s.min_rank ?? '';
			note = '';
			void loadAudit(id);
		} catch (e) {
			if (e instanceof SkilluError && e.status === 404) {
				notFound = true;
			} else {
				toast.error(errorMessage(e));
			}
			slice = null;
		} finally {
			loading = false;
		}
	}

	async function loadAudit(id: string) {
		try {
			// Filtered on the target id alone: the audit `target_type` the
			// override handler writes is the backend's to choose, and matching
			// on the uuid is exact regardless.
			const res = await adminApi.auditLogGeneric({ target_id: id, per_page: 20 });
			auditEntries = res.data as typeof auditEntries;
		} catch {
			auditEntries = [];
		}
	}

	/** Backend shape guard: 3-60 chars, lowercase alphanumerics and dashes. */
	function orientationSlugError(slug: string): string | null {
		if (slug.length < 3 || slug.length > 60) return 'Un slug fait entre 3 et 60 caractères.';
		if (!/^[a-z0-9-]+$/.test(slug)) return 'Minuscules, chiffres et tirets uniquement.';
		return null;
	}

	const dirty = $derived.by(() => {
		if (!slice) return false;
		const before = (slice.required_orientation_slugs ?? []).join('|');
		const after = orientationSlugs.join('|');
		return before !== after || (slice.min_rank ?? '') !== minRank;
	});

	const canSave = $derived(dirty && note.trim().length > 0 && !saving);

	async function save() {
		if (!slice || !canSave) return;
		saving = true;
		saveError = null;
		// `null` is the documented "clear this override" signal; an empty array
		// would read as "restrict to nothing", which is not the same thing.
		const body: SliceConfigBody = {
			required_orientation_slugs: orientationSlugs.length > 0 ? orientationSlugs : null,
			min_rank: minRank === '' ? null : minRank,
			note: note.trim()
		};
		try {
			const res = await adminApi.patchSliceConfig(slice.id, body);
			slice = res.data.slice;
			orientationSlugs = [...(res.data.slice.required_orientation_slugs ?? [])];
			minRank = res.data.slice.min_rank ?? '';
			note = '';
			toast.success('Configuration de la slice mise à jour');
			void loadAudit(slice.id);
		} catch (e) {
			saveError = e;
			if (!(e instanceof SkilluError && (e.status === 404 || e.status === 405))) {
				toast.error(errorMessage(e));
			}
		} finally {
			saving = false;
		}
	}

	function reset() {
		if (!slice) return;
		orientationSlugs = [...(slice.required_orientation_slugs ?? [])];
		minRank = slice.min_rank ?? '';
		note = '';
		saveError = null;
	}
</script>

<svelte:head>
	<title>Config slice — Admin Skilluv</title>
</svelte:head>

<div class="mx-auto max-w-3xl p-6 lg:p-8">
	<a
		href="/projects"
		class="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
	>
		<ArrowLeft size={15} strokeWidth={2} />
		Projets
	</a>

	{#if loading}
		<Skeleton class="h-96 w-full rounded-2xl" />
	{:else if notFound}
		<div class="rounded-2xl border border-border bg-surface-elevated p-12 text-center">
			<p class="text-sm text-text-muted">
				Aucune slice avec l'identifiant <code class="font-mono text-text-primary">{sliceId}</code>.
			</p>
		</div>
	{:else if slice}
		<header class="mb-6">
			<h1 class="text-2xl font-bold text-text-primary">{slice.title}</h1>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<Badge variant="default">{slice.status}</Badge>
				<Badge variant="primary">{slice.primary_domain}</Badge>
				<Badge variant="accent">difficulté {slice.difficulty}</Badge>
				{#if slice.external_ref}
					<span class="font-mono text-xs text-text-muted">{slice.external_ref}</span>
				{/if}
			</div>
			<a
				href="/projects"
				class="mt-2 inline-block font-mono text-xs text-text-muted hover:text-text-primary"
			>
				projet {slice.project_id}
			</a>
			{#if slice.submitted_pr_url}
				<a
					href={slice.submitted_pr_url}
					target="_blank"
					rel="noopener"
					class="ml-3 inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
				>
					PR soumise
					<ExternalLink size={11} strokeWidth={2} />
				</a>
			{/if}
		</header>

		<div class="mb-6 flex items-start gap-2 rounded-2xl border border-border bg-surface-elevated/60 p-4">
			<span class="mt-0.5 shrink-0 text-text-muted"><Info size={15} strokeWidth={2} /></span>
			<p class="text-xs text-text-muted">
				Ces deux réglages sont normalement dérivés des labels de l'issue. Un override manuel
				remplace complètement la valeur calculée jusqu'à ce qu'il soit effacé — vider un champ
				restaure le comportement par défaut.
			</p>
		</div>

		<div class="grid gap-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<div>
				<span class="block text-sm font-medium text-text-primary">
					Orientations requises pour claim
				</span>
				<TagInput
					bind:value={orientationSlugs}
					validate={orientationSlugError}
					placeholder="frontend-svelte, backend-rust…"
					class="mt-1.5"
				/>
				<p class="mt-1 text-xs text-text-muted">
					Vide = aucune restriction. Sinon, seuls les users portant l'une de ces orientations
					actives peuvent claim la slice.
				</p>
			</div>

			<div>
				<span class="block text-sm font-medium text-text-primary">Rang minimum</span>
				<Select
					items={[
						{ value: '', label: 'Aucun plancher' },
						...RANKS.map((r) => ({ value: r, label: r }))
					]}
					bind:value={minRank}
					shape="rounded"
					class="mt-1.5 w-full sm:w-64"
				/>
				<p class="mt-1 text-xs text-text-muted">
					Comparaison ordinale : apprenti &lt; ranger &lt; artisan &lt; maitre &lt; doyen.
				</p>
			</div>

			<div>
				<label for="override-note" class="block text-sm font-medium text-text-primary">
					Raison de l'override *
				</label>
				<textarea
					id="override-note"
					bind:value={note}
					rows="3"
					placeholder="Pourquoi cette slice sort du calcul automatique ?"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
				></textarea>
				<p class="mt-1 text-xs text-text-muted">
					Consignée dans le journal d'audit. Obligatoire : un override sans rationale est
					indéchiffrable trois mois plus tard.
				</p>
			</div>

			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if dirty}
					<Button variant="ghost" onclick={reset}>Annuler les modifications</Button>
				{/if}
				<Button onclick={save} disabled={!canSave} loading={saving}>Enregistrer</Button>
			</div>

			{#if !dirty && note.trim().length === 0}
				<p class="text-right text-xs text-text-muted">Aucune modification en attente.</p>
			{:else if dirty && note.trim().length === 0}
				<p class="text-right text-xs text-warning">Une raison est requise pour enregistrer.</p>
			{/if}
		</div>

		{#if saveError}
			<div class="mt-4">
				<PendingBackendNotice
					error={saveError}
					ticket="SKI-106"
					endpoint="PATCH /api/admin/slices/{'{'}id{'}'}/config"
					description="Override de la sensibilité et du rang plancher sur une slice individuelle. En attendant, la modification doit passer par SQL."
				/>
			</div>
		{/if}

		<section class="mt-8">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				Historique des changements
			</h2>
			{#if auditEntries.length === 0}
				<div class="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
					<p class="text-sm text-text-muted">Aucune entrée d'audit sur cette slice.</p>
				</div>
			{:else}
				<ul
					class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-elevated"
				>
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
