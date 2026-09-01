<script lang="ts">
	import { untrack } from 'svelte';
	import { engagementApi } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { SkilluError } from '$api/client';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { ExternalSignal } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Table from '$components/ui/Table.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Link2, RefreshCw, BadgeCheck, Trash2, Info, Lock } from '@lucide/svelte';

	// SKI-42 — moderation review queue for imported reputation.
	//
	// The three endpoints behind this screen are capability-gated
	// (`community_moderator` / `community_curator`), not role-gated. An
	// admin without the capability gets a 403, so the screen names the
	// missing capability instead of rendering an empty queue that would read
	// as "nothing to review".

	let pending = $state<ExternalSignal[]>([]);
	let limit = $state(50);
	let loading = $state(true);
	let forbidden = $state(false);
	let busyId = $state<string | null>(null);
	let deleteTarget = $state<ExternalSignal | null>(null);
	let deleting = $state(false);

	// Load once on mount. `limit` is read inside `load()`, so without
	// `untrack` it would become a dependency and the number input would fire
	// a request per keystroke — the Refresh button applies it instead.
	$effect(() => {
		untrack(() => void load());
	});

	async function load() {
		loading = true;
		try {
			const res = await engagementApi.listPendingExternalSignals({ limit });
			pending = res.data.pending;
			forbidden = false;
		} catch (e) {
			if (e instanceof SkilluError && e.status === 403) {
				forbidden = true;
				pending = [];
			} else {
				toast.error(errorMessage(e));
			}
		} finally {
			loading = false;
		}
	}

	async function verify(id: string) {
		if (busyId) return;
		busyId = id;
		try {
			await engagementApi.verifyExternalSignal(id);
			pending = pending.filter((s) => s.id !== id);
			toast.success(i18n.t('admin.engagement.externalSignals.verifiedToast'));
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			busyId = null;
		}
	}

	async function confirmDelete() {
		if (!deleteTarget || deleting) return;
		const id = deleteTarget.id;
		deleting = true;
		try {
			await engagementApi.deleteExternalSignal(id);
			pending = pending.filter((s) => s.id !== id);
			toast.success(i18n.t('admin.engagement.externalSignals.deletedToast'));
			deleteTarget = null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			deleting = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(intlLocale());
		} catch {
			return iso;
		}
	}

	const columns = [
		{ key: 'provider', label: i18n.t('admin.engagement.externalSignals.table.provider'), width: '110px' },
		{ key: 'title', label: i18n.t('admin.engagement.externalSignals.table.signalTitle') },
		{ key: 'url', label: i18n.t('admin.engagement.externalSignals.table.url') },
		{ key: 'user_id', label: i18n.t('admin.engagement.externalSignals.table.user'), width: '160px' },
		{ key: 'created_at', label: i18n.t('admin.engagement.externalSignals.table.createdAt'), width: '180px' },
		{
			key: 'actions',
			label: i18n.t('admin.engagement.externalSignals.table.actions'),
			align: 'right' as const,
			width: '220px'
		}
	];

	const rows = $derived(pending as unknown as Record<string, unknown>[]);
</script>

<svelte:head>
	<title>{i18n.t('admin.engagement.externalSignals.title')} — Admin Skilluv</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8 sm:py-10">
	<div class="mb-6 flex items-start gap-3">
		<Link2 size={24} strokeWidth={2} class="mt-1 text-accent" />
		<div>
			<h1 class="text-2xl font-black tracking-tight">
				{i18n.t('admin.engagement.externalSignals.title')}
			</h1>
			<p class="mt-1 text-sm text-text-muted">
				{i18n.t('admin.engagement.externalSignals.subtitle')}
			</p>
		</div>
	</div>

	<p
		class="mb-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning"
	>
		<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
		<span>{i18n.t('admin.engagement.externalSignals.disclaimer')}</span>
	</p>

	{#if forbidden}
		<div class="flex items-start gap-3 rounded-2xl border border-border bg-surface-elevated p-5">
			<Lock size={18} strokeWidth={2} class="mt-0.5 shrink-0 text-text-muted" />
			<p class="text-sm text-text-muted">
				{i18n.t('admin.engagement.externalSignals.forbiddenHint')}
			</p>
		</div>
	{:else}
		<div class="mb-4 flex flex-wrap items-end gap-3">
			<Input
				label={i18n.t('admin.engagement.externalSignals.limitLabel')}
				type="number"
				step="1"
				min="1"
				max="200"
				bind:value={limit as unknown as string}
				class="w-28"
			/>
			<Button variant="primary" size="sm" onclick={load} loading={loading}>
				<RefreshCw size={14} strokeWidth={2} />
				{i18n.t('admin.engagement.externalSignals.refreshBtn')}
			</Button>
		</div>

		{#if loading}
			<Skeleton class="h-48 w-full" rounded="xl" />
		{:else}
			<Table
				{columns}
				{rows}
				emptyLabel={i18n.t('admin.engagement.externalSignals.empty')}
			>
				{#snippet cell(row, col)}
					{@const s = row as unknown as ExternalSignal}
					{#if col.key === 'provider'}
						<Badge variant="default"><code class="font-mono">{s.provider}</code></Badge>
					{:else if col.key === 'title'}
						<span class="text-sm text-text-primary">{s.title}</span>
					{:else if col.key === 'url'}
						<a
							href={s.url}
							target="_blank"
							rel="noopener nofollow"
							class="break-all text-xs text-primary hover:underline"
						>
							{s.url}
						</a>
					{:else if col.key === 'user_id'}
						<a href={`/users/${s.user_id}`} class="font-mono text-xs text-primary hover:underline">
							{s.user_id.slice(0, 8)}…
						</a>
					{:else if col.key === 'created_at'}
						<span class="text-xs text-text-muted">{fmtDate(s.created_at)}</span>
					{:else if col.key === 'actions'}
						<div class="flex justify-end gap-2">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => verify(s.id)}
								loading={busyId === s.id}
							>
								<BadgeCheck size={14} strokeWidth={2} />
								{i18n.t('admin.engagement.externalSignals.verifyBtn')}
							</Button>
							<Button variant="danger" size="sm" onclick={() => (deleteTarget = s)}>
								<Trash2 size={14} strokeWidth={2} />
								{i18n.t('admin.engagement.externalSignals.deleteBtn')}
							</Button>
						</div>
					{/if}
				{/snippet}
			</Table>
		{/if}
	{/if}
</div>

<ConfirmDangerousDialog
	open={deleteTarget !== null}
	title={i18n.t('admin.engagement.externalSignals.deleteDialogTitle')}
	description={deleteTarget
		? `${deleteTarget.provider} — ${deleteTarget.title} · ${i18n.t('admin.engagement.externalSignals.deleteDialogDescription')}`
		: ''}
	actionLabel={i18n.t('admin.engagement.externalSignals.deleteBtn')}
	requireReason={false}
	loading={deleting}
	onconfirm={() => confirmDelete()}
	onclose={() => (deleteTarget = null)}
/>
