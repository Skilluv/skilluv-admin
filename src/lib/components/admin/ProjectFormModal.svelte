<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import { toast } from '$stores/toast.svelte';
	import type {
		PartnershipLevel,
		ProjectCreateBody,
		ProjectDetail,
		ProjectPatchBody
	} from '$types';

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
		skilluv_editorial_notes: ''
	});

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

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		// Flagship validation (mirrors backend rule).
		if (form.is_flagship && !form.flagship_steward_user_id.trim()) {
			toast.error('Un projet flagship nécessite un steward (UUID user).');
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
				skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null
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
				skilluv_editorial_notes: form.skilluv_editorial_notes.trim() || null
			};
			await onsubmit(body);
		}
	}
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
			<Button type="button" variant="secondary" onclick={onclose}>Annuler</Button>
			<Button type="submit" disabled={submitting}>
				{submitting ? 'Sauvegarde...' : editing ? 'Mettre à jour' : 'Créer'}
			</Button>
		</div>
	</form>
	{/snippet}
</Modal>
