<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import Button from '$components/ui/Button.svelte';
	import ConfirmDangerousDialog from '$components/ui/ConfirmDangerousDialog.svelte';
	import { Download } from '@lucide/svelte';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let showConfirm = $state(false);
	let submitting = $state(false);

	async function confirmTrigger(reason: string) {
		if (submitting) return;
		submitting = true;
		try {
			await adminApi.triggerUserGdprExport(userId, { reason });
			toast.success(i18n.t('admin.userEnrichment.gdpr.queuedToast'));
			showConfirm = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			submitting = false;
		}
	}
</script>

<section class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Download size={16} strokeWidth={2} class="text-accent" />
			<h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.userEnrichment.gdpr.sectionTitle')}
			</h2>
		</div>
		<Button variant="secondary" size="sm" onclick={() => (showConfirm = true)}>
			<Download size={14} strokeWidth={2} />
			{i18n.t('admin.userEnrichment.gdpr.triggerBtn')}
		</Button>
	</div>
	<p class="text-xs text-text-muted">
		{i18n.t('admin.userEnrichment.gdpr.sectionHint')}
	</p>
</section>

<ConfirmDangerousDialog
	open={showConfirm}
	title={i18n.t('admin.userEnrichment.gdpr.dialogTitle')}
	description={i18n.t('admin.userEnrichment.gdpr.dialogDescription')}
	actionLabel={i18n.t('admin.userEnrichment.gdpr.triggerBtn')}
	reasonPlaceholder={i18n.t('admin.userEnrichment.gdpr.reasonPlaceholder')}
	requireReason={true}
	minReasonLength={8}
	loading={submitting}
	onconfirm={(reason) => confirmTrigger(reason)}
	onclose={() => (showConfirm = false)}
/>
