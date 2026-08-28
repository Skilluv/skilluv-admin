<script lang="ts">
	import { engagementApi } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type { SkillNodeDomain, SkillTreeNode, SkillTreeStatus } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { Network, ChevronRight, ChevronDown } from '@lucide/svelte';

	// SKI-47 — skill tree. The endpoint returns the whole catalog with this
	// user's status per node, so the payload is bounded by the catalog, not
	// by user data. It is loaded on demand rather than on mount: a few
	// hundred nodes is not something to fetch for every user page view.

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	const DOMAINS: SkillNodeDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'soft_skills',
		'ai',
		'ops'
	];

	let tree = $state<SkillTreeNode[]>([]);
	let counts = $state<Partial<Record<SkillTreeStatus, number>>>({});
	let domain = $state<SkillNodeDomain | ''>('');
	let loading = $state(false);
	let loaded = $state(false);
	let expanded = $state<Set<string>>(new Set());

	// Reset when the page switches user — a stale tree under a new name
	// would be a lie the UI tells silently.
	$effect(() => {
		void userId;
		tree = [];
		counts = {};
		loaded = false;
		expanded = new Set();
	});

	async function load() {
		if (loading) return;
		loading = true;
		try {
			const res = await engagementApi.getUserSkillTree(userId, {
				domain: domain === '' ? undefined : domain
			});
			tree = res.data.tree;
			counts = res.data.counts;
			loaded = true;
			// Roots open by default; deeper levels stay folded so the list
			// does not open at several hundred rows.
			expanded = new Set(tree.map((n) => n.id));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function toggle(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function allIds(nodes: SkillTreeNode[], acc: string[] = []): string[] {
		for (const n of nodes) {
			acc.push(n.id);
			allIds(n.children, acc);
		}
		return acc;
	}

	function expandAll() {
		expanded = new Set(allIds(tree));
	}

	function collapseAll() {
		expanded = new Set();
	}

	function statusVariant(s: SkillTreeStatus): 'default' | 'primary' | 'warning' | 'success' {
		switch (s) {
			case 'mastered':
				return 'success';
			case 'in_progress':
				return 'primary';
			case 'locked':
				return 'default';
			default:
				return 'warning';
		}
	}

	const STATUS_ORDER: SkillTreeStatus[] = ['mastered', 'in_progress', 'unlocked', 'locked'];
	const summary = $derived(
		STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({ status: s, count: counts[s] ?? 0 }))
	);
</script>

{#snippet node(n: SkillTreeNode, depth: number)}
	<li>
		<div
			class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-overlay"
			style="padding-inline-start: {depth * 0.75 + 0.5}rem"
		>
			{#if n.children.length > 0}
				<button
					type="button"
					onclick={() => toggle(n.id)}
					class="text-text-muted transition-colors hover:text-text-primary"
					aria-expanded={expanded.has(n.id)}
					aria-label={n.display_name}
				>
					{#if expanded.has(n.id)}
						<ChevronDown size={14} strokeWidth={2} />
					{:else}
						<ChevronRight size={14} strokeWidth={2} />
					{/if}
				</button>
			{:else}
				<span class="inline-block w-3.5" aria-hidden="true"></span>
			{/if}

			<span class="text-sm text-text-primary">{n.display_name}</span>
			<code class="font-mono text-[10px] text-text-muted">{n.slug}</code>
			<Badge variant={statusVariant(n.status)}>
				{i18n.t(`admin.engagement.skillTree.status.${n.status}`)}
			</Badge>
			{#if n.proven_count > 0}
				<span class="text-xs text-text-muted">
					{n.proven_count}
					{i18n.t('admin.engagement.skillTree.provenCountLabel')}
				</span>
			{/if}
			{#if n.proficiency_level > 0}
				<span class="text-xs text-text-muted">
					{i18n.t('admin.engagement.skillTree.proficiencyLabel')} {n.proficiency_level}
				</span>
			{/if}
		</div>

		{#if n.missing_prerequisites.length > 0}
			<p
				class="text-xs text-warning"
				style="padding-inline-start: {depth * 0.75 + 2}rem"
			>
				{i18n.t('admin.engagement.skillTree.missingPrerequisites')}:
				{n.missing_prerequisites.map((p) => p.display_name).join(', ')}
			</p>
		{/if}

		{#if n.children.length > 0 && expanded.has(n.id)}
			<ul>
				{#each n.children as child (child.id)}
					{@render node(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Network size={16} strokeWidth={2} class="text-accent" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.skillTree.sectionTitle')}
			</h2>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Select
				size="sm"
				shape="rounded"
				items={[
					{ value: '', label: i18n.t('admin.engagement.skillTree.filterDomainAll') },
					...DOMAINS.map((d) => ({ value: d, label: i18n.t(`admin.catalog.domains.${d}`) }))
				]}
				bind:value={domain}
				onchange={() => {
					if (loaded) void load();
				}}
			/>
			<Button variant="secondary" size="sm" onclick={load} loading={loading}>
				<Network size={14} strokeWidth={2} />
				{i18n.t('admin.engagement.skillTree.loadBtn')}
			</Button>
		</div>
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.engagement.skillTree.sectionHint')}
	</p>

	{#if loading}
		<Skeleton class="h-40 w-full" rounded="xl" />
	{:else if loaded}
		{#if summary.length > 0}
			<div class="mb-3 flex flex-wrap gap-2">
				{#each summary as s (s.status)}
					<Badge variant={statusVariant(s.status)}>
						{i18n.t(`admin.engagement.skillTree.status.${s.status}`)}: {s.count}
					</Badge>
				{/each}
			</div>
		{/if}

		{#if tree.length === 0}
			<p class="text-sm text-text-muted">{i18n.t('admin.engagement.skillTree.empty')}</p>
		{:else}
			<div class="mb-2 flex gap-2">
				<Button variant="ghost" size="sm" onclick={expandAll}>
					{i18n.t('admin.engagement.skillTree.expandAll')}
				</Button>
				<Button variant="ghost" size="sm" onclick={collapseAll}>
					{i18n.t('admin.engagement.skillTree.collapseAll')}
				</Button>
			</div>
			<ul class="max-h-96 overflow-y-auto auto-hide-scrollbar rounded-xl border border-border bg-surface-overlay p-2">
				{#each tree as root (root.id)}
					{@render node(root, 0)}
				{/each}
			</ul>
		{/if}
	{/if}
</section>
