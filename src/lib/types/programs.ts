/**
 * Programmes and competitions: labs, beta programmes, launch campaigns,
 * ambassador programmes, certifications, community events, proposals.
 *
 * Re-exported by `types/index.ts`.
 *
 * ## Why every list here is a public one
 *
 * None of these has an admin listing. What they have is a public "open" list
 * — `GET /labs`, `/beta-programs/open`, `/launch-campaigns/open`,
 * `/ambassador-programs/open`, `/events`, `/certifications` — and the admin
 * actions hang off ids from it.
 *
 * That covers acting on something already open, which is most of the work:
 * closing, settling, paying, concluding. It does **not** cover acting on a
 * draft, because a draft is in no public list — which is why
 * `ambassador-programs/{id}/activate` and `launch-campaigns/{id}/open` are
 * absent from this module and present in SKI-354.
 *
 * The row types below carry the fields the screens render, not every column
 * the backend selects. Where a column is genuinely free-form JSON it is
 * `unknown`, because that is what it is.
 */

export interface LabRow {
	id: string;
	title: string;
	status: string;
	/** Decimal string: the pool a month's settlement divides. */
	monthly_pool?: string | null;
	currency?: string | null;
	[key: string]: unknown;
}

export interface BetaProgramRow {
	id: string;
	title?: string;
	name?: string;
	status: string;
	[key: string]: unknown;
}

export interface LaunchCampaignRow {
	id: string;
	title?: string;
	name?: string;
	status: string;
	ends_at?: string | null;
	[key: string]: unknown;
}

export interface AmbassadorProgramRow {
	id: string;
	title?: string;
	name?: string;
	status: string;
	[key: string]: unknown;
}

export interface CertificationRow {
	id: string;
	name?: string;
	title?: string;
	status?: string;
	[key: string]: unknown;
}

export interface ProposalRow {
	id: string;
	title?: string;
	status?: string;
	[key: string]: unknown;
}

/** `services::events::ROLES`. Appointment is separate from joining because
 *  these are invitations: a jury somebody can join is a jury whose verdict
 *  means nothing. */
export type EventRole = 'participant' | 'jury' | 'organizer' | 'speaker' | 'sponsor_rep';

export type EventStatus = 'draft' | 'published' | 'live' | 'finished' | 'cancelled';

export interface EventRow {
	id: string;
	slug: string;
	name: string;
	description: string;
	event_type: string;
	domain_focus: string[];
	location_type: string;
	/** Free-form: an address, a URL, both. */
	location_details: unknown;
	max_participants: number | null;
	showcase_page_url: string | null;
	status: string;
	starts_at: string;
	ends_at: string | null;
	/** Colours, hero image, whatever the front renders. The backend does not
	 *  care about the shape and neither does this. */
	visual_theme: unknown;
	[key: string]: unknown;
}

/** One criterion of a certification audit, with what the score rests on.
 *  `evidence` is not optional: a score with no evidence is an opinion with a
 *  number on it. */
export interface AuditFinding {
	criterion: string;
	score: string;
	weight?: string;
	evidence: string;
}

// ─────────────────────────────────────────────────────────────────────
// Series, seasons and awards
// ─────────────────────────────────────────────────────────────────────

/** `services::series::KINDS`. */
export type SeriesKind = 'awards_edition' | 'sprint' | 'programme';

export interface SeriesRow {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	kind: string;
	skill_domain: string | null;
	starts_at: string;
	ends_at: string;
	created_at: string;
}

export interface CreateSeriesInput {
	slug: string;
	name: string;
	description?: string;
	kind: SeriesKind;
	skill_domain?: string;
	starts_at: string;
	ends_at: string;
}

/** One nominee on an awards ballot. */
export interface AwardsNominee {
	id: string;
	category_slug: string;
	subject_type: string;
	subject_id: string;
	/** The name to print: a username, a project, or the title of the slice a
	 *  deliverable answered. */
	subject_label: string | null;
	citation: string;
	shortlisted: boolean;
	community_votes: number;
	jury_votes: number;
	/** Zero before voting opens, which is the truth rather than a
	 *  placeholder. */
	weighted_score: string;
}

