<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import MultiSelect from '$components/ui/MultiSelect.svelte';
	import Select from '$components/ui/Select.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import TagInput from '$components/ui/TagInput.svelte';
	import { toast } from '$stores/toast.svelte';
	import { VALIDATOR_DOMAINS } from '$types';
	import type {
		PartnershipLevel,
		ProjectCreateBody,
		ProjectDetail,
		ProjectPatchBody,
		SliceIngestionMode,
		ValidatorDomain
	} from '$types';
	import { AlertTriangle, Info } from '@lucide/svelte';

	interface Props {
		open: boolean;
		/** null = create mode. In edit mode, pass the fully-loaded ProjectDetail so
		 *  every field prefills — the list-row DTO doesn't carry enough. */
		editing: ProjectDetail | null;
		submitting?: boolean;
		onclose: () => void;
		onsubmit: (body: ProjectCreateBody | ProjectPatchBody) => void | Promise<void>;
	}

	let { open, editing, submitting = false, onclose, onsubmit }: Props = $props();

	const DOMAIN_LABELS: Record<ValidatorDomain, string> = {
		code: 'Code',
		design: 'Design',
		game: 'Game',
		security: 'Sécurité',
		ops: 'Ops',
		ai: 'IA',
		soft_skills: 'Soft skills'
	};

	const INGESTION_MODES: { value: SliceIngestionMode; label: string; hint: string }[] = [
		{
			value: 'auto',
			label: 'Auto',
			hint: 'Les issues portant un label curé deviennent des slices ouvertes sans relecture.'
		},
		{
			value: 'curator_review',
			label: 'Revue curateur',
			hint: 'Les issues arrivent en brouillon ; un steward les publie manuellement.'
		},
		{
			value: 'manual_only',
			label: 'Manuel',
			hint: "Aucune ingestion automatique : les slices sont créées à la main."
		}
	];

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
		owner_id: '',
		curated_by_admin: true,
		is_flagship: false,
		flagship_steward_user_id: '',
		skilluv_partnership_level: '' as '' | '1' | '2' | '3',
		skilluv_editorial_notes: '',
		// P26 v2 SKI-110 — challenge workflow wiring.
		github_repo_owner: '',
		github_repo_name: '',
		curated_labels: [] as string[],
		// '' means "leave untouched" — only reachable in edit mode when the
		// backend didn't echo the stored value back (see `p26Echoed`).
		slice_ingestion_mode: 'curator_review' as SliceIngestionMode | '',
		skill_domains: [] as string[]
	});

	/** True when the loaded project actually carries the P26 fields.
	 *
	 *  Vrai depuis SKI-109 : `GET /admin/projects/{slug}` renvoie les cinq
	 *  champs, donc l'édition se pré-remplit et un tableau vidé part bien en
	 *  `[]` — ce que `COALESCE` accepte, contrairement à `null`.
	 *
	 *  Le garde reste en place plutôt que d'être supprimé : il couvre le cas
	 *  d'un backend plus ancien (un déploiement en retard, un environnement
	 *  local), où l'on retombe sur « champ vide = ne pas modifier » au lieu
	 *  d'effacer à l'aveugle une config qu'on ne peut pas relire. */
	const p26Echoed = $derived(
		editing !== null &&
			(editing.curated_labels !== undefined ||
				editing.slice_ingestion_mode !== undefined ||
				editing.github_repo_owner !== undefined ||
				editing.skill_domains !== undefined)
	);

	$effect(() => {
		if (!open) return;
		if (editing) {
			const d = editing;
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
			form.github_repo_owner = d.github_repo_owner ?? '';
			form.github_repo_name = d.github_repo_name ?? '';
			form.curated_labels = [...(d.curated_labels ?? [])];
			form.slice_ingestion_mode = d.slice_ingestion_mode ?? '';
			form.skill_domains = [...(d.skill_domains ?? [])];
		} else {
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
			form.github_repo_owner = '';
			form.github_repo_name = '';
			form.curated_labels = [];
			form.slice_ingestion_mode = 'curator_review';
			form.skill_domains = [];
		}
	});

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

	// ─── Live validation (mirrors the backend validators) ────────────────

	/** `validate_github_pair` — both fields or neither, never one. */
	const githubPairError = $derived.by(() => {
		const owner = form.github_repo_owner.trim();
		const name = form.github_repo_name.trim();
		if (!!owner === !!name) return null;
		return 'Owner et repo doivent être renseignés ensemble (ou tous les deux vides).';
	});

	/** `warn_ingest_will_no_op` — the backend logs a warning and accepts;
	 *  the operator deserves to see the same warning before saving. */
	const ingestNoOpWarning = $derived(
		form.slice_ingestion_mode === 'auto' && form.curated_labels.length === 0
	);

	const missingRepoForIngest = $derived(
		form.slice_ingestion_mode !== '' &&
			form.slice_ingestion_mode !== 'manual_only' &&
			!form.github_repo_owner.trim() &&
			!form.github_repo_name.trim()
	);

	const canSubmit = $derived(!submitting && githubPairError === null);

	/** Editing a project whose stored mode we can't read back needs a fourth,
	 *  explicit "don't touch this" choice — otherwise every save would force
	 *  one of the three real modes onto the row. */
	const ingestionItems = $derived<{ value: SliceIngestionMode | ''; label: string }[]>([
		...(editing && !p26Echoed ? [{ value: '' as const, label: 'Inchangé' }] : []),
		...INGESTION_MODES.map((m) => ({ value: m.value, label: m.label }))
	]);

	function labelShapeError(tag: string): string | null {
		if (tag.length > 100) return 'Un label GitHub fait au plus 100 caractères.';
		return null;
	}

	/** Assemble the five P26 fields.
	 *
	 *  In create mode they always go out. In edit mode without an echoed value
	 *  we only send what the operator actually filled in: the backend PATCH is
	 *  `COALESCE($n, column)`, so an empty array would *clear* stored labels
	 *  rather than leave them alone. */
	function challengeConfigFromForm(): Partial<ProjectCreateBody> {
		const owner = form.github_repo_owner.trim();
		const name = form.github_repo_name.trim();
		const alwaysSend = !editing || p26Echoed;

		const out: Partial<ProjectCreateBody> = {};
		if (owner && name) {
			out.github_repo_owner = owner;
			out.github_repo_name = name;
		} else if (alwaysSend && !owner && !name) {
			// Les deux champs vides : on envoie des `null` explicites. À la création
			// c'est l'intention « pas de repo » ; en édition c'est ce qui débranche
			// réellement le repo depuis que SKI-269 est corrigé. Conditionné à
			// `alwaysSend` : sans avoir relu la valeur stockée, on effacerait un
			// champ que l'opérateur n'a jamais vu.
			out.github_repo_owner = null;
			out.github_repo_name = null;
		}
		if (alwaysSend || form.curated_labels.length > 0) {
			out.curated_labels = [...form.curated_labels];
		}
		if (form.slice_ingestion_mode !== '') {
			out.slice_ingestion_mode = form.slice_ingestion_mode;
		}
		if (alwaysSend || form.skill_domains.length > 0) {
			out.skill_domains = [...form.skill_domains] as ValidatorDomain[];
		}
		return out;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		// Flagship validation (mirrors backend rule).
		if (form.is_flagship && !form.flagship_steward_user_id.trim()) {
			toast.error('Un projet flagship nécessite un steward (UUID user).');
			return;
		}
		if (githubPairError) {
			toast.error(githubPairError);
			return;
		}
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
				flagship_steward_user_id: form.is_flagship ? form.flagship_steward_user_id.trim() : null,
				skilluv_partnership_level: partnershipLevelFromForm(),
				skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null,
				...challengeConfigFromForm()
			};
			await onsubmit(body);
		} else {
			// Both create + patch bodies accept `null` for optional fields; keep
			// the exact shape the pre-refactor page sent so the backend contract
			// doesn't shift underfoot.
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
				skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null,
				...challengeConfigFromForm()
			};
			await onsubmit(body);
		}
	}

	const fieldClass =
		'mt-1 w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none';
	const labelClass = 'block text-sm font-medium text-text-primary';
	const hintClass = 'mt-1 text-xs text-text-muted';
