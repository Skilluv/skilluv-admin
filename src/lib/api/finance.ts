/**
 * The finance line — four queues and the seven decisions they carry.
 *
 * Until SKI-354 landed, `/admin/finance/*` had seven POSTs and **no GET at
 * all**. Nobody could disburse an advance because nobody could find one. The
 * four lists below are what changed; the writes have been there all along.
 *
 * ## What each queue sorts on, and why it matters
 *
 * Every list puts the rows a human owes an answer to at the top, and the
 * ordering is the server's rather than this client's:
 *
 *   * advances — approved but not yet disbursed;
 *   * referrals — undecided;
 *   * guarantee claims — unpaid;
 *   * partnerships — **drafts first**, because the public `/finance/partners`
 *     shows active partnerships only, so the one waiting to be activated was
 *     the only one nobody could see.
 *
 * Re-sorting here would put this app's opinion over the backend's, and the
 * backend's is the one written next to the query.
 */
import type {
	ApiResponse,
	FinanceAdvance,
	FinanceGuaranteeClaim,
	FinancePartnership,
	FinanceReferral,
	GuaranteeClaimInput,
	PartnershipInput,
	ReferralDecisionInput
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const financeApi = {
	// --- The four queues ---

	advances(params?: { status?: string }) {
		return api.get<ApiResponse<{ advances: FinanceAdvance[] }>>(
			'/admin/finance/advances',
			params as Record<string, string>
		);
	},

	referrals(params?: { status?: string }) {
		return api.get<ApiResponse<{ referrals: FinanceReferral[] }>>(
			'/admin/finance/referrals',
			params as Record<string, string>
		);
	},

	guaranteeClaims(params?: { status?: string }) {
		return api.get<ApiResponse<{ claims: FinanceGuaranteeClaim[] }>>(
			'/admin/finance/guarantee-claims',
			params as Record<string, string>
		);
	},

	partnerships(params?: { status?: string }) {
		return api.get<ApiResponse<{ partnerships: FinancePartnership[] }>>(
			'/admin/finance/partnerships',
			params as Record<string, string>
		);
	},

	// --- Advances ---

	/** Money leaves here. */
	disburseAdvance(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/finance/advances/${id}/disburse`
		);
	},

	markAdvanceRepaid(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/finance/advances/${id}/repaid`
		);
	},

	/** Writing an advance off is not marking it repaid. The first says the
	 *  money is not coming back and records the loss; the second says it
	 *  came. Two routes because they are two different facts about the same
	 *  row, and a single "settle" would let one be recorded as the other. */
	writeOffAdvance(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/finance/advances/${id}/write-off`
		);
	},

	// --- Referrals ---

	/** An approval carries the amount and the premium the partner set; a
	 *  refusal carries neither. Both carry a note when there is one to
	 *  carry — the person who asked reads it either way. */
	decideReferral(id: string, decision: ReferralDecisionInput) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/finance/referrals/${id}/decision`,
			decision
		);
	},

	// --- Guarantee claims ---

	/** Pay a contributor for work a client refused to pay for. This creates
	 *  the claim and settles it in one call — the guarantee exists so nobody
	 *  waits on a second decision. */
	honourGuaranteeClaim(claim: GuaranteeClaimInput) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			'/admin/finance/guarantee-claims',
			claim
		);
	},

	// --- Partnerships ---

	/** Opens as a draft. An introduction Skilluv cannot lawfully make should
	 *  not be advertised as coming soon, which is why the public list shows
	 *  active partnerships only — and why this one had to exist. */
	openPartnership(input: PartnershipInput) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			'/admin/finance/partnerships',
			input
		);
	},

	/** The act the public list could not reach: a partnership is invisible
	 *  there until it is active, and this is what makes it active. */
	activatePartnership(id: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/finance/partnerships/${id}/activate`
		);
	}
};

/** Advance statuses, as the queue filter offers them. */
export const ADVANCE_STATUSES = ['requested', 'approved', 'disbursed', 'repaid', 'written_off'] as const;

/** The one advance transition that means the money is gone. Named so a
 *  screen can ask for confirmation on it and not on the others. */
export function advanceIsLoss(action: string): boolean {
	return action === 'write-off';
}
