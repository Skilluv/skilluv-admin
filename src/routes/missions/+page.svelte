<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { missionsApi, type AdminMissionQuery } from '$api/missions';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import {
		MISSION_STATUSES,
		type AdminMissionRow,
		type MissionStatus,
		type MissionType,
		type SkillDomain
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Table from '$components/ui/Table.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import { Briefcase, ChevronRight, Info, RefreshCw } from '@lucide/svelte';

	// The mission board, seen from outside the two parties (SKI-162 for
	// cyber, SKI-249 for design).
	//
	// One page for both tickets, because the backend has one mechanism: a
	// design mission is a mission with skill_domain = design. The two pages
	// the tickets asked for are this page with the filter pre-set, which is
	// what `/missions?domain=design` is.

	const DOMAINS: SkillDomain[] = ['code', 'design', 'game', 'security'];

	let domain = $state<SkillDomain | ''>(
		($page.url.searchParams.get('domain') ?? '') as SkillDomain | ''
	);
	let missionType = $state($page.url.searchParams.get('type') ?? '');
	let status = $state<MissionStatus | ''>(
		($page.url.searchParams.get('status') ?? '') as MissionStatus | ''
	);
	let stuckOnly = $state($page.url.searchParams.get('stuck') === '1');
	let stuckAfterDays = $state(Number($page.url.searchParams.get('after') ?? 21));
	let pageNo = $state(Number($page.url.searchParams.get('page') ?? 1));

	const PER_PAGE = 50;

	let rows = $state<AdminMissionRow[]>([]);
	let loading = $state(true);
	let types = $state<MissionType[]>([]);

	const t = (k: string, params?: Record<string, string | number>) => i18n.t(k, params);

	$effect(() => {
		void loadTypes();
	});

	$effect(() => {
		void load();
	});

	async function loadTypes() {
		try {
			const res = await missionsApi.types();
			types = res.data.mission_types;
		} catch (e) {
			// The type filter degrades to "all" rather than blocking the
			// board: the list is a convenience, the board is the page.
			toast.error(errorMessage(e));
		}
	}

	async function load() {
		loading = true;
		try {
			const params: AdminMissionQuery = {
				skill_domain: domain || undefined,
				mission_type: missionType || undefined,
				status: status || undefined,
				stuck_only: stuckOnly || undefined,
				stuck_after_days: stuckAfterDays,
				page: pageNo,
				per_page: PER_PAGE
			};
			const res = await missionsApi.list(params);
			rows = res.data;
		} catch (e) {
			toast.error(errorMessage(e));
			rows = [];
		} finally {
			loading = false;
		}
	}

	function syncUrl() {
		const params = new URLSearchParams();
		if (domain) params.set('domain', domain);
		if (missionType) params.set('type', missionType);
		if (status) params.set('status', status);
		if (stuckOnly) params.set('stuck', '1');
		if (stuckAfterDays !== 21) params.set('after', String(stuckAfterDays));
		if (pageNo !== 1) params.set('page', String(pageNo));
		const qs = params.toString();
		void goto(qs ? `/missions?${qs}` : '/missions', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function applyFilters() {
		pageNo = 1;
		syncUrl();
		void load();
	}

	function changePage(next: number) {
		pageNo = next;
		syncUrl();
		void load();
	}

	// The backend returns a page, not a count. Rather than invent a total,
	// the pager offers one more page while the current one is full — which
	// is the only thing this data supports saying.
	const pageCount = $derived(rows.length === PER_PAGE ? pageNo + 1 : pageNo);

	function statusLabel(s: string): string {
		return t(`admin.missions.statuses.${s}`);
	}

	function statusVariant(s: MissionStatus): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'closed') return 'success';
		if (s === 'in_progress' || s === 'delivered') return 'warning';
		if (s === 'cancelled') return 'error';
		return 'default';
	}

	function domainVariant(d: SkillDomain): 'code' | 'design' | 'game' | 'security' {
		return d;
	}

	function typeName(slug: string): string {
		return types.find((x) => x.slug === slug)?.name ?? slug;
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		try {
			return new Date(iso).toLocaleDateString(intlLocale());
		} catch {
			return iso;
		}
	}

	const domainItems = $derived([
		{ value: '', label: t('admin.missions.filters.all') },
		...DOMAINS.map((d) => ({ value: d, label: t(`common.domains.${d}`) }))
	]);

	const typeItems = $derived([
		{ value: '', label: t('admin.missions.filters.all') },
		...types
			.filter((x) => !domain || x.skill_domain === domain)
			.map((x) => ({ value: x.slug, label: x.name }))
	]);

	const statusItems = $derived([
		{ value: '', label: t('admin.missions.filters.all') },
		...MISSION_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))
	]);

	const columns = $derived([
		{ key: 'mission', label: t('admin.missions.table.mission') },
		{ key: 'type', label: t('admin.missions.table.type'), width: '170px' },
		{ key: 'enterprise', label: t('admin.missions.table.enterprise'), width: '150px' },
		{ key: 'talent', label: t('admin.missions.table.talent'), width: '140px' },
		{ key: 'status', label: t('admin.missions.table.status'), width: '150px' },
		{
			key: 'rounds',
			label: t('admin.missions.table.rounds'),
			width: '90px',
			align: 'right' as const
		},
		{ key: 'lastDelivery', label: t('admin.missions.table.lastDelivery'), width: '120px' }
	]);

	const tableRows = $derived(rows as unknown as Record<string, unknown>[]);
