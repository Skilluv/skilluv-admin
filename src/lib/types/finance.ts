/**
 * The finance line, and the servicing actions the product register unlocks.
 *
 * Re-exported by `types/index.ts`.
 *
 * These types arrived last because until SKI-354 landed there was nothing to
 * type them against: the write routes existed and nothing listed what they
 * act on. The four finance queues and `GET /admin/enterprise-products` are
 * what changed.
 */

// ─────────────────────────────────────────────────────────────────────
// Finance queues
// ─────────────────────────────────────────────────────────────────────

/** An advance a contributor asked for on their own invoice.
 *
 *  Ordered approved-first server-side: approved-but-not-disbursed is the
 *  state a human owes an answer to. */
export interface FinanceAdvance {
	id: string;
	user_id: string;
	username: string | null;
	advance_amount: string;
	fee_amount: string | null;
	currency: string | null;
	status: string;
	disbursed_at: string | null;
	created_at: string;
}

/** A request to be introduced to a financial partner. Undecided first. */
export interface FinanceReferral {
	id: string;
	user_id: string;
	username: string | null;
	partner_org: string | null;
	purpose: string;
	amount_requested: string | null;
	currency: string | null;
	decision: string | null;
	created_at: string;
}

/** A claim on the payment guarantee. Unpaid first. */
export interface FinanceGuaranteeClaim {
	id: string;
	user_id: string;
	username: string | null;
	amount: string;
	currency: string | null;
	status: string;
	paid_at: string | null;
	created_at: string;
}

/** A partnership with a financial institution.
 *
 *  Drafts sort first, and that is the point of this list: the public
 *  `/finance/partners` shows active partnerships only, so the one waiting to
 *  be activated was the only one nobody could see. */
export interface FinancePartnership {
	id: string;
	partner_org: string;
	kind: string;
	countries: string[];
	commission_percent: string | null;
	status: string;
	registry_url: string | null;
	created_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// The product register
// ─────────────────────────────────────────────────────────────────────

/**
 * One row of `GET /admin/enterprise-products`.
 *
 * `source_table` and `source_id` are the pair that ends the failure SKI-354
 * described: `source_id` **is** the `{id}` twenty-one write routes take, and
 * `source_table` says which module owns it. Both were already in the table;
 * nothing served them.
 *
 * Unlike the renewals list, this one does not filter on
 * `status = 'active' AND renews_at IS NOT NULL` — a `pending` product waiting
 * to be activated is neither, and it is exactly what somebody comes here for.
 */
export interface ProductRegistryRow {
	id: string;
	enterprise_id: string;
	company_name: string;
	product_type: string;
	product_label: string;
	revenue_stream: string | null;
	status: string;
	contract_value: string | null;
	currency: string | null;
	renews_at: string | null;
	/** Which module owns the row. Null when a product was recorded by hand
	 *  with no source — the CHECK only guarantees the pair travels together,
	 *  not that it is present. */
	source_table: string | null;
	source_id: string | null;
	created_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Servicing inputs
// ─────────────────────────────────────────────────────────────────────

export interface EngagementMemberInput {
	user_id: string;
	role: string;
	/** Percentage of the team's side. Every member's shares must total 100
	 *  before the work can start. */
	share_percent: string;
}

export interface MilestoneInput {
	title: string;
	acceptance_criteria: string;
	value_percent: string;
	due_on?: string;
}

/** Skilluv reviews a milestone before the client sees it. Notes are required
 *  on either verdict: a pass with no words is as unhelpful as a fail. */
export interface MilestoneReview {
	passed: boolean;
	notes: string;
}

export interface AssessmentInput {
	assessed_level: string;
	strengths?: string[];
	gaps?: string[];
	notes_md?: string;
}

export interface InformEmployeeInput {
	employee_email: string;
	orientation_slug: string;
	employee_name?: string;
}

export interface AuditDeliveryInput {
	matrix_url: string;
	recommendations_md?: string;
}

/** A launch piece passes Skilluv's gate before the sponsor sees it. The
 *  backend refuses a verdict with no notes. */
export interface PieceQualityInput {
	passed: boolean;
	notes: string;
}

export interface RetentionInput {
	months: number;
	still_there: boolean;
}

/** The five kinds the backend runs. Anything else is a 400. */
export const SPONSORED_CONTENT_TYPES = [
	'blog_post',
	'video',
	'newsletter',
	'podcast',
	'recap'
] as const;

/**
 * Commission a sponsored piece.
 *
 * `disclosure_text` is optional and defaults on the server to wording that
 * names the sponsor — a default rather than an empty field, because the
 * disclosure is the part a reader is owed. Shorter than ten characters is
 * discarded in favour of that default, so an almost-empty one changes
 * nothing.
 */
export interface SponsoredContentInput {
	sponsor_enterprise_id: string;
	content_type: string;
	title: string;
	/** Decimal string. */
	fee: string;
	event_id?: string;
	disclosure_text?: string;
	author_user_id?: string;
}

/** One item of sponsored content. */
export interface SponsoredContentRow {
	id: string;
	sponsor_enterprise_id: string | null;
	company_name: string | null;
	content_type: string;
	title: string;
	content_url: string | null;
	fee: string | null;
	currency: string | null;
	status: string;
	published_at: string | null;
	created_at: string;
}

/** Open a partnership with a financial institution. It starts as a draft —
 *  `activatePartnership` is what makes it visible on the public list. */
export interface PartnershipInput {
	partner_org: string;
	kind: string;
	countries: string[];
	commission_percent: string;
	/** What makes the introduction lawful where the partner operates. */
	regulatory_basis?: string;
	registry_url?: string;
	contract_url?: string;
	min_rank?: string;
}

export interface ReferralDecisionInput {
	approved: boolean;
	approved_amount?: string;
	monthly_premium?: string;
	note?: string;
}

/** Pay a contributor for work a client refused to pay for. */
export interface GuaranteeClaimInput {
	user_id: string;
	invoice_id?: string;
	amount: string;
	reason: string;
}
