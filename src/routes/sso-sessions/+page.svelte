<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Pagination from '$components/ui/Pagination.svelte';
	import { adminApi, type SsoSession } from '$api/admin';
	import { SkilluError } from '$api/client';
	import { i18n } from '$lib/i18n';

	let loading = $state(true);
	let error = $state('');
	let sessions = $state<SsoSession[]>([]);
	let page = $state(1);
	let perPage = $state(50);
	let total = $state(0);
	let enterpriseFilter = $state('');
	let revokingId = $state<string | null>(null);

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
			error = e instanceof SkilluError ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(load);

	async function revoke(id: string) {
		if (
			!confirm(
				i18n.locale === 'fr'
					? 'Révoquer cette session ? L’utilisateur sera immédiatement déconnecté.'
					: 'Revoke this session? The user will be logged out immediately.'
			)
		)
			return;
		revokingId = id;
		try {
			await adminApi.revokeSsoSession(id);
			sessions = sessions.filter((s) => s.session_id !== id);
			total = Math.max(0, total - 1);
		} catch (e) {
			error = e instanceof SkilluError ? e.message : String(e);
		} finally {
			revokingId = null;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(i18n.locale === 'fr' ? 'fr-FR' : 'en-US');
		} catch {
			return iso;
		}
	}
</script>

<svelte:head>
	<title>{i18n.locale === 'fr' ? 'Sessions SSO' : 'SSO sessions'} — Skilluv</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-2 text-3xl font-black">
		{i18n.locale === 'fr' ? 'Sessions SSO actives' : 'Active SSO sessions'}
	</h1>
	<p class="mb-6 text-sm text-text-muted">
		{i18n.locale === 'fr'
			? "Toutes les sessions authentifiées via un IdP externe (login_method='sso'). Utile pour l'audit et pour révoquer une session à distance en cas de compromission."
			: "All sessions authenticated via an external IdP (login_method='sso'). Useful for auditing and remote-revoking a compromised session."}
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
				label={i18n.locale === 'fr' ? "Filtrer par entreprise (UUID)" : 'Filter by enterprise (UUID)'}
				placeholder="e.g. 3c72e18a-…"
				bind:value={enterpriseFilter}
			/>
		</div>
		<Button variant="accent" type="submit">
			{i18n.locale === 'fr' ? 'Filtrer' : 'Filter'}
		</Button>
		<Button
			variant="ghost"
			onclick={() => {
				enterpriseFilter = '';
				page = 1;
				load();
			}}
		>
			{i18n.locale === 'fr' ? 'Réinitialiser' : 'Reset'}
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
			{i18n.locale === 'fr' ? 'Aucune session SSO active.' : 'No active SSO sessions.'}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-[720px] text-sm">
				<thead class="bg-surface-overlay text-left text-xs uppercase text-text-muted">
					<tr>
						<th class="px-4 py-3 font-medium">
							{i18n.locale === 'fr' ? 'Utilisateur' : 'User'}
						</th>
						<th class="px-4 py-3 font-medium">
							{i18n.locale === 'fr' ? 'Entreprise' : 'Enterprise'}
						</th>
						<th class="px-4 py-3 font-medium">IP</th>
						<th class="px-4 py-3 font-medium">
							{i18n.locale === 'fr' ? 'Créée' : 'Created'}
						</th>
						<th class="px-4 py-3 font-medium">
							{i18n.locale === 'fr' ? 'Dernière activité' : 'Last used'}
						</th>
						<th class="px-4 py-3 font-medium text-right">
							{i18n.locale === 'fr' ? 'Actions' : 'Actions'}
						</th>
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
									variant="ghost"
									size="sm"
									loading={revokingId === s.session_id}
									onclick={() => revoke(s.session_id)}
								>
									{i18n.locale === 'fr' ? 'Révoquer' : 'Revoke'}
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
