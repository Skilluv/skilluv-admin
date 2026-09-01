/**
 * The reviewer queues served outside `/admin`.
 *
 * Twelve routes across `apprentice_verifications.rs`, `quality.rs`,
 * `vouchings.rs`, `moderation.rs`, `communication.rs`, `education.rs` and
 * `leadership.rs`. Every one of them is gated by a capability; none of them
 * carries the `/admin` prefix.
 *
 * That combination is the reason this module exists late. The reverse audit
 * scoped itself to the prefix, reported these as out of scope, and a report
 * built on it concluded the domains had no staff surface — a conclusion the
 * tool could not have reached any other way. The snapshot now records the
 * guard; see `scripts/sync-backend-routes.mjs`.
 *
 * ## What is not here
 *
 * Routes a capability check protects but that belong to the practitioner
 * rather than to staff: submitting to a challenge, uploading audio sources,
 * a cohort lead graduating a member. Holding a capability is not the same as
 * acting for the platform, and an admin panel that offered those would be
 * inviting somebody to act in a role they merely qualify for.
 */
import type {
	ApiResponse,
	ApprenticeVerdict,
	BugReviewDecision,
	ModeratePostBody,
	MuteUserBody,
	PendingApprenticeVerification,
	QualityBugReport,
	ReviewTranslationBody,
	TranslationReview,
	VouchingQueueResponse,
	VouchingStatus
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const reviewApi = {
	// --- Apprentice verifications (capability `apprentice_verifier`) ---

	apprenticeQueue(params?: { limit?: number; offset?: number }) {
		return api.get<ApiResponse<{ pending: PendingApprenticeVerification[] }>>(
			'/beginner/verifications/queue',
			params as Record<string, number>
		);
	},

	/** A second verdict on the same request is refused server-side, which is
	 *  what stops two compagnons racing each other on the same row. */
	recordVerdict(id: string, verdict: ApprenticeVerdict, notes?: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/beginner/verifications/${id}/verdict`,
			notes ? { verdict, notes } : { verdict }
		);
	},

	// --- Quality (capability `quality_reviewer:{family}`) ---

	/** Unreviewed defect reports, worst severity first then oldest. Capped at
	 *  100 server-side. */
	bugReviewQueue() {
		return api.get<ApiResponse<{ reports: QualityBugReport[] }>>('/quality/bugs/review-queue');
	},

	/**
	 * Decide a defect report.
	 *
	 * The guard is per-report rather than global: the backend reads the
	 * orientation on the slice the report hangs off and demands a reviewer of
	 * *that* trade. A defect report against a game build and one against an
	 * API are both `bug_report`, and the people who can judge them differ —
	 * so a 403 here means the wrong family, not the wrong role.
	 */
	reviewBug(id: string, decision: BugReviewDecision) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/quality/bugs/${id}/review`,
			decision
		);
	},

	verifyTestRun(id: string) {
		return api.post<ApiResponse<{ run: unknown }>>(`/quality/test-runs/${id}/verify`);
	},

	// --- Vouchings (capability `community_moderator`) ---

	/** The queue behind an action this app already had.
	 *
	 *  `breakVouching` has been wired since the post-MVP batch with no list
	 *  in front of it — the same shape SKI-337 described for research tokens.
	 *  Sorted so flagged backings surface first. */
	vouchingQueue(params?: {
		status?: VouchingStatus;
		voucher_id?: string;
		vouched_id?: string;
		at_stake_kind?: string;
		limit?: number;
		offset?: number;
	}) {
		return api.get<ApiResponse<VouchingQueueResponse>>(
			'/moderation/vouchings',
			params as Record<string, string | number>
		);
	},

	// --- Forum moderation (capability `forum_moderator`) ---

	/** `hide` is a soft delete: the post stays readable to moderators, so an
	 *  appeal is instructed against what was written rather than against a
	 *  recollection of it. */
	moderatePost(postId: string, body: ModeratePostBody) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/forum/posts/${postId}/moderate`,
			body
		);
	},

	/** A forum moderator is capped at 168 hours. Longer than that is a ban,
	 *  which is a different decision behind a different endpoint. */
	muteUser(userId: string, body: MuteUserBody) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/forum/users/${userId}/mute`, body);
	},

	// --- Per-slice confirmations, one per domain ---

	/** Public read: the point of the record is that a reader weighing the
	 *  attestation can see whose word it rests on. */
	translationReviews(sliceId: string) {
		return api.get<ApiResponse<TranslationReview[]>>(
			`/communication/slices/${sliceId}/translation-reviews`
		);
	},

	reviewTranslation(sliceId: string, body: ReviewTranslationBody) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/communication/slices/${sliceId}/translation-reviews`,
			body
		);
	},

	/** Declares that an education artefact carries no learner data. A
	 *  statement about a file, made by somebody accountable for it. */
	declareLearnerDataCleared(sliceId: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/education/slices/${sliceId}/learner-data-cleared`
		);
	},

	/** Everything measured on one slice. The ids a reproduction needs come
	 *  from here. */
	sliceBenchmarks(sliceId: string) {
		return api.get<ApiResponse<Record<string, unknown>>>(`/slices/${sliceId}/benchmarks`);
	},

	/** A reviewer re-ran the measurement. `notes` is optional because "same
	 *  numbers" is a complete answer. */
	reproduceBenchmark(id: string, notes?: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/benchmarks/${id}/reproduce`,
			notes ? { notes } : {}
		);
	},

	/** Attest a credit on somebody else's released work. By hand, because
	 *  nothing here can read a credit roll — which is the whole value of the
	 *  attestation: a competent person went and looked. */
	creditAudioDeliverable(deliverableId: string, username: string, evidenceUrl: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/audio/deliverables/${deliverableId}/credit`,
			{ username, evidence_url: evidenceUrl }
		);
	},

	/** Confirms a leadership artefact has been redacted. This is what the
	 *  attestation was waiting for, so the backend recomputes the author's
	 *  proofs on the spot. */
	confirmRedaction(sliceId: string) {
		return api.post<ApiResponse<{ confirmed: boolean }>>(
			`/leadership/slices/${sliceId}/redaction/confirm`
		);
	}
};

export const APPRENTICE_VERDICTS = ['approved', 'rejected', 'abstain'] as const;

/** `services::vouchings::QUEUE_STATUSES`. Derived rather than stored:
 *  "expired" is the absence of a break plus a date in the past. */
export const VOUCHING_STATUSES = ['live', 'broken', 'expired'] as const;

export const FORUM_POST_ACTIONS = ['hide', 'lock', 'unlock', 'unhide'] as const;

export const BUG_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

/** A forum moderator cannot mute for longer than this. Beyond it the right
 *  instrument is a ban, which is a different decision with a different
 *  audit trail. */
export const MUTE_MAX_HOURS = 168;

/** Required on a rejection, on both sides. */
export function bugDecisionNeedsReason(decision: string): boolean {
	return decision === 'reject';
}
