<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { adminApi, type SsoSession } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n, intlLocale } from '$lib/i18n';

	let loading = $state(true);
	let error = $state('');
	let sessions = $state<SsoSession[]>([]);
	let page = $state(1);
	let perPage = $state(50);
	let total = $state(0);
	let enterpriseFilter = $state('');
	let revokingId = $state<string | null>(null);
	let revokeTarget = $state<SsoSession | null>(null);

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await adminApi.listSsoSessions({
				page,
				per_page: perPage,
				enterprise_id: enterpriseFilter.trim() || undefined
			});
			sessions = res.data;
			total = res.pagination.total;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function requestRevoke(session: SsoSession) {
		revokeTarget = session;
	}

	async function confirmRevoke(reason: string) {
		if (!revokeTarget) return;
		const id = revokeTarget.session_id;
		revokingId = id;
		try {
			await adminApi.revokeSsoSession(id, reason);
			sessions = sessions.filter((s) => s.session_id !== id);
			total = Math.max(0, total - 1);
			toast.success(i18n.t('admin.sso.revokedToast'));
			revokeTarget = null;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			revokingId = null;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(intlLocale());
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.sso.title')} — Skilluv</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-2 text-3xl font-black">
		{i18n.t('admin.sso.headingActive')}
	</h1>
	<p class="mb-6 text-sm text-text-muted">
		{i18n.t('admin.sso.subtitle')}
	</p>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			page = 1;
			load();
		}}
		class="mb-6 flex flex-wrap items-end gap-3"
	>
		<div class="flex-1 min-w-[240px]">
			<Input
				label={i18n.t('admin.sso.filterEnterpriseLabel')}
				placeholder="e.g. 3c72e18a-…"
				bind:value={enterpriseFilter}
			/>
		</div>
		<Button variant="accent" type="submit">
			{i18n.t('admin.sso.filterBtn')}
		</Button>
		<Button
			variant="ghost"
			onclick={() => {
				enterpriseFilter = '';
				page = 1;
				load();
			}}
		>
			{i18n.t('admin.sso.resetFilterBtn')}
		</Button>
	</form>

	{#if error}
		<div class="mb-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="h-64 animate-pulse rounded-2xl bg-surface-overlay"></div>
	{:else if sessions.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated px-6 py-12 text-center text-text-muted">
			{i18n.t('admin.sso.emptyState')}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-[720px] text-sm">
				<thead class="bg-surface-overlay text-left text-xs uppercase text-text-muted">
					<tr>
						<th class="px-4 py-3 font-medium">{i18n.t('admin.sso.colUser')}</th>
						<th class="px-4 py-3 font-medium">{i18n.t('admin.sso.colEnterprise')}</th>
						<th class="px-4 py-3 font-medium">IP</th>
						<th class="px-4 py-3 font-medium">{i18n.t('admin.sso.colCreated')}</th>
						<th class="px-4 py-3 font-medium">{i18n.t('admin.sso.colLastUsed')}</th>
						<th class="px-4 py-3 font-medium text-right">{i18n.t('admin.sso.colActions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each sessions as s (s.session_id)}
						<tr class="border-t border-border">
							<td class="px-4 py-3">
								<div class="font-medium">{s.user_username}</div>
								<div class="text-xs text-text-muted">{s.user_email}</div>
							</td>
							<td class="px-4 py-3">
								{#if s.company_name}
									<div class="font-medium">{s.company_name}</div>
									<div class="text-xs text-text-muted">{s.enterprise_slug}</div>
								{:else}
									<span class="text-text-muted">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 font-mono text-xs">
								{s.ip ?? '—'}
							</td>
							<td class="px-4 py-3 text-xs text-text-muted">{fmtDate(s.created_at)}</td>
							<td class="px-4 py-3 text-xs text-text-muted">{fmtDate(s.last_used_at)}</td>
							<td class="px-4 py-3 text-right">
								<Button
									variant="danger"
									size="sm"
									loading={revokingId === s.session_id}
									onclick={() => requestRevoke(s)}
								>
									{i18n.t('admin.sso.revokeBtn')}
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-6">
			<Pagination
				current={page}
				total={Math.max(1, Math.ceil(total / perPage))}
				onchange={(p) => {
					page = p;
					load();
				}}
			/>
		</div>
	{/if}
</div>

<ConfirmDangerousDialog
	open={revokeTarget !== null}
	title={i18n.t('admin.sso.revokeDialogTitle')}
	description={revokeTarget
		? `${revokeTarget.user_username} — ${revokeTarget.user_email}`
		: ''}
	actionLabel={i18n.t('admin.sso.revokeBtn')}
	reasonHint={i18n.t('admin.sso.revokeHint')}
	loading={revokingId !== null}
	onconfirm={confirmRevoke}
	onclose={() => (revokeTarget = null)}
/>
