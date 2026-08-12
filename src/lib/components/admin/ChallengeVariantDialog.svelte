<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import { i18n } from '$lib/i18n';
	import type { Challenge } from '$types';

	type VariantType = 'harder' | 'easier';

	interface Props {
		open: boolean;
		/** The published challenge the variant will be derived from. */
		source: Challenge | null;
		submitting?: boolean;
		onclose: () => void;
		onsubmit: (body: { variant_type: VariantType; target_param?: string }) => void | Promise<void>;
	}

	let { open, source, submitting = false, onclose, onsubmit }: Props = $props();

	let variantType = $state<VariantType>('harder');
	let targetParam = $state('');

	$effect(() => {
		if (open) {
			variantType = 'harder';
			targetParam = '';
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		await onsubmit({
			variant_type: variantType,
			target_param: targetParam.trim() || undefined
		});
	}
</script>

<Modal
	{open}
	title={i18n.t('admin.variant.dialogTitle')}
	{onclose}
>
	<form onsubmit={submit} class="space-y-4">
		{#if source}
			<div class="rounded-xl border border-border bg-surface-overlay p-4">
				<p class="text-xs uppercase tracking-wider text-text-muted mb-1">
					{i18n.t('admin.challenges.editTitle')}
				</p>
				<p class="font-bold">{source.title}</p>
				<p class="mt-1 text-xs text-text-muted">
					{source.skill_domain} · {i18n.t('admin.challenges.difficulty')} {source.difficulty}
				</p>
			</div>
		{/if}

		<div>
			<label for="variant-type" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.variant.typeLabel')}
			</label>
			<Select
				items={[
					{ value: 'harder', label: i18n.t('admin.variant.typeHarder') },
					{ value: 'easier', label: i18n.t('admin.variant.typeEasier') }
				]}
				bind:value={variantType}
				class="w-full"
			/>
		</div>

		<Input
			label={i18n.t('admin.variant.targetParamLabel')}
			hint={i18n.t('admin.variant.targetParamHint')}
			bind:value={targetParam}
		/>

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={onclose}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant="accent" loading={submitting}>
				{i18n.t('admin.variant.submit')}
			</Button>
		</div>
	</form>
</Modal>
