/**
 * Paid missions, seen from outside the two parties.
 *
 * ## Why there is no `/admin/design-missions` and no `/admin/cyber-missions`
 *
 * The two Linear tickets (SKI-162 for cyber, SKI-249 for design) each ask for
 * their own admin page. The backend answered with one: migration 0192 built
 * missions, applications and billing for every domain, keyed by
 * `mission_types.skill_domain`. Design needed rows, not a mechanism, and got
 * twelve of them; security got its own.
 *
 * So a design mission is a mission with `skill_domain = 'design'`, a cyber
 * mission is one with `skill_domain = 'security'`, and this module is the
 * single surface both tickets describe. The two pages they asked for are the
 * same page with the filter pre-set, which is why `/missions?domain=design`
 * exists and `/design-missions` does not.
 *
 * ## What an admin is for here
 *
 * Not running missions. A mission belongs to the enterprise that posted it
 * and the person who took it, and both already have every action they need.
 * What neither has is a way out of the case where they disagree and neither
 * will move: the mission sits `in_progress` for ever and the money sits in
 * escrow.
 *
 * That is the whole write surface — one decision, taken by somebody outside,
 * recorded as having been decided rather than agreed. It can be taken once.
 */
import type {
	AdminMissionDetail,
	AdminMissionRow,
	ApiPaginatedResponse,
	ApiResponse,
	MissionStatus,
	MissionType,
	SkillDomain
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

/** How the board is narrowed.
 *
 *  `skill_domain` is optional for an admin and required for a curator: the
 *  backend answers "all of them" only to somebody entitled to all of them,
 *  rather than handing a design curator the security board. */
export interface AdminMissionQuery {
	skill_domain?: SkillDomain;
	/** A `mission_types` slug — `brand_identity_design`, `pentest_web`… */
	mission_type?: string;
	status?: MissionStatus;
	/** Only missions where the two sides have stopped moving. The queue an
	 *  arbiter actually works. */
	stuck_only?: boolean;
	/** How long without a decision counts as stuck. Twenty-one days by
	 *  default: long enough that a fortnight's holiday is not a dispute. */
	stuck_after_days?: number;
	page?: number;
	per_page?: number;
}

export const missionsApi = {
	/** Every kind of paid work, per domain. Public, and used to build the
	 *  type filter rather than hard-coding a list that drifts. */
	types() {
		return api.get<ApiResponse<{ mission_types: MissionType[] }>>('/missions/types');
	},

	/**
	 * The mission board, narrowed.
	 *
	 * Ordered by how long a hand-in has gone unanswered, oldest first, then
	 * by creation date — so the missions that need somebody are at the top
	 * whether or not the stuck filter is on.
	 *
	 * Paginated in the shape every other admin listing answers, `total`
	 * included: without it a pager can only ever offer one more page when the
	 * current one comes back full, which is a guess about whether there is
	 * anything on it.
	 */
	list(params?: AdminMissionQuery) {
		return api.get<ApiPaginatedResponse<AdminMissionRow>>(
			'/admin/missions',
			params as Record<string, string | number | boolean>
		);
	},

	/** One mission and everything that happened to it: the rounds, the
	 *  invoices, the IP terms, and the arbitration if there was one.
	 *
	 *  A mission nobody may read answers 404 rather than 403 — which missions
	 *  exist is not a curator's business. */
	detail(slug: string) {
		return api.get<ApiResponse<AdminMissionDetail>>(
			`/admin/missions/${encodeURIComponent(slug)}`
		);
	},

	/**
	 * Take a mission off the board.
	 *
	 * The counterpart of there being no review before publication: Skilluv
	 * does not read a mission before it goes live — the KYC gate upstream
	 * decides who may post at all — so it needs the gesture after. Until
	 * this endpoint existed no administrator could touch a mission, including
	 * one breaking the terms.
	 *
	 * `cancelled` is the only status an administrator sets on somebody else's
	 * mission; moving it forward belongs to the two parties. Twenty
	 * characters of reason minimum, read by the enterprise and by whoever was
	 * working on it, and it is the only account either of them gets.
	 *
	 * Refused with 409 on a `delivered` mission, pointing at
	 * {@link missionsApi.arbitrate}: cancelling there would take the escrow
	 * back from somebody who handed in the work, on one person's say-so and
	 * with nothing recording that the delivery was weighed.
	 */
	takeDown(slug: string, reason: string) {
		return api.post<ApiResponse<AdminMissionDetail>>(
			`/admin/missions/${encodeURIComponent(slug)}/status`,
			{ status: 'cancelled', reason }
		);
	},

	/**
	 * Decide a mission neither side will end.
	 *
	 * `accepted` — the delivery stands and the money is released.
	 * `cancelled` — the mission ends and the escrow goes back.
	 *
	 * No third outcome: both already exist in the mission's own vocabulary,
	 * and what this adds is the record that the outcome was decided rather
	 * than agreed. The reason has an eighty-character floor because both
	 * sides read it and one of them has just lost.
	 *
	 * Once per mission. Re-arbitrating would re-open a decision that has
	 * already moved money.
	 */
	arbitrate(slug: string, outcome: 'accepted' | 'cancelled', reasonMd: string) {
		return api.post<ApiResponse<AdminMissionDetail>>(
			`/admin/missions/${encodeURIComponent(slug)}/arbitrate`,
			{ outcome, reason_md: reasonMd }
		);
	}
};

/** The floor the backend enforces on an arbitration reason. Restated here so
 *  the form can refuse before the round trip, and kept as one constant so the
 *  two cannot drift apart silently. */
export const ARBITRATION_REASON_MIN = 80;

/** The floor on a take-down reason. Lower than an arbitration because it
 *  settles nothing between the parties — but not absent, because two
 *  people read it and `spam` is a verdict rather than a reason. */
export const TAKEDOWN_REASON_MIN = 20;