</script>

<svelte:head>
	<title>{t('admin.missions.navLabel')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{t('admin.missions.navLabel')}</span>
	</nav>

	<div class="mb-8">
		<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
			{t('admin.missions.label')}
		</p>
		<h1 class="flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
			<Briefcase size={26} strokeWidth={2} class="text-accent" />
			{t('admin.missions.title')}
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-text-muted">{t('admin.missions.subtitle')}</p>
	</div>

	<p
		class="mb-6 flex items-start gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-xs text-text-muted"
	>
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{t('admin.missions.scopeNotice')} {t('admin.missions.stuckHint')}</span>
	</p>

	<div class="mb-5 flex flex-wrap items-end gap-3">
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.missions.filters.domain')}
			</span>
			<Select items={domainItems} bind:value={domain} shape="rounded" />
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.missions.filters.type')}
			</span>
			<Select items={typeItems} bind:value={missionType} shape="rounded" searchable />
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-text-primary">
				{t('admin.missions.filters.status')}
			</span>
			<Select items={statusItems} bind:value={status} shape="rounded" />
		</label>
		<Input
			label={t('admin.missions.filters.stuckAfterDays')}
			type="number"
			min="1"
			max="365"
			bind:value={stuckAfterDays as unknown as string}
			class="w-32"
		/>
		<label class="flex h-11 items-center gap-2 text-sm text-text-muted">
			<input
				type="checkbox"
				bind:checked={stuckOnly}
				class="h-4 w-4 rounded border-border bg-surface-elevated accent-primary"
			/>
			{t('admin.missions.filters.stuckOnly')}
		</label>
		<Button variant="primary" size="sm" onclick={applyFilters} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<Skeleton class="h-64 w-full" rounded="xl" />
	{:else}
		<Table columns={columns} rows={tableRows} emptyLabel={t('admin.missions.empty')}>
			{#snippet cell(row, col)}
				{@const m = row as unknown as AdminMissionRow}
				{#if col.key === 'mission'}
					<a
						href={`/missions/${encodeURIComponent(m.slug)}`}
						class="text-sm font-medium text-text-primary hover:text-primary hover:underline"
					>
						{m.title}
					</a>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={domainVariant(m.skill_domain)}>
							{t(`common.domains.${m.skill_domain}`)}
						</Badge>
						{#if m.awaiting_decision}
							<Badge variant="error">{t('admin.missions.stuck')}</Badge>
						{/if}
						{#if m.arbitrated}
							<Badge variant="primary">{t('admin.missions.arbitrated')}</Badge>
						{/if}
					</div>
				{:else if col.key === 'type'}
					<span class="text-xs text-text-muted">{typeName(m.mission_type_slug)}</span>
				{:else if col.key === 'enterprise'}
					<span class="text-xs text-text-primary">{m.enterprise_name}</span>
				{:else if col.key === 'talent'}
					{#if m.assigned_username}
						<a
							href={`/users/${m.assigned_username}`}
							class="text-xs text-primary hover:underline"
						>
							{m.assigned_username}
						</a>
					{:else}
						<span class="text-xs text-text-muted">{t('admin.missions.unassigned')}</span>
					{/if}
				{:else if col.key === 'status'}
					<Badge variant={statusVariant(m.status)}>{statusLabel(m.status)}</Badge>
				{:else if col.key === 'rounds'}
					<span class="font-mono text-xs text-text-muted">{m.rounds}</span>
				{:else if col.key === 'lastDelivery'}
					<span class="font-mono text-xs text-text-muted">
						{fmtDate(m.last_delivered_at)}
					</span>
				{/if}
			{/snippet}
		</Table>

		{#if pageCount > 1 || pageNo > 1}
			<Pagination current={pageNo} total={pageCount} onchange={changePage} />
		{/if}
	{/if}
</div>
