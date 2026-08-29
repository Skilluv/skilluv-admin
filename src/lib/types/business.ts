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

// ─────────────────────────────────────────────────────────────────────
// Data line — reports, licences, white-label deployments
// ─────────────────────────────────────────────────────────────────────

/**
 * `services::data_consent::PURPOSES`.
 *
 * Every figure the data line sells rests on one of these, and which one is
 * never assumed: a report drawn from research consent and one drawn from
 * commercial consent are different datasets with different people in them.
 */
export type DataPurpose =
	| 'public_score_api'
	| 'research_licensing'
	| 'commercial_licensing'
	| 'identity_aggregation';

/** How many people a purpose currently covers, and whether that is enough to
 *  publish anything drawn from it. */
export interface DataCohort {
	purpose: DataPurpose;
	people: number;
	publishable: boolean;
}

export interface DataCohortsResponse {
	cohorts: DataCohort[];
	/** `COHORT_FLOOR`. A chart drawn from four people names those four,
	 *  whatever its header says. */
	floor: number;
}

export type DataClientType =
	| 'research_lab'
	| 'university'
	| 'government'
	| 'development_bank'
	| 'enterprise'
	| 'ngo';

export interface DataReport {
	id: string;
	client_type: string;
	client_org: string;
	title: string;
	scope_md: string;
	delivery_formats: string[];
	fee: string;
	currency: string;
	/** The floor this particular report was commissioned against. Stored per
	 *  report rather than read from the constant, so a delivery is checked
	 *  against the rule that applied when it was agreed. */
	minimum_cohort_size: number;
	status: string;
	document_url: string | null;
	delivered_at: string | null;
	created_at: string;
}

export interface DataReportInput {
	client_type: DataClientType;
	client_org: string;
	title: string;
	scope_md: string;
	delivery_formats?: string[];
	fee: string;
	currency?: string;
	enterprise_id?: string;
}

export interface DataLicence {
	id: string;
	licensee_org: string;
	licensee_type: string;
	purpose: string;
	contract_purpose_md: string;
	data_scope: unknown;
	starts_on: string;
	ends_on: string | null;
	total_fee: string;
	currency: string;
	/** What the people in the dataset get. A commercial licence paying
	 *  nobody is refused by the backend. */
	talents_share_percent: string;
	status: string;
	signed_at: string | null;
}

export interface DataLicenceInput {
	licensee_org: string;
	licensee_type: DataClientType;
	purpose: DataPurpose;
	contract_purpose_md: string;
	data_scope?: unknown;
	starts_on: string;
	ends_on?: string;
	total_fee: string;
	currency?: string;
	talents_share_percent?: string;
	contract_url?: string;
}

/** What settling a period actually paid. `amount_each` is the whole share
 *  divided by the cohort and rounded down. */
export interface DataSettlement {
	people_paid: number;
	amount_each: string;
}

export type DataPartnerType =
	| 'university'
	| 'bootcamp'
	| 'coding_school'
	| 'corporate_academy'
	| 'government';

export interface DataDeployment {
	id: string;
	partner_org: string;
	partner_type: string;
	country: string | null;
	deployment_host: string;
	branding: unknown;
	features_enabled: string[];
	/** What the partner may call official. A recognition claim without a
	 *  signed contract is refused. */
	official_recognition_scope: string[];
	setup_fee: string;
	monthly_fee: string;
	annual_fee: string | null;
	currency: string;
	users_limit: number | null;
	status: string;
	launched_on: string | null;
}

export interface DataDeploymentInput {
	partner_org: string;
	partner_type: DataPartnerType;
	country?: string;
	deployment_host: string;
	branding?: unknown;
	features_enabled?: string[];
	official_recognition_scope?: string[];
	setup_fee?: string;
	monthly_fee?: string;
	annual_fee?: string;
	currency?: string;
	users_limit?: number;
	contract_url?: string;
}
