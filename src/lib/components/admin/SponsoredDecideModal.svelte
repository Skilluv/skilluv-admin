<script lang="ts">
	import Button from '$components/ui/Button.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Select from '$components/ui/Select.svelte';
	import { i18n, intlLocale } from '$lib/i18n';
	import type { SponsoredRequest } from '$api/admin';

	type DecideAction = 'approve' | 'reject' | 'negotiate';

	interface Props {
		open: boolean;
		target: SponsoredRequest | null;
		/** Initial action selected in the modal — mirrors the button the user clicked in the parent list. */
		initialAction: DecideAction;
		submitting?: boolean;
		onclose: () => void;
		onsubmit: (action: DecideAction, adminNotes: string) => void | Promise<void>;
	}

	let {
		open,
		target,
		initialAction,
		submitting = false,
		onclose,
		onsubmit
	}: Props = $props();

	// Local form state — the state initializer only reads a prop once so we
	// seed with a placeholder and let the `$effect` sync `initialAction` in
	// on every (re-)open, which is the correct reactive path in Svelte 5.
	let action = $state<DecideAction>('approve');
	let adminNotes = $state('');

	$effect(() => {
		if (open) {
			action = initialAction;
			adminNotes = '';
		}
	});

	function fmtEur(cents: number, currency = 'EUR'): string {
		return new Intl.NumberFormat(intlLocale(), {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(cents / 100);
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		await onsubmit(action, adminNotes.trim());
	}

	const title = $derived(
		action === 'approve'
			? i18n.t('admin.sponsored.approveTitle')
			: action === 'reject'
				? i18n.t('admin.sponsored.rejectTitle')
				: i18n.t('admin.sponsored.negotiateTitle')
	);
</script>

<Modal {open} {title} {onclose}>
	<form onsubmit={submit} class="space-y-4">
		{#if target}
			<div class="rounded-xl border border-border bg-surface-overlay p-4">
				<p class="text-xs uppercase tracking-wider text-text-muted mb-1">
					{i18n.t('admin.sponsored.requestLabel')}
				</p>
				<p class="font-bold">{target.proposed_title}</p>
				<p class="text-xs text-text-muted mt-1">
					{fmtEur(target.budget_eur_cents)} · {target.duration_days} {i18n.t('admin.sponsored.daysSuffix')} · {target.skill_domain}
				</p>
			</div>
		{/if}

		<div>
			<label for="s-action" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.actionLabel')}
			</label>
			<Select
				items={[
					{ value: 'approve', label: i18n.t('admin.common.approve') },
					{ value: 'negotiate', label: i18n.t('admin.sponsored.negotiate') },
					{ value: 'reject', label: i18n.t('admin.common.reject') }
				]}
				bind:value={action}
				class="w-full"
			/>
		</div>

		<div>
			<label for="s-notes" class="mb-1 block text-xs font-bold uppercase tracking-wider text-text-muted">
				{i18n.t('admin.sponsored.internalNotes')}
				{#if action === 'reject' || action === 'negotiate'}
					<span class="text-text-muted normal-case font-normal">
						· {i18n.t('admin.common.recommended')}
					</span>
				{/if}
			</label>
			<textarea
				id="s-notes"
				bind:value={adminNotes}
				rows="4"
				placeholder={action === 'reject'
					? i18n.t('admin.sponsored.notesRejectPlaceholder')
					: action === 'negotiate'
						? i18n.t('admin.sponsored.notesNegotiatePlaceholder')
						: i18n.t('admin.sponsored.notesDefaultPlaceholder')}
				class="w-full rounded-2xl border border-border bg-surface-overlay px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none"
			></textarea>
			<p class="mt-2 text-xs text-text-muted">{i18n.t('admin.sponsored.notesHint')}</p>
		</div>

		<div class="flex justify-end gap-2 pt-2 border-t border-border">
			<Button variant="ghost" onclick={onclose}>
				{i18n.t('admin.common.cancel')}
			</Button>
			<Button variant={action === 'reject' ? 'danger' : 'accent'} loading={submitting}>
				{action === 'approve'
					? i18n.t('admin.common.approve')
					: action === 'reject'
						? i18n.t('admin.common.reject')
						: i18n.t('admin.sponsored.negotiate')}
			</Button>
		</div>
	</form>
</Modal>
