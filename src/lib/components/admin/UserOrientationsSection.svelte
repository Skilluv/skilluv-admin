<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type { UserOrientationEntry } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Skeleton from '$components/ui/Skeleton.svelte';
	import { Compass, Star } from '@lucide/svelte';

	interface Props {
		userId: string;
		refreshKey?: number;
	}

	let { userId, refreshKey = 0 }: Props = $props();

	let orientations = $state<UserOrientationEntry[]>([]);
	let loading = $state(true);

	$effect(() => {
		void refreshKey;
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await adminApi.getUserOrientations(userId);
			orientations = res.data.orientations;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			loading = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(
				i18n.locale === 'ar' ? 'ar' : i18n.locale === 'fr' ? 'fr-FR' : 'en-US',
				{ day: '2-digit', month: 'short', year: 'numeric' }
			);
		} catch {
			return iso;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center gap-2">
		<Compass size={16} strokeWidth={2} class="text-primary" />
		<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
			{i18n.t('admin.userEnrichment.orientations.sectionTitle')}
		</h2>
	</div>

	<p class="mb-4 text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.orientations.sectionHint')}
	</p>

	{#if loading}
		<div class="flex flex-col gap-2">
			<Skeleton class="h-10 w-full" rounded="xl" />
			<Skeleton class="h-10 w-full" rounded="xl" />
		</div>
	{:else if orientations.length === 0}
		<p class="rounded-xl border border-border bg-surface-overlay px-4 py-6 text-center text-sm text-text-muted">
			{i18n.t('admin.userEnrichment.orientations.empty')}
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each orientations as o (o.orientation_slug)}
				<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-overlay px-3 py-2">
					<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						{#if o.is_primary}
							<Badge variant="accent" size="sm">
								<Star size={11} strokeWidth={2} />
								{i18n.t('admin.userEnrichment.orientations.primaryBadge')}
							</Badge>
						{/if}
						<span class="font-medium text-text-primary">{o.orientation_name}</span>
						<code class="font-mono text-xs text-text-muted">{o.orientation_slug}</code>
						<Badge variant={o.mode === 'active' ? 'success' : 'default'} size="sm">
							{i18n.t(`admin.userEnrichment.orientations.mode${o.mode === 'active' ? 'Active' : 'Learning'}`)}
						</Badge>
					</div>
					<span class="text-xs text-text-muted">
						{i18n.t('admin.userEnrichment.orientations.pickedAt')} {fmtDate(o.picked_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
