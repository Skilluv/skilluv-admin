<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Input from '$components/ui/Input.svelte';
	import Select from '$components/ui/Select.svelte';
	import { i18n } from '$lib/i18n';
	import type {
		SkillNodeAdmin,
		SkillNodeDomain,
		CreateSkillNodeBody,
		UpdateSkillNodeBody
	} from '$lib/types';

	const DOMAINS: SkillNodeDomain[] = [
		'code',
		'design',
		'game',
		'security',
		'soft_skills',
		'ai',
		'ops'
	];

	// Discriminated mode: create wants everything, edit is scoped to mutable
	// fields (slug is immutable and displayed in the title only).
	type Mode = { kind: 'create' } | { kind: 'edit'; target: SkillNodeAdmin };

	interface Props {
		open: boolean;
		mode: Mode;
		submitting?: boolean;
		onclose: () => void;
		/** Payload varies by mode; parent narrows via the mode.kind it passed in. */
		onsubmit: (body: CreateSkillNodeBody | UpdateSkillNodeBody) => void | Promise<void>;
	}

	let { open, mode, submitting = false, onclose, onsubmit }: Props = $props();

	// Local form state — reset every time `open` flips true so switching between
	// two edit targets doesn't leak the previous form values.
	let slug = $state('');
	let displayName = $state('');
	let description = $state('');
	let domain = $state<SkillNodeDomain>('code');
	let parentId = $state('');
	let clearParent = $state(false);
	let aliasesRaw = $state('');
	let externalRefsRaw = $state('');
	let isSkilluv = $state(false);
	let touched = $state(false);

	$effect(() => {
		if (!open) return;
		touched = false;
		if (mode.kind === 'create') {
			slug = '';
			displayName = '';
			description = '';
			domain = 'code';
			parentId = '';
			clearParent = false;
			aliasesRaw = '';
			externalRefsRaw = '';
			isSkilluv = false;
		} else {
			// Edit mode. `SkillNodeAdmin` doesn't carry aliases or external_refs
			// so we leave those two textareas empty — a submit with an empty
			// value maps back to `undefined` in `parseAliases` / `parseExternalRefs`,
			// which the backend interprets as "keep the stored value untouched".
			const t = mode.target;
			slug = t.slug;
			displayName = t.display_name;
			description = t.description ?? '';
			domain = t.domain;
			parentId = t.parent_id ?? '';
			clearParent = false;
			aliasesRaw = '';
			externalRefsRaw = '';
			isSkilluv = t.is_skilluv_specific;
		}
	});

	const slugError = $derived.by(() => {
		if (mode.kind === 'edit') return null; // slug is immutable in edit mode
		if (!touched) return null;
		const s = slug.trim();
		if (s.length < 2 || s.length > 80) return i18n.t('admin.skills.create.slugHint');
		if (!/^[a-z0-9_-]+$/.test(s)) return i18n.t('admin.skills.create.slugHint');
		return null;
	});

	const externalRefsError = $derived.by(() => {
		const raw = externalRefsRaw.trim();
		if (raw === '') return null;
		if (mode.kind === 'create' && !touched) return null;
		try {
			const parsed = JSON.parse(raw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.skills.create.externalRefsInvalidJson');
		} catch {
			return i18n.t('admin.skills.create.externalRefsInvalidJson');
		}
		return null;
	});

	const canSubmit = $derived.by(() => {
		if (submitting) return false;
		if (externalRefsError !== null) return false;
		if (mode.kind === 'create') {
			return (
				slug.trim().length > 0 && displayName.trim().length > 0 && slugError === null
			);
		}
		return displayName.trim().length > 0;
	});

	function parseAliases(): string[] {
		return aliasesRaw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	function parseExternalRefs(): Record<string, unknown> | undefined {
		const raw = externalRefsRaw.trim();
		if (raw === '') return undefined;
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return undefined;
		}
	}

	async function handleSubmit() {
		if (!canSubmit) return;
		if (mode.kind === 'create') {
			const body: CreateSkillNodeBody = {
				slug: slug.trim(),
				display_name: displayName.trim(),
				description: description.trim() || undefined,
				domain,
				parent_id: parentId.trim() || undefined,
				aliases: parseAliases(),
				external_refs: parseExternalRefs(),
				is_skilluv_specific: isSkilluv
			};
			await onsubmit(body);
		} else {
			const body: UpdateSkillNodeBody = {
				display_name: displayName.trim(),
				description: description.trim() || undefined,
				domain,
				parent_id: clearParent ? null : parentId.trim() || undefined,
				aliases: parseAliases(),
				external_refs: parseExternalRefs(),
				is_skilluv_specific: isSkilluv
			};
			await onsubmit(body);
		}
	}

	const title = $derived(
		mode.kind === 'create'
			? i18n.t('admin.skills.create.title')
			: `${i18n.t('admin.skills.edit.title')} — ${mode.target.slug}`
	);
</script>

<Modal {open} {title} {onclose} size="lg">
	<div class="flex flex-col gap-4">
		{#if mode.kind === 'create'}
			<Input
				label={i18n.t('admin.skills.create.slugLabel')}
				hint={i18n.t('admin.skills.create.slugHint')}
				bind:value={slug}
				oninput={() => (touched = true)}
				error={slugError ?? undefined}
				placeholder="react-hooks"
			/>
		{/if}
		<Input
			label={i18n.t('admin.skills.create.displayNameLabel')}
			bind:value={displayName}
			oninput={() => (touched = true)}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.descriptionLabel')}
			</label>
			<textarea
				id="skill-desc"
				bind:value={description}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-text-primary">
					{i18n.t('admin.skills.create.domainLabel')}
				</span>
				<Select
					items={DOMAINS.map((d) => ({ value: d, label: i18n.t(`admin.catalog.domains.${d}`) }))}
					bind:value={domain}
					shape="rounded"
				/>
			</div>
			<Input
				label={i18n.t('admin.skills.create.parentIdLabel')}
				hint={mode.kind === 'edit'
					? i18n.t('admin.skills.edit.parentIdHint')
					: i18n.t('admin.skills.create.parentIdHint')}
				bind:value={parentId}
				disabled={mode.kind === 'edit' && clearParent}
				placeholder="00000000-0000-0000-0000-000000000000"
			/>
		</div>
		{#if mode.kind === 'edit'}
			<label class="flex items-center gap-2 text-sm text-text-primary">
				<input
					type="checkbox"
					bind:checked={clearParent}
					class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
				/>
				{i18n.t('admin.skills.edit.clearParentLabel')}
			</label>
		{/if}
		<Input
			label={i18n.t('admin.skills.create.aliasesLabel')}
			hint={i18n.t('admin.skills.create.aliasesHint')}
			bind:value={aliasesRaw}
		/>
		<div class="flex flex-col gap-1.5">
			<label for="skill-refs" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.skills.create.externalRefsLabel')}
			</label>
			<textarea
				id="skill-refs"
				bind:value={externalRefsRaw}
				oninput={() => (touched = true)}
				rows="3"
				placeholder="{'{}'}"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if externalRefsError}
				<p class="text-xs text-error">{externalRefsError}</p>
			{:else if mode.kind === 'create'}
				<p class="text-xs text-text-muted">{i18n.t('admin.skills.create.externalRefsHint')}</p>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={isSkilluv}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.skills.create.isSkilluvSpecificLabel')}
		</label>
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={onclose} disabled={submitting}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={handleSubmit}
			disabled={!canSubmit}
			loading={submitting}
		>
			{mode.kind === 'create'
				? i18n.t('admin.skills.create.submit')
				: i18n.t('admin.skills.edit.submit')}
		</Button>
	{/snippet}
</Modal>
