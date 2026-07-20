<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type { RecomputeCapabilitiesResult } from '$lib/types';
	import Badge from '$components/ui/Badge.svelte';
	import Button from '$components/ui/Button.svelte';
	import { ShieldCheck } from '@lucide/svelte';

	interface Props {
		userId: string;
		onchange?: () => void;
	}

	let { userId, onchange }: Props = $props();

	let running = $state(false);
	let lastResult = $state<RecomputeCapabilitiesResult | null>(null);

	async function run() {
		if (running) return;
		running = true;
		try {
			const res = await adminApi.recomputeUserCapabilities(userId);
			lastResult = res.data;
			toast.success(i18n.t('admin.userEnrichment.recomputeCap.successToast'));
			onchange?.();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			running = false;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<ShieldCheck size={16} strokeWidth={2} class="text-primary" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.userEnrichment.recomputeCap.sectionTitle')}
			</h2>
		</div>
		<Button variant="secondary" size="sm" onclick={run} loading={running} disabled={running}>
			<ShieldCheck size={14} strokeWidth={2} />
			{i18n.t('admin.userEnrichment.recomputeCap.runBtn')}
		</Button>
	</div>
	<p class="text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.recomputeCap.sectionHint')}
	</p>

	{#if lastResult}
		<div class="mt-4 rounded-xl border border-success bg-success-soft p-3 text-xs">
			<div class="mb-2 flex items-center gap-2">
				<Badge variant="success" size="sm">
					{lastResult.granted.length} {i18n.t('admin.userEnrichment.recomputeCap.resultGranted')}
				</Badge>
				<Badge variant="default" size="sm">
					{lastResult.already_active.length} {i18n.t('admin.userEnrichment.recomputeCap.resultAlreadyActive')}
				</Badge>
			</div>
			{#if lastResult.granted.length > 0}
				<p class="text-text-primary">
					{lastResult.granted.join(', ')}
				</p>
			{/if}
		</div>
	{/if}
</section>
