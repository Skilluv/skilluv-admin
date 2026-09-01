/**
 * Programmes and competitions — eleven admin writes, six public reads.
 *
 * Every action here is keyed on an id that comes from a **public** list.
 * None of these resources has an admin listing, so this module pairs each
 * write with the read that makes it reachable, and the screen shows them
 * together.
 *
 * ## The line this module does not cross
 *
 * `POST /admin/ambassador-programs/{id}/activate` and
 * `POST /admin/launch-campaigns/{id}/open` are not here. They act on a
 * **draft**, and a draft is in no public list — so for as long as the only
 * reads were public ones, wiring them would have meant a form asking for a
 * UUID out of psql.
 *
 * SKI-354 shipped `GET /admin/enterprise-products`, and they now live in
 * `servicing.ts` keyed on the `source_id` that register returns. They stay
 * out of this module because its organising idea is unchanged: everything
 * here hangs off a public list.
 */
import type {
	AmbassadorProgramRow,
	ApiResponse,
	AuditFinding,
	BetaProgramRow,
	CertificationRow,
	EventRole,
	EventRow,
	EventStatus,
	ContributionJudgementInput,
	LabContributionRow,
	LabRow,
	LaunchCampaignRow,
	ProposalRow,
	SponsoredContentInput,
	SponsoredContentRow
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const programsApi = {
	// --- Reads: the public lists the actions hang off ---

	/** Recruiting and running labs. */
	labs() {
		return api.get<ApiResponse<{ labs: LabRow[] }>>('/labs');
	},

	openBetaPrograms() {
		return api.get<ApiResponse<{ programs: BetaProgramRow[] }>>('/beta-programs/open');
	},

	openLaunchCampaigns() {
		return api.get<ApiResponse<{ campaigns: LaunchCampaignRow[] }>>('/launch-campaigns/open');
	},

	openAmbassadorPrograms() {
		return api.get<ApiResponse<{ programs: AmbassadorProgramRow[] }>>(
			'/ambassador-programs/open'
		);
	},

	certifications() {
		return api.get<ApiResponse<{ certifications: CertificationRow[] }>>('/certifications');
	},

	proposals() {
		return api.get<ApiResponse<{ proposals: ProposalRow[] }>>('/proposals');
	},

	/** Published and live events only — which is the set an appointment or a
	 *  status change is about. A draft event is not listed here, and the one
	 *  status transition that starts from `draft` is therefore only reachable
	 *  on an event somebody already published. */
	events(params?: { event_type?: string }) {
		return api.get<ApiResponse<{ events: EventRow[] }>>(
			'/events',
			params as Record<string, string>
		);
	},

	/** Sponsored content, unpublished first. Listed nowhere before SKI-354 —
	 *  not admin, not enterprise, not public — so publishing a piece worked
	 *  only in the session that created it. */
	sponsoredContent(params?: { status?: string }) {
		return api.get<ApiResponse<{ content: SponsoredContentRow[] }>>(
			'/admin/sponsored-content',
			params as Record<string, string>
		);
	},

	// --- Writes ---

	/**
	 * One lab's contributions, unjudged first.
	 *
	 * The list behind the judge button. Submission is write-only and `GET
	 * /labs` lists labs rather than their contributions, so until this route
	 * existed the only way to act on a contribution was to settle a whole
	 * month without ever naming one.
	 *
	 * `status` is `pending`, `accepted` or `rejected`; `pending` is the
	 * absence of a verdict rather than a stored value, which is why the
	 * server spells the three out instead of taking a boolean.
	 */
	labContributions(
		labId: string,
		params?: { status?: string; month?: string; page?: number; per_page?: number }
	) {
		return api.get<
			ApiResponse<{
				contributions: LabContributionRow[];
				page: number;
				per_page: number;
				total: number;
			}>
		>(`/admin/labs/${labId}/contributions`, params as Record<string, string | number>);
	},

	/** Accept or refuse one contribution. A refusal with no reason is
	 *  refused by the backend, which is the rule and not a formality. */
	judgeContribution(id: string, input: ContributionJudgementInput) {
		return api.post<ApiResponse<{ accepted: boolean }>>(
			`/admin/lab-contributions/${id}/judge`,
			input
		);
	},

	/** Divide a month's pool and pay it out. `month` is any day in the month;
	 *  the backend uses the first of it. Refused when nothing was accepted
	 *  and unpaid that month, so a second click cannot double-pay. */
	settleLab(labId: string, month: string) {
		return api.post<ApiResponse<{ contributions_paid: number; each: string; month: string }>>(
			`/admin/labs/${labId}/settle`,
			{ month }
		);
	},

	/** Books the programme fee. */
	closeBetaProgram(id: string) {
		return api.post<ApiResponse<{ program_fee_booked: string }>>(
			`/admin/beta-programs/${id}/close`
		);
	},

	closeLaunchCampaign(id: string) {
		return api.post<ApiResponse<{ campaign_fee_booked: string }>>(
			`/admin/launch-campaigns/${id}/close`
		);
	},

	inviteAmbassador(programId: string, userId: string) {
		return api.post<ApiResponse<{ invited: boolean }>>(
			`/admin/ambassador-programs/${programId}/invite`,
			{ user_id: userId }
		);
	},

	/** One ambassador, one month. Refused when nothing was delivered that
	 *  month or when it is already paid. */
	payAmbassador(programId: string, userId: string, month: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/ambassador-programs/${programId}/pay`,
			{ user_id: userId, month }
		);
	},

	/**
	 * Record an audit and decide in one call.
	 *
	 * The findings are the decision, not a note attached to it: the backend
	 * computes the score as their weighted mean. Every finding carries its
	 * evidence, because a score with no evidence is an opinion with a number
	 * on it.
	 */
	auditCertification(id: string, findings: AuditFinding[], notes?: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/certifications/${id}/audit`,
			notes ? { findings, notes } : { findings }
		);
	},

	revokeCertification(id: string, reason: string) {
		return api.post<ApiResponse<{ revoked: boolean }>>(
			`/admin/certifications/${id}/revoke`,
			{ reason }
		);
	},

	/** A company signed. Books the contract value against the proposal. */
	recordProposalSignature(id: string, enterpriseId: string, contractValue: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/admin/proposals/${id}/signed`, {
			enterprise_id: enterpriseId,
			contract_value: contractValue
		});
	},

	/** Commission a piece. Returns the id, which is what made publishing
	 *  work in the creating session even while no listing existed. */
	commissionSponsoredContent(input: SponsoredContentInput) {
		return api.post<ApiResponse<{ content_id: string }>>('/admin/sponsored-content', input);
	},

	/**
	 * Publish a piece at a URL, which books its fee as revenue.
	 *
	 * The URL is where the piece actually went and is required: the backend
	 * refuses anything that is not https, and refuses a second publish. The
	 * money moves here, not at commission time.
	 */
	publishSponsoredContent(id: string, url: string) {
		return api.post<ApiResponse<{ revenue_booked: string }>>(
			`/admin/sponsored-content/${id}/publish`,
			{ url }
		);
	},

	/** Appoint a juror, organiser, speaker or sponsor representative.
	 *  Separate from joining because these are invitations. */
	appointToEvent(eventId: string, userId: string, role: EventRole) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/admin/events/${eventId}/appoint`, {
			user_id: userId,
			role
		});
	},

	/** Refused for an onsite event with no address — a published event
	 *  nobody can find is worse than an unpublished one. */
	setEventStatus(eventId: string, status: EventStatus) {
		return api.post<ApiResponse<{ status: string }>>(`/admin/events/${eventId}/status`, {
			status
		});
	},

	/** Refused on an unknown platform or a non-https URL. */
	addLivestream(eventId: string, platform: string, url: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/events/${eventId}/livestreams`,
			{ platform, url }
		);
	}
};

/** `services::events::ROLES`. */
export const EVENT_ROLES = [
	'participant',
	'jury',
	'organizer',
	'speaker',
	'sponsor_rep'
] as const;

export const EVENT_STATUSES = [
	'draft',
	'published',
	'live',
	'finished',
	'cancelled'
] as const;

/**
 * Whether a set of audit findings can be submitted.
 *
 * Empty is refused because the score is their weighted mean and a mean of
 * nothing is not zero. An empty `evidence` is refused for the reason above:
 * the number would be unaccountable.
 */
export function auditIsComplete(findings: AuditFinding[]): boolean {
	return (
		findings.length > 0 &&
		findings.every((f) => f.criterion.trim() !== '' && f.evidence.trim() !== '' && f.score !== '')
	);
}
