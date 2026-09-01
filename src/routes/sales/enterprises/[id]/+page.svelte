<script lang="ts">
	import { page } from '$app/state';
	import { i18n, intlLocale } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { salesApi } from '$api/sales';
	import type {
		EnterpriseProductLine,
		EnterpriseSpendLine,
		EnterpriseSuggestion,
		SalesRenewal
	} from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { ChevronRight, RefreshCw, Info } from '@lucide/svelte';

	const id = $derived(page.params.id as string);

	let loading = $state(true);
	let products = $state<EnterpriseProductLine[]>([]);
	let spend = $state<EnterpriseSpendLine[]>([]);
	let renewals = $state<SalesRenewal[]>([]);
	let suggestions = $state<EnterpriseSuggestion[]>([]);

	function fmtMoment(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	function money(amount: string | null, cur: string): string {
		return amount === null ? '—' : `${amount} ${cur}`;
	}

	function statusVariant(s: string): 'success' | 'warning' | 'error' | 'default' {
		if (s === 'active') return 'success';
		if (s === 'pending') return 'warning';
		if (s === 'cancelled' || s === 'expired') return 'error';
		return 'default';
	}

	$effect(() => {
		void load(id);
	});

	async function load(entId: string) {
		loading = true;
		try {
			const res = await salesApi.enterpriseFile(entId);
			products = res.data.products;
			spend = res.data.spend_by_stream;
			renewals = res.data.renewals;
			suggestions = res.data.not_yet_used_in_familiar_pillars;
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/sales" class="hover:text-text-primary">{i18n.t('admin.sales.navLabel')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary">{i18n.t('admin.sales.enterpriseFileTitle')}</span>
	</nav>

	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">
				{i18n.t('admin.sales.label')}
			</p>
			<h1 class="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
				{i18n.t('admin.sales.enterpriseFileTitle')}
			</h1>
			<code class="mt-2 block font-mono text-[11px] text-text-muted">{id}</code>
		</div>
		<Button variant="secondary" onclick={() => load(id)} {loading}>
			<RefreshCw size={14} strokeWidth={2} />
			{i18n.t('admin.common.refreshBtn')}
		</Button>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(3) as _}<Skeleton class="h-28 w-full" rounded="xl" />{/each}
		</div>
	{:else}
		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.productsTitle')}
			</h2>
			{#if products.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.sales.emptyProducts')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each products as p (p.source_table + p.source_id)}
						<li class="flex flex-wrap items-center justify-between gap-3 py-2.5">
							<div class="min-w-0">
								<span class="text-sm">{p.label}</span>
								<Badge variant={statusVariant(p.status)} size="sm">{p.status}</Badge>
								{#if p.recurring}
									<span class="ms-2 text-[10px] text-text-muted">
										{i18n.t('admin.sales.cols.recurring')}
									</span>
								{/if}
								<p class="mt-0.5 text-[11px] text-text-muted">
									{p.pillar ?? '—'} · {fmtMoment(p.since)}
								</p>
							</div>
							<span class="font-mono text-sm">{money(p.contract_value, p.currency)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.spendTitle')}
			</h2>
			{#if spend.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.sales.emptySpend')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each spend as s (s.stream)}
						<li class="flex items-center justify-between gap-3 py-2 text-sm">
							<span>
								{s.label ?? s.stream}
								<span class="ms-2 text-[11px] text-text-muted">{s.pillar ?? '—'}</span>
							</span>
							<span class="text-end">
								<span class="font-bold text-primary">{s.total ?? '0'}</span>
								<span class="ms-2 text-[11px] text-text-muted">
									{s.entries}
									{i18n.t('admin.sales.cols.entries')}
								</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.tabs.renewals')}
			</h2>
			{#if renewals.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.sales.emptyRenewals')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each renewals as r (r.source_id)}
						<li class="flex items-center justify-between gap-3 py-2 text-sm">
							<span>{r.product}</span>
							<span class="text-end">
								<span class="font-mono">{money(r.value, r.currency)}</span>
								<span class="ms-2 text-[11px] text-text-muted">{fmtMoment(r.renews_at)}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="rounded-2xl border border-border bg-surface-elevated p-5">
			<h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
				{i18n.t('admin.sales.suggestionsTitle')}
			</h2>
			<p class="mb-3 flex items-start gap-2 text-xs text-text-muted">
				<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
				<span>{i18n.t('admin.sales.suggestionsHint')}</span>
			</p>
			{#if suggestions.length === 0}
				<p class="text-sm text-text-muted">{i18n.t('admin.sales.emptySuggestions')}</p>
			{:else}
				<ul class="flex flex-wrap gap-2">
					{#each suggestions as s (s.product_type)}
						<li
							class="rounded-xl border border-border bg-surface-overlay px-3 py-1.5 text-xs"
							title={s.pillar}
						>
							{s.label}
							<span class="ms-1.5 text-[10px] text-text-muted">{s.pillar}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
