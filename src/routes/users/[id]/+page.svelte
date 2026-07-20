<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
	import { adminApi } from '$api/admin';
	import type { UserPrivate, Rank } from '$lib/types';

	// UserPrivate ne déclare pas `banned`/`ban_reason` alors que /admin/users/{id}
	// les renvoie — on élargit localement pour rester type-safe côté UI.
	type AdminUser = UserPrivate & { banned?: boolean; ban_reason?: string | null; created_at?: string };
	import Button from '$components/ui/Button.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import UserCapabilitiesSection from '$components/admin/UserCapabilitiesSection.svelte';
	import UserOrientationsSection from '$components/admin/UserOrientationsSection.svelte';
	import UserBadgesSection from '$components/admin/UserBadgesSection.svelte';
	import UserRankSection from '$components/admin/UserRankSection.svelte';
	import UserRecomputeSection from '$components/admin/UserRecomputeSection.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import {
		ChevronRight,
		ShieldAlert,
		ShieldCheck,
		Link2,
		Globe,
		Mail,
		MapPin,
		Flame,
		FileCheck2,
		Flag,
		Sparkles,
		Star,
		KeyRound
	} from '@lucide/svelte';

	const userId = $derived($page.params.id as string);

	let user = $state<AdminUser | null>(null);
	let reportsAgainst = $state(0);
	let totalSubmissions = $state(0);
	let loading = $state(true);

	let showBan = $state(false);
	let showUnban = $state(false);
	let showReset2fa = $state(false);

	// ADM-M5 — refreshKey pilote la reload des sections proof engine après
	// recompute / rank override. currentRank est peuplé par UserBadgesSection.
	let refreshKey = $state(0);
	let currentRank = $state<Rank>('apprenti');

	function triggerRefresh() {
		refreshKey++;
	}
	let banning = $state(false);
	let unbanning = $state(false);
	let resetting2fa = $state(false);

	const canReset2fa = $derived(
		user !== null && auth.user !== null && user.id !== auth.user.id
	);
	const targetHasStrongFactor = $derived(user?.totp_enabled === true);

	async function load() {
		loading = true;
		try {
			const res = await adminApi.getUser(userId);
			user = res.data.user;
			reportsAgainst = res.data.reports_against;
			totalSubmissions = res.data.total_submissions;
		} catch (e) {
			toast.error(errorMessage(e));
			void goto('/users');
		} finally {
			loading = false;
		}
	}

	async function confirmBan(reason: string) {
		if (!user || banning) return;
		banning = true;
		try {
			await adminApi.banUser(user.id, reason);
			toast.success(i18n.t('admin.userDetail.bannedToast'));
			showBan = false;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			banning = false;
		}
	}

	async function confirmUnban() {
		if (!user || unbanning) return;
		unbanning = true;
		try {
			await adminApi.unbanUser(user.id);
			toast.success(i18n.t('admin.userDetail.unbannedToast'));
			showUnban = false;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			unbanning = false;
		}
	}

	async function confirmReset2fa(reason: string) {
		if (!user || resetting2fa) return;
		if (user.id === auth.user?.id) {
			toast.error(i18n.t('admin.reset2fa.selfBlocked'));
			return;
		}
		resetting2fa = true;
		try {
			await adminApi.resetUser2fa(user.id, reason);
			toast.success(i18n.t('admin.reset2fa.successToast'));
			showReset2fa = false;
			await load();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			resetting2fa = false;
		}
	}

	function roleVariant(r: string): 'default' | 'primary' | 'accent' | 'warning' {
		return r === 'admin' ? 'accent' : r === 'enterprise' ? 'primary' : r === 'recruiter' ? 'warning' : 'default';
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

	function fmtNum(n: number): string {
		return new Intl.NumberFormat(intlLocale()).format(n);
	}

	function createdAt(u: AdminUser): string | null {
		return u.created_at ?? null;
	}

	onMount(() => {
		if (!auth.isAuthenticated) {
			void goto(`/auth/login?redirect=/users/${userId}`);
			return;
		}
		void load();
	});
</script>

<svelte:head>
	<title>{user?.display_name ?? 'User'} — Admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-10 sm:py-14">
	<nav class="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
		<a href="/" class="hover:text-text-primary">Admin</a>
		<ChevronRight size={14} strokeWidth={2} />
		<a href="/users" class="hover:text-text-primary">{i18n.t('admin.users.title')}</a>
		<ChevronRight size={14} strokeWidth={2} />
		<span class="text-text-primary truncate">{user?.username ?? '…'}</span>
	</nav>

	{#if loading}
		<div class="space-y-4">
			<Skeleton class="h-32 w-full" rounded="xl" />
			<Skeleton class="h-24 w-full" rounded="xl" />
			<Skeleton class="h-48 w-full" rounded="xl" />
		</div>
	{:else if user}
		{#if user.banned}
			<div class="mb-6 flex items-center gap-3 rounded-2xl border border-error/40 bg-error/10 p-4">
				<ShieldAlert size={20} strokeWidth={2} class="shrink-0 text-error" />
				<div class="flex-1">
					<p class="font-bold text-error">
						{i18n.t('admin.userDetail.bannedTitle')}
					</p>
					{#if user.ban_reason}
						<p class="mt-0.5 text-sm text-text-muted">
							{i18n.t('admin.users.banReason')} {user.ban_reason}
						</p>
					{/if}
				</div>
				<Button variant="secondary" size="sm" onclick={() => (showUnban = true)} loading={unbanning}>
					<ShieldCheck size={14} strokeWidth={2} />
					{i18n.t('admin.users.unbanBtn')}
				</Button>
			</div>
		{/if}

		<!-- Header profile -->
		<div class="mb-8 rounded-2xl border border-border bg-surface-elevated p-6">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start">
				<div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-3xl font-black uppercase text-primary">
					{#if user.avatar_url}
						<img src={user.avatar_url} alt="" class="h-full w-full rounded-2xl object-cover" />
					{:else}
						{user.display_name.charAt(0) || user.username.charAt(0)}
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 flex-wrap">
						<h1 class="text-2xl sm:text-3xl font-black tracking-tight truncate">
							{user.display_name}
						</h1>
						<Badge variant={roleVariant(user.role)}>{user.role}</Badge>
						{#if user.skill_domain}
							<Badge variant="default">{user.skill_domain}</Badge>
						{/if}
						{#if user.email_verified}
							<Badge variant="success" size="sm">
								{i18n.t('admin.userDetail.verifiedEmail')}
							</Badge>
						{/if}
						{#if user.totp_enabled || user.email_2fa_enabled}
							<Badge variant="primary" size="sm">2FA</Badge>
						{/if}
					</div>
					<p class="mt-1 font-mono text-xs text-text-muted truncate">
						@{user.username} · {user.title}
					</p>
					{#if user.bio}
						<p class="mt-3 text-sm text-text-muted">{user.bio}</p>
					{/if}
					<div class="mt-3 flex items-center gap-4 text-xs text-text-muted flex-wrap">
						<span class="flex items-center gap-1">
							<Mail size={12} strokeWidth={2} />
							{user.email}
						</span>
						{#if user.city || user.country}
							<span class="flex items-center gap-1">
								<MapPin size={12} strokeWidth={2} />
								{[user.city, user.country].filter(Boolean).join(', ')}
							</span>
						{/if}
						{#if user.github}
							<a href={`https://github.com/${user.github}`} target="_blank" rel="noopener" class="flex items-center gap-1 hover:text-text-primary">
								<Link2 size={12} strokeWidth={2} />
								github.com/{user.github}
							</a>
						{/if}
						{#if user.linkedin}
							<a href={user.linkedin} target="_blank" rel="noopener" class="flex items-center gap-1 hover:text-text-primary">
								<Link2 size={12} strokeWidth={2} />
								LinkedIn
							</a>
						{/if}
						{#if user.website}
							<a href={user.website} target="_blank" rel="noopener" class="flex items-center gap-1 hover:text-text-primary">
								<Globe size={12} strokeWidth={2} />
								{i18n.t('admin.userDetail.websiteLabel')}
							</a>
						{/if}
					</div>
					<p class="mt-3 font-mono text-[10px] text-text-muted/70">
						{user.id}
						{#if createdAt(user)}
							<span> · {i18n.t('admin.userDetail.joined')} {fmtDate(createdAt(user))}</span>
						{/if}
					</p>
				</div>
				<div class="shrink-0">
					{#if user.banned}
						<Button variant="secondary" onclick={() => (showUnban = true)} loading={unbanning}>
							<ShieldCheck size={14} strokeWidth={2} />
							{i18n.t('admin.users.unbanBtn')}
						</Button>
					{:else}
						<Button variant="danger" onclick={() => (showBan = true)}>
							<ShieldAlert size={14} strokeWidth={2} />
							{i18n.t('admin.users.banBtn')}
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Capabilities section (P18.4) -->
		<UserCapabilitiesSection userId={user.id} />

		<!-- ADM-M5 — Orientations métier (P16.3, public projection). -->
		<UserOrientationsSection userId={user.id} {refreshKey} />

		<!-- ADM-M5 — Badges + rank chevron (P17.5). Renvoie currentRank via callback. -->
		<UserBadgesSection
			userId={user.id}
			{refreshKey}
			onrankloaded={(r) => (currentRank = r)}
		/>

		<!-- ADM-M5 — Rank courant + historique + Force rank (P17.4 + ADM-M5+). -->
		<UserRankSection
			userId={user.id}
			{currentRank}
			{refreshKey}
			onchange={triggerRefresh}
		/>

		<!-- ADM-M5 — Recompute proof engine (P19). -->
		<UserRecomputeSection userId={user.id} onchange={triggerRefresh} />

		<!-- Security card -->
		<div class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
			<div class="mb-3 flex items-center gap-2">
				<KeyRound size={16} strokeWidth={2} class="text-accent" />
				<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
					{i18n.t('admin.reset2fa.sectionTitle')}
				</h2>
			</div>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<p class="text-sm text-text-primary">
						{i18n.t('admin.reset2fa.sectionHint')}
					</p>
					<p class="mt-1 text-xs text-text-muted">
						{i18n.t('admin.reset2fa.wipeExplanation')}
					</p>
					{#if !canReset2fa}
						<p class="mt-2 text-xs text-warning">{i18n.t('admin.reset2fa.selfBlocked')}</p>
					{/if}
				</div>
				<div class="shrink-0">
					<Button
						variant="danger"
						size="sm"
						onclick={() => (showReset2fa = true)}
						disabled={!canReset2fa || !targetHasStrongFactor}
						loading={resetting2fa}
					>
						<KeyRound size={14} strokeWidth={2} />
						{i18n.t('admin.reset2fa.buttonLabel')}
					</Button>
				</div>
			</div>
		</div>

		<!-- KPI grid -->
		<div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-border bg-surface-elevated p-4">
				<div class="flex items-center gap-2 text-xs text-text-muted">
					<Sparkles size={14} strokeWidth={2} />
					{i18n.t('admin.userDetail.fragments')}
				</div>
				<p class="mt-1 text-2xl font-bold text-primary">{fmtNum(user.total_fragments)}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-elevated p-4">
				<div class="flex items-center gap-2 text-xs text-text-muted">
					<Star size={14} strokeWidth={2} />
					{i18n.t('admin.userDetail.goldenStars')}
				</div>
				<p class="mt-1 text-2xl font-bold text-accent">{fmtNum(user.golden_stars)}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-elevated p-4">
				<div class="flex items-center gap-2 text-xs text-text-muted">
					<Flame size={14} strokeWidth={2} />
					{i18n.t('admin.userDetail.streak')}
				</div>
				<p class="mt-1 text-2xl font-bold">{fmtNum(user.streak_current)}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-elevated p-4">
				<div class="flex items-center gap-2 text-xs text-text-muted">
					<ShieldCheck size={14} strokeWidth={2} />
					{i18n.t('admin.userDetail.trustScore')}
				</div>
				<p class="mt-1 text-2xl font-bold {user.trust_score < 50 ? 'text-warning' : ''}">
					{fmtNum(user.trust_score)}
				</p>
			</div>
		</div>

		<!-- Admin-only KPIs -->
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted mb-2">
					<FileCheck2 size={14} strokeWidth={2} />
					{i18n.t('admin.dashboard.submissions')}
				</div>
				<p class="text-3xl font-black">{fmtNum(totalSubmissions)}</p>
				<p class="mt-1 text-xs text-text-muted">
					{i18n.t('admin.userDetail.submissionsHint')}
				</p>
			</div>
			<div class="rounded-2xl border border-border bg-surface-elevated p-5">
				<div class="flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted mb-2">
					<Flag size={14} strokeWidth={2} />
					{i18n.t('admin.userDetail.reportsAgainst')}
				</div>
				<p class="text-3xl font-black {reportsAgainst > 0 ? 'text-warning' : ''}">{fmtNum(reportsAgainst)}</p>
				{#if reportsAgainst > 0}
					<a href="/reports" class="mt-1 inline-block text-xs text-primary hover:underline">
						{i18n.t('admin.userDetail.viewReports')}
					</a>
				{:else}
					<p class="mt-1 text-xs text-text-muted">
						{i18n.t('admin.userDetail.noReport')}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<ConfirmDangerousDialog
	open={showBan}
	title={i18n.t('admin.users.banBtn')}
	description={user ? `@${user.username} — ${user.display_name}` : ''}
	actionLabel={i18n.t('admin.users.banBtn')}
	reasonPlaceholder={i18n.t('admin.userDetail.banPlaceholder')}
	reasonHint={i18n.t('admin.userDetail.banHint')}
	loading={banning}
	onconfirm={confirmBan}
	onclose={() => (showBan = false)}
/>

<ConfirmDangerousDialog
	open={showUnban}
	title={i18n.t('admin.users.unbanBtn')}
	description={user ? `@${user.username} — ${user.display_name}` : ''}
	actionLabel={i18n.t('admin.users.unbanBtn')}
	requireReason={false}
	loading={unbanning}
	onconfirm={() => confirmUnban()}
	onclose={() => (showUnban = false)}
/>

<ConfirmDangerousDialog
	open={showReset2fa}
	title={i18n.t('admin.reset2fa.dialogTitle')}
	description={i18n.t('admin.reset2fa.dialogDescription')}
	actionLabel={i18n.t('admin.reset2fa.buttonLabel')}
	reasonHint={i18n.t('admin.reset2fa.reasonHint')}
	minReasonLength={8}
	loading={resetting2fa}
	onconfirm={confirmReset2fa}
	onclose={() => (showReset2fa = false)}
/>
