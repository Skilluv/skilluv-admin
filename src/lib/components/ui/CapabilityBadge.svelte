<script lang="ts">
	import type { Capability } from '$lib/types';
	import Badge from './Badge.svelte';
	import { i18n } from '$lib/i18n';

	interface Props {
		capability: Capability;
		size?: 'sm' | 'md';
	}

	let { capability, size = 'sm' }: Props = $props();

	// Grouping by family — colours reuse existing Badge variants so we stay
	// inside the design system and pick up theme changes automatically.
	const FAMILY: Record<Capability, 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'default'> = {
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

	let variant = $derived(FAMILY[capability]);
	let label = $derived(i18n.t(`admin.capabilities.names.${capability}`));
</script>

<Badge {variant} {size}>{label}</Badge>
