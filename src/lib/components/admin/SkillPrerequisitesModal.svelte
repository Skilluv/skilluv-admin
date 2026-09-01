<script lang="ts">
	import { i18n } from '$lib/i18n';
	import type { SkillCatalogEntry, SkillNodeAdmin } from '$lib/types';
	import Modal from '$components/ui/Modal.svelte';
	import Button from '$components/ui/Button.svelte';
	import MultiSelect from '$components/ui/MultiSelect.svelte';

	// SKI-47 — prerequisite editor. PUT sends the complete list: a partial
	// update of a set that gates the whole tree is easy to get subtly wrong,
	// so the form mirrors that and always submits everything selected.
	//
	// The catalog and the current selection come from the parent, which
	// already holds both — this component stays a form.

	interface Props {
		open: boolean;
		skill: SkillNodeAdmin | null;
		/** Every skill that can be a prerequisite, minus the edited one. */
		catalog: SkillCatalogEntry[];
		/** Prerequisites already recorded for `skill`. */
		currentIds: string[];
		submitting?: boolean;
		onclose: () => void;
		onsubmit: (prerequisiteSkillIds: string[]) => void | Promise<void>;
	}

	let {
		open,
		skill,
		catalog,
		currentIds,
		submitting = false,
		onclose,
		onsubmit
	}: Props = $props();

	const MAX_PREREQUISITES = 20;

	let selected = $state<string[]>([]);

	// Re-seed on every open so a cancelled edit never leaks into the next
	// skill's form.
	$effect(() => {
		if (open) selected = [...currentIds];
	});

	const items = $derived(
		catalog
			.filter((c) => c.id !== skill?.id)
			.map((c) => ({ value: c.id, label: `${c.display_name} (${c.slug})` }))
	);

	const tooMany = $derived(selected.length > MAX_PREREQUISITES);

	function submit() {
		if (submitting || tooMany) return;
		void onsubmit(selected);
	}
</script>

<Modal
	{open}
	title={skill
		? `${i18n.t('admin.engagement.prerequisites.modalTitle')} — ${skill.display_name}`
		: i18n.t('admin.engagement.prerequisites.modalTitle')}
	size="xl"
	{onclose}
>
	<div class="flex flex-col gap-4">
		<p class="text-xs text-text-muted">
			{i18n.t('admin.engagement.prerequisites.modalHint')}
		</p>

		<div class="flex flex-col gap-1.5">
			<span class="text-xs font-medium uppercase tracking-wider text-text-muted">
				{i18n.t('admin.engagement.prerequisites.selectLabel')}
			</span>
			<MultiSelect
				items={items}
				bind:value={selected}
				searchable
				searchPlaceholder={i18n.t('admin.engagement.prerequisites.selectPlaceholder')}
				placeholder={i18n.t('admin.engagement.prerequisites.selectPlaceholder')}
				shape="rounded"
				maxChips={4}
			/>
			<p class="text-xs text-text-muted">
				{i18n.t('admin.engagement.prerequisites.currentCount', { count: selected.length })}
				· {i18n.t('admin.engagement.prerequisites.maxHint')}
			</p>
			{#if selected.length === 0}
				<p class="text-xs text-warning">
					{i18n.t('admin.engagement.prerequisites.emptyClears')}
				</p>
			{/if}
			{#if tooMany}
				<p class="text-xs text-error">
					{i18n.t('admin.engagement.prerequisites.maxHint')}
				</p>
			{/if}
		</div>
	</div>

	{#snippet actions()}
		<Button variant="ghost" size="sm" onclick={onclose}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submit} loading={submitting} disabled={tooMany}>
			{i18n.t('admin.engagement.prerequisites.submitBtn')}
		</Button>
	{/snippet}
</Modal>
