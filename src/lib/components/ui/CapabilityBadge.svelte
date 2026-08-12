<script lang="ts">
	import type { Capability } from '$lib/types';
	import Badge from './Badge.svelte';
	import { i18n } from '$lib/i18n';

	interface Props {
		capability: Capability;
		size?: 'sm' | 'md';
	}

	let { capability, size = 'sm' }: Props = $props();

	type Variant = 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'default';

	/** P26 v2 SKI-80 — `challenge_validator:{domain}` is one enum value per
	 *  domain rather than a single capability, so it is handled by prefix
	 *  instead of being spelled out seven times in every map below. */
	const VALIDATOR_PREFIX = 'challenge_validator:';

	// Grouping by family — colours reuse existing Badge variants so we stay
	// inside the design system and pick up theme changes automatically.
	const FAMILY: Record<
		Exclude<Capability, `${typeof VALIDATOR_PREFIX}${string}`>,
		Variant
	> = {
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
		community_curator: 'primary'
	};

	let isValidator = $derived(capability.startsWith(VALIDATOR_PREFIX));
	let variant = $derived<Variant>(
		isValidator
			? 'accent'
			: FAMILY[capability as Exclude<Capability, `${typeof VALIDATOR_PREFIX}${string}`>]
	);
	// Validator capabilities carry their domain in the slug; the domain names
	// are proper nouns backend-side, so they render as-is rather than through
	// a per-locale table that would have to be kept in sync with migration 0120.
	let label = $derived(
		isValidator
			? `${i18n.t('admin.capabilities.validatorPrefix')} ${capability.slice(VALIDATOR_PREFIX.length)}`
			: i18n.t(`admin.capabilities.names.${capability}`)
	);
</script>

<Badge {variant} {size}>{label}</Badge>
