<script lang="ts">
	import { adminApi, type AuditGenericEntry } from '$api/admin';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import Table from '$components/ui/Table.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import SegmentedControl from '$components/ui/SegmentedControl.svelte';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import { SkilluError } from '$api/client';
	import { toast } from '$stores/toast.svelte';
	import { Filter, X } from '@lucide/svelte';

	interface LegacyEntry {
		id: string; admin_id: string; admin_username: string;
		action: string; target_type: string; target_id: string;
		details: string | null; created_at: string;
	}

	type Mode = 'legacy' | 'generic';
	let mode = $state<Mode>('legacy');

	let legacyEntries = $state<LegacyEntry[]>([]);
	let genericEntries = $state<AuditGenericEntry[]>([]);
	let loading = $state(true);
	let currentPage = $state(1);
	let totalPages = $state(1);
	let returned = $state(0);

	// Filters (generic mode)
	let actorType = $state('');
	let actorId = $state('');
	let action = $state('');
	let targetType = $state('');
	let targetId = $state('');

	// Detail modal
	let selected = $state<AuditGenericEntry | null>(null);

	$effect(() => {
		// Trigger reload whenever mode or page changes.
		void load();
	});

	async function load() {
		loading = true;
		try {
			if (mode === 'legacy') {
				const res = await adminApi.auditLog({ page: currentPage, per_page: 30 });
				legacyEntries = res.data as LegacyEntry[];
				totalPages = res.pagination.total_pages;
			} else {
				const res = await adminApi.auditLogGeneric({
					actor_type: actorType.trim() || undefined,
					actor_id: actorId.trim() || undefined,
					action: action.trim() || undefined,
					target_type: targetType.trim() || undefined,
					target_id: targetId.trim() || undefined,
					page: currentPage,
					per_page: 50
				});
				genericEntries = res.data;
				returned = res.data.length;
				// Le nouveau format ne renvoie pas total_pages — on affiche juste "page N".
				totalPages = res.data.length < 50 ? currentPage : currentPage + 1;
			}
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : 'Erreur');
		} finally {
			loading = false;
		}
	}

	function applyFilters() {
		currentPage = 1;
		void load();
	}

	function clearFilters() {
		actorType = ''; actorId = ''; action = ''; targetType = ''; targetId = '';
		currentPage = 1;
		void load();
	}

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleString(intlLocale());
	}

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-3 py-1.5 text-xs focus:border-primary focus:outline-none';
	const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-muted';
</script>

