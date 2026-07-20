<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		BadgeOutputType,
		BadgeRarity,
		BadgeRuleCatalogEntry,
		CreateBadgeRuleBody,
		PatchBadgeRuleBody
	} from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Plus, Pencil, ArchiveX, Info } from '@lucide/svelte';

	const OUTPUT_TYPES: BadgeOutputType[] = [
		'skill_patch',
		'rank',
		'guild_crest',
		'challenge_seal',
		'event_stamp',
		'medal'
	];
	const RARITIES: BadgeRarity[] = ['auto', 'common', 'rare', 'epic', 'legendary'];

	// --- List state ---
	let rules = $state<BadgeRuleCatalogEntry[]>([]);
	let loading = $state(true);
	let filterOutputType = $state<BadgeOutputType | ''>('');

	// --- Create dialog ---
	let showCreate = $state(false);
	let creating = $state(false);
	let createSlug = $state('');
	let createOutputType = $state<BadgeOutputType>('skill_patch');
	let createOutputVariant = $state('');
	let createDisplayName = $state('');
	let createDescription = $state('');
	let createIconKey = $state('');
	let createConditionsRaw = $state('{}');
	let createRarity = $state<BadgeRarity>('auto');
	let createAdminEditable = $state(true);
	let createUiMetadataRaw = $state('');
	let createTouched = $state(false);

	const createSlugError = $derived.by(() => {
		if (!createTouched) return null;
		const s = createSlug.trim();
		if (s.length < 3 || s.length > 80) return i18n.t('admin.catalog.badgeRules.create.slugHint');
		if (!/^[a-z0-9_-]+$/.test(s)) return i18n.t('admin.catalog.badgeRules.create.slugHint');
		return null;
	});
	const createNameError = $derived.by(() => {
		if (!createTouched) return null;
		if (createDisplayName.trim().length < 1) return ' ';
		return null;
	});
	const createConditionsError = $derived.by(() => {
		if (!createTouched) return null;
		try {
			const parsed = JSON.parse(createConditionsRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidRoot');
		} catch {
			return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidJson');
		}
		return null;
	});
	const createUiMetadataError = $derived.by(() => {
		if (!createTouched || createUiMetadataRaw.trim() === '') return null;
		try {
			const parsed = JSON.parse(createUiMetadataRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidRoot');
		} catch {
			return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidJson');
		}
		return null;
	});
	const canCreate = $derived(
		!creating &&
			createSlug.trim().length > 0 &&
			createDisplayName.trim().length > 0 &&
			createSlugError === null &&
			createNameError === null &&
			createConditionsError === null &&
			createUiMetadataError === null
	);

	// --- Edit dialog ---
	let editTarget = $state<BadgeRuleCatalogEntry | null>(null);
	let editOutputVariant = $state('');
	let editDisplayName = $state('');
	let editDescription = $state('');
	let editIconKey = $state('');
	let editConditionsRaw = $state('{}');
	let editRarity = $state<BadgeRarity>('auto');
	let editing = $state(false);
	let editUsersImpacted = $state<number | null>(null);

	const editConditionsError = $derived.by(() => {
		try {
			const parsed = JSON.parse(editConditionsRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidRoot');
		} catch {
			return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidJson');
		}
		return null;
	});

	// --- Deprecate ---
	let deprecateTarget = $state<BadgeRuleCatalogEntry | null>(null);
	let deprecating = $state(false);
	let deprecatePreviewCount = $state<number | null>(null);

	$effect(() => {
		void loadList();
	});

	async function loadList() {
		loading = true;
		try {
			const res = await adminApi.listBadgeRulesCatalog();
			rules = res.data.rules;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	const filteredRows = $derived(
		rules
			.filter((r) => filterOutputType === '' || r.output_type === filterOutputType)
			.map((r) => r as unknown as Record<string, unknown>)
	);

	function openCreate() {
		createSlug = '';
		createOutputType = 'skill_patch';
		createOutputVariant = '';
		createDisplayName = '';
		createDescription = '';
		createIconKey = '';
		createConditionsRaw = JSON.stringify(
			{ proof_types: ['deliverable_verified'], min_count: 5 },
			null,
			2
		);
		createRarity = 'auto';
		createAdminEditable = true;
		createUiMetadataRaw = '';
		createTouched = false;
		showCreate = true;
	}

	async function submitCreate() {
		createTouched = true;
		if (!canCreate) return;
		creating = true;
		try {
			const body: CreateBadgeRuleBody = {
				slug: createSlug.trim(),
				output_type: createOutputType,
				output_variant: createOutputVariant.trim() || undefined,
				display_name: createDisplayName.trim(),
				description: createDescription.trim() || undefined,
				icon_key: createIconKey.trim() || undefined,
				conditions: JSON.parse(createConditionsRaw),
				rarity: createRarity,
				admin_editable: createAdminEditable,
				ui_metadata:
					createUiMetadataRaw.trim() === '' ? undefined : JSON.parse(createUiMetadataRaw)
			};
			await adminApi.createBadgeRule(body);
			toast.success(i18n.t('admin.catalog.badgeRules.create.successToast'));
			showCreate = false;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creating = false;
		}
	}

	function openEdit(r: BadgeRuleCatalogEntry) {
		editTarget = r;
		editOutputVariant = r.output_variant ?? '';
		editDisplayName = r.display_name;
		editDescription = r.description;
		editIconKey = r.icon_key ?? '';
		editConditionsRaw = JSON.stringify(r.conditions ?? {}, null, 2);
		editRarity = r.rarity;
		editUsersImpacted = null;
	}

	function buildPatch(): PatchBadgeRuleBody {
		if (!editTarget) return {};
		const patch: PatchBadgeRuleBody = {};
		if (editOutputVariant.trim() !== (editTarget.output_variant ?? ''))
			patch.output_variant = editOutputVariant.trim() || undefined;
		if (editDisplayName.trim() !== editTarget.display_name)
			patch.display_name = editDisplayName.trim();
		if (editDescription !== editTarget.description) patch.description = editDescription;
		if (editIconKey.trim() !== (editTarget.icon_key ?? ''))
			patch.icon_key = editIconKey.trim() || undefined;
		try {
			const nextCond = JSON.parse(editConditionsRaw);
			if (JSON.stringify(nextCond) !== JSON.stringify(editTarget.conditions ?? {}))
				patch.conditions = nextCond;
		} catch {
			/* validation is enforced by editConditionsError */
		}
		if (editRarity !== editTarget.rarity) patch.rarity = editRarity;
		return patch;
	}

	async function submitEditDryRun() {
		if (!editTarget || editing || editConditionsError !== null) return;
		editing = true;
		try {
			const res = await adminApi.patchBadgeRule(editTarget.slug, buildPatch(), true);
			editUsersImpacted = res.meta.dry_run_preview?.users_impacted_count ?? null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			editing = false;
		}
	}

	async function submitEdit() {
		if (!editTarget || editing || editConditionsError !== null) return;
		editing = true;
		try {
			await adminApi.patchBadgeRule(editTarget.slug, buildPatch(), false);
			toast.success(i18n.t('admin.catalog.badgeRules.edit.successToast'));
			editTarget = null;
			editUsersImpacted = null;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			editing = false;
		}
	}

	async function requestDeprecate(r: BadgeRuleCatalogEntry) {
		deprecateTarget = r;
		deprecatePreviewCount = null;
		// Best-effort : dry-run pour préviewer le nombre d'utilisateurs impactés.
		try {
			const res = await adminApi.deprecateBadgeRule(r.slug, 'preview count only.', true);
			deprecatePreviewCount = res.meta.dry_run_preview?.users_with_badge_count ?? null;
		} catch {
			deprecatePreviewCount = null;
		}
	}

	async function confirmDeprecate(reason: string) {
		if (!deprecateTarget || deprecating) return;
		deprecating = true;
		try {
			await adminApi.deprecateBadgeRule(deprecateTarget.slug, reason, false);
			toast.success(i18n.t('admin.catalog.badgeRules.deprecate.successToast'));
			deprecateTarget = null;
			await loadList();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			deprecating = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.catalog.badgeRules.filterOutputType')}
			</span>
			<Select
				items={[
					{ value: '', label: i18n.t('admin.catalog.badgeRules.filterOutputTypeAll') },
					...OUTPUT_TYPES.map((t) => ({
						value: t,
						label: i18n.t(`admin.catalog.outputTypes.${t}`)
					}))
				]}
				bind:value={filterOutputType}
				shape="rounded"
			/>
		</div>
		<div class="ml-auto">
			<Button variant="primary" size="sm" onclick={openCreate}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.catalog.badgeRules.createBtn')}
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
				{ key: 'slug', label: i18n.t('admin.catalog.badgeRules.table.slug'), width: '22%' },
				{ key: 'displayName', label: i18n.t('admin.catalog.badgeRules.table.displayName') },
				{ key: 'outputType', label: i18n.t('admin.catalog.badgeRules.table.outputType'), width: '14%' },
				{ key: 'rarity', label: i18n.t('admin.catalog.badgeRules.table.rarity'), width: '10%' },
				{ key: 'status', label: i18n.t('admin.catalog.badgeRules.table.status'), width: '12%' },
				{
					key: 'actions',
					label: i18n.t('admin.catalog.badgeRules.table.actions'),
					width: '16%',
					align: 'right'
				}
			]}
			rows={filteredRows}
			emptyLabel={i18n.t('admin.catalog.badgeRules.empty')}
		>
			{#snippet cell(row, col)}
				{@const r = row as unknown as BadgeRuleCatalogEntry}
				{#if col.key === 'slug'}
					<code class="font-mono text-xs text-text-muted">{r.slug}</code>
				{:else if col.key === 'displayName'}
					<span class="font-medium text-text-primary">{r.display_name}</span>
					{#if r.output_variant}
						<span class="ms-2 text-xs text-text-muted">/ {r.output_variant}</span>
					{/if}
				{:else if col.key === 'outputType'}
					<Badge variant="primary" size="sm">
						{i18n.t(`admin.catalog.outputTypes.${r.output_type}`)}
					</Badge>
				{:else if col.key === 'rarity'}
					<Badge
						variant={r.rarity === 'legendary'
							? 'warning'
							: r.rarity === 'epic'
								? 'accent'
								: 'default'}
						size="sm"
					>
						{i18n.t(`admin.catalog.rarities.${r.rarity}`)}
					</Badge>
				{:else if col.key === 'status'}
					<Badge variant="success" size="sm">
						{i18n.t('admin.catalog.badgeRules.statusActive')}
					</Badge>
				{:else if col.key === 'actions'}
					<div class="flex items-center justify-end gap-1">
						<Button variant="ghost" size="sm" onclick={() => openEdit(r)}>
							<Pencil size={13} strokeWidth={2} />
							{i18n.t('admin.catalog.badgeRules.editBtn')}
						</Button>
						<Button variant="ghost" size="sm" onclick={() => requestDeprecate(r)}>
							<ArchiveX size={13} strokeWidth={2} />
							{i18n.t('admin.catalog.badgeRules.deprecateBtn')}
						</Button>
					</div>
				{/if}
			{/snippet}
		</Table>
	{/if}
</div>

<!-- Create dialog -->
<Modal
	open={showCreate}
	title={i18n.t('admin.catalog.badgeRules.create.title')}
	onclose={() => (showCreate = false)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.catalog.badgeRules.create.slugLabel')}
			hint={i18n.t('admin.catalog.badgeRules.create.slugHint')}
			bind:value={createSlug}
			oninput={() => (createTouched = true)}
			error={createSlugError ?? undefined}
			placeholder="reactor_of_the_month"
		/>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.badgeRules.create.outputTypeLabel')}
				</span>
				<Select
					items={OUTPUT_TYPES.map((t) => ({
						value: t,
						label: i18n.t(`admin.catalog.outputTypes.${t}`)
					}))}
					bind:value={createOutputType}
					shape="rounded"
				/>
			</div>
			<Input
				label={i18n.t('admin.catalog.badgeRules.create.outputVariantLabel')}
				bind:value={createOutputVariant}
			/>
		</div>
		<Input
			label={i18n.t('admin.catalog.badgeRules.create.displayNameLabel')}
			bind:value={createDisplayName}
			oninput={() => (createTouched = true)}
			error={createNameError ?? undefined}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="rule-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.badgeRules.create.descriptionLabel')}
			</label>
			<textarea
				id="rule-desc"
				bind:value={createDescription}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<Input
			label={i18n.t('admin.catalog.badgeRules.create.iconKeyLabel')}
			bind:value={createIconKey}
			placeholder="react"
		/>
		<div class="flex flex-col gap-1.5">
			<label for="rule-conditions" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.badgeRules.create.conditionsLabel')}
			</label>
			<textarea
				id="rule-conditions"
				bind:value={createConditionsRaw}
				oninput={() => (createTouched = true)}
				rows="6"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if createConditionsError}
				<p class="text-xs text-error">{createConditionsError}</p>
			{:else}
				<p class="text-xs text-text-muted">
					{i18n.t('admin.catalog.badgeRules.create.conditionsHint')}
				</p>
			{/if}
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.badgeRules.create.rarityLabel')}
				</span>
				<Select
					items={RARITIES.map((r) => ({
						value: r,
						label: i18n.t(`admin.catalog.rarities.${r}`)
					}))}
					bind:value={createRarity}
					shape="rounded"
				/>
			</div>
			<label class="mt-6 flex items-center gap-2 text-sm text-text-primary">
				<input
					type="checkbox"
					bind:checked={createAdminEditable}
					class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
				/>
				{i18n.t('admin.catalog.badgeRules.create.adminEditableLabel')}
			</label>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="rule-ui-meta" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.badgeRules.create.uiMetadataLabel')}
			</label>
			<textarea
				id="rule-ui-meta"
				bind:value={createUiMetadataRaw}
				oninput={() => (createTouched = true)}
				rows="3"
				placeholder="{'{}'}"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if createUiMetadataError}
				<p class="text-xs text-error">{createUiMetadataError}</p>
			{:else}
				<p class="text-xs text-text-muted">
					{i18n.t('admin.catalog.badgeRules.create.uiMetadataHint')}
				</p>
			{/if}
		</div>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showCreate = false)} disabled={creating}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitCreate} disabled={!canCreate} loading={creating}>
			{i18n.t('admin.catalog.badgeRules.create.submit')}
		</Button>
	{/snippet}
</Modal>

<!-- Edit dialog -->
<Modal
	open={editTarget !== null}
	title={editTarget ? `${i18n.t('admin.catalog.badgeRules.edit.title')} — ${editTarget.slug}` : ''}
	onclose={() => {
		editTarget = null;
		editUsersImpacted = null;
	}}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<Input
				label={i18n.t('admin.catalog.badgeRules.create.outputVariantLabel')}
				bind:value={editOutputVariant}
			/>
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.badgeRules.create.rarityLabel')}
				</span>
				<Select
					items={RARITIES.map((r) => ({
						value: r,
						label: i18n.t(`admin.catalog.rarities.${r}`)
					}))}
					bind:value={editRarity}
					shape="rounded"
				/>
			</div>
		</div>
		<Input
			label={i18n.t('admin.catalog.badgeRules.create.displayNameLabel')}
			bind:value={editDisplayName}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="rule-edit-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.badgeRules.create.descriptionLabel')}
			</label>
			<textarea
				id="rule-edit-desc"
				bind:value={editDescription}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<Input
			label={i18n.t('admin.catalog.badgeRules.create.iconKeyLabel')}
			bind:value={editIconKey}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="rule-edit-conditions" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.badgeRules.create.conditionsLabel')}
			</label>
			<textarea
				id="rule-edit-conditions"
				bind:value={editConditionsRaw}
				rows="6"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if editConditionsError}
				<p class="text-xs text-error">{editConditionsError}</p>
			{/if}
		</div>

		{#if editUsersImpacted !== null}
			<div class="flex items-center gap-2 rounded-xl border border-info bg-info-soft px-3 py-2 text-xs text-info">
				<Info size={12} strokeWidth={2} />
				<span>
					{editUsersImpacted} {i18n.t('admin.catalog.badgeRules.edit.dryRunUsersImpacted')}
				</span>
			</div>
		{/if}
	</div>

	{#snippet actions()}
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				editTarget = null;
				editUsersImpacted = null;
			}}
			disabled={editing}
		>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="secondary"
			size="sm"
			onclick={submitEditDryRun}
			disabled={editing || editConditionsError !== null}
			loading={editing}
		>
			{i18n.t('admin.catalog.badgeRules.edit.dryRunBtn')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={submitEdit}
			disabled={editing || editConditionsError !== null}
			loading={editing}
		>
			{i18n.t('admin.catalog.badgeRules.edit.submit')}
		</Button>
	{/snippet}
</Modal>

<ConfirmDangerousDialog
	open={deprecateTarget !== null}
	title={i18n.t('admin.catalog.badgeRules.deprecate.title')}
	description={deprecateTarget
		? `${deprecateTarget.display_name} — ${i18n.t('admin.catalog.badgeRules.deprecate.description')}${deprecatePreviewCount !== null ? ` (${deprecatePreviewCount} ${i18n.t('admin.catalog.badgeRules.deprecate.usersWithBadgeCount')})` : ''}`
		: ''}
	actionLabel={i18n.t('admin.catalog.badgeRules.deprecateBtn')}
	reasonPlaceholder={i18n.t('admin.catalog.badgeRules.deprecate.reasonPlaceholder')}
	requireReason={true}
	minReasonLength={8}
	loading={deprecating}
	onconfirm={(reason) => confirmDeprecate(reason)}
	onclose={() => (deprecateTarget = null)}
/>
