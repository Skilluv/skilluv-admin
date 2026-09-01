/**
 * Post-MVP Tier 1 / 2 / 3 (SKI-36 → SKI-47) — admin-side client.
 *
 * These features are user-facing first: bookmarks, private notes, personal
 * goals, peer matching and the AI companion are scoped to the caller by the
 * backend and have no admin or moderator route at all, so nothing here
 * touches them. What is left is the surface an operator can legitimately
 * reach:
 *
 *   * timeline (SKI-39)         — read a profile's history, replay it;
 *   * external signals (SKI-42) — the moderation review queue;
 *   * vouchings (SKI-46)        — read who backs a user, break a vouching;
 *   * skill tree (SKI-47)       — read a user's tree, edit prerequisites;
 *   * cohorts (SKI-40)          — read-only oversight of public cohorts;
 *   * talent offers (SKI-45)    — read-only oversight of the marketplace.
 *
 * Two of those live under `/moderation/*`, not `/admin/*`, and are gated by
 * a capability (`community_moderator` / `community_curator`) rather than by
 * `role='admin'`. An admin account without that capability gets a 403 — the
 * calling screens surface it instead of hiding the section, so the fix
 * (grant the capability on the user page) is discoverable.
 */
import type {
	ApiResponse,
	Cohort,
	CohortDetail,
	CohortListEntry,
	CohortMember,
	CohortMilestone,
	ExternalSignal,
	ExternalSignalBuckets,
	SetPrerequisitesResult,
	SkillNodeDomain,
	SkillTreeResponse,
	TalentOfferListing,
	TalentOfferType,
	TimelineBackfillResult,
	TimelineEventType,
	TimelineResponse,
	UserVouching,
	VouchingBreakReport
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const engagementApi = {
	// --- Timeline (SKI-39) ---

	/** Public read, but scoped by profile visibility: a hidden or banned
	 *  profile answers 404 even for an admin. */
	getUserTimeline(
		userId: string,
		params?: { event_type?: TimelineEventType; limit?: number; offset?: number }
	) {
		return api.get<ApiResponse<TimelineResponse>>(
			`/users/${userId}/timeline`,
			params as Record<string, string | number>
		);
	},

	/** Replay one user's timeline from the source tables. Idempotent. */
	backfillUserTimeline(userId: string) {
		return api.post<ApiResponse<TimelineBackfillResult>>(
			`/admin/users/${userId}/backfill-timeline`
		);
	},

	// --- External signals (SKI-42) ---

	/** Review queue: unverified signals only, oldest first. */
	listPendingExternalSignals(params?: { limit?: number }) {
		return api.get<ApiResponse<{ pending: ExternalSignal[] }>>(
			'/moderation/external-signals',
			params as Record<string, number>
		);
	},

	/** Confirms ownership of the claim. Never turns it into a Skilluv proof. */
	verifyExternalSignal(id: string) {
		return api.post<ApiResponse<{ signal: ExternalSignal }>>(
			`/moderation/external-signals/${id}/verify`
		);
	},

	/**
	 * Remove a bogus or abusive claim. 204, no body.
	 *
	 * `reason` is required and the backend refuses anything under eight
	 * characters — this erases a declaration somebody made about themselves,
	 * and the refusal message says so. It travels as a query parameter
	 * because the route is a DELETE and the backend reads it from there.
	 */
	deleteExternalSignal(id: string, reason: string) {
		return api.delete<void>(
			`/moderation/external-signals/${id}?reason=${encodeURIComponent(reason)}`
		);
	},

	/** A single profile's signals, split into verified and declared. */
	getUserExternalSignals(userId: string) {
		return api.get<ApiResponse<ExternalSignalBuckets>>(`/users/${userId}/external-signals`);
	},

	// --- Vouchings (SKI-46) ---

	/** Live vouchings backing a user — broken and expired ones are excluded
	 *  backend-side, so this is the actionable set. */
	getUserVouchings(userId: string) {
		return api.get<ApiResponse<{ vouchings: UserVouching[]; count: number }>>(
			`/users/${userId}/vouchings`
		);
	},

	/** Costs the voucher a rank for three months when `at_stake_kind` is
	 *  `rank_temporary`. The reason is stored and must be at least 8 chars. */
	breakVouching(id: string, reason: string) {
		return api.post<ApiResponse<VouchingBreakReport>>(`/moderation/vouchings/${id}/break`, {
			reason
		});
	},

	// --- Skill tree (SKI-47) ---

	/** The whole catalog with this user's status per node. Not paginated:
	 *  a partial graph cannot be laid out. */
	getUserSkillTree(userId: string, params?: { domain?: SkillNodeDomain }) {
		return api.get<ApiResponse<SkillTreeResponse>>(
			`/users/${userId}/skill-tree`,
			params as Record<string, string>
		);
	},

	/** Full replacement of a skill's prerequisites — an empty array clears
	 *  them. Rejected backend-side if it would introduce a cycle, and capped
	 *  at 20 entries. */
	setSkillPrerequisites(skillId: string, prerequisiteSkillIds: string[]) {
		return api.put<ApiResponse<SetPrerequisitesResult>>(
			`/admin/skills/${skillId}/prerequisites`,
			{ prerequisite_skill_ids: prerequisiteSkillIds }
		);
	},

	// --- Cohorts (SKI-40) ---

	/** Discovery listing: public, non-archived cohorts only. Private cohorts
	 *  are invisible here even to an admin — the backend has no override. */
	listCohorts(params?: {
		orientation?: string;
		upcoming_only?: boolean;
		limit?: number;
		offset?: number;
	}) {
		return api.get<ApiResponse<{ cohorts: CohortListEntry[]; limit: number; offset: number }>>(
			'/cohorts',
			params as Record<string, string | number | boolean>
		);
	},

	getCohort(id: string) {
		return api.get<ApiResponse<CohortDetail>>(`/cohorts/${id}`);
	},

	getCohortMembers(id: string) {
		return api.get<ApiResponse<{ members: CohortMember[] }>>(`/cohorts/${id}/members`);
	},

	getCohortMilestones(id: string) {
		return api.get<ApiResponse<{ milestones: CohortMilestone[] }>>(`/cohorts/${id}/milestones`);
	},

	// --- Talent offers (SKI-45) ---

	/** Public browse. Only active offers from eligible (Artisan+, unpenalised,
	 *  non-hidden) authors appear — the same list a visitor sees. */
	browseTalentOffers(params?: {
		offer_type?: TalentOfferType;
		skill?: string;
		free_only?: boolean;
		limit?: number;
		offset?: number;
	}) {
		return api.get<ApiResponse<{ offers: TalentOfferListing[]; limit: number; offset: number }>>(
			'/talent-offers',
			params as Record<string, string | number | boolean>
		);
	}
};

/** Re-exported so screens can build filters without restating the list. */
export const TALENT_OFFER_TYPES: TalentOfferType[] = [
	'pair_programming',
	'code_review',
	'whiteboard',
	'mock_interview',
	'career_advice'
];

export const TIMELINE_EVENT_TYPES: TimelineEventType[] = [
	'signup',
	'orientation_added',
	'deliverable_verified',
	'rank_promoted',
	'capability_granted',
	'attestation_received',
	'event_participation',
	'first_bounty_earned',
	'first_mentor_session'
];

/** Kept in sync with `services::external_signals::PROVIDERS`. */
export const EXTERNAL_SIGNAL_PROVIDERS = [
	'github',
	'medium',
	'dev_to',
	'conf_ref',
	'behance',
	'dribbble',
	'artstation',
	'vimeo',
	'foundry'
] as const;

/** Type guard used by the cohort screen to tell an archived cycle apart. */
export function isCohortArchived(c: Cohort): boolean {
	return c.archived_at !== null;
}
