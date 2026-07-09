<script lang="ts">
	import { adminApi } from '$api/admin';
	import { SkilluError } from '$api/client';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import FilterBar from '$components/ui/FilterBar.svelte';
	import { i18n } from '$lib/i18n';
	import type { ReportStatus, ReportTargetType } from '$types';

	interface ReportEntry {
		id: string; target_type: ReportTargetType; target_id: string;
		reason: string; details: string | null; status: ReportStatus;
		reporter_id: string; reporter_username: string; created_at: string;
	}

	let reports = $state<ReportEntry[]>([]);
	let loading = $state(true);
	let filterStatus = $state<ReportStatus | ''>('pending');
	let currentPage = $state(1);
	let totalPages = $state(1);

	const statusColors: Record<string, string> = {
		pending: 'warning', resolved: 'success', dismissed: 'default'
	};

	$effect(() => { loadReports(); });

	async function loadReports() {
		loading = true;
		try {
			const res = await adminApi.listReports({
				status: (filterStatus as ReportStatus) || undefined,
				page: currentPage,
				per_page: 20
			});
			reports = res.data as ReportEntry[];
			totalPages = res.pagination.total_pages;
		} catch { /* silent */ }
		loading = false;
	}

	async function resolve(id: string, status: 'resolved' | 'dismissed') {
		try {
			await adminApi.resolveReport(id, status);
			reports = reports.filter((r) => r.id !== id);
		} catch { /* silent */ }
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.reports.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<h1 class="mb-6 text-2xl font-bold">{i18n.t('admin.reports.title')}</h1>

	<FilterBar class="mb-4">
		<SegmentedControl
			size="sm"
			items={[
				{ value: 'pending', label: i18n.t('admin.reports.pending') },
				{ value: 'resolved', label: i18n.t('admin.reports.resolvedLabel') },
				{ value: 'dismissed', label: i18n.t('admin.reports.dismissed') },
				{ value: '', label: i18n.t('admin.reports.allLabel') }
			]}
			bind:value={filterStatus}
			onchange={() => { currentPage = 1; loadReports(); }}
		/>
	</FilterBar>

	{#if loading}
		<div class="flex flex-col gap-3">
			{#each Array(5) as _}<Skeleton class="h-20 w-full" rounded="xl" />{/each}
		</div>
	{:else if reports.length === 0}
		<p class="py-8 text-center text-text-muted">{i18n.t('admin.reports.noReports')}</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each reports as report}
				<div class="rounded-2xl border border-border bg-surface-elevated p-4">
					<div class="mb-2 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Badge variant={statusColors[report.status] as any}>{report.status === 'pending' ? i18n.t('admin.reports.pending') : report.status === 'resolved' ? i18n.t('admin.reports.resolvedLabel') : i18n.t('admin.reports.dismissed')}</Badge>
							<Badge variant="default">{report.target_type}</Badge>
							<span class="text-xs text-text-muted capitalize">{report.reason}</span>
						</div>
						<span class="text-xs text-text-muted">{new Date(report.created_at).toLocaleDateString('fr')}</span>
					</div>
					<p class="text-sm text-text-muted">
						{i18n.t('admin.reports.reportedBy')} <span class="font-medium text-text-primary">{report.reporter_username}</span>
					</p>
					{#if report.details}
						<p class="mt-1 text-sm text-text-muted">{report.details}</p>
					{/if}
					{#if report.status === 'pending'}
						<div class="mt-3 flex gap-2">
							<Button variant="primary" size="sm" onclick={() => resolve(report.id, 'resolved')}>{i18n.t('admin.reports.resolveBtn')}</Button>
							<Button variant="ghost" size="sm" onclick={() => resolve(report.id, 'dismissed')}>{i18n.t('admin.reports.dismissBtn')}</Button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if totalPages > 1}
			<div class="mt-6 flex items-center justify-center gap-4">
				<Button variant="ghost" size="sm" disabled={currentPage <= 1} onclick={() => { currentPage--; loadReports(); }}>←</Button>
				<span class="text-sm text-text-muted">{currentPage} / {totalPages}</span>
				<Button variant="ghost" size="sm" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadReports(); }}>→</Button>
			</div>
		{/if}
	{/if}
</div>
