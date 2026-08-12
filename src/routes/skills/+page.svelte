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
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import SkillFormModal from '$components/admin/SkillFormModal.svelte';
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

	// --- Modals (form state is owned by <SkillFormModal>) ---
	let showCreate = $state(false);
	let creating = $state(false);
	let editTarget = $state<SkillNodeAdmin | null>(null);
	let editing = $state(false);

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

	function openCreate() {
		showCreate = true;
	}

	async function submitCreate(body: CreateSkillNodeBody | UpdateSkillNodeBody) {
		creating = true;
		try {
			await adminApi.createSkillNode(body as CreateSkillNodeBody);
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
	}

	async function submitEdit(body: CreateSkillNodeBody | UpdateSkillNodeBody) {
		if (!editTarget) return;
		editing = true;
		try {
			await adminApi.updateSkillNode(editTarget.id, body as UpdateSkillNodeBody);
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

<SkillFormModal
	open={showCreate}
	mode={{ kind: 'create' }}
	submitting={creating}
	onclose={() => (showCreate = false)}
	onsubmit={submitCreate}
/>

<SkillFormModal
	open={editTarget !== null}
	mode={editTarget ? { kind: 'edit', target: editTarget } : { kind: 'create' }}
	submitting={editing}
	onclose={() => (editTarget = null)}
	onsubmit={submitEdit}
/>
