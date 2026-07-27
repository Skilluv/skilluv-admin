<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { toast } from '$stores/toast.svelte';
	import { SkilluError } from '$api/client';
	import {
		tenantsApi,
		type TenantFull,
		type TenantMember,
		type TenantCohort,
		type TenantPlan,
		type TenantMemberRole
	} from '$api/tenants';
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import {
		ChevronRight,
		Settings2,
		Users as UsersIcon,
		GraduationCap,
		Save,
		UserPlus,
		Plus,
		Power
	} from '@lucide/svelte';

	const tenantId = $derived($page.params.id as string);

	type Tab = 'settings' | 'members' | 'cohorts';
	let activeTab = $state<Tab>('settings');

	let tenant = $state<TenantFull | null>(null);
	let members = $state<TenantMember[]>([]);
	let cohorts = $state<TenantCohort[]>([]);
	let loading = $state(true);
	let loadingMembers = $state(false);
	let loadingCohorts = $state(false);
	let saving = $state(false);

	// Edit form state — synced from tenant on load
	let form = $state({
		name: '',
		subdomain: '',
		custom_domain: '',
		logo_url: '',
		primary_color: '#6C5CE7',
		secondary_color: '#000000',
		plan: 'starter' as TenantPlan,
		max_users: 100,
		active: true
	});

	// Add-member modal
	let showAddMember = $state(false);
	let addingMember = $state(false);
	let newMemberUserId = $state('');
	let newMemberRole = $state<TenantMemberRole>('member');

	// Create-cohort modal
	let showCreateCohort = $state(false);
	let creatingCohort = $state(false);
	let cohortName = $state('');
	let cohortStartsAt = $state('');
	let cohortEndsAt = $state('');

	function syncForm(t: TenantFull) {
		form.name = t.name;
		form.subdomain = t.subdomain ?? '';
		form.custom_domain = t.custom_domain ?? '';
		form.logo_url = t.logo_url ?? '';
		form.primary_color = t.primary_color ?? '#6C5CE7';
		form.secondary_color = t.secondary_color ?? '#000000';
		form.plan = t.plan;
		form.max_users = t.max_users;
		form.active = t.active;
	}

	async function loadTenant() {
		loading = true;
		try {
			const res = await tenantsApi.get(tenantId);
			tenant = res.data;
			syncForm(res.data);
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
			void goto('/tenants');
		} finally {
			loading = false;
		}
	}

	async function loadMembers() {
		loadingMembers = true;
		try {
			const res = await tenantsApi.listMembers(tenantId);
			members = res.data.members;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loadingMembers = false;
		}
	}

	async function loadCohorts() {
		loadingCohorts = true;
		try {
			const res = await tenantsApi.listCohorts(tenantId);
			cohorts = res.data.cohorts;
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			loadingCohorts = false;
		}
	}

	async function saveTenant(e: SubmitEvent) {
		e.preventDefault();
		if (!tenant || saving) return;
		saving = true;
		try {
			await tenantsApi.update(tenantId, {
				name: form.name.trim(),
				subdomain: form.subdomain.trim() || null,
				custom_domain: form.custom_domain.trim() || null,
				logo_url: form.logo_url.trim() || null,
				primary_color: form.primary_color || null,
				secondary_color: form.secondary_color || null,
				plan: form.plan,
				max_users: form.max_users,
				active: form.active
			});
			toast.success(i18n.t('admin.tenants.updated'));
			await loadTenant();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			saving = false;
		}
	}

	async function toggleActive() {
		if (!tenant || saving) return;
		saving = true;
		try {
			await tenantsApi.update(tenantId, { active: !tenant.active });
			toast.success(tenant.active ? i18n.t('admin.tenants.deactivated') : i18n.t('admin.tenants.reactivated'));
			await loadTenant();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			saving = false;
		}
	}

	async function submitAddMember(e: SubmitEvent) {
		e.preventDefault();
		if (!newMemberUserId.trim() || addingMember) return;
		addingMember = true;
		try {
			await tenantsApi.addMember(tenantId, newMemberUserId.trim(), newMemberRole);
			toast.success(i18n.t('admin.tenants.memberAdded'));
			showAddMember = false;
			newMemberUserId = '';
			newMemberRole = 'member';
			await loadMembers();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			addingMember = false;
		}
	}

	async function submitCreateCohort(e: SubmitEvent) {
		e.preventDefault();
		if (!cohortName.trim() || creatingCohort) return;
		creatingCohort = true;
		try {
			await tenantsApi.createCohort(
				tenantId,
				cohortName.trim(),
				cohortStartsAt || undefined,
				cohortEndsAt || undefined
			);
			toast.success(i18n.t('admin.tenants.cohortCreated'));
			showCreateCohort = false;
			cohortName = '';
			cohortStartsAt = '';
			cohortEndsAt = '';
			await loadCohorts();
		} catch (e) {
			toast.error(e instanceof SkilluError ? e.message : i18n.t('admin.common.errorGeneric'));
		} finally {
			creatingCohort = false;
		}
	}

	function planVariant(p: string): 'default' | 'primary' | 'accent' {
		return p === 'enterprise' ? 'accent' : p === 'pro' ? 'primary' : 'default';
	}

	function roleVariant(r: TenantMemberRole): 'default' | 'primary' | 'accent' | 'warning' {
		return r === 'owner' ? 'accent' : r === 'admin' ? 'primary' : r === 'instructor' ? 'warning' : 'default';
	}

	function intlLocale(): string {
		return i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US';
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Intl.DateTimeFormat(intlLocale(), {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).format(new Date(iso));
	}

	// Trigger tab data load when switching tabs (once per tab).
	let loadedTabs = $state<Set<Tab>>(new Set(['settings']));
	$effect(() => {
		if (!tenant) return;
		if (activeTab === 'members' && !loadedTabs.has('members')) {
			loadedTabs.add('members');
			void loadMembers();
		} else if (activeTab === 'cohorts' && !loadedTabs.has('cohorts')) {
			loadedTabs.add('cohorts');
			void loadCohorts();
		}
	});

	// Auth enforced by hooks.server.ts — client re-check was racy on deep-links.
	onMount(() => void loadTenant());
</script>

<svelte:head>
	<title>{tenant?.name ?? 'Tenant'} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/tenants" class="hover:text-text-primary">{i18n.t('admin.nav.tenantsLabel')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary truncate">{tenant?.slug ?? '…'}</span>
	</nav>

	{#if loading}
		<div class="space-y-4">
			<Skeleton class="h-24 w-full" rounded="xl" />
			<Skeleton class="h-96 w-full" rounded="xl" />
		</div>
	{:else if tenant}
		<!-- Header -->
		<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-4 min-w-0">
				<div
					class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black uppercase text-primary-fg"
					style="background-color: {tenant.primary_color ?? 'var(--sk-primary)'}"
				>
					{tenant.slug.charAt(0)}
				</div>
				<div class="min-w-0">
					<div class="flex items-center gap-2 flex-wrap">
						<h1 class="text-2xl sm:text-3xl font-black tracking-tight truncate">{tenant.name}</h1>
						<Badge variant={planVariant(tenant.plan)}>{tenant.plan}</Badge>
						{#if !tenant.active}
							<Badge variant="error">{i18n.t('admin.tenants.inactive')}</Badge>
						{/if}
					</div>
					<p class="mt-1 font-mono text-xs text-text-muted truncate">
						{tenant.slug}
						{#if tenant.subdomain}
							<span> · {tenant.subdomain}.skilluv.com</span>
						{/if}
						{#if tenant.custom_domain}
							<span> · {tenant.custom_domain}</span>
						{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2 shrink-0">
				<Button variant={tenant.active ? 'secondary' : 'accent'} onclick={toggleActive} loading={saving}>
					<Power size={14} strokeWidth={2} />
					{tenant.active ? i18n.t('admin.tenants.deactivate') : i18n.t('admin.tenants.reactivate')}
				</Button>
			</div>
		</div>

		<!-- Tabs -->
		<div class="mb-6 flex gap-1 border-b border-border">
			{#each [
				{ id: 'settings' as Tab, label: i18n.t('admin.tenants.tabSettings'), icon: Settings2 },
				{ id: 'members' as Tab, label: i18n.t('admin.tenants.tabMembers'), icon: UsersIcon },
				{ id: 'cohorts' as Tab, label: i18n.t('admin.tenants.tabCohorts'), icon: GraduationCap }
			] as tab (tab.id)}
				<button
					type="button"
					onclick={() => (activeTab = tab.id)}
					class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors {activeTab === tab.id
						? 'border-primary text-primary'
						: 'border-transparent text-text-muted hover:text-text-primary'}"
				>
					<tab.icon size={16} strokeWidth={2} />
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Settings tab -->
		{#if activeTab === 'settings'}
			<form onsubmit={saveTenant} class="space-y-6 rounded-2xl border border-border bg-surface-elevated p-6">
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="f-name" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.tenants.nameLabel')} *
						</label>
						<input
							id="f-name"
							bind:value={form.name}
							required
							class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
						/>
					</div>
					<div>
						<label for="f-email" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.tenants.contactLabel')}
						</label>
						<input
							id="f-email"
							value={tenant.contact_email}
							disabled
							class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm opacity-60"
						/>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="f-sub" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.tenants.subdomain')}
						</label>
						<div class="flex items-center gap-1">
							<input
								id="f-sub"
								bind:value={form.subdomain}
								placeholder="acme"
								class="flex-1 rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm lowercase focus:border-primary focus:outline-none"
							/>
							<span class="text-sm text-text-muted whitespace-nowrap">.skilluv.com</span>
						</div>
					</div>
					<div>
						<label for="f-custom" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.tenants.customDomain')}
						</label>
						<input
							id="f-custom"
							bind:value={form.custom_domain}
							placeholder="learn.acme.com"
							class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
						/>
					</div>
				</div>

				<div>
					<label for="f-logo" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tenants.logoUrl')}
					</label>
					<input
						id="f-logo"
						bind:value={form.logo_url}
						placeholder="https://cdn.acme.com/logo.svg"
						class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
					/>
				</div>

				<div class="grid gap-4 sm:grid-cols-4">
					<div class="sm:col-span-2">
						<label class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted" for="f-plan">
							{i18n.t('admin.tenants.plan')}
						</label>
						<Select
							items={[
								{ value: 'starter', label: 'Starter' },
								{ value: 'pro', label: 'Pro' },
								{ value: 'enterprise', label: 'Enterprise' }
							]}
							bind:value={form.plan}
							class="w-full"
						/>
					</div>
					<div>
						<label for="f-max" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.tenants.maxUsers')}
						</label>
						<input
							id="f-max"
							type="number"
							bind:value={form.max_users}
							min="1"
							class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
						/>
					</div>
					<div>
						<p class="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">
							{i18n.t('admin.common.status')}
						</p>
						<label class="flex h-10 items-center gap-2 rounded-full border border-border bg-surface-overlay px-4 text-sm cursor-pointer">
							<input type="checkbox" bind:checked={form.active} class="accent-primary" />
							<span>{i18n.t('admin.common.active')}</span>
						</label>
					</div>
				</div>

				<div>
					<p class="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">
						{i18n.t('admin.tenants.branding')}
					</p>
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="flex items-center gap-3 rounded-full border border-border bg-surface-overlay px-4 py-2 cursor-pointer">
							<input type="color" bind:value={form.primary_color} class="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent" />
							<span class="text-xs font-mono text-text-muted flex-1">{form.primary_color}</span>
							<span class="text-xs text-text-muted">{i18n.t('admin.tenants.primary')}</span>
						</label>
						<label class="flex items-center gap-3 rounded-full border border-border bg-surface-overlay px-4 py-2 cursor-pointer">
							<input type="color" bind:value={form.secondary_color} class="h-8 w-10 cursor-pointer rounded-md border-0 bg-transparent" />
							<span class="text-xs font-mono text-text-muted flex-1">{form.secondary_color}</span>
							<span class="text-xs text-text-muted">{i18n.t('admin.tenants.secondary')}</span>
						</label>
					</div>
				</div>

				<div class="flex justify-end gap-2 pt-2 border-t border-border">
					<Button variant="ghost" onclick={() => tenant && syncForm(tenant)}>
						{i18n.t('admin.common.reset')}
					</Button>
					<Button variant="accent" loading={saving}>
						<Save size={14} strokeWidth={2} />
						{i18n.t('admin.common.save')}
					</Button>
				</div>
			</form>
		{/if}

		<!-- Members tab -->
		{#if activeTab === 'members'}
			<div class="rounded-2xl border border-border bg-surface-elevated">
				<div class="flex items-center justify-between p-4 border-b border-border">
					<div>
						<p class="text-sm font-bold">{members.length} {i18n.t('admin.tenants.membersLabel')}</p>
						<p class="text-xs text-text-muted">
							/ {tenant.max_users} {i18n.t('admin.tenants.maxSuffix')}
						</p>
					</div>
					<Button variant="accent" size="sm" onclick={() => (showAddMember = true)}>
						<UserPlus size={14} strokeWidth={2} />
						{i18n.t('admin.tenants.addMember')}
					</Button>
				</div>

				{#if loadingMembers}
					<div class="p-4 space-y-2">
						{#each Array(4) as _}
							<Skeleton class="h-14 w-full" rounded="xl" />
						{/each}
					</div>
				{:else if members.length === 0}
					<div class="p-10 text-center text-sm text-text-muted">
						{i18n.t('admin.tenants.noMember')}
					</div>
				{:else}
					<ul class="divide-y divide-border">
						{#each members as m (m.user_id)}
							<li class="flex items-center gap-4 p-4">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary uppercase">
									{m.display_name.charAt(0) || m.username.charAt(0)}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 flex-wrap">
										<p class="font-medium truncate">{m.display_name || m.username}</p>
										<Badge variant={roleVariant(m.role)} size="sm">{m.role}</Badge>
									</div>
									<p class="mt-0.5 font-mono text-xs text-text-muted truncate">
										@{m.username} · {m.email}
									</p>
								</div>
								<span class="hidden sm:block text-xs text-text-muted shrink-0">
									{fmtDate(m.joined_at)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Cohorts tab -->
		{#if activeTab === 'cohorts'}
			<div class="rounded-2xl border border-border bg-surface-elevated">
				<div class="flex items-center justify-between p-4 border-b border-border">
					<p class="text-sm font-bold">
						{cohorts.length} {i18n.t('admin.tenants.cohorts')}
					</p>
					<Button variant="accent" size="sm" onclick={() => (showCreateCohort = true)}>
						<Plus size={14} strokeWidth={2} />
						{i18n.t('admin.tenants.newCohort')}
					</Button>
				</div>

				{#if loadingCohorts}
					<div class="p-4 space-y-2">
						{#each Array(3) as _}
							<Skeleton class="h-16 w-full" rounded="xl" />
						{/each}
					</div>
				{:else if cohorts.length === 0}
					<div class="p-10 text-center text-sm text-text-muted">
						{i18n.t('admin.tenants.noCohort')}
					</div>
				{:else}
					<ul class="divide-y divide-border">
						{#each cohorts as c (c.id)}
							<li class="flex items-center gap-4 p-4">
								<GraduationCap size={20} strokeWidth={2} class="shrink-0 text-primary" />
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 flex-wrap">
										<p class="font-medium truncate">{c.name}</p>
										{#if !c.active}
											<Badge variant="default" size="sm">
												{i18n.t('admin.common.archived')}
											</Badge>
										{/if}
									</div>
									<p class="mt-0.5 text-xs text-text-muted">
										{fmtDate(c.starts_at)} — {fmtDate(c.ends_at)}
									</p>
								</div>
								<div class="text-right shrink-0">
									<div class="text-lg font-bold text-primary">{c.members_count}</div>
									<div class="text-xs text-text-muted">{i18n.t('admin.tenants.membersLabel')}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<!-- Add member modal -->
<Modal
	open={showAddMember}
	title={i18n.t('admin.tenants.addMemberTitle')}
	onclose={() => (showAddMember = false)}
>
	<form onsubmit={submitAddMember} class="space-y-4">
		<div>
			<label for="m-uid" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.common.userIdLabel')} *
			</label>
			<input
				id="m-uid"
				bind:value={newMemberUserId}
				required
				placeholder="uuid…"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 font-mono text-xs focus:border-primary focus:outline-none"
			/>
			<p class="mt-1 text-xs text-text-muted">
				{i18n.t('admin.tenants.userIdHint')}
			</p>
		</div>
		<div>
			<label for="m-role" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.tenants.role')}
			</label>
			<Select
				items={[
					{ value: 'member', label: 'Member' },
					{ value: 'instructor', label: 'Instructor' },
					{ value: 'admin', label: 'Admin' },
					{ value: 'owner', label: 'Owner' }
				]}
				bind:value={newMemberRole}
				class="w-full"
			/>
		</div>
		<div class="flex justify-end gap-2 pt-2">
			<Button variant="ghost" onclick={() => (showAddMember = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={addingMember}>
				{i18n.t('admin.tenants.addMember')}
			</Button>
		</div>
	</form>
</Modal>

<!-- Create cohort modal -->
<Modal
	open={showCreateCohort}
	title={i18n.t('admin.tenants.newCohortTitle')}
	onclose={() => (showCreateCohort = false)}
>
	<form onsubmit={submitCreateCohort} class="space-y-4">
		<div>
			<label for="c-name" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.tenants.cohortName')} *
			</label>
			<input
				id="c-name"
				bind:value={cohortName}
				required
				placeholder="Promo 2026"
				class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
			/>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="c-start" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.cohortStarts')}
				</label>
				<input
					id="c-start"
					type="date"
					bind:value={cohortStartsAt}
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
			<div>
				<label for="c-end" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.tenants.cohortEnds')}
				</label>
				<input
					id="c-end"
					type="date"
					bind:value={cohortEndsAt}
					class="w-full rounded-full border border-border bg-surface-overlay px-4 py-2 text-sm focus:border-primary focus:outline-none"
				/>
			</div>
		</div>
		<div class="flex justify-end gap-2 pt-2">
			<Button variant="ghost" onclick={() => (showCreateCohort = false)}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={creatingCohort}>
				{i18n.t('admin.common.create')}
			</Button>
		</div>
	</form>
</Modal>
