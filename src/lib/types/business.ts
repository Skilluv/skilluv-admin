/**
 * The B2B lines: what Skilluv sells, to whom, and what it earned.
 *
 * Split out of `index.ts` rather than appended to it. These types describe
 * the commercial surface — pipeline, contracts, renewals, revenue — which is
 * a different subject from the platform types that file holds, and there is
 * a lot of it. `index.ts` re-exports everything here, so `$lib/types` stays
 * the single import path.
 *
 * ## A note on money
 *
 * Every amount crossing this boundary is a **string**, not a number. The
 * backend serialises `BigDecimal` and `NUMERIC` as decimal strings on
 * purpose: money that round-trips through an IEEE double is money that stops
 * adding up. Screens format them; nothing here parses them into `number`.
 */

// ─────────────────────────────────────────────────────────────────────
// Sales pipeline
// ─────────────────────────────────────────────────────────────────────

/** `services::sales_pipeline::STAGES`. Ordered as the pipeline runs, which
 *  is also the order a board renders its columns in. */
export type SalesStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

/** `services::sales_pipeline::ACTIVITY_KINDS`. */
export type SalesActivityKind = 'call' | 'email' | 'meeting' | 'demo' | 'proposal_sent' | 'note';

export interface SalesOpportunity {
	id: string;
	/** Null until the prospect becomes a registered company. An opportunity
	 *  exists before the enterprise row does — that is the point of the
	 *  pipeline — so this cannot be required. */
	enterprise_id: string | null;
	org_name: string;
	contact_name: string | null;
	contact_email: string | null;
	product_type: string | null;
	/** Decimal string, or null when nobody has put a number on it yet. */
	estimated_value: string | null;
	currency: string;
	stage: SalesStage;
	/** Required by the backend when moving to `lost`, absent otherwise. */
	lost_reason: string | null;
	owner_user_id: string | null;
	/** `YYYY-MM-DD`, a date with no time — an expected close is a day, not a
	 *  moment, and giving it a timezone would move it across midnight. */
	expected_close_on: string | null;
	created_at: string;
}

export interface SalesActivity {
	id: string;
	kind: SalesActivityKind;
	summary_md: string;
	next_step: string | null;
	next_step_due_on: string | null;
	happened_at: string;
}

export interface SalesPipelineResponse {
	opportunities: SalesOpportunity[];
	/** Decimal string. A sum of guesses, and the backend says so in the field
	 *  below rather than letting a screen present it as a forecast. */
	weighted_value: string;
	weighted_value_note: string;
}

export interface SalesOpportunityDetail {
	opportunity: SalesOpportunity;
	activities: SalesActivity[];
}

export interface SalesOverdueStep {
	opportunity_id: string;
	org_name: string;
	next_step: string | null;
	due_on: string | null;
}

/** A product about to lapse, read from the product tables rather than from a
 *  renewals table — `upcoming_renewals` is a view over them. */
export interface SalesRenewal {
	product: string;
	enterprise_id: string | null;
	source_id: string;
	renews_at: string | null;
	value: string | null;
	currency: string;
}

export interface SalesRenewalsResponse {
	renewals: SalesRenewal[];
	within_days: number;
}

/** One line of what a company currently has with Skilluv. */
export interface EnterpriseProductLine {
	product_type: string;
	label: string;
	pillar: string | null;
	status: string;
	contract_value: string | null;
	currency: string;
	recurring: boolean;
	source_table: string;
	source_id: string;
	since: string;
}

/** What a company has spent, grouped by revenue stream. */
export interface EnterpriseSpendLine {
	stream: string;
	label: string | null;
	pillar: string | null;
	total: string | null;
	entries: number;
}

/** A product a company does not have, in a pillar it already buys from.
 *  Deliberately unranked — see `unused_products_in_familiar_pillars`. */
export interface EnterpriseSuggestion {
	product_type: string;
	label: string;
	pillar: string;
}

export interface SalesEnterpriseFile {
	products: EnterpriseProductLine[];
	spend_by_stream: EnterpriseSpendLine[];
	renewals: SalesRenewal[];
	not_yet_used_in_familiar_pillars: EnterpriseSuggestion[];
}

export interface OpportunityInput {
	org_name: string;
	enterprise_id?: string;
	contact_name?: string;
	contact_email?: string;
	product_type?: string;
	estimated_value?: string;
	currency?: string;
	expected_close_on?: string;
}

export interface SalesActivityInput {
	kind: SalesActivityKind;
	summary_md: string;
	next_step?: string;
	next_step_due_on?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Revenue
// ─────────────────────────────────────────────────────────────────────

export interface RevenueStream {
	slug: string;
	pillar: string;
	label: string;
	description: string;
	recurring: boolean;
	/** False until something has actually booked revenue under it. Planned
	 *  streams are served rather than hidden: a catalogue that dropped them
	 *  would read as a business with twenty-seven live revenue lines, which
	 *  is the number of ideas. */
	is_live: boolean;
	/** Decimal string, over the requested window. */
	amount: string;
	entries: number;
}

export interface RevenueStreamsResponse {
	streams: RevenueStream[];
	window_days: number;
	live_streams: number;
	planned_streams: number;
}

export interface RevenuePillar {
	pillar: string;
	total: string;
	/** Split out because a business that reads its one-off revenue as
	 *  run-rate overstates itself. */
	recurring: string;
	entries: number;
}

export interface RevenueByPillarResponse {
	pillars: RevenuePillar[];
	window_days: number;
}
