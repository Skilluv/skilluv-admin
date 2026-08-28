<script lang="ts">
	import type { Capability, PlainCapability } from '$lib/types';
	import Badge from './Badge.svelte';
	import { i18n } from '$lib/i18n';

	interface Props {
		capability: Capability;
		size?: 'sm' | 'md';
	}

	let { capability, size = 'sm' }: Props = $props();

	type Variant = 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'default';

	/** Scoped capabilities carry their scope after a colon — a validator
	 *  domain (migration 0120) or a reviewer group (0176, 0210, 0229). They
	 *  are handled by prefix rather than spelled out forty-odd times below,
	 *  and each family gets its own colour so a design reviewer is not
	 *  mistaken for a code one at a glance. */
	const SCOPED_FAMILIES: Record<string, { variant: Variant; labelKey: string }> = {
		challenge_validator: { variant: 'accent', labelKey: 'admin.capabilities.validatorPrefix' },
		code_reviewer: { variant: 'primary', labelKey: 'admin.capabilities.families.code_reviewer' },
		ai_reviewer: { variant: 'success', labelKey: 'admin.capabilities.families.ai_reviewer' },
		design_reviewer: {
			variant: 'warning',
			labelKey: 'admin.capabilities.families.design_reviewer'
		}
	};

	// Grouping by family — colours reuse existing Badge variants so we stay
	// inside the design system and pick up theme changes automatically.
	const FAMILY: Record<PlainCapability, Variant> = {
		challenger: 'default',
		mentor: 'primary',
		project_steward: 'primary',
		pr_reviewer: 'primary',
		bounty_funder: 'success',
		issue_proposer: 'success',
		jury_tournament: 'accent',
		admin: 'error',
		enterprise_recruiter: 'accent',
		community_moderator: 'warning',
		forum_moderator: 'warning',
		plagiarism_reviewer: 'warning',
		kyc_reviewer: 'warning',
		community_curator: 'primary',
		verified_apprentice: 'success',
		apprentice_verifier: 'primary'
	};

	/** Split once: everything downstream needs both halves or neither. */
	let scoped = $derived.by(() => {
		const colon = capability.indexOf(':');
		if (colon === -1) return null;
		const family = capability.slice(0, colon);
		const spec = SCOPED_FAMILIES[family];
		return spec ? { spec, scope: capability.slice(colon + 1) } : null;
	});

	let variant = $derived<Variant>(
		scoped ? scoped.spec.variant : (FAMILY[capability as PlainCapability] ?? 'default')
	);

	// Scoped capabilities carry their domain or reviewer group in the slug.
	// Those slugs are the values an admin reasons about — `orientations
	// .reviewer_group` holds the same string — so they render as-is rather
	// than through a per-locale table that would have to be kept in sync with
	// migrations 0120, 0176, 0210 and 0229.
	let label = $derived(
		scoped ? `${i18n.t(scoped.spec.labelKey)} ${scoped.scope}` : i18n.t(`admin.capabilities.names.${capability}`)
	);
</script>

<Badge {variant} {size}>{label}</Badge>
