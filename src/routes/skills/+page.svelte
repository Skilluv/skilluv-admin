<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		SkillNodeAdmin,
		SkillNodeDomain,
		CreateSkillNodeBody,
		UpdateSkillNodeBody
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import { Plus, Pencil, Copy } from '@lucide/svelte';

	const DOMAINS: SkillNodeDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'soft_skills',
		'ai',
		'ops'
	];

	// --- List state ---
	let skills = $state<SkillNodeAdmin[]>([]);
	let loading = $state(true);
	let filterDomain = $state<SkillNodeDomain | ''>('');
	let filterQ = $state('');
	let filterSkilluv = $state<'any' | 'yes' | 'no'>('any');
	let page = $state(1);
	let perPage = $state(30);
	let totalPages = $state(0);
	let total = $state(0);

	// --- Create dialog ---
	let showCreate = $state(false);
	let creating = $state(false);
	let createSlug = $state('');
	let createDisplayName = $state('');
	let createDescription = $state('');
	let createDomain = $state<SkillNodeDomain>('code');
	let createParentId = $state('');
	let createAliasesRaw = $state('');
	let createExternalRefsRaw = $state('');
	let createIsSkilluv = $state(false);
	let createTouched = $state(false);

	const createSlugError = $derived.by(() => {
		if (!createTouched) return null;
		const s = createSlug.trim();
		if (s.length < 2 || s.length > 80) return i18n.t('admin.skills.create.slugHint');
		if (!/^[a-z0-9_-]+$/.test(s)) return i18n.t('admin.skills.create.slugHint');
		return null;
	});
	const createExtRefsError = $derived.by(() => {
		if (!createTouched || createExternalRefsRaw.trim() === '') return null;
		try {
			const parsed = JSON.parse(createExternalRefsRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.skills.create.externalRefsInvalidJson');
		} catch {
			return i18n.t('admin.skills.create.externalRefsInvalidJson');
		}
		return null;
	});
	const canCreate = $derived(
		!creating &&
			createSlug.trim().length > 0 &&
			createDisplayName.trim().length > 0 &&
			createSlugError === null &&
			createExtRefsError === null
	);

	// --- Edit dialog ---
	let editTarget = $state<SkillNodeAdmin | null>(null);
	let editDisplayName = $state('');
	let editDescription = $state('');
	let editDomain = $state<SkillNodeDomain>('code');
	let editParentId = $state('');
	let editClearParent = $state(false);
	let editAliasesRaw = $state('');
	let editExternalRefsRaw = $state('');
	let editIsSkilluv = $state(false);
	let editing = $state(false);

	const editExtRefsError = $derived.by(() => {
		if (editExternalRefsRaw.trim() === '') return null;
		try {
			const parsed = JSON.parse(editExternalRefsRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.skills.create.externalRefsInvalidJson');
		} catch {
			return i18n.t('admin.skills.create.externalRefsInvalidJson');
		}
		return null;
	});

	$effect(() => {
		void loadList();
	});

	async function loadList() {
		loading = true;
		try {
			const verifiedParam =
				filterSkilluv === 'any' ? undefined : filterSkilluv === 'yes';
			const res = await adminApi.listAdminSkills({
				domain: filterDomain === '' ? undefined : filterDomain,
				q: filterQ.trim() || undefined,
				is_skilluv_specific: verifiedParam,
				page,
				per_page: perPage
			});
			skills = res.data;
			total = res.pagination.total;
			totalPages = res.pagination.total_pages;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function onFilterChange() {
		page = 1;
		void loadList();
	}

	const rows = $derived(skills.map((s) => s as unknown as Record<string, unknown>));

	function parseList(raw: string): string[] {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	function openCreate() {
		createSlug = '';
		createDisplayName = '';
		createDescription = '';
		createDomain = 'code';
		createParentId = '';
		createAliasesRaw = '';
		createExternalRefsRaw = '';
		createIsSkilluv = false;
		createTouched = false;
		showCreate = true;
	}

	async function submitCreate() {
		createTouched = true;
		if (!canCreate) return;
		creating = true;
		try {
			const body: CreateSkillNodeBody = {
				slug: createSlug.trim(),
				display_name: createDisplayName.trim(),
				description: createDescription.trim() || undefined,
				domain: createDomain,
				parent_id: createParentId.trim() || undefined,
				aliases: parseList(createAliasesRaw),
				external_refs:
					createExternalRefsRaw.trim() === '' ? undefined : JSON.parse(createExternalRefsRaw),
				is_skilluv_specific: createIsSkilluv
			};
			await adminApi.createSkillNode(body);
			toast.success(i18n.t('admin.skills.create.successToast'));
			showCreate = false;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creating = false;
		}
	}

	function openEdit(s: SkillNodeAdmin) {
		editTarget = s;
		editDisplayName = s.display_name;
		editDescription = s.description ?? '';
		editDomain = s.domain;
		editParentId = s.parent_id ?? '';
		editClearParent = false;
		editAliasesRaw = '';
		editExternalRefsRaw = '';
		editIsSkilluv = s.is_skilluv_specific;
	}

	async function submitEdit() {
		if (!editTarget || editing || editExtRefsError !== null) return;
		editing = true;
		try {
			const body: UpdateSkillNodeBody = {
				display_name: editDisplayName.trim(),
				description: editDescription,
				domain: editDomain,
				parent_id: editClearParent ? null : editParentId.trim() || undefined,
				aliases: editAliasesRaw.trim() === '' ? undefined : parseList(editAliasesRaw),
				external_refs:
					editExternalRefsRaw.trim() === '' ? undefined : JSON.parse(editExternalRefsRaw),
				is_skilluv_specific: editIsSkilluv
			};
			await adminApi.updateSkillNode(editTarget.id, body);
			toast.success(i18n.t('admin.skills.edit.successToast'));
			editTarget = null;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			editing = false;
		}
	}

	async function copyId(id: string) {
		try {
			await navigator.clipboard.writeText(id);
			toast.success(i18n.t('admin.skills.idCopiedToast'));
		} catch {
			// Some browsers refuse clipboard access on non-HTTPS or restricted contexts.
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.skills.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-col gap-2">
		<h1 class="text-2xl font-bold text-text-primary">{i18n.t('admin.skills.title')}</h1>
		<p class="text-sm text-text-muted">{i18n.t('admin.skills.subtitle')}</p>
	</div>

	<div class="mb-4 flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.skills.filterDomain')}
			</span>
			<Select
				items={[
					{ value: '', label: i18n.t('admin.skills.filterDomainAll') },
					...DOMAINS.map((d) => ({
						value: d,
						label: i18n.t(`admin.catalog.domains.${d}`)
					}))
				]}
				bind:value={filterDomain}
				onchange={onFilterChange}
				shape="rounded"
			/>
		</div>
		<div class="flex min-w-56 flex-1 flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.skills.filterQ')}
			</span>
			<Input
				bind:value={filterQ}
				placeholder={i18n.t('admin.skills.filterQPlaceholder')}
				onblur={onFilterChange}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.skills.filterSkilluvSpecific')}
			</span>
			<Select
				items={[
					{ value: 'any', label: i18n.t('admin.skills.filterAny') },
					{ value: 'yes', label: i18n.t('admin.skills.filterYes') },
					{ value: 'no', label: i18n.t('admin.skills.filterNo') }
				]}
				bind:value={filterSkilluv}
				onchange={onFilterChange}
				shape="rounded"
			/>
		</div>
		<div class="ms-auto flex items-end gap-2">
			<p class="text-xs text-text-muted">{total}</p>
			<Button variant="primary" size="sm" onclick={openCreate}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.skills.createBtn')}
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
				{ key: 'slug', label: i18n.t('admin.skills.table.slug'), width: '22%' },
				{ key: 'displayName', label: i18n.t('admin.skills.table.displayName') },
				{ key: 'domain', label: i18n.t('admin.skills.table.domain'), width: '14%' },
				{ key: 'flags', label: i18n.t('admin.skills.table.flags'), width: '18%' },
				{
					key: 'actions',
					label: i18n.t('admin.skills.table.actions'),
					width: '20%',
					align: 'right'
				}
			]}
			rows={rows}
			emptyLabel={i18n.t('admin.skills.empty')}
		>
			{#snippet cell(row, col)}
				{@const s = row as unknown as SkillNodeAdmin}
				{#if col.key === 'slug'}
					<code class="font-mono text-xs text-text-muted">{s.slug}</code>
				{:else if col.key === 'displayName'}
					<span class="font-medium text-text-primary">{s.display_name}</span>
				{:else if col.key === 'domain'}
					<Badge variant="primary" size="sm">
						{i18n.t(`admin.catalog.domains.${s.domain}`)}
					</Badge>
				{:else if col.key === 'flags'}
					{#if s.is_skilluv_specific}
						<Badge variant="accent" size="sm">
							{i18n.t('admin.skills.skilluvSpecificBadge')}
						</Badge>
					{/if}
					{#if s.parent_id}
						<span class="ms-1 text-xs text-text-muted">child</span>
					{/if}
				{:else if col.key === 'actions'}
					<div class="flex items-center justify-end gap-1">
						<Button variant="ghost" size="sm" onclick={() => copyId(s.id)}>
							<Copy size={13} strokeWidth={2} />
							{i18n.t('admin.skills.copyIdBtn')}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => openEdit(s)}>
							<Pencil size={13} strokeWidth={2} />
							{i18n.t('admin.skills.editBtn')}
						</Button>
					</div>
				{/if}
			{/snippet}
		</Table>

		{#if totalPages > 1}
			<div class="mt-4 flex justify-center">
				<Pagination
					current={page}
					total={totalPages}
					onchange={(p) => {
						page = p;
						void loadList();
					}}
				/>
			</div>
		{/if}
	{/if}
</div>

<!-- Create dialog -->
<Modal
	open={showCreate}
	title={i18n.t('admin.skills.create.title')}
	onclose={() => (showCreate = false)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.skills.create.slugLabel')}
			hint={i18n.t('admin.skills.create.slugHint')}
			bind:value={createSlug}
			oninput={() => (createTouched = true)}
			error={createSlugError ?? undefined}
			placeholder="react-hooks"
		/>
		<Input
			label={i18n.t('admin.skills.create.displayNameLabel')}
			bind:value={createDisplayName}
			oninput={() => (createTouched = true)}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.descriptionLabel')}
			</label>
			<textarea
				id="skill-desc"
				bind:value={createDescription}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.skills.create.domainLabel')}
				</span>
				<Select
					items={DOMAINS.map((d) => ({
						value: d,
						label: i18n.t(`admin.catalog.domains.${d}`)
					}))}
					bind:value={createDomain}
					shape="rounded"
				/>
			</div>
			<Input
				label={i18n.t('admin.skills.create.parentIdLabel')}
				hint={i18n.t('admin.skills.create.parentIdHint')}
				bind:value={createParentId}
				placeholder="00000000-0000-0000-0000-000000000000"
			/>
		</div>
		<Input
			label={i18n.t('admin.skills.create.aliasesLabel')}
			hint={i18n.t('admin.skills.create.aliasesHint')}
			bind:value={createAliasesRaw}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-refs" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.externalRefsLabel')}
			</label>
			<textarea
				id="skill-refs"
				bind:value={createExternalRefsRaw}
				oninput={() => (createTouched = true)}
				rows="3"
				placeholder="{'{}'}"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if createExtRefsError}
				<p class="text-xs text-error">{createExtRefsError}</p>
			{:else}
				<p class="text-xs text-text-muted">{i18n.t('admin.skills.create.externalRefsHint')}</p>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={createIsSkilluv}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.skills.create.isSkilluvSpecificLabel')}
		</label>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showCreate = false)} disabled={creating}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitCreate} disabled={!canCreate} loading={creating}>
			{i18n.t('admin.skills.create.submit')}
		</Button>
	{/snippet}
</Modal>

<!-- Edit dialog -->
<Modal
	open={editTarget !== null}
	title={editTarget ? `${i18n.t('admin.skills.edit.title')} — ${editTarget.slug}` : ''}
	onclose={() => (editTarget = null)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.skills.create.displayNameLabel')}
			bind:value={editDisplayName}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-edit-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.descriptionLabel')}
			</label>
			<textarea
				id="skill-edit-desc"
				bind:value={editDescription}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.skills.create.domainLabel')}
				</span>
				<Select
					items={DOMAINS.map((d) => ({
						value: d,
						label: i18n.t(`admin.catalog.domains.${d}`)
					}))}
					bind:value={editDomain}
					shape="rounded"
				/>
			</div>
			<Input
				label={i18n.t('admin.skills.create.parentIdLabel')}
				hint={i18n.t('admin.skills.edit.parentIdHint')}
				bind:value={editParentId}
				disabled={editClearParent}
			/>
		</div>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={editClearParent}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.skills.edit.clearParentLabel')}
		</label>
		<Input
			label={i18n.t('admin.skills.create.aliasesLabel')}
			hint={i18n.t('admin.skills.create.aliasesHint')}
			bind:value={editAliasesRaw}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-edit-refs" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.externalRefsLabel')}
			</label>
			<textarea
				id="skill-edit-refs"
				bind:value={editExternalRefsRaw}
				rows="3"
				placeholder="{'{}'}"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if editExtRefsError}
				<p class="text-xs text-error">{editExtRefsError}</p>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={editIsSkilluv}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.skills.create.isSkilluvSpecificLabel')}
		</label>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (editTarget = null)} disabled={editing}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitEdit}
			disabled={editing || editExtRefsError !== null}
			loading={editing}
		>
			{i18n.t('admin.skills.edit.submit')}
		</Button>
	{/snippet}
</Modal>
