<script lang="ts">
	import { adminApi } from '$api/admin';
	import { errorMessage } from '$api/errors';
	import { toast } from '$stores/toast.svelte';
	import { i18n } from '$lib/i18n';
	import type { CreateBadgeEventBody } from '$lib/types';
	import Button from '$components/ui/Button.svelte';
	import Input from '$components/ui/Input.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Badge from '$components/ui/Badge.svelte';
	import { Plus, CalendarDays, Info } from '@lucide/svelte';

	// --- Create dialog state ---
	let showCreate = $state(false);
	let creating = $state(false);
	let createSlug = $state('');
	let createName = $state('');
	let createDescription = $state('');
	let createStartsAt = $state('');
	let createEndsAt = $state('');
	let createVisualThemeRaw = $state('');
	let createIsPartner = $state(false);
	let createTouched = $state(false);

	const slugError = $derived.by(() => {
		if (!createTouched) return null;
		const s = createSlug.trim();
		if (s.length < 3 || s.length > 60) return i18n.t('admin.catalog.events.create.slugHint');
		if (!/^[a-z0-9-]+$/.test(s)) return i18n.t('admin.catalog.events.create.slugHint');
		return null;
	});
	const visualThemeError = $derived.by(() => {
		if (!createTouched || createVisualThemeRaw.trim() === '') return null;
		try {
			const parsed = JSON.parse(createVisualThemeRaw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
				return i18n.t('admin.catalog.badgeRules.create.conditionsInvalidRoot');
		} catch {
			return i18n.t('admin.catalog.events.create.visualThemeInvalidJson');
		}
		return null;
	});
	const canCreate = $derived(
		!creating &&
			createSlug.trim().length > 0 &&
			createName.trim().length > 0 &&
			createStartsAt.length > 0 &&
			slugError === null &&
			visualThemeError === null
	);

	function openCreate() {
		createSlug = '';
		createName = '';
		createDescription = '';
		createStartsAt = '';
		createEndsAt = '';
		createVisualThemeRaw = '';
		createIsPartner = false;
		createTouched = false;
		showCreate = true;
	}

	function toRfc3339(local: string): string {
		// datetime-local returns "YYYY-MM-DDTHH:mm"
		return new Date(local).toISOString();
	}

	async function submitCreate() {
		createTouched = true;
		if (!canCreate) return;
		creating = true;
		try {
			const body: CreateBadgeEventBody = {
				slug: createSlug.trim(),
				name: createName.trim(),
				description: createDescription.trim() || undefined,
				starts_at: toRfc3339(createStartsAt),
				ends_at: createEndsAt ? toRfc3339(createEndsAt) : undefined,
				visual_theme:
					createVisualThemeRaw.trim() === '' ? undefined : JSON.parse(createVisualThemeRaw),
				is_partner: createIsPartner
			};
			await adminApi.createBadgeEvent(body);
			toast.success(i18n.t('admin.catalog.events.create.successToast'));
			showCreate = false;
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-xs text-text-muted">{i18n.t('admin.catalog.events.subtitle')}</p>
		<Button variant="primary" size="sm" onclick={openCreate}>
			<Plus size={14} strokeWidth={2} />
			{i18n.t('admin.catalog.events.createBtn')}
		</Button>
	</div>

	<div class="rounded-2xl border border-border bg-surface-elevated p-6">
		<div class="flex items-start gap-3">
			<div class="rounded-xl bg-primary/15 p-2 text-primary">
				<CalendarDays size={18} strokeWidth={2} />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm text-text-primary">
					{i18n.t('admin.catalog.events.subtitle')}
				</p>
				<p class="mt-2 flex items-start gap-2 text-xs text-text-muted">
					<Info size={12} strokeWidth={2} class="mt-0.5 shrink-0" />
					<span>
						Le back n'expose pas encore de <code class="font-mono">GET /admin/badge-events</code> ;
						cette section est en création seule. La liste consultable arrivera avec ADM-M8.
					</span>
				</p>
			</div>
		</div>
	</div>
</div>

<Modal
	open={showCreate}
	title={i18n.t('admin.catalog.events.create.title')}
	onclose={() => (showCreate = false)}
	size="lg"
>
	<div class="flex flex-col gap-4">
		<Input
			label={i18n.t('admin.catalog.events.create.slugLabel')}
			hint={i18n.t('admin.catalog.events.create.slugHint')}
			bind:value={createSlug}
			oninput={() => (createTouched = true)}
			error={slugError ?? undefined}
			placeholder="hacktoberfest-2026"
		/>
		<Input
			label={i18n.t('admin.catalog.events.create.nameLabel')}
			bind:value={createName}
			oninput={() => (createTouched = true)}
			placeholder="Hacktoberfest 2026"
		/>
		<div class="flex flex-col gap-1.5">
			<label for="event-desc" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.events.create.descriptionLabel')}
			</label>
			<textarea
				id="event-desc"
				bind:value={createDescription}
				rows="2"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<label for="event-start" class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.events.create.startsAtLabel')}
				</label>
				<input
					id="event-start"
					type="datetime-local"
					bind:value={createStartsAt}
					class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="event-end" class="text-sm font-medium text-text-primary">
					{i18n.t('admin.catalog.events.create.endsAtLabel')}
				</label>
				<input
					id="event-end"
					type="datetime-local"
					bind:value={createEndsAt}
					class="h-11 w-full rounded-xl border border-border bg-surface-elevated px-4 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
				/>
				<p class="text-xs text-text-muted">
					{i18n.t('admin.catalog.events.create.endsAtHint')}
				</p>
			</div>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="event-theme" class="text-sm font-medium text-text-primary">
				{i18n.t('admin.catalog.events.create.visualThemeLabel')}
			</label>
			<textarea
				id="event-theme"
				bind:value={createVisualThemeRaw}
				oninput={() => (createTouched = true)}
				rows="3"
				placeholder="{'{}'}"
				class="w-full rounded-xl border border-border bg-surface-elevated px-4 py-2.5 font-mono text-xs text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
			></textarea>
			{#if visualThemeError}
				<p class="text-xs text-error">{visualThemeError}</p>
			{:else}
				<p class="text-xs text-text-muted">
					{i18n.t('admin.catalog.events.create.visualThemeHint')}
				</p>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-text-primary">
			<input
				type="checkbox"
				bind:checked={createIsPartner}
				class="h-4 w-4 rounded border-border bg-surface-elevated text-primary focus:ring-primary"
			/>
			{i18n.t('admin.catalog.events.create.isPartnerLabel')}
		</label>
		{#if createIsPartner}
			<Badge variant="accent" size="sm">
				{i18n.t('admin.catalog.events.partnerYes')}
			</Badge>
		{/if}
	</div>

	{#snippet actions()}
		<Button variant="secondary" size="sm" onclick={() => (showCreate = false)} disabled={creating}>
			{i18n.t('admin.common.cancel')}
		</Button>
		<Button variant="primary" size="sm" onclick={submitCreate} disabled={!canCreate} loading={creating}>
			{i18n.t('admin.catalog.events.create.submit')}
		</Button>
	{/snippet}
</Modal>
