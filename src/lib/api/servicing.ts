/**
 * Servicing what a company bought — the twenty-one writes the product
 * register unlocked.
 *
 * Every one of these takes an `{id}` that, until SKI-354, an administrator
 * had no way to obtain. They all come from the same place now:
 * `contractsApi.registry()` returns `source_table` and `source_id` per row,
 * where `source_table` names the module that owns the row and `source_id` is
 * the id its verbs take.
 *
 * ## Why this module is organised by source table
 *
 * Because that is the only thing the register tells you about a row. A screen
 * holding a registry line knows "this is an `engagements` row with id X" and
 * nothing more specific — so the actions are looked up by that string rather
 * than by a product type the client would have to map itself. `ACTIONS_BY_
 * SOURCE` is that lookup, and it is the reason the registry tab can offer the
 * right buttons without a per-product branch in the markup.
 */
import type {
	ApiResponse,
	AssessmentInput,
	AuditDeliveryInput,
	EngagementMemberInput,
	InformEmployeeInput,
	MilestoneInput,
	MilestoneReview,
	PieceQualityInput,
	RetentionInput
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const servicingApi = {
	// --- Engagements ---

	/** Refused before the team's shares total 100 — the same arithmetic a
	 *  studio is held to. */
	startEngagement(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/admin/engagements/${id}/start`);
	},

	addEngagementMember(id: string, member: EngagementMemberInput) {
		return api.post<ApiResponse<{ members: unknown[] }>>(
			`/admin/engagements/${id}/members`,
			member
		);
	},

	/** Copies the studio's roster onto the engagement. Refused when no studio
	 *  is attached, with a message saying to add members individually — which
	 *  is the other button on the same row. */
	staffFromStudio(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/engagements/${id}/staff-from-studio`
		);
	},

	addMilestone(id: string, milestone: MilestoneInput) {
		return api.post<ApiResponse<{ milestone_id: string; milestones: unknown[] }>>(
			`/admin/engagements/${id}/milestones`,
			milestone
		);
	},

	/** Skilluv's own review, before the client sees the work. Notes are
	 *  required on either verdict: a pass with no words is as unhelpful to
	 *  the team as a fail with none. */
	reviewMilestone(milestoneId: string, review: MilestoneReview) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/milestones/${milestoneId}/review`,
			review
		);
	},

	// --- Sponsorships ---

	signSponsorship(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/admin/sponsorships/${id}/sign`);
	},

	/** Books the revenue. Signing and honouring are separate because a signed
	 *  sponsorship is a promise and an honoured one is money. */
	honourSponsorship(id: string) {
		return api.post<ApiResponse<{ revenue_booked: string }>>(
			`/admin/sponsorships/${id}/honour`
		);
	},

	cancelSponsorship(id: string, reason: string) {
		return api.post<ApiResponse<{ cancelled: boolean }>>(`/admin/sponsorships/${id}/cancel`, {
			reason
		});
	},

	// --- Consultations ---

	/** Refused below the expert rank floor. */
	inviteExpert(id: string, expertUserId: string) {
		return api.post<ApiResponse<{ experts: unknown[] }>>(
			`/admin/consultations/${id}/invite`,
			{ expert_user_id: expertUserId }
		);
	},

	/** Refused when nobody has written anything. The synthesis is optional in
	 *  general and required for a review — the backend knows which kind this
	 *  is, so the message says so rather than the form guessing. */
	deliverConsultation(id: string, synthesisMd?: string) {
		return api.post<ApiResponse<{ commission: string; experts_paid: number }>>(
			`/admin/consultations/${id}/deliver`,
			synthesisMd ? { synthesis_md: synthesisMd } : {}
		);
	},

	// --- Placements ---

	/** Any day in the month; the first of it is recorded. */
	billPlacementMonth(id: string, month: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/placements/${id}/bill-month`,
			{ month }
		);
	},

	/** Answers whether the guarantee applies, which is the thing worth
	 *  knowing before telling the client anything. */
	endPlacement(id: string, reason: string) {
		return api.post<ApiResponse<{ guarantee_applies: boolean; reason: string }>>(
			`/admin/placements/${id}/end`,
			{ reason }
		);
	},

	// --- Skill audits and assessments ---

	/** Tell somebody they are being assessed, before assessing them. That
	 *  ordering is the product, not a courtesy: the route exists so the
	 *  assessment cannot start without it. */
	informEmployee(auditId: string, input: InformEmployeeInput) {
		return api.post<ApiResponse<{ assessment_id?: string }>>(
			`/admin/skill-audits/${auditId}/inform`,
			input
		);
	},

	deliverAudit(auditId: string, input: AuditDeliveryInput) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/skill-audits/${auditId}/deliver`,
			input
		);
	},

	assess(assessmentId: string, input: AssessmentInput) {
		return api.post<ApiResponse<{ assessed: boolean }>>(
			`/admin/assessments/${assessmentId}`,
			input
		);
	},

	/** Share the assessment with the person it is about. A separate act from
	 *  writing it, because the two decisions are separate. */
	shareAssessment(assessmentId: string) {
		return api.post<ApiResponse<{ shared: boolean }>>(
			`/admin/assessments/${assessmentId}/share`
		);
	},

	// --- Launch campaigns and pieces ---

	/** Opens a drafted campaign for submissions. The act the public
	 *  `/launch-campaigns/open` list could not reach, because a draft is not
	 *  in it. */
	openCampaignForSubmissions(id: string) {
		return api.post<ApiResponse<{ campaign: unknown }>>(
			`/admin/launch-campaigns/${id}/open`
		);
	},

	/** Skilluv's gate before the sponsor sees a piece. A verdict with no
	 *  notes is refused. */
	reviewPieceQuality(pieceId: string, input: PieceQualityInput) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/launch-pieces/${pieceId}/quality`,
			input
		);
	},

	// --- Ambassadors ---

	/** Books the activation fee. The draft this acts on is not in
	 *  `/ambassador-programs/open`, which is why it waited on the register. */
	activateAmbassadorProgram(id: string) {
		return api.post<ApiResponse<{ activation_fee_booked: string }>>(
			`/admin/ambassador-programs/${id}/activate`
		);
	},

	// --- Onboardings ---

	/** Whether the person was still there after N months. Recorded rather
	 *  than inferred: a hire that lasted is the only evidence an onboarding
	 *  product worked, and nothing else in the system knows it. */
	recordRetention(id: string, input: RetentionInput) {
		return api.post<ApiResponse<{ recorded: boolean }>>(
			`/admin/onboardings/${id}/retention`,
			input
		);
	}
};

/**
 * What can be done to a registry row, keyed by the table it came from.
 *
 * The register hands a screen `source_table` and `source_id` and nothing
 * else. Looking the actions up by that string keeps the mapping in one place
 * — and makes the gap visible when a new product line registers itself and
 * this table has no entry for it, instead of the row quietly offering
 * nothing.
 */
export const ACTIONS_BY_SOURCE: Record<string, readonly string[]> = {
	engagements: ['start', 'staffFromStudio', 'addMember', 'addMilestone'],
	sponsorships: ['sign', 'honour', 'cancel'],
	annual_sponsorships: ['sign', 'honour', 'cancel'],
	consultations: ['invite', 'deliver'],
	placements: ['billMonth', 'end'],
	skill_audits: ['inform', 'deliverAudit'],
	launch_campaigns: ['openSubmissions'],
	ambassador_programs: ['activateAmbassadors'],
	onboardings: ['retention']
};

export function actionsFor(sourceTable: string | null): readonly string[] {
	return sourceTable ? (ACTIONS_BY_SOURCE[sourceTable] ?? []) : [];
}
