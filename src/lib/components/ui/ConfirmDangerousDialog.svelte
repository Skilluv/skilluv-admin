<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import { i18n } from '$lib/i18n';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		actionLabel: string;
		reasonPlaceholder?: string;
		reasonHint?: string;
		requireReason?: boolean;
		minReasonLength?: number;
		loading?: boolean;
		onconfirm: (reason: string) => void | Promise<void>;
		onclose: () => void;
	}

	let {
		open,
		title,
		description,
		actionLabel,
		reasonPlaceholder,
		reasonHint,
		requireReason = true,
		minReasonLength = 4,
		loading = false,
		onconfirm,
		onclose
	}: Props = $props();

	let reason = $state('');
	let touched = $state(false);

	$effect(() => {
		if (!open) {
			reason = '';
			touched = false;
		}
	});

	let trimmed = $derived(reason.trim());
	let validationError = $derived.by(() => {
		if (!requireReason) return null;
		if (trimmed.length === 0) return i18n.t('admin.confirmDialog.reasonRequired');
		if (trimmed.length < minReasonLength)
			return i18n.t('admin.confirmDialog.reasonTooShort', { n: minReasonLength });
		return null;
	});

	let canConfirm = $derived(!loading && validationError === null);

	async function handleConfirm() {
		touched = true;
		if (!canConfirm) return;
		await onconfirm(trimmed);
	}
</script>

<Modal {open} {title} {onclose} size="md">
	<div class="flex flex-col gap-4">
		<p class="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
			{i18n.t('admin.confirmDialog.irreversible')}
		</p>

		{#if description}
			<p class="text-sm text-text-primary">{description}</p>
		{/if}

		{#if requireReason}
			<Input
				label={i18n.t('admin.confirmDialog.reasonLabel')}
				placeholder={reasonPlaceholder ?? i18n.t('admin.confirmDialog.reasonPlaceholderDefault')}
				hint={reasonHint ?? i18n.t('admin.confirmDialog.reasonHint')}
				bind:value={reason}
				oninput={() => (touched = true)}
				error={touched ? (validationError ?? undefined) : undefined}
				data-testid="confirm-dangerous-reason"
			/>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={onclose} disabled={loading}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="danger"
			size="sm"
			onclick={handleConfirm}
			disabled={!canConfirm}
			{loading}
			data-testid="confirm-dangerous-action"
		>
			{actionLabel}
		</Button>
	{/snippet}
</Modal>