export interface AwardsEdition {
	edition: Record<string, unknown>;
	nominees: AwardsNominee[];
}

/** A proposed terrain awaiting a steward's decision. */
export interface TerrainProposal {
	slug: string;
	name?: string;
	title?: string;
	status?: string;
	[key: string]: unknown;
}

/** What creating a season takes. A theme, not a description: the writer
 *  that recorded a description was removed when the duplication was. */
export interface CreateSeasonInput {
	slug: string;
	name: string;
	theme: string;
	starts_at: string;
	ends_at: string;
}

/**
 * A season, as the one surviving writer records it and the one listing
 * returns it.
 *
 * This used to be one of two shapes. `tournament.rs` wrote a `description`
 * and a `closed_at` while `seasons.rs` wrote a `theme` and a
 * `retrospective_report_url`, both into the same table, so a season created
 * through one path was missing a field the other assumed. The backend
 * removed the first writer; this is now simply what a season is.
 */
export interface SeasonListRow {
	id: string;
	slug: string;
	name: string;
	theme: string;
	starts_at: string;
	ends_at: string;
	status: string;
	retrospective_report_url: string | null;
	created_at: string;
	updated_at: string;
}

/** One contest entry, as the submissions listing returns it. */
export interface TournamentSubmission {
	id: string;
	tournament_id: string;
	participant_type: string;
	participant_id: string;
	submitted_by: string;
	artifact_url: string;
	artifact_type: string;
	secondary_url: string | null;
	summary: string;
	language: string | null;
	/** Set on a measured contest and null on a judged one. Which of the two
	 *  it is decides whether a score may be sent with an acceptance. */
	measured_value: number | null;
	status: string;
	judge_score: number | null;
	judged_by: string | null;
	judged_at: string | null;
	judge_notes: string | null;
	submitted_at: string;
	updated_at: string;
}

/**
 * The entries of one contest, plus whether the caller is reading them blind.
 *
 * `blinded` is not decoration. During the submission window of a blind
 * contest, a reader who is not a juror sees only their own entry — a list of
 * one that would otherwise read as a contest nobody entered. `blind_until`
 * says when that ends.
 */
export interface TournamentSubmissions {
	submissions: TournamentSubmission[];
	blinded: boolean;
	blind_until: string | null;
}

/** A juror's verdict on one contest entry. */
export interface JudgeSubmissionInput {
	/** `accepted`, `rejected` or `disqualified`. */
	status: 'accepted' | 'rejected' | 'disqualified';
	/** 0..100. Required to accept a judged entry, refused on a measured one —
	 *  the contest knows which it is, so the client sends what was typed and
	 *  lets the backend say. */
	judge_score?: number;
	judge_notes?: string;
}

export const JUDGE_STATUSES = ['accepted', 'rejected', 'disqualified'] as const;

/** One contribution to a living lab, with enough context to judge it
 *  without opening anything else. */
export interface LabContributionRow {
	id: string;
	lab_id: string;
	contributor_user_id: string;
	contributor_username: string | null;
	/** What the contribution brings, in the contributor's own words. */
	summary_md: string;
	activity_type: string;
	/** A DATE, so format it in UTC — the month it counts for is a period,
	 *  not an instant, and a local rendering shifts it by a day. */
	counts_for_month: string;
	submitted_at: string;
	/** Null while nobody has judged it, which is a third state rather than a
	 *  value — and the one the default ordering puts first. */
	accepted: boolean | null;
	rejection_reason: string | null;
	/** Decimal string. */
	reward: string | null;
	paid_at: string | null;
}

/**
 * A verdict on one contribution.
 *
 * A refusal must carry a reason and the backend says why in as many words:
 * somebody spent an evening on this and the pool is what they were promised
 * for it. So the client sends what was typed and lets that message through
 * rather than inventing a shorter one.
 */
export interface ContributionJudgementInput {
	accept: boolean;
	reason?: string;
}

/** The three states a contribution can be filtered by. `pending` is the
 *  absence of a verdict, not a stored value. */
export const CONTRIBUTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;
