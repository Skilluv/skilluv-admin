<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n';
	import { auth } from '$stores/auth.svelte';
	import BackendStatusBanner from '$components/ui/BackendStatusBanner.svelte';
	import Toast from '$components/ui/Toast.svelte';
	import { type Component } from 'svelte';
	import {
		LayoutDashboard,
		ShieldAlert,
		Handshake,
		Users,
		Flag,
		Code2,
		Star,
		Clock,
		KeyRound,
		Wallet,
		Scale,
		Mail,
		Building2,
		ShieldCheck,
		Megaphone,
		Swords,
		Wrench,
		Fingerprint,
		BookMarked,
		Briefcase,
		Network,
		Link2,
		GraduationCap,
		Palette,
		FolderGit2,
		Layers,
		BadgeCheck,
		ChartNoAxesColumn,
		TrendingUp,
		Gamepad2,
		Database,
		ServerCog,
		Compass,
		FileSignature,
		UsersRound,
		UserSearch,
		LogOut
	} from '@lucide/svelte';

	// Root layout for the standalone admin app. The whole app IS the admin
	// workspace — no candidate/enterprise chrome to hide, no persona
	// switching. Every route below this layer already requires role='admin'
	// (enforced by `hooks.server.ts`).

	let { children, data } = $props();
	let pathname = $derived($page.url.pathname);

	// Hydrate the auth store from SSR data so client-side components see the
	// same user object without an extra /auth/me round-trip.
	$effect(() => {
		auth.setUser(data.user);
	});

	const navItems = $derived<{ href: string; label: string; icon: Component }[]>([
		{ href: '/', label: i18n.t('admin.dashboard.title'), icon: LayoutDashboard },
		{ href: '/users', label: i18n.t('admin.users.title'), icon: Users },
		{ href: '/reports', label: i18n.t('admin.reports.title'), icon: Flag },
		{ href: '/fraud', label: i18n.t('admin.nav.fraud'), icon: Fingerprint },
		{ href: '/challenges', label: i18n.t('admin.challenges.title'), icon: Code2 },
		{ href: '/projects', label: 'Projets', icon: FolderGit2 },
		{ href: '/slices', label: 'Slices', icon: Layers },
		{ href: '/validators', label: 'Validateurs', icon: BadgeCheck },
		{ href: '/validation-analytics', label: 'Analytics validation', icon: ChartNoAxesColumn },
		{ href: '/community', label: i18n.t('admin.community.title'), icon: Star },
		{ href: '/catalog', label: i18n.t('admin.nav.catalog'), icon: BookMarked },
		{ href: '/skills', label: i18n.t('admin.nav.skills'), icon: Network },
		{ href: '/domains', label: i18n.t('admin.oversight.domainsNavLabel'), icon: Compass },
		{ href: '/design', label: i18n.t('admin.design.navLabel'), icon: Palette },
		{ href: '/game', label: i18n.t('admin.gameDomain.navLabel'), icon: Gamepad2 },
		{ href: '/security', label: i18n.t('admin.nav.security'), icon: ShieldAlert },
		{ href: '/missions', label: i18n.t('admin.nav.missions'), icon: Handshake },
		{
			href: '/external-signals',
			label: i18n.t('admin.engagement.externalSignals.navLabel'),
			icon: Link2
		},
		{
			href: '/engagement',
			label: i18n.t('admin.engagement.cohorts.navLabel'),
			icon: GraduationCap
		},
		{ href: '/tenants', label: i18n.t('admin.nav.tenantsLabel'), icon: Building2 },
		{ href: '/sales', label: i18n.t('admin.sales.navLabel'), icon: TrendingUp },
		{ href: '/data', label: i18n.t('admin.dataLine.navLabel'), icon: Database },
		{ href: '/recruitment', label: i18n.t('admin.recruitment.navLabel'), icon: UserSearch },
		{ href: '/money', label: i18n.t('admin.nav.money'), icon: Wallet },
		{ href: '/disputes', label: i18n.t('admin.nav.disputes'), icon: Scale },
		{ href: '/emails', label: i18n.t('admin.nav.emails'), icon: Mail },
		{ href: '/enterprise-kyc', label: i18n.t('admin.nav.kycEnterprises'), icon: ShieldCheck },
		{ href: '/enterprises', label: i18n.t('admin.nav.enterprises'), icon: Briefcase },
		{ href: '/contracts', label: i18n.t('admin.contracts.navLabel'), icon: FileSignature },
		{ href: '/studios', label: i18n.t('admin.studios.navLabel'), icon: UsersRound },
		{ href: '/sponsored-challenges', label: i18n.t('admin.nav.sponsorings'), icon: Megaphone },
		{ href: '/tournaments', label: i18n.t('admin.nav.tournamentsSeasons'), icon: Swords },
		{ href: '/audit-log', label: i18n.t('admin.nav.auditLabel'), icon: Clock },
		{ href: '/ops-practice', label: i18n.t('admin.opsPractice.navLabel'), icon: ServerCog },
		{ href: '/operations', label: i18n.t('admin.nav.operations'), icon: Wrench },
		{ href: '/sso-sessions', label: i18n.t('admin.nav.ssoSessions'), icon: KeyRound }
	]);

	function isActive(href: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(href + '/');
	}

	async function handleLogout() {
		try {
			await auth.logout();
		} finally {
			window.location.href = '/auth/login';
		}
	}

	// Auth is enforced by hooks.server.ts (SSR 303 to /auth/login when user is
	// null). The old client-side check here fired before the `$effect` above
	// had migrated `data.user` into the store, so it kicked out authenticated
	// users on direct navigation. Removed — SSR is the single source of truth.
</script>

<svelte:head>
	<title>Skilluv Admin</title>
</svelte:head>

<BackendStatusBanner />
<!-- Sans ce montage, les ~194 appels `toast.*` de l'app ne rendent rien : les
     succès comme les erreurs étaient avalés en silence. -->
<Toast />

{#if pathname.startsWith('/auth/')}
	<!-- Auth pages render standalone, no chrome. -->
	{@render children()}
{:else}
	<header class="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface-elevated/95 px-4 backdrop-blur">
		<a href="/" class="flex items-center gap-2 text-lg font-black tracking-tight">
			<img src="/favicon.svg" alt="" class="h-6 w-6" />
			<span><span class="text-accent">Skill</span><span class="text-text-primary">uv</span></span>
			<span class="ml-2 rounded-full border border-border bg-surface-overlay px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
				Admin
			</span>
		</a>
		<div class="flex items-center gap-3">
			{#if auth.user}
				<span class="hidden text-xs font-mono text-text-muted sm:inline">{auth.user.email}</span>
				<button
					type="button"
					onclick={handleLogout}
					class="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary"
				>
					<LogOut size={14} strokeWidth={2} />
					{i18n.t('admin.nav.signOut')}
				</button>
			{/if}
		</div>
	</header>

	<div class="flex min-h-[calc(100vh-4rem)]">
		<aside class="hidden w-52 shrink-0 border-r border-border bg-surface-elevated p-4 lg:block">
			<p class="mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.nav.administration')}
			</p>
			<nav class="flex flex-col gap-1">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors {isActive(item.href)
							? 'bg-primary/10 text-primary font-medium'
							: 'text-text-muted hover:bg-surface-overlay hover:text-text-primary'}"
					>
						<item.icon size={16} strokeWidth={2} />
						{item.label}
					</a>
				{/each}
			</nav>
		</aside>

		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
{/if}