<svelte:head>
	<title>{i18n.t('admin.audit.title')} — Admin Skilluv</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{i18n.t('admin.audit.title')}</h1>
			<p class="mt-1 text-sm text-text-muted">
				{i18n.t('admin.audit.subtitle')}
			</p>
		</div>
		<SegmentedControl
			items={[
				{ value: 'legacy', label: i18n.t('admin.audit.modeLegacy') },
				{ value: 'generic', label: i18n.t('admin.audit.modeGeneric') }
			]}
			bind:value={mode}
			onchange={() => { currentPage = 1; }}
		/>
	</div>

	{#if mode === 'generic'}
		<div class="mb-6 rounded-2xl border border-border bg-surface-elevated p-4">
			<div class="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
				<Filter size={12} strokeWidth={2} />
				{i18n.t('admin.audit.filters')}
			</div>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<div>
					<label for="f-at" class={labelCls}>actor_type</label>
					<input id="f-at" bind:value={actorType} placeholder="user, admin, system…" class={inputCls} />
				</div>
				<div>
					<label for="f-aid" class={labelCls}>actor_id</label>
					<input id="f-aid" bind:value={actorId} placeholder="uuid" class="{inputCls} font-mono" />
				</div>
				<div>
					<label for="f-act" class={labelCls}>action</label>
					<input id="f-act" bind:value={action} placeholder="ban_user, revoke_session…" class={inputCls} />
				</div>
				<div>
					<label for="f-tt" class={labelCls}>target_type</label>
					<input id="f-tt" bind:value={targetType} placeholder="user, enterprise…" class={inputCls} />
				</div>
				<div>
					<label for="f-tid" class={labelCls}>target_id</label>
					<input id="f-tid" bind:value={targetId} placeholder="uuid" class="{inputCls} font-mono" />
				</div>
			</div>
			<div class="mt-3 flex items-center gap-2">
				<Button variant="accent" size="sm" onclick={applyFilters}>
					<Filter size={12} strokeWidth={2} />
					{i18n.t('admin.common.filter')}
				</Button>
				<Button variant="ghost" size="sm" onclick={clearFilters}>
					<X size={12} strokeWidth={2} />
					{i18n.t('admin.common.reset')}
				</Button>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="flex flex-col gap-2">
			{#each Array(10) as _}
				<Skeleton class="h-10 w-full" rounded="lg" />
			{/each}
		</div>
	{:else if mode === 'legacy'}
		<Table
			columns={[
				{ key: 'date', label: i18n.t('admin.audit.date') },
				{ key: 'admin', label: i18n.t('admin.audit.admin') },
				{ key: 'action', label: i18n.t('admin.audit.action') },
				{ key: 'target', label: i18n.t('admin.audit.target') },
				{ key: 'details', label: i18n.t('admin.audit.details') }
			]}
			rows={legacyEntries.map((e) => ({
				date: fmtDate(e.created_at),
				admin: e.admin_username,
				action: e.action,
				target: `${e.target_type}:${e.target_id.slice(0, 8)}`,
				details: e.details ?? '—'
			}))}
			emptyLabel={i18n.t('admin.audit.empty')}
		/>

		<Pagination
			current={currentPage}
			total={totalPages}
			onchange={(p) => { currentPage = p; }}
			compact
		/>
	{:else}
		{#if genericEntries.length === 0}
			<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center text-text-muted">
				{i18n.t('admin.audit.empty')}
			</div>
		{:else}
			<div class="overflow-x-auto rounded-2xl border border-border">
				<table class="w-full min-w-[900px] text-sm">
					<thead class="bg-surface-overlay text-left text-xs uppercase text-text-muted">
						<tr>
							<th class="px-4 py-3 font-medium">{i18n.t('admin.audit.date')}</th>
							<th class="px-4 py-3 font-medium">actor</th>
							<th class="px-4 py-3 font-medium">action</th>
							<th class="px-4 py-3 font-medium">target</th>
							<th class="px-4 py-3 font-medium">ip</th>
							<th class="px-4 py-3 font-medium text-right"></th>
						</tr>
					</thead>
					<tbody>
						{#each genericEntries as e (e.id)}
							<tr class="border-t border-border">
								<td class="px-4 py-2 text-xs text-text-muted whitespace-nowrap">{fmtDate(e.created_at)}</td>
								<td class="px-4 py-2">
									<Badge variant="default" size="sm">{e.actor_type}</Badge>
									{#if e.actor_id}
										<span class="ml-1 font-mono text-[10px] text-text-muted">{e.actor_id.slice(0, 8)}</span>
									{/if}
								</td>
								<td class="px-4 py-2 font-mono text-xs">{e.action}</td>
								<td class="px-4 py-2 text-xs">
									{#if e.target_type}
										<span class="text-text-muted">{e.target_type}</span>
										{#if e.target_id}
											<span class="ml-1 font-mono text-[10px] text-text-muted/70">{e.target_id.slice(0, 8)}</span>
										{/if}
									{:else}
										<span class="text-text-muted">—</span>
									{/if}
								</td>
								<td class="px-4 py-2 font-mono text-xs text-text-muted">{e.ip ?? '—'}</td>
								<td class="px-4 py-2 text-right">
									<Button variant="ghost" size="sm" onclick={() => (selected = e)}>
										{i18n.t('admin.common.details')}
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="mt-4 flex items-center justify-center gap-4 text-sm text-text-muted">
				<Button variant="ghost" size="sm" disabled={currentPage <= 1} onclick={() => { currentPage = Math.max(1, currentPage - 1); }}>
					←
				</Button>
				<span>Page {currentPage} · {returned} {i18n.t('admin.audit.rowsLabel')}</span>
				<Button variant="ghost" size="sm" disabled={genericEntries.length < 50} onclick={() => { currentPage++; }}>
					→
				</Button>
			</div>
		{/if}
	{/if}
</div>

<Modal
	open={selected !== null}
	size="lg"
	title={i18n.t('admin.audit.entryDetail')}
	onclose={() => (selected = null)}
>
	{#if selected}
		<p class="mb-4 font-mono text-xs text-text-muted">{selected.id}</p>
		<dl class="space-y-2 text-sm">
			<div class="flex justify-between gap-4 border-b border-border py-2">
				<dt class="text-text-muted">action</dt>
				<dd class="font-mono">{selected.action}</dd>
			</div>
			<div class="flex justify-between gap-4 border-b border-border py-2">
				<dt class="text-text-muted">actor</dt>
				<dd class="font-mono text-right"><Badge variant="default" size="sm">{selected.actor_type}</Badge> {selected.actor_id ?? '—'}</dd>
			</div>
			<div class="flex justify-between gap-4 border-b border-border py-2">
				<dt class="text-text-muted">target</dt>
				<dd class="font-mono text-right">{selected.target_type ?? '—'} {selected.target_id ?? ''}</dd>
			</div>
			<div class="flex justify-between gap-4 border-b border-border py-2">
				<dt class="text-text-muted">ip</dt>
				<dd class="font-mono">{selected.ip ?? '—'}</dd>
			</div>
			<div class="flex justify-between gap-4 border-b border-border py-2">
				<dt class="text-text-muted">user_agent</dt>
				<dd class="font-mono text-xs text-right max-w-[60%] truncate" title={selected.user_agent ?? ''}>{selected.user_agent ?? '—'}</dd>
			</div>
			<div class="border-b border-border py-2">
				<dt class="text-text-muted mb-1">metadata</dt>
				<dd>
					<pre class="overflow-x-auto rounded-xl bg-surface-overlay p-3 font-mono text-xs">{JSON.stringify(selected.metadata, null, 2)}</pre>
				</dd>
			</div>
		</dl>
	{/if}
</Modal>
