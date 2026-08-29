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
