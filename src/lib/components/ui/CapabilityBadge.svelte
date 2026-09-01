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
		},
		security_reviewer: {
			variant: 'error',
			labelKey: 'admin.capabilities.families.security_reviewer'
		},
		domain_curator: {
			variant: 'primary',
			labelKey: 'admin.capabilities.families.domain_curator'
		}
	};

	// Grouping by family — colours reuse existing Badge variants so we stay
	// inside the design system and pick up theme changes automatically.
	//
	// Keyed by `string`, not by a union of every capability: the catalogue is
	// a table and partly generated, so this cannot be exhaustive and must not
	// pretend to be. An unlisted capability falls through to `default`, which
	// is a duller badge and not a broken screen.
	const FAMILY: Record<string, Variant> = {
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
		apprentice_verifier: 'primary',
		mission_arbiter: 'error',
		security_triager: 'error',
		sre: 'accent',
		featured_ops_engineer: 'accent'
	};

	/**
	 * Translate, or fall back to the slug.
	 *
	 * `i18n.t` returns the key it was given when nothing matches, so a
	 * capability the catalogue grew since the last locale pass would render
	 * as `admin.capabilities.names.foo` on the badge. The slug is a worse
	 * label than a translation and a much better one than a dotted key — and
	 * it is the value the operator is reasoning about anyway.
	 */
	function tr(key: string, fallback: string): string {
		const out = i18n.t(key);
		return out === key ? fallback : out;
	}

	/** Split once: everything downstream needs both halves or neither.
	 *
	 * A colon is enough to make a capability scoped. The family does not have
	 * to be one this file knows: the catalogue gains
	 * `{domain}_reviewer:{family}` rows whenever a trade is added, and those
	 * must render as a scope rather than fall through to a missing name key.
	 */
	let scoped = $derived.by(() => {
		const colon = capability.indexOf(':');
		if (colon === -1) return null;
		const family = capability.slice(0, colon);
		return { family, spec: SCOPED_FAMILIES[family], scope: capability.slice(colon + 1) };
	});

	let variant = $derived<Variant>(
		scoped ? (scoped.spec?.variant ?? 'default') : (FAMILY[capability] ?? 'default')
	);

	// Scoped capabilities carry their domain or reviewer group in the slug.
	// Those slugs are the values an admin reasons about — `orientations
	// .reviewer_group` holds the same string — so they render as-is rather
	// than through a per-locale table that would have to be kept in sync with
	// every migration that adds a trade.
	let label = $derived.by(() => {
		if (!scoped) return tr(`admin.capabilities.names.${capability}`, capability);
		const familyLabel = scoped.spec
			? i18n.t(scoped.spec.labelKey)
			: tr(`admin.capabilities.families.${scoped.family}`, scoped.family);
		return `${familyLabel} ${scoped.scope}`;
	});
</script>

<Badge {variant} {size}>{label}</Badge>
