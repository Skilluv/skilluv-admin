<script lang="ts">
	import { onMount } from 'svelte';
	import { adminApi, type ChallengeCreateBody, type ChallengePatchBody } from '$api/admin';
	import { SkilluError } from '$api/client';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ChallengeFormModal from '$components/admin/ChallengeFormModal.svelte';
	import ChallengeVariantDialog from '$components/admin/ChallengeVariantDialog.svelte';
	import { i18n } from '$lib/i18n';
	import { toast } from '$stores/toast.svelte';
	import type { Challenge } from '$types';
	import { Plus, Pencil, Sparkles } from '@lucide/svelte';

	let challenges = $state<Challenge[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let query = $state('');

	// The form itself lives in <ChallengeFormModal>; this page keeps ownership
	// of the open/editing flags + submit-pending state.
	let showForm = $state(false);
	let editing = $state<Challenge | null>(null); // null → create mode
	let submitting = $state(false);

	// Variant dialog — IA-C.1. Only offered on published challenges.
	let variantSource = $state<Challenge | null>(null);
	let generatingVariant = $state(false);

	async function loadChallenges() {
		loading = true;
		try {
			const res = await adminApi.listChallenges();
			challenges = res.data.challenges;
			total = res.data.total;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loading = false;
		}
	}

	async function publish(id: string) {
		try {
			await adminApi.publishChallenge(id);
			toast.success(i18n.t('admin.challenges.published'));
			// Refetch instead of mutating the array item in place — see
			// qa/BUGS_FRONT.md (Corrigés): mutating a $state<T[]> property
			// doesn't always re-render `{#if}` blocks in Svelte 5 dev mode.
			await loadChallenges();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		}
	}

	async function archive(id: string) {
		try {
			await adminApi.archiveChallenge(id);
			toast.success(i18n.t('admin.challenges.archived'));
			await loadChallenges();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		}
	}

	function openCreate() {
		editing = null;
		showForm = true;
	}

	function openEdit(ch: Challenge) {
		editing = ch;
		showForm = true;
	}

	function openVariant(ch: Challenge) {
		variantSource = ch;
	}

	async function submitVariant(body: { variant_type: 'harder' | 'easier'; target_param?: string }) {
		if (!variantSource) return;
		generatingVariant = true;
		try {
			await adminApi.generateChallengeVariant(variantSource.id, body);
			toast.success(i18n.t('admin.variant.successToast'));
			variantSource = null;
			await loadChallenges();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			generatingVariant = false;
		}
	}

	async function submit(body: ChallengeCreateBody | ChallengePatchBody) {
		submitting = true;
		try {
			if (editing) {
				await adminApi.updateChallenge(editing.id, body as ChallengePatchBody);
				toast.success(i18n.t('admin.challenges.updated'));
			} else {
				await adminApi.createChallenge(body as ChallengeCreateBody);
				toast.success(i18n.t('admin.challenges.created'));
			}
			showForm = false;
			editing = null;
			await loadChallenges();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			submitting = false;
		}
	}

	const statusColors: Record<string, 'warning' | 'success' | 'default'> = {
		draft: 'warning',
		published: 'success',
		archived: 'default'
	};

	const filtered = $derived(
		query.trim()
			? challenges.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
			: challenges
	);

	onMount(loadChallenges);

	const inputCls =
		'w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none';
	const textareaCls =
		'w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-y';
	const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted';
</script>

<svelte:head>
	<title>{i18n.t('admin.challenges.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{i18n.t('admin.challenges.title')}</h1>
			<p class="text-text-muted">{total} {i18n.t('admin.challenges.total')}</p>
		</div>
		<div class="flex items-center gap-3">
			<input
				bind:value={query}
				placeholder={i18n.t('admin.challenges.searchPlaceholder')}
				class="{inputCls} sm:w-72"
			/>
			<Button variant="accent" onclick={openCreate}>
				<Plus size={14} strokeWidth={2} />
				{i18n.t('admin.challenges.newChallenge')}
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex flex-col gap-3">
			{#each Array(5) as _}<Skeleton class="h-16 w-full" rounded="xl" />{/each}
		</div>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center text-text-muted">
			{i18n.t('admin.challenges.empty')}
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtered as ch (ch.id)}
				<div class="flex items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4">
					<div class="min-w-0 flex-1">
						<div class="mb-1 flex items-center gap-2 flex-wrap">
							<span class="font-medium truncate">{ch.title}</span>
							<Badge variant={statusColors[ch.status] ?? 'default'}>{ch.status}</Badge>
							<Badge variant="default">{ch.skill_domain}</Badge>
							<span class="text-xs text-text-muted">{i18n.t('admin.challenges.difficulty')} {ch.difficulty}/5</span>
						</div>
						<p class="text-xs text-text-muted line-clamp-1">{ch.description}</p>
					</div>
					<div class="flex gap-2 shrink-0">
						<Button variant="ghost" size="sm" onclick={() => openEdit(ch)}>
							<Pencil size={14} strokeWidth={2} />
							{i18n.t('admin.challenges.editBtn')}
						</Button>
						{#if ch.status === 'draft'}
							<Button variant="primary" size="sm" onclick={() => publish(ch.id)}>
								{i18n.t('admin.challenges.publishBtn')}
							</Button>
						{/if}
						{#if ch.status === 'published'}
							<Button variant="ghost" size="sm" onclick={() => openVariant(ch)}>
								<Sparkles size={14} strokeWidth={2} />
								{i18n.t('admin.variant.btn')}
							</Button>
							<Button variant="ghost" size="sm" onclick={() => archive(ch.id)}>
								{i18n.t('admin.challenges.archiveBtn')}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ChallengeFormModal
	open={showForm}
	{editing}
	{submitting}
	onclose={() => { showForm = false; editing = null; }}
	onsubmit={submit}
/>

<ChallengeVariantDialog
	open={variantSource !== null}
	source={variantSource}
	submitting={generatingVariant}
	onclose={() => (variantSource = null)}
	onsubmit={submitVariant}
/>

