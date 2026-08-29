/**
 * Running a domain, and the queues that come with it.
 *
 * Eleven routes across `admin_domains.rs`, `credentials.rs`, `cohorts.rs`
 * and `talent_offers.rs`.
 *
 * ## Three different gates, and none of them is `admin` alone
 *
 *   * the domain routes accept `admin`, `domain_curator:{domain}` or
 *     `domain_curator:all` — reading how a domain is doing is deliberately
 *     not the same permission as changing it, so a curator can see the
 *     reviewer backlog without being able to revoke a capability;
 *   * the cohort and offer routes accept `admin` or `community_moderator`;
 *   * the credential routes are `admin` only.
 *
 * The screens do not hide anything on the strength of a guess about which
 * the caller holds. The server decides and its 403 names the capability,
 * which is the only thing that tells somebody what to ask for.
 */
import type {
	AdminCohortsResponse,
	AdminTalentOffersResponse,
	ApiResponse,
	DomainFeaturedCandidate,
	DomainOverview,
	DomainReviewerStats,
	PendingCredential,
	TerrainProposal
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const oversightApi = {
	// --- Domain dashboard ---

	/** Eleven counters in one round trip, so the page cannot show figures
	 *  from eleven different instants. */
	domainOverview(domain: string, params?: { days?: number }) {
		return api.get<ApiResponse<DomainOverview>>(
			`/admin/domains/${domain}/overview`,
			params as Record<string, number>
		);
	},

	/** No ranking and no target, by design. A reviewer who asks for
	 *  iterations more often than the others is not necessarily doing it
	 *  wrong — saying "not yet" is the point of the round — and a page that
	 *  shamed it would teach reviewers to approve. */
	domainReviewers(domain: string, params?: { days?: number }) {
		return api.get<ApiResponse<DomainReviewerStats[]>>(
			`/admin/domains/${domain}/reviewers`,
			params as Record<string, number>
		);
	},

	/** A suggestion, never a decision. The featuring itself is a separate
	 *  call that demands a written reason. */
	domainFeaturedQueue(domain: string, params?: { days?: number }) {
		return api.get<ApiResponse<DomainFeaturedCandidate[]>>(
			`/admin/domains/${domain}/featured-queue`,
			params as Record<string, number>
		);
	},

	// --- Terrains: the projects a domain takes on ---

	/** Proposed terrains for a domain, with what each is waiting on. */
	domainTerrains(domain: string) {
		return api.get<ApiResponse<{ terrains: TerrainProposal[] }>>(
			`/domains/${domain}/terrains`
		);
	},

	/** A steward has taken a proposed terrain on, under a project that must
	 *  already exist. The backend refuses an unknown slug rather than
	 *  creating one: a project has an owner who greets newcomers and answers
	 *  for what happens there, and no endpoint can appoint that person. */
	adoptTerrain(domain: string, slug: string, projectSlug: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/domains/${domain}/terrains/${slug}/adopt`,
			{ project_slug: projectSlug }
		);
	},

	/** Turn a proposal down, on the record. The reason is required: a
	 *  shortlist that silently loses entries teaches the next researcher
	 *  nothing, and they will propose the same project again. */
	declineTerrain(domain: string, slug: string, reason: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/domains/${domain}/terrains/${slug}/decline`,
			{ reason }
		);
	},

	// --- Credentials issued elsewhere ---

	pendingCredentials() {
		return api.get<ApiResponse<{ credentials: PendingCredential[] }>>(
			'/admin/credentials/pending'
		);
	},

	/** The note is the record of the check, not a comment on it. The backend
	 *  refuses anything under twenty characters: "OK" is not a record of
	 *  having opened an issuer's page, and what was opened and what it said
	 *  is. */
	verifyCredential(id: string, note: string) {
		return api.post<ApiResponse<{ verified: boolean }>>(`/admin/credentials/${id}/verify`, {
			note
		});
	},

	refuseCredential(id: string, note: string) {
		return api.post<ApiResponse<{ refused: boolean }>>(`/admin/credentials/${id}/refuse`, {
			note
		});
	},

	// --- Cohorts, as moderation sees them ---

	/** The public listing plus what moderation needs and discovery does not:
	 *  who runs it, and whether the chat is alive. Private and archived
	 *  cohorts are opt-in rather than default — the common case is the live
	 *  public set. */
	adminCohorts(params?: {
		orientation?: string;
		include_private?: boolean;
		include_archived?: boolean;
		limit?: number;
		offset?: number;
	}) {
		return api.get<ApiResponse<AdminCohortsResponse>>(
			'/admin/cohorts',
			params as Record<string, string | number | boolean>
		);
	},

	/** Irreversible, and the backend asks for at least eight characters
	 *  saying why. */
	archiveCohort(id: string, reason: string) {
		return api.post<ApiResponse<{ cohort: unknown }>>(`/admin/cohorts/${id}/archive`, {
			reason
		});
	},

	// --- Talent offers, as moderation sees them ---

	adminTalentOffers(params?: {
		offer_type?: string;
		skill?: string;
		user_id?: string;
		include_inactive?: boolean;
		held_only?: boolean;
		limit?: number;
		offset?: number;
	}) {
		return api.get<ApiResponse<AdminTalentOffersResponse>>(
			'/admin/talent-offers',
			params as Record<string, string | number | boolean>
		);
	},

	/** A moderation hold, not a delete. The offer stays readable so a dispute
	 *  over it can be instructed against what was actually published rather
	 *  than against somebody's recollection of it. */
	deactivateTalentOffer(id: string, reason: string) {
		return api.post<ApiResponse<{ offer: unknown }>>(`/admin/talent-offers/${id}/deactivate`, {
			reason
		});
	},

	reinstateTalentOffer(id: string) {
		return api.post<ApiResponse<{ offer: unknown }>>(`/admin/talent-offers/${id}/reinstate`);
	}
};

/** `services::credentials::verify` refuses a shorter note. */
export const CREDENTIAL_NOTE_MIN = 20;

/** Both moderation reasons here have the same floor server-side. */
export const MODERATION_REASON_MIN = 8;

/**
 * Why an offer is not in the public browse.
 *
 * Only one of these five is a moderator's doing, and the screen says which:
 * reinstating an offer whose author is banned would change nothing, and
 * offering that button would be a lie about what it does.
 */
export const OFFER_HIDDEN_REASONS = [
	'paused_by_author',
	'moderation_hold',
	'author_hidden',
	'author_banned',
	'rank_below_bar'
] as const;

export function isModerationHold(hiddenReason: string | null): boolean {
	return hiddenReason === 'moderation_hold';
}
