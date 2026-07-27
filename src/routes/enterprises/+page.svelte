<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { EnterpriseAdmin, EnterpriseType } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Select from '$components/ui/Select.svelte';
	import Table from '$components/ui/Table.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import { ShieldCheck, ShieldOff } from '@lucide/svelte';

	const TYPES: EnterpriseType[] = ['direct_hire', 'staffing_agency', 'remote_international'];

	let enterprises = $state<EnterpriseAdmin[]>([]);
	let loading = $state(true);
	let filterType = $state<EnterpriseType | ''>('');
	let filterVerified = $state<'any' | 'yes' | 'no'>('any');
	let page = $state(1);
	let perPage = $state(20);
	let total = $state(0);
	let totalPages = $state(0);

	$effect(() => {
		void loadList();
	});

	async function loadList() {
		loading = true;
		try {
			const verifiedParam =
				filterVerified === 'any' ? undefined : filterVerified === 'yes';
			const res = await adminApi.listAdminEnterprises({
				type: filterType === '' ? undefined : filterType,
				verified: verifiedParam,
				page,
				per_page: perPage
			});
			enterprises = res.data;
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

	const rows = $derived(enterprises.map((e) => e as unknown as Record<string, unknown>));

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(intlLocale(), {
				day: '2-digit',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.enterprises.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-col gap-2">
		<h1 class="text-2xl font-bold text-text-primary">{i18n.t('admin.enterprises.title')}</h1>
		<p class="text-sm text-text-muted">{i18n.t('admin.enterprises.subtitle')}</p>
	</div>

	<div class="mb-4 flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.enterprises.filterType')}
			</span>
			<Select
				items={[
					{ value: '', label: i18n.t('admin.enterprises.filterTypeAll') },
					...TYPES.map((t) => ({
						value: t,
						label: i18n.t(`admin.enterprises.types.${t}`)
					}))
				]}
				bind:value={filterType}
				onchange={onFilterChange}
				shape="rounded"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.enterprises.filterVerified')}
			</span>
			<Select
				items={[
					{ value: 'any', label: i18n.t('admin.enterprises.filterVerifiedAny') },
					{ value: 'yes', label: i18n.t('admin.enterprises.filterVerifiedYes') },
					{ value: 'no', label: i18n.t('admin.enterprises.filterVerifiedNo') }
				]}
				bind:value={filterVerified}
				onchange={onFilterChange}
				shape="rounded"
			/>
		</div>
		<p class="ms-auto text-xs text-text-muted">
			{total} · {i18n.t('admin.enterprises.title')}
		</p>
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
				{ key: 'company', label: i18n.t('admin.enterprises.table.company') },
				{ key: 'industry', label: i18n.t('admin.enterprises.table.industry'), width: '20%' },
				{ key: 'type', label: i18n.t('admin.enterprises.table.type'), width: '16%' },
				{ key: 'verified', label: i18n.t('admin.enterprises.table.verified'), width: '12%' },
				{ key: 'created', label: i18n.t('admin.enterprises.table.created'), width: '14%', align: 'right' }
			]}
			rows={rows}
			emptyLabel={i18n.t('admin.enterprises.empty')}
			rowWrapper={undefined}
		>
			{#snippet cell(row, col)}
				{@const e = row as unknown as EnterpriseAdmin}
				{#if col.key === 'company'}
					<a
						href={`/enterprises/${e.id}`}
						class="font-medium text-text-primary transition-colors hover:text-primary"
					>
						{e.company_name}
					</a>
					<code class="ms-2 font-mono text-xs text-text-muted">{e.slug}</code>
				{:else if col.key === 'industry'}
					<span class="text-sm text-text-muted">{e.industry ?? '—'}</span>
				{:else if col.key === 'type'}
					<Badge variant="primary" size="sm">
						{i18n.t(`admin.enterprises.types.${e.enterprise_type}`)}
					</Badge>
				{:else if col.key === 'verified'}
					{#if e.verified}
						<span class="inline-flex items-center gap-1 text-xs text-success">
							<ShieldCheck size={13} strokeWidth={2} />
							{i18n.t('admin.enterprises.verifiedYes')}
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 text-xs text-text-muted">
							<ShieldOff size={13} strokeWidth={2} />
							{i18n.t('admin.enterprises.verifiedNo')}
						</span>
					{/if}
				{:else if col.key === 'created'}
					<span class="text-xs text-text-muted">{fmtDate(e.created_at)}</span>
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
