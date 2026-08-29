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

/**
 * A season as `GET /seasons` returns it.
 *
 * **Not the same shape as `Season` in `api/admin.ts`**, and that is the point
 * rather than an oversight. Two backend modules write the one `seasons`
 * table: `tournament.rs` records a `description` and a `closed_at`,
 * `seasons.rs` records a `theme` and a `retrospective_report_url`. A season
 * created through one path is missing a field the other assumes.
 *
 * This app creates through `/admin/seasons` and lists through `GET /seasons`
 * — the only listing that exists — so both shapes are real and both are
 * typed. The duplication itself is filed on SKI-354.
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
