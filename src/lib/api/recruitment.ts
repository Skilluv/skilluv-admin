/**
 * Recruitment — `recruitment.rs`, admin half.
 *
 * Four routes: the internal queue, assigning a recruiter, putting somebody
 * forward, and recording a departure inside the guarantee.
 *
 * ## What has no admin equivalent, on purpose
 *
 * `POST /api/recruitment/campaigns/{id}/respond` is the talent's own answer
 * and is reachable only from their session. The backend says so in a comment
 * and there is no admin route beside it. Shortlisting somebody asks them; it
 * does not answer for them, and this client must not grow a way to.
 */
import type {
	ApiResponse,
	DepartureInput,
	RecruitmentCampaign,
	ShortlistInput
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const recruitmentApi = {
	/** Open campaigns, unassigned first. Closed and cancelled are excluded
	 *  server-side, so this is a worklist rather than an archive. */
	campaigns() {
		return api.get<ApiResponse<{ campaigns: RecruitmentCampaign[] }>>(
			'/admin/recruitment/campaigns'
		);
	},

	/** Also moves a campaign out of `briefing` into `sourcing`: putting
	 *  somebody on it is what starts it. */
	assign(campaignId: string, recruiterUserId: string) {
		return api.post<ApiResponse<{ assigned: boolean }>>(
			`/admin/recruitment/campaigns/${campaignId}/assign`,
			{ recruiter_user_id: recruiterUserId }
		);
	},

	/** Put somebody forward, and ask them. The argument for the match is
	 *  required — the backend refuses without it, and it is what the person
	 *  reads when deciding whether they are interested. */
	shortlist(campaignId: string, input: ShortlistInput) {
		return api.post<ApiResponse<{ shortlisted: boolean }>>(
			`/admin/recruitment/campaigns/${campaignId}/shortlist`,
			input
		);
	},

	/** Somebody left inside the guarantee window; this computes the refund.
	 *  Refused if the fee was already refunded, or with no reason. */
	recordDeparture(feeId: string, input: DepartureInput) {
		return api.post<ApiResponse<{ refund_amount: string }>>(
			`/admin/recruitment/fees/${feeId}/departure`,
			input
		);
	}
};

/** The minimum argument a shortlisting must carry.
 *
 *  The backend requires a non-empty `match_reason_md` and caps it at 8000.
 *  This floor is the screen's own: "good fit" is not an argument, and the
 *  person being put forward decides on the strength of what is written here.
 */
export const MATCH_REASON_MIN = 30;
