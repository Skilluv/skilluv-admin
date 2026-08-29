/**
 * The game domain's reviewer surface.
 *
 * Re-exported by `types/index.ts`, so `$lib/types` stays the one import path.
 *
 * ## Who may do what
 *
 * Not one gate but two, and the split matters enough that the screens show
 * it. Reviewing work — validating a slice, judging a mod, issuing a
 * reviewer-confirmed attestation, opening a jam — is open to any
 * `game_reviewer:{family}` capability, `game_reviewer:all`, or `admin`.
 * Finalising a jam and featuring a creator are editorial acts and are
 * `admin` only. The people who judge the work are not the people who run the
 * platform.
 *
 * The reviewer families are derived rows in `capability_catalog`, written by
 * the orientations trigger of migration 0404 — so they are not enumerated
 * here either. See the note on `Capability`.
 */

/** `game_mods.status`. A mod starts `registered` and waits on a reviewer. */
export type GameModStatus = 'registered' | 'confirmed' | 'refused';

export interface GameMod {
	id: string;
	author_user_id: string;
	/** Set when the mod was produced against a slice, null when it was
	 *  registered on its own. */
	slice_id: string | null;
	title: string;
	target_game: string;
	target_platform: string;
	external_hosting_url: string;
	/** Declared by the author, corrected by a reviewer. It is a number from
	 *  a site Skilluv does not control, which is exactly why a reviewer can
	 *  overwrite it rather than it being read-only. */
	external_downloads_count: number;
	description_md: string;
	status: GameModStatus;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_reason: string | null;
	registered_at: string;
}

/** `services::game_jams::JAM_KINDS`. */
export type GameJamKind = 'game_jam_48h' | 'game_jam_72h' | 'game_jam_week';

export interface GameJam {
	id: string;
	/** A jam is a tournament underneath — the ranking, the submissions and
	 *  the conclusion all live there. */
	tournament_id: string;
	theme: string;
	theme_revealed_at: string | null;
	submission_deadline: string;
	voting_deadline: string;
	/** Free-form JSON: a list of axis names, or whatever the organiser set. */
	scoring_axes: unknown;
	solo_or_team: string;
	team_size_max: number;
}

export interface CreateJamInput {
	kind: GameJamKind;
	slug: string;
	name: string;
	description?: string;
	theme: string;
	starts_at: string;
	ends_at: string;
	submission_deadline: string;
	voting_deadline: string;
	scoring_axes?: string[];
	solo_or_team?: string;
	team_size_max?: number;
}

/** What closing a jam did. Both numbers converge on a re-run — the scoring
 *  and the attestations are idempotent — so a second finalise is safe. */
export interface JamFinalizeReport {
	submissions_scored: number;
	attestations_issued: number;
}

export interface ShippedTitleInput {
	user_id: string;
	deliverable_id: string;
	store_url: string;
	title: string;
}

export interface OpenSourceAttestationInput {
	user_id: string;
	deliverable_id: string;
	pr_url: string;
	what_changed: string;
}

export interface FeatureCreatorInput {
	user_id: string;
	/** `YYYY-MM-DD`. A featuring covers a week, not an instant. */
	week_starts_at: string;
	week_ends_at: string;
	/** The citation the attestation carries. The backend rejects an empty
	 *  one: an editorial choice has to say why. */
	bio_md: string;
	highlighted_projects?: string[];
	itch_embeds?: unknown;
	interview_qa_json?: unknown;
}
