<script lang="ts">
	import { adminApi } from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { i18n } from '$lib/i18n';

	interface UserRow {
		id: string; username: string; display_name: string; email: string;
		role: string; skill_domain: string; title: string; total_fragments: number;
		profile_active: boolean; banned: boolean; created_at: string;
	}

	let users = $state<UserRow[]>([]);
	let loading = $state(true);
	let query = $state('');
	let filterBanned = $state<boolean | undefined>(undefined);
	let currentPage = $state(1);
	let totalPages = $state(1);

	$effect(() => { loadUsers(); });

	async function loadUsers() {
		loading = true;
		try {
			const res = await adminApi.listUsers({
				q: query || undefined,
				banned: filterBanned,
				page: currentPage,
				per_page: 20
			});
			users = res.data as UserRow[];
			totalPages = res.pagination.total_pages;
		} catch { /* silent */ }
		loading = false;
	}

	function search() { currentPage = 1; loadUsers(); }

	async function toggleBan(user: UserRow) {
		try {
			if (user.banned) {
				await adminApi.unbanUser(user.id);
				user.banned = false;
			} else {
				const reason = prompt(i18n.t('admin.users.banReason'));
				if (!reason) return;
				await adminApi.banUser(user.id, reason);
				user.banned = true;
			}
		} catch { /* silent */ }
	}
</script>

<svelte:head>
	<title>{i18n.t('admin.users.title')} — Admin Skilluv</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<h1 class="mb-6 text-2xl font-bold">{i18n.t('admin.users.title')}</h1>

	<div class="mb-4 flex gap-3">
		<div class="flex-1"><Input placeholder={i18n.t('admin.users.searchPlaceholder')} bind:value={query} /></div>
		<Button variant="primary" size="sm" onclick={search}>{i18n.t('admin.users.searchBtn')}</Button>
	</div>

	{#if loading}
		<div class="flex flex-col gap-2">{#each Array(5) as _}<Skeleton class="h-14 w-full" rounded="xl" />{/each}</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border border-border">
			{#each users as user}
				<div class="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0 {user.banned ? 'opacity-50' : ''}">
					<div class="flex-1">
						<div class="flex items-center gap-2">
							<a href="/users/{user.id}" class="font-medium hover:text-accent">{user.display_name}</a>
							<span class="text-xs text-text-muted">@{user.username}</span>
							{#if user.banned}<Badge variant="error">{i18n.t('admin.users.banned')}</Badge>{/if}
						</div>
						<div class="flex gap-2 text-xs text-text-muted">
							<Badge variant={user.skill_domain as any}>{user.skill_domain}</Badge>
							<span class="capitalize">{user.title}</span>
							<span>{user.total_fragments} ◆</span>
						</div>
					</div>
					<Button
						variant={user.banned ? 'primary' : 'danger'}
						size="sm"
						onclick={() => toggleBan(user)}
					>
						{user.banned ? i18n.t('admin.users.unbanBtn') : i18n.t('admin.users.banBtn')}
					</Button>
				</div>
			{/each}
		</div>

		{#if totalPages > 1}
			<div class="mt-4 flex items-center justify-center gap-4">
				<Button variant="ghost" size="sm" disabled={currentPage <= 1} onclick={() => { currentPage--; loadUsers(); }}>←</Button>
				<span class="text-sm text-text-muted">{currentPage}/{totalPages}</span>
				<Button variant="ghost" size="sm" disabled={currentPage >= totalPages} onclick={() => { currentPage++; loadUsers(); }}>→</Button>
			</div>
		{/if}
	{/if}
</div>