</script>

<Modal
	{open}
	title={editing ? `Éditer ${editing.slug}` : 'Nouveau projet'}
	size="xl"
	{onclose}
>
	{#snippet children()}
	<form onsubmit={submit} class="grid gap-4">
		{#if !editing}
			<div>
				<label for="slug" class={labelClass}>Slug *</label>
				<input
					id="slug"
					type="text"
					required
					bind:value={form.slug}
					placeholder="sqlx, hello-africa, wax-icons"
					pattern="^[a-z0-9-]+$"
					class={fieldClass}
				/>
				<p class={hintClass}>Minuscules, chiffres, tirets. Immuable après création.</p>
			</div>
		{/if}
		<div>
			<label for="name" class={labelClass}>Nom *</label>
			<input id="name" type="text" required bind:value={form.name} class={fieldClass} />
		</div>
		<div>
			<label for="description" class={labelClass}>Description</label>
			<textarea id="description" bind:value={form.description} rows="3" class={fieldClass}
			></textarea>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="repo_url" class={labelClass}>URL Repo</label>
				<input
					id="repo_url"
					type="url"
					bind:value={form.repo_url}
					placeholder="https://github.com/launchbadge/sqlx"
					class={fieldClass}
				/>
			</div>
			<div>
				<label for="demo_url" class={labelClass}>URL Démo</label>
				<input id="demo_url" type="url" bind:value={form.demo_url} class={fieldClass} />
			</div>
		</div>
		<div>
			<label for="tech_stack" class={labelClass}>Tech Stack (séparé par virgules)</label>
			<input
				id="tech_stack"
				type="text"
				bind:value={form.tech_stack}
				placeholder="Rust, Axum, PostgreSQL"
				class={fieldClass}
			/>
		</div>

		{#if !editing}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<span class={labelClass}>Owner type</span>
					<Select
						items={[
							{ value: 'user', label: 'User' },
							{ value: 'guild', label: 'Guild' }
						]}
						bind:value={form.owner_type}
						shape="rounded"
						class="mt-1 w-full"
					/>
				</div>
				<div>
					<label for="owner_id" class={labelClass}>Owner UUID *</label>
					<input
						id="owner_id"
						type="text"
						required
						bind:value={form.owner_id}
						placeholder="UUID admin pour OSS partners"
						class="{fieldClass} font-mono text-xs"
					/>
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-2 gap-3">
			<label class="flex items-center gap-2 text-sm text-text-primary">
				<input type="checkbox" bind:checked={form.is_oss} class="accent-primary" />
				Open source
			</label>
			<label class="flex items-center gap-2 text-sm text-text-primary">
				<input
					type="checkbox"
					bind:checked={form.looking_for_contributors}
					class="accent-primary"
				/>
				Cherche contributeurs
			</label>
			<label class="flex items-center gap-2 text-sm text-text-primary">
				<input type="checkbox" bind:checked={form.curated_by_admin} class="accent-primary" />
				Curated by admin
			</label>
			<label class="flex items-center gap-2 text-sm text-text-primary">
				<input type="checkbox" bind:checked={form.is_flagship} class="accent-primary" />
				Flagship
			</label>
		</div>

		{#if form.is_flagship}
			<div>
				<label for="steward_id" class={labelClass}>Steward UUID *</label>
				<input
					id="steward_id"
					type="text"
					required
					bind:value={form.flagship_steward_user_id}
					placeholder="Requis pour flagships"
					class="{fieldClass} font-mono text-xs"
				/>
			</div>
		{/if}

		<div>
			<span class={labelClass}>Niveau partenariat OSS</span>
			<Select
				items={[
					{ value: '', label: 'Aucun (non-partenaire)' },
					{ value: '1', label: 'Niveau 1 — curation unilatérale' },
					{ value: '2', label: 'Niveau 2 — partenariat léger (email + label)' },
					{ value: '3', label: 'Niveau 3 — MoU formel' }
				]}
				bind:value={form.skilluv_partnership_level}
				shape="rounded"
				class="mt-1 w-full"
			/>
		</div>

		<div>
			<label for="notes" class={labelClass}>
				Notes éditoriales internes (non publiques)
			</label>
			<textarea
				id="notes"
				bind:value={form.skilluv_editorial_notes}
				rows="3"
				placeholder="Contexte de curation, sensibilité culturelle, guide pour mentors, etc."
				class={fieldClass}
			></textarea>
		</div>

		<!-- ── P26 v2 — configuration challenge ─────────────────────────── -->
		<div class="rounded-2xl border border-border bg-surface/40 p-4">
			<div class="mb-3">
				<h3 class="text-sm font-bold uppercase tracking-wider text-text-muted">
					Workflow challenge
				</h3>
				<p class="mt-1 text-xs text-text-muted">
					Câble ce projet sur l'ingestion GitHub : quel repo est lu, quels labels sont curés,
					et comment les issues deviennent des slices.
				</p>
			</div>

			{#if editing && !p26Echoed}
				<div
					class="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface-overlay/50 p-3"
				>
					<span class="mt-0.5 shrink-0 text-text-muted">
						<Info size={14} strokeWidth={2} />
					</span>
					<p class="text-xs text-text-muted">
						Le détail projet ne renvoie pas encore ces cinq champs : ils s'affichent vides même
						s'ils sont renseignés en base. <strong class="text-text-primary"
							>Laisser vide = conserver la valeur actuelle</strong
						> ; ne remplis que ce que tu veux réellement changer.
					</p>
				</div>
			{/if}

			<div class="grid gap-4">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="gh_owner" class={labelClass}>GitHub owner</label>
						<input
							id="gh_owner"
							type="text"
							bind:value={form.github_repo_owner}
							placeholder="skilluv"
							class="{fieldClass} font-mono text-xs"
						/>
					</div>
					<div>
						<label for="gh_name" class={labelClass}>GitHub repo</label>
						<input
							id="gh_name"
							type="text"
							bind:value={form.github_repo_name}
							placeholder="skilluv-backend"
							class="{fieldClass} font-mono text-xs"
						/>
					</div>
				</div>
				{#if githubPairError}
					<p class="-mt-2 text-xs text-error">{githubPairError}</p>
				{/if}

				<div>
					<label for="curated_labels" class={labelClass}>Labels curés</label>
					<TagInput
						id="curated_labels"
						bind:value={form.curated_labels}
						validate={labelShapeError}
						placeholder="skilluv-challenge, good first issue…"
						class="mt-1"
					/>
					<p class={hintClass}>
						Seules les issues portant l'un de ces labels sont ingérées. Entrée ou virgule pour
						valider un label.
					</p>
				</div>

				<div>
					<span class={labelClass}>Mode d'ingestion</span>
					<div class="mt-1">
						<SegmentedControl items={ingestionItems} bind:value={form.slice_ingestion_mode} size="sm" equal />
					</div>
					<p class={hintClass}>
						{INGESTION_MODES.find((m) => m.value === form.slice_ingestion_mode)?.hint ??
							'Mode inchangé.'}
					</p>
				</div>

				<div>
					<span class={labelClass}>Domaines du projet</span>
					<MultiSelect
						items={VALIDATOR_DOMAINS.map((d) => ({ value: d, label: DOMAIN_LABELS[d] }))}
						bind:value={form.skill_domains}
						shape="rounded"
						placeholder="Aucun domaine"
						class="mt-1 w-full"
					/>
					<p class={hintClass}>
						Le premier domaine sert de repli quand une issue ingérée ne porte pas de label
						<code class="font-mono">domain:*</code>.
					</p>
				</div>

				{#if ingestNoOpWarning}
					<div
						class="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3"
					>
						<span class="mt-0.5 shrink-0 text-warning">
							<AlertTriangle size={14} strokeWidth={2} />
						</span>
						<p class="text-xs text-text-primary">
							Mode <strong>auto</strong> sans label curé : l'ingestor ne remontera aucune issue.
							Le backend accepte cette configuration, mais elle est probablement une erreur.
						</p>
					</div>
				{/if}

				{#if missingRepoForIngest}
					<div
						class="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3"
					>
						<span class="mt-0.5 shrink-0 text-warning">
							<AlertTriangle size={14} strokeWidth={2} />
						</span>
						<p class="text-xs text-text-primary">
							Aucun repo GitHub renseigné : l'ingestion ne peut rien lire tant que le couple
							owner / repo est vide.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<div class="flex justify-end gap-2">
			<Button type="button" variant="secondary" onclick={onclose}>Annuler</Button>
			<Button type="submit" disabled={!canSubmit}>
				{submitting ? 'Sauvegarde...' : editing ? 'Mettre à jour' : 'Créer'}
			</Button>
		</div>
	</form>
	{/snippet}
</Modal>
