<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		Orientation,
		OrientationDomain,
		PatchOrientationBody
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Plus, Pencil, Archive, ArchiveRestore, Link2, X, Info } from '@lucide/svelte';

	const DOMAINS: OrientationDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'soft_skills',
		'ai',
		'ops'
	];

	// --- List state ---
	let orientations = $state<Orientation[]>([]);
	let loading = $state(true);
	let filterDomain = $state<OrientationDomain | ''>('');
	let includeArchived = $state(false);

	// --- Create dialog ---
	let showCreate = $state(false);
	let creating = $state(false);
	let createSlug = $state('');
	let createName = $state('');
	let createDescription = $state('');
	let createPrimaryDomain = $state<OrientationDomain>('code');
	let createSecondaryRaw = $state('');
	let createTagsRaw = $state('');
	let createIsCurated = $state(true);
	let createTouched = $state(false);

	const createSlugError = $derived.by(() => {
		if (!createTouched) return null;
		const s = createSlug.trim();
		if (s.length < 3 || s.length > 60) return i18n.t('admin.catalog.orientations.create.slugHint');
		if (!/^[a-z0-9-]+$/.test(s)) return i18n.t('admin.catalog.orientations.create.slugHint');
		return null;
	});
	const createNameError = $derived.by(() => {
		if (!createTouched) return null;
		const n = createName.trim();
		if (n.length < 1 || n.length > 120) return i18n.t('admin.catalog.orientations.create.nameLabel');
		return null;
	});
	const canCreate = $derived(
		!creating &&
			createSlug.trim().length > 0 &&
			createName.trim().length > 0 &&
			createSlugError === null &&
			createNameError === null
	);

	// --- Edit dialog ---
	let editTarget = $state<Orientation | null>(null);
	let editName = $state('');
	let editDescription = $state('');
	let editPrimaryDomain = $state<OrientationDomain>('code');
	let editSecondaryRaw = $state('');
	let editTagsRaw = $state('');
	let editIsCurated = $state(true);
	let editIsArchived = $state(false);
	let editing = $state(false);
	let editDryPreview = $state<{ before: Orientation; after: Orientation } | null>(null);

	// --- Skills sub-dialog ---
	let skillsTarget = $state<Orientation | null>(null);
	let skillsList = $state<
		Array<{ id: string; slug: string; name: string; is_core: boolean; is_recommended: boolean; weight: number }>
	>([]);
	let skillsLoading = $state(false);
	let attachSkillId = $state('');
	let attachIsCore = $state(false);
	let attachIsRecommended = $state(true);
	let attachWeight = $state(1.0);
	let attaching = $state(false);
	let detachTargetSkill = $state<{ id: string; name: string } | null>(null);
	let detaching = $state(false);

	$effect(() => {
		void loadList();
	});

	async function loadList() {
		loading = true;
		try {
			const res = await adminApi.listOrientationsCatalog({
				domain: filterDomain === '' ? undefined : filterDomain,
				include_archived: includeArchived,
				limit: 200
			});
			orientations = res.data.orientations;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	const filteredRows = $derived(orientations.map((o) => o as unknown as Record<string, unknown>));

	function openCreate() {
		createSlug = '';
		createName = '';
		createDescription = '';
		createPrimaryDomain = 'code';
		createSecondaryRaw = '';
		createTagsRaw = '';
		createIsCurated = true;
		createTouched = false;
		showCreate = true;
	}

	function parseList(raw: string): string[] {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	async function submitCreate() {
		createTouched = true;
		if (!canCreate) return;
		creating = true;
		try {
			await adminApi.createOrientation({
				slug: createSlug.trim(),
				name: createName.trim(),
				description: createDescription.trim() || undefined,
				primary_domain: createPrimaryDomain,
				secondary_domains: parseList(createSecondaryRaw),
				tags: parseList(createTagsRaw),
				is_curated: createIsCurated
			});
			toast.success(i18n.t('admin.catalog.orientations.create.successToast'));
			showCreate = false;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creating = false;
		}
	}

	function openEdit(o: Orientation) {
		editTarget = o;
		editName = o.name;
		editDescription = o.description;
		editPrimaryDomain = o.primary_domain;
		editSecondaryRaw = o.secondary_domains.join(', ');
		editTagsRaw = o.tags.join(', ');
		editIsCurated = o.is_curated;
		editIsArchived = o.is_archived;
		editDryPreview = null;
	}

	function buildPatchBody(): PatchOrientationBody {
		if (!editTarget) return {};
		const body: PatchOrientationBody = {};
		if (editName.trim() !== editTarget.name) body.name = editName.trim();
		if (editDescription !== editTarget.description) body.description = editDescription;
		if (editPrimaryDomain !== editTarget.primary_domain) body.primary_domain = editPrimaryDomain;
		const nextSec = parseList(editSecondaryRaw);
		if (nextSec.join(',') !== editTarget.secondary_domains.join(','))
			body.secondary_domains = nextSec;
		const nextTags = parseList(editTagsRaw);
		if (nextTags.join(',') !== editTarget.tags.join(',')) body.tags = nextTags;
		if (editIsCurated !== editTarget.is_curated) body.is_curated = editIsCurated;
		if (editIsArchived !== editTarget.is_archived) body.is_archived = editIsArchived;
		return body;
	}

	async function submitEditDryRun() {
		if (!editTarget || editing) return;
		editing = true;
		try {
			const res = await adminApi.patchOrientation(editTarget.slug, buildPatchBody(), true);
			editDryPreview = res.meta.dry_run_preview ?? null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			editing = false;
		}
	}

	async function submitEdit() {
		if (!editTarget || editing) return;
		editing = true;
		try {
			await adminApi.patchOrientation(editTarget.slug, buildPatchBody(), false);
			toast.success(i18n.t('admin.catalog.orientations.edit.successToast'));
			editTarget = null;
			editDryPreview = null;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			editing = false;
		}
	}

	async function toggleArchive(o: Orientation) {
		try {
			await adminApi.patchOrientation(o.slug, { is_archived: !o.is_archived }, false);
			toast.success(i18n.t('admin.catalog.orientations.edit.successToast'));
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		}
	}

	async function openSkills(o: Orientation) {
		skillsTarget = o;
		attachSkillId = '';
		attachIsCore = false;
		attachIsRecommended = true;
		attachWeight = 1.0;
		skillsLoading = true;
		try {
			const res = await adminApi.getOrientation(o.slug);
			skillsList = res.data.skills;
		} catch (e) {
			toast.error(errorMessage(e));
			skillsList = [];
		} finally {
			skillsLoading = false;
		}
	}

	function isUuid(v: string): boolean {
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
	}

	async function submitAttach() {
		if (!skillsTarget || attaching) return;
		const id = attachSkillId.trim();
		if (!isUuid(id)) {
			toast.error(i18n.t('admin.catalog.orientations.skills.skillIdLabel'));
			return;
		}
		if (!(attachWeight > 0)) return;
		attaching = true;
		try {
			await adminApi.attachOrientationSkill(skillsTarget.slug, {
				skill_id: id,
				is_core: attachIsCore,
				is_recommended: attachIsRecommended,
				weight: attachWeight
			});
			toast.success(i18n.t('admin.catalog.orientations.skills.attachedToast'));
			await openSkills(skillsTarget);
			attachSkillId = '';
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			attaching = false;
		}
	}

	function requestDetach(s: { id: string; slug: string; name: string }) {
		detachTargetSkill = { id: s.id, name: s.name || s.slug };
	}

	async function confirmDetach() {
		if (!skillsTarget || !detachTargetSkill || detaching) return;
		detaching = true;
		try {
			await adminApi.detachOrientationSkill(skillsTarget.slug, detachTargetSkill.id);
			toast.success(i18n.t('admin.catalog.orientations.skills.detachedToast'));
			detachTargetSkill = null;
			await openSkills(skillsTarget);
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			detaching = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.catalog.orientations.filterDomain')}
			</span>
			<Select
				items={[
					{ value: '', label: i18n.t('admin.catalog.orientations.filterDomainAll') },
					...DOMAINS.map((d) => ({
						value: d,
						label: i18n.t(`admin.catalog.domains.${d}`)
					}))
				]}
				bind:value={filterDomain}
				onchange={() => loadList()}
				shape="rounded"
			/>
		</div>
		<label class="mb-1 flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={includeArchived}
				onchange={() => loadList()}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.catalog.orientations.includeArchived')}
		</label>
		<div class="ml-auto">
			<Button variant="primary" size="sm" onclick={openCreate}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.catalog.orientations.createBtn')}
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-12 w-full" rounded="xl" />
			<Skeleton class="h-12 w-full" rounded="xl" />
			<Skeleton class="h-12 w-full" rounded="xl" />
		</div>
	{:else}
		<Table
			columns={[
				{ key: 'slug', label: i18n.t('admin.catalog.orientations.table.slug'), width: '18%' },
				{ key: 'name', label: i18n.t('admin.catalog.orientations.table.name') },
				{ key: 'domain', label: i18n.t('admin.catalog.orientations.table.domain'), width: '14%' },
				{ key: 'status', label: i18n.t('admin.catalog.orientations.table.status'), width: '14%' },
				{
					key: 'actions',
					label: i18n.t('admin.catalog.orientations.table.actions'),
					width: '22%',
					align: 'right'
				}
			]}
			rows={filteredRows}
			emptyLabel={i18n.t('admin.catalog.orientations.empty')}
		>
			{#snippet cell(row, col)}
				{@const o = row as unknown as Orientation}
				{#if col.key === 'slug'}
					<code class="font-mono text-xs text-text-muted">{o.slug}</code>
				{:else if col.key === 'name'}
					<span class="font-medium text-text-primary">{o.name}</span>
					{#if o.tags.length > 0}
						<span class="ms-2 text-xs text-text-muted">
							{o.tags.slice(0, 3).join(', ')}{o.tags.length > 3 ? '…' : ''}
						</span>
					{/if}
				{:else if col.key === 'domain'}
					<Badge variant="primary" size="sm">
						{i18n.t(`admin.catalog.domains.${o.primary_domain}`)}
					</Badge>
				{:else if col.key === 'status'}
					{#if o.is_archived}
						<Badge variant="warning" size="sm">
							{i18n.t('admin.catalog.orientations.statusArchived')}
						</Badge>
					{:else if o.is_curated}
						<Badge variant="success" size="sm">
							{i18n.t('admin.catalog.orientations.statusCurated')}
						</Badge>
					{:else}
						<Badge variant="default" size="sm">
							{i18n.t('admin.catalog.orientations.statusDraft')}
						</Badge>
					{/if}
				{:else if col.key === 'actions'}
					<div class="flex items-center justify-end gap-1">
						<Button variant="ghost" size="sm" onclick={() => openSkills(o)}>
							<Link2 size={13} strokeWidth={2} />
							{i18n.t('admin.catalog.orientations.skillsBtn')}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => openEdit(o)}>
							<Pencil size={13} strokeWidth={2} />
							{i18n.t('admin.catalog.orientations.editBtn')}
						</Button>
						{#if o.is_archived}
							<Button variant="ghost" size="sm" onclick={() => toggleArchive(o)}>
								<ArchiveRestore size={13} strokeWidth={2} />
								{i18n.t('admin.catalog.orientations.unarchiveBtn')}
							</Button>
						{:else}
							<Button variant="ghost" size="sm" onclick={() => toggleArchive(o)}>
								<Archive size={13} strokeWidth={2} />
								{i18n.t('admin.catalog.orientations.archiveBtn')}
							</Button>
						{/if}
					</div>
				{/if}
			{/snippet}
		</Table>
	{/if}
</div>

<!-- Create dialog -->
<Modal
	open={showCreate}
	title={i18n.t('admin.catalog.orientations.create.title')}
	onclose={() => (showCreate = false)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.catalog.orientations.create.slugLabel')}
			hint={i18n.t('admin.catalog.orientations.create.slugHint')}
			bind:value={createSlug}
			oninput={() => (createTouched = true)}
			error={createSlugError ?? undefined}
			placeholder="dev-embedded"
		/>
		<Input
			label={i18n.t('admin.catalog.orientations.create.nameLabel')}
			bind:value={createName}
			oninput={() => (createTouched = true)}
			error={createNameError ?? undefined}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="orient-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.orientations.create.descriptionLabel')}
			</label>
			<textarea
				id="orient-desc"
				bind:value={createDescription}
				rows="3"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.orientations.create.primaryDomainLabel')}
			</span>
			<Select
				items={DOMAINS.map((d) => ({
					value: d,
					label: i18n.t(`admin.catalog.domains.${d}`)
				}))}
				bind:value={createPrimaryDomain}
				shape="rounded"
			/>
		</div>
		<Input
			label={i18n.t('admin.catalog.orientations.create.secondaryDomainsLabel')}
			hint={i18n.t('admin.catalog.orientations.create.secondaryDomainsHint')}
			bind:value={createSecondaryRaw}
			placeholder="design, ops"
		/>
		<Input
			label={i18n.t('admin.catalog.orientations.create.tagsLabel')}
			hint={i18n.t('admin.catalog.orientations.create.tagsHint')}
			bind:value={createTagsRaw}
			placeholder="web, mobile"
		/>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={createIsCurated}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.catalog.orientations.create.isCuratedLabel')}
		</label>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showCreate = false)} disabled={creating}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitCreate} disabled={!canCreate} loading={creating}>
			{i18n.t('admin.catalog.orientations.create.submit')}
		</Button>
	{/snippet}
</Modal>

<!-- Edit dialog -->
<Modal
	open={editTarget !== null}
	title={editTarget
		? `${i18n.t('admin.catalog.orientations.edit.title')} — ${editTarget.slug}`
		: ''}
	onclose={() => {
		editTarget = null;
		editDryPreview = null;
	}}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<p class="flex items-start gap-2 text-xs text-text-muted">
			<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
			<span>{i18n.t('admin.catalog.orientations.edit.slugImmutableHint')}</span>
		</p>
		<Input label={i18n.t('admin.catalog.orientations.create.nameLabel')} bind:value={editName} />
		<div class="flex flex-col gap-1.5">
			<label for="orient-edit-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.orientations.create.descriptionLabel')}
			</label>
			<textarea
				id="orient-edit-desc"
				bind:value={editDescription}
				rows="3"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.orientations.create.primaryDomainLabel')}
			</span>
			<Select
				items={DOMAINS.map((d) => ({
					value: d,
					label: i18n.t(`admin.catalog.domains.${d}`)
				}))}
				bind:value={editPrimaryDomain}
				shape="rounded"
			/>
		</div>
		<Input
			label={i18n.t('admin.catalog.orientations.create.secondaryDomainsLabel')}
			bind:value={editSecondaryRaw}
		/>
		<Input
			label={i18n.t('admin.catalog.orientations.create.tagsLabel')}
			bind:value={editTagsRaw}
		/>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={editIsCurated}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.catalog.orientations.create.isCuratedLabel')}
		</label>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={editIsArchived}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.catalog.orientations.statusArchived')}
		</label>

		{#if editDryPreview}
			<div class="rounded-xl border border-info bg-info-soft p-3 text-xs">
				<p class="mb-2 font-semibold uppercase tracking-wider text-info">
					{i18n.t('admin.catalog.orientations.edit.dryRunPreviewLabel')}
				</p>
				<pre class="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(
						editDryPreview,
						null,
						2
					)}</pre>
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				editTarget = null;
				editDryPreview = null;
			}}
			disabled={editing}
		>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="secondary" size="sm" onclick={submitEditDryRun} disabled={editing} loading={editing}>
			{i18n.t('admin.catalog.orientations.edit.dryRunBtn')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitEdit} disabled={editing} loading={editing}>
			{i18n.t('admin.catalog.orientations.edit.submit')}
		</Button>
	{/snippet}
</Modal>

<!-- Skills sub-dialog -->
<Modal
	open={skillsTarget !== null}
	title={skillsTarget
		? `${i18n.t('admin.catalog.orientations.skills.title')} — ${skillsTarget.slug}`
		: ''}
	onclose={() => (skillsTarget = null)}
	size="xl"
>
	<div class="flex flex-col gap-4">
		<p class="text-xs text-text-muted">{i18n.t('admin.catalog.orientations.skills.subtitle')}</p>

		<div class="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface-overlay p-4 md:grid-cols-2">
			<div class="md:col-span-2">
				<Input
					label={i18n.t('admin.catalog.orientations.skills.skillIdLabel')}
					hint={i18n.t('admin.catalog.orientations.skills.skillIdHint')}
					bind:value={attachSkillId}
					placeholder="00000000-0000-0000-0000-000000000000"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="weight" class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.orientations.skills.weightLabel')}
				</label>
				<input
					id="weight"
					type="number"
					step="0.1"
					min="0.1"
					bind:value={attachWeight}
					class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
				/>
				<p class="text-xs text-text-muted">
					{i18n.t('admin.catalog.orientations.skills.weightHint')}
				</p>
			</div>
			<div class="flex flex-col justify-end gap-2">
				<label class="flex items-center gap-2 text-sm text-text-primary">
					<input
						type="checkbox"
						bind:checked={attachIsCore}
						class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
					/>
					{i18n.t('admin.catalog.orientations.skills.isCoreLabel')}
				</label>
				<label class="flex items-center gap-2 text-sm text-text-primary">
					<input
						type="checkbox"
						bind:checked={attachIsRecommended}
						class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
					/>
					{i18n.t('admin.catalog.orientations.skills.isRecommendedLabel')}
				</label>
			</div>
			<div class="md:col-span-2">
				<Button variant="primary" size="sm" onclick={submitAttach} loading={attaching} disabled={attaching}>
					<Plus size={13} strokeWidth={2} />
					{i18n.t('admin.catalog.orientations.skills.attachBtn')}
				</Button>
			</div>
		</div>

		{#if skillsLoading}
			<Skeleton class="h-16 w-full" rounded="xl" />
		{:else if skillsList.length === 0}
			<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
				{i18n.t('admin.catalog.orientations.skills.noSkills')}
			</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each skillsList as s (s.id)}
					<li class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-overlay px-3 py-2">
						<div class="flex min-w-0 flex-1 items-center gap-2">
							{#if s.is_core}
								<Badge variant="primary" size="sm">
									{i18n.t('admin.catalog.orientations.skills.coreBadge')}
								</Badge>
							{/if}
							<span class="font-medium text-text-primary">{s.name || s.slug}</span>
							<code class="font-mono text-xs text-text-muted">{s.slug}</code>
							<span class="text-xs text-text-muted">×{s.weight.toFixed(2)}</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => requestDetach(s)}
						>
							<X size={13} strokeWidth={2} />
							{i18n.t('admin.catalog.orientations.skills.detachBtn')}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (skillsTarget = null)}>
			{i18n.t('admin.common.close')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={detachTargetSkill !== null}
	title={i18n.t('admin.catalog.orientations.skills.detachConfirmTitle')}
	description={detachTargetSkill
		? `${detachTargetSkill.name} — ${i18n.t('admin.catalog.orientations.skills.detachConfirmDescription')}`
		: ''}
	actionLabel={i18n.t('admin.catalog.orientations.skills.detachBtn')}
	requireReason={false}
	loading={detaching}
	onconfirm={() => confirmDetach()}
	onclose={() => (detachTargetSkill = null)}
/>
