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
 * `POST /admin/launch-campaigns/{id}/open` are absent, deliberately. They act
 * on a **draft**, and a draft is in no public list — only in
 * `/enterprise/*`, which is scoped to the calling company. Wiring them would
 * mean a form asking for a UUID somebody got out of psql, which is the
 * problem SKI-337 named rather than a way around it. They are in SKI-354.
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
	LabRow,
	LaunchCampaignRow,
	ProposalRow
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

	// --- Writes ---

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
