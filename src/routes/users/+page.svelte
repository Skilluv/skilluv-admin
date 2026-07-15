<script lang="ts">
	import { adminApi } from '$api/admin';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { toast } from '$stores/toast.svelte';
	import { errorMessage } from '$api/errors';
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

	let banTarget = $state<UserRow | null>(null);
	let banSubmitting = $state(false);

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
		} catch (err) {
			toast.error(errorMessage(err));
		}
		loading = false;
	}

	function search() { currentPage = 1; loadUsers(); }

	function requestBan(user: UserRow) {
		banTarget = user;
	}

	async function confirmBan(reason: string) {
		if (!banTarget) return;
		banSubmitting = true;
		try {
			await adminApi.banUser(banTarget.id, reason);
			banTarget.banned = true;
			toast.success(i18n.t('admin.userDetail.bannedToast'));
			banTarget = null;
		} catch (err) {
			toast.error(errorMessage(err));
		}
		banSubmitting = false;
	}

	async function unban(user: UserRow) {
		try {
			await adminApi.unbanUser(user.id);
			user.banned = false;
			toast.success(i18n.t('admin.userDetail.unbannedToast'));
		} catch (err) {
			toast.error(errorMessage(err));
		}
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
					{#if user.banned}
						<Button variant="primary" size="sm" onclick={() => unban(user)}>
							{i18n.t('admin.users.unbanBtn')}
						</Button>
					{:else}
						<Button variant="danger" size="sm" onclick={() => requestBan(user)}>
							{i18n.t('admin.users.banBtn')}
						</Button>
					{/if}
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

<ConfirmDangerousDialog
	open={banTarget !== null}
	title={i18n.t('admin.users.banBtn')}
	description={banTarget ? `@${banTarget.username} — ${banTarget.display_name}` : ''}
	actionLabel={i18n.t('admin.users.banBtn')}
	reasonPlaceholder={i18n.t('admin.userDetail.banPlaceholder')}
	reasonHint={i18n.t('admin.userDetail.banHint')}
	loading={banSubmitting}
	onconfirm={confirmBan}
	onclose={() => (banTarget = null)}
/>
