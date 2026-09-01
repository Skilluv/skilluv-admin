<script lang="ts">
	import { engagementApi } from '$api/engagement';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { ExternalSignal } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Link2, BadgeCheck, Trash2 } from '@lucide/svelte';

	// SKI-42 — one profile's external signals, kept in the two buckets the
	// backend returns. Merging them here would undo the entire point of the
	// feature: declared reputation is never a Skilluv proof.

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let verified = $state<ExternalSignal[]>([]);
	let declared = $state<ExternalSignal[]>([]);
	let disclaimer = $state('');
	let loading = $state(true);
	let busyId = $state<string | null>(null);
	let deleteTarget = $state<ExternalSignal | null>(null);
	let deleting = $state(false);

	$effect(() => {
		void userId;
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await engagementApi.getUserExternalSignals(userId);
			verified = res.data.verified;
			declared = res.data.declared;
			disclaimer = res.data.disclaimer;
		} catch (e) {
			verified = [];
			declared = [];
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	async function verify(signal: ExternalSignal) {
		if (busyId) return;
		busyId = signal.id;
		try {
			await engagementApi.verifyExternalSignal(signal.id);
			toast.success(i18n.t('admin.engagement.externalSignals.verifiedToast'));
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			busyId = null;
		}
	}

	async function confirmDelete() {
		if (!deleteTarget || deleting) return;
		deleting = true;
		try {
			await engagementApi.deleteExternalSignal(deleteTarget.id);
			toast.success(i18n.t('admin.engagement.externalSignals.deletedToast'));
			deleteTarget = null;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			deleting = false;
		}
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
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

	const isEmpty = $derived(verified.length === 0 && declared.length === 0);
</script>

{#snippet signalRow(s: ExternalSignal, isVerified: boolean)}
	<li class="rounded-xl border border-border bg-surface-overlay p-3">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant={isVerified ? 'success' : 'default'}>
						<code class="font-mono">{s.provider}</code>
					</Badge>
					<span class="text-sm font-medium text-text-primary">{s.title}</span>
				</div>
				<a
					href={s.url}
					target="_blank"
					rel="noopener nofollow"
					class="mt-1 flex items-center gap-1 break-all text-xs text-primary hover:underline"
				>
					<Link2 size={12} strokeWidth={2} class="shrink-0" />
					{s.url}
				</a>
				{#if isVerified}
					<p class="mt-1 text-xs text-text-muted">
						{i18n.t('admin.engagement.externalSignals.verifiedAtLabel')}
						<span class="font-mono">{fmtDate(s.verified_at)}</span>
						{#if s.verification_method}
							· {i18n.t('admin.engagement.externalSignals.methodLabel')}
							<span class="font-mono">{s.verification_method}</span>
						{/if}
					</p>
				{/if}
			</div>
			<div class="flex shrink-0 gap-2">
				{#if !isVerified}
					<Button
						variant="ghost"
						size="sm"
						onclick={() => verify(s)}
						loading={busyId === s.id}
					>
						<BadgeCheck size={14} strokeWidth={2} />
						{i18n.t('admin.engagement.externalSignals.verifyBtn')}
					</Button>
				{/if}
				<Button variant="danger" size="sm" onclick={() => (deleteTarget = s)}>
					<Trash2 size={14} strokeWidth={2} />
					{i18n.t('admin.engagement.externalSignals.deleteBtn')}
				</Button>
			</div>
		</div>
	</li>
{/snippet}

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center gap-2">
		<Link2 size={16} strokeWidth={2} class="text-accent" />
		<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.engagement.externalSignals.userSectionTitle')}
		</h2>
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.engagement.externalSignals.userSectionHint')}
	</p>

	{#if loading}
		<Skeleton class="h-24 w-full" rounded="xl" />
	{:else if isEmpty}
		<p class="text-sm text-text-muted">
			{i18n.t('admin.engagement.externalSignals.userSectionEmpty')}
		</p>
	{:else}
		{#if disclaimer}
			<p class="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">
				{disclaimer}
			</p>
		{/if}

		{#if verified.length > 0}
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.externalSignals.verifiedBucket')} ({verified.length})
			</h3>
			<ul class="mb-4 flex flex-col gap-2">
				{#each verified as s (s.id)}
					{@render signalRow(s, true)}
				{/each}
			</ul>
		{/if}

		{#if declared.length > 0}
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.externalSignals.declaredBucket')} ({declared.length})
			</h3>
			<ul class="flex flex-col gap-2">
				{#each declared as s (s.id)}
					{@render signalRow(s, false)}
				{/each}
			</ul>
		{/if}
	{/if}
</section>

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
