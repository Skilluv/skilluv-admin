/**
 * The sales pipeline and what the platform earns.
 *
 * Nine routes across `sales_pipeline.rs` and `revenue.rs`, all `require_admin`
 * — no capability opens a subset of this. That is deliberate on the backend
 * side and worth restating here: the catalogue of revenue streams is public
 * (the business model is in `docs/`), the figures are not, and splitting them
 * into two authorisations would mean two places to get it wrong.
 *
 * ## What the numbers are, and are not
 *
 * `weighted_value` is a sum of guesses. The stage weights were chosen a
 * priori and no closed deal has calibrated them, which the backend says in a
 * `weighted_value_note` field it serves beside the number. The screen shows
 * that note; nothing here presents the total as a forecast.
 *
 * Amounts stay strings end to end. See the note in `types/business.ts`.
 */
import type {
	ApiResponse,
	OpportunityInput,
	RevenueByPillarResponse,
	RevenueStreamsResponse,
	SalesActivityInput,
	SalesEnterpriseFile,
	SalesOpportunity,
	SalesOpportunityDetail,
	SalesOverdueStep,
	SalesPipelineResponse,
	SalesRenewalsResponse,
	SalesStage
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const salesApi = {
	// --- Pipeline ---

	/** Every opportunity that is not yet closed, with the weighted total. */
	pipeline() {
		return api.get<ApiResponse<SalesPipelineResponse>>('/admin/sales/opportunities');
	},

	/** `org_name` is the only required field: a lead is a company name and a
	 *  reason to call it, and demanding more would push people to invent
	 *  values that then look like data. */
	openOpportunity(input: OpportunityInput) {
		return api.post<ApiResponse<{ opportunity: SalesOpportunity }>>(
			'/admin/sales/opportunities',
			input
		);
	},

	opportunity(id: string) {
		return api.get<ApiResponse<SalesOpportunityDetail>>(`/admin/sales/opportunities/${id}`);
	},

	/** Moving to `lost` requires a reason — the backend rejects the call
	 *  without one, so the form asks for it before sending. A pipeline whose
	 *  losses are unexplained teaches nobody anything. */
	setStage(id: string, stage: SalesStage, lostReason?: string) {
		return api.post<ApiResponse<{ opportunity: SalesOpportunity }>>(
			`/admin/sales/opportunities/${id}/stage`,
			lostReason ? { stage, lost_reason: lostReason } : { stage }
		);
	},

	recordActivity(id: string, input: SalesActivityInput) {
		return api.post<ApiResponse<{ activity_id: string }>>(
			`/admin/sales/opportunities/${id}/activities`,
			input
		);
	},

	/** Everything somebody said they would do and has not. Excludes
	 *  opportunities already won or lost, so it is a list to act on rather
	 *  than an archive. */
	overdue() {
		return api.get<ApiResponse<{ overdue: SalesOverdueStep[] }>>('/admin/sales/overdue');
	},

	/** What lapses in the window. Ninety days by default: long enough to act
	 *  on, short enough that the list is not everything. Clamped to 1..730
	 *  server-side. */
	renewals(params?: { within_days?: number }) {
		return api.get<ApiResponse<SalesRenewalsResponse>>(
			'/admin/sales/renewals',
			params as Record<string, number>
		);
	},

	/** One company's whole file: what they have, what they spent, what lapses,
	 *  and what they do not have in pillars they already buy from. */
	enterpriseFile(enterpriseId: string) {
		return api.get<ApiResponse<SalesEnterpriseFile>>(
			`/admin/sales/enterprises/${enterpriseId}`
		);
	},

	// --- Revenue ---

	/** Every stream, including the ones that have never booked anything —
	 *  those come back with `is_live: false` rather than being dropped. */
	revenueStreams(params?: { days?: number }) {
		return api.get<ApiResponse<RevenueStreamsResponse>>(
			'/admin/revenue/streams',
			params as Record<string, number>
		);
	},

	revenueByPillar(params?: { days?: number }) {
		return api.get<ApiResponse<RevenueByPillarResponse>>(
			'/admin/revenue/by-pillar',
			params as Record<string, number>
		);
	}
};

/** In pipeline order, which is the order the board renders columns in. */
export const SALES_STAGES: SalesStage[] = [
	'lead',
	'qualified',
	'proposal',
	'negotiation',
	'won',
	'lost'
];

/** The two terminal stages. Kept apart from the list above because several
 *  screens need "is this still in play" and computing it from two literals
 *  every time is how one of them ends up disagreeing. */
export const CLOSED_STAGES: SalesStage[] = ['won', 'lost'];

export function isClosed(stage: SalesStage): boolean {
	return CLOSED_STAGES.includes(stage);
}

export const SALES_ACTIVITY_KINDS = [
	'call',
	'email',
	'meeting',
	'demo',
	'proposal_sent',
	'note'
] as const;

/** `services::sales_pipeline::stage_weight`, mirrored so the board can show
 *  what each column contributes to the weighted total.
 *
 *  A mirror of a server constant is the thing this codebase has been burned
 *  by, so: it is unit-tested against the documented values, and it is used
 *  for display only — the total the screen shows is the server's own
 *  `weighted_value`, never a number recomputed here. */
export function stageWeight(stage: SalesStage): number {
	switch (stage) {
		case 'lead':
			return 0.1;
		case 'qualified':
			return 0.25;
		case 'proposal':
			return 0.5;
		case 'negotiation':
			return 0.75;
		case 'won':
			return 1;
		default:
			return 0;
	}
}
