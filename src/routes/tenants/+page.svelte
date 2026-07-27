<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { goto } from '$app/navigation';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import { tenantsApi, type TenantSummary, type TenantPlan } from '$api/tenants';
	import { toast } from '$stores/toast.svelte';
	import { SkilluError } from '$api/client';

	let tenants = $state<TenantSummary[]>([]);
	let loading = $state(true);
	let showCreate = $state(false);
	let creating = $state(false);

	// Create form
	let slug = $state('');
	let name = $state('');
	let subdomain = $state('');
	let contactEmail = $state('');
	let plan = $state<TenantPlan>('starter');
	let maxUsers = $state(100);
	let primaryColor = $state('#6C5CE7');
	let logoUrl = $state('');

	async function load() {
		loading = true;
		try {
			const res = await tenantsApi.list();
			tenants = res.data.tenants;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : 'Erreur');
		} finally {
			loading = false;
		}
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		if (!slug.trim() || !name.trim() || !contactEmail.trim() || creating) return;
		creating = true;
		try {
			const res = await tenantsApi.create({
				slug: slug.trim().toLowerCase(),
				name: name.trim(),
				subdomain: subdomain.trim() || undefined,
				contact_email: contactEmail.trim().toLowerCase(),
				plan,
				max_users: maxUsers,
				primary_color: primaryColor,
				logo_url: logoUrl.trim() || undefined
			});
			toast.success(i18n.t('admin.tenants.createdToast'));
			showCreate = false;
			slug = ''; name = ''; subdomain = ''; contactEmail = '';
			plan = 'starter'; maxUsers = 100; primaryColor = '#6C5CE7'; logoUrl = '';
			await load();
			void goto(`/tenants/${res.data.tenant_id}`);
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			creating = false;
		}
	}

	function planVariant(p: string): 'default' | 'primary' | 'accent' | 'warning' {
		return p === 'enterprise' ? 'accent' : p === 'pro' ? 'primary' : 'default';
	}


	function fmtDate(iso: string): string {
		return new Intl.DateTimeFormat(intlLocale(), {
			day: '2-digit', month: 'short', year: 'numeric'
		}).format(new Date(iso));
	}

	// Auth enforced by hooks.server.ts — client re-check was racy on deep-links.
	onMount(() => void load());
</script>

<svelte:head>
	<title>{i18n.t('admin.nav.tenantsLabel')} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-2 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<span>›</span>
		<span class="text-text-primary">{i18n.t('admin.nav.tenantsLabel')}</span>
	</nav>

	<div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{i18n.t('admin.tenants.whiteLabel')}</p>
			<h1 class="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
				{i18n.t('admin.tenants.title')}
			</h1>
			<p class="mt-3 max-w-xl text-sm text-text-muted">
				{i18n.t('admin.tenants.subtitle')}
			</p>
		</div>
		<Button variant="accent" onclick={() => (showCreate = true)}>
			+ {i18n.t('admin.tenants.newTenant')}
		</Button>
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each Array(4) as _}
				<div class="animate-pulse rounded-2xl border border-border bg-surface-elevated h-24"></div>
			{/each}
		</div>
	{:else if tenants.length === 0}
		<div class="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
			<div class="mb-3 text-4xl text-text-muted">⬢</div>
			<p class="text-text-muted">
				{i18n.t('admin.tenants.noTenant')}
			</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each tenants as t}
				<a
					href={`/tenants/${t.id}`}
					class="flex items-center gap-4 rounded-2xl border {t.active ? 'border-border' : 'border-error/30 opacity-70'} bg-surface-elevated p-5 hover:border-primary/40 hover:shadow-md transition-all"
				>
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary uppercase">
						{t.slug.charAt(0)}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2 flex-wrap">
							<h2 class="text-lg font-bold truncate">{t.name}</h2>
							<Badge variant={planVariant(t.plan)} size="sm">{t.plan}</Badge>
							{#if !t.active}
								<Badge variant="error" size="sm">{i18n.t('admin.tenants.inactive')}</Badge>
							{/if}
						</div>
						<p class="mt-0.5 font-mono text-xs text-text-muted">
							{t.slug}
							{#if t.subdomain}
								<span> · {t.subdomain}.skilluv.com</span>
							{/if}
						</p>
					</div>
					<div class="text-right shrink-0">
						<div class="text-2xl font-black text-primary">{t.members_count}</div>
						<div class="text-xs text-text-muted">
							/ {t.max_users} {i18n.t('admin.tenants.membersLabel')}
						</div>
					</div>
					<div class="hidden sm:block text-xs text-text-muted shrink-0 pl-2 border-l border-border">
						{fmtDate(t.created_at)}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Create modal -->
<Modal open={showCreate} title={i18n.t('admin.tenants.newTenant')} onclose={() => (showCreate = false)}>
	<form onsubmit={submitCreate} class="space-y-4">
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="t-slug" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.slug')} *
				</label>
				<input
					id="t-slug"
					bind:value={slug}
					required
					pattern={'[a-z0-9\\-]{2,60}'}
					placeholder="acme"
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm lowercase focus:border-primary focus:outline-none"
				/>
			</div>
			<div>
				<label for="t-name" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.nameLabel')} *
				</label>
				<input
					id="t-name"
					bind:value={name}
					required
					placeholder="Acme Bootcamp"
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
		</div>
		<div>
			<label for="t-sub" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.tenants.subdomain')}
			</label>
			<div class="flex items-center gap-1">
				<input
					id="t-sub"
					bind:value={subdomain}
					placeholder="acme"
					class="flex-1 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm lowercase focus:border-primary focus:outline-none"
				/>
				<span class="text-sm text-text-muted">.skilluv.com</span>
			</div>
		</div>
		<div>
			<label for="t-email" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.tenants.contactLabel')} *
			</label>
			<input
				id="t-email"
				type="email"
				bind:value={contactEmail}
				required
				placeholder="admin@acme.com"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
			/>
		</div>
		<div class="grid grid-cols-3 gap-3">
			<div>
				<label for="t-plan" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.plan')}
				</label>
				<Select
					items={[
						{ value: 'starter', label: 'Starter' },
						{ value: 'pro', label: 'Pro' },
						{ value: 'enterprise', label: 'Enterprise' }
					]}
					bind:value={plan}
					class="w-full"
				/>
			</div>
			<div>
				<label for="t-max" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.maxUsers')}
				</label>
				<input
					id="t-max"
					type="number"
					bind:value={maxUsers}
					min="1"
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
			<div>
				<label for="t-color" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.color')}
				</label>
				<input
					id="t-color"
					type="color"
					bind:value={primaryColor}
					class="w-full h-10 rounded-full border border-border cursor-pointer"
				/>
			</div>
		</div>
		<div>
			<label for="t-logo" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.tenants.logoUrl')}
			</label>
			<input
				id="t-logo"
				bind:value={logoUrl}
				placeholder="https://cdn.acme.com/logo.svg"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
			/>
		</div>
		<div class="flex justify-end gap-2 pt-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={creating}>
				{i18n.t('admin.common.create')}
			</Button>
		</div>
	</form>
</Modal>
