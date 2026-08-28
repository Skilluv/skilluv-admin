/**
 * Skilluv Design — the admin-reachable half of the design workflow.
 *
 * ## What the backlog asked for, and what the backend built
 *
 * SKI-205 specifies an `/api/admin/design/*` family: an overview of KPIs,
 * contest CRUD, a featured queue, validator statistics, moderation actions.
 * Most of that was not built under that prefix, and for a reason worth
 * writing down rather than working around:
 *
 *   * **Contests** are tournaments. A design contest is a `brief_contest`
 *     with `skill_domain = 'design'`; the difference between a contest about
 *     a logotype and one about a parser is the subject, not the mechanism.
 *     Contest administration therefore goes through `adminApi`.
 *   * **Missions** are missions. A design mission is one with
 *     `skill_domain = 'design'` — see `missionsApi`.
 *   * **Validator statistics** already exist for every domain at
 *     `/admin/validators/stats`.
 *   * **Moderation** of a copied entry is a plagiarism case, and the queue is
 *     cross-domain: {@link designApi.plagiarismQueue}.
 *   * **The featured designer** is the weekly featuring every domain has:
 *     {@link designApi.feature}.
 *
 * What is genuinely design-shaped got its own routes, and they are all here:
 * the critique loop, the brief queue that feeds it, the automated checks, the
 * version trail, the profile and the score.
 *
 * The one thing SKI-205 asks for that nothing serves is the aggregated
 * overview — there is no endpoint returning "contributors actifs, challenges
 * ouverts, contests en cours". The screens compose what they can from the
 * queues themselves and say so; they do not invent a number.
 *
 * ## Capability scoping, and why an empty queue is ambiguous
 *
 * `GET /api/design/reviews/queue` filters on the caller's capabilities. With
 * `admin` or `design_reviewer:all` it is unfiltered; otherwise it narrows to
 * the families the caller holds, and returns an empty list rather than a 403
 * when they hold none. An empty queue is therefore genuinely ambiguous, and
 * the calling screen says so instead of implying there is no work waiting.
 */
import type {
	ApiResponse,
	AdminSlice,
	DesignAutoCheck,
	DesignBriefProposal,
	DesignComparison,
	DesignProfile,
	DesignReviewRound,
	DesignTiersResponse,
	DesignVersionAtRound,
	FeaturedCard,
	FeaturedTalent,
	PlagiarismCase,
	SkillDomain
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const designApi = {
	// ── The critique loop ────────────────────────────────────────

	/**
	 * Design slices waiting for a critique, oldest first.
	 *
	 * A reviewer never sees the slice they claimed themselves.
	 */
	reviewQueue(params?: { limit?: number }) {
		return api.get<ApiResponse<{ slices: AdminSlice[] }>>(
			'/design/reviews/queue',
			params as Record<string, number>
		);
	},

	/** The whole critique trail for one slice, oldest round first. Public:
	 *  the sequence of rounds is the most convincing thing a designer can
	 *  show. */
	reviewHistory(sliceId: string) {
		return api.get<ApiResponse<{ rounds: DesignReviewRound[] }>>(
			`/design/slices/${sliceId}/reviews`
		);
	},

	/**
	 * What the automated checks said, per round.
	 *
	 * Contrast, motion budget, token linting. Advisory and stated as such:
	 * none of them decides a verdict, and a reviewer who overrules one is
	 * doing their job rather than ignoring a gate.
	 */
	autoChecks(sliceId: string) {
		return api.get<ApiResponse<{ checks: DesignAutoCheck[] }>>(
			`/design/slices/${sliceId}/auto-checks`
		);
	},

	/** One reviewed version, at the round it was reviewed. */
	versionAt(sliceId: string, round: number) {
		return api.get<ApiResponse<{ version: DesignVersionAtRound }>>(
			`/design/slices/${sliceId}/versions/${round}`
		);
	},

	/** Two versions and every critique said between them — the reason the
	 *  second one looks the way it does. */
	compare(sliceId: string, from: number, to: number) {
		return api.get<ApiResponse<{ comparison: DesignComparison }>>(
			`/design/slices/${sliceId}/compare`,
			{ from, to }
		);
	},

	// ── The brief queue ──────────────────────────────────────────

	/**
	 * Briefs waiting to be read, oldest first.
	 *
	 * Oldest first so nobody waits twice — the same rule the review queue
	 * follows, and for the same reason.
	 *
	 * Gated by `community_curator` rather than by `admin` alone: reserving
	 * curation to administrators makes the queue's length a function of how
	 * many administrators there are.
	 */
	briefQueue(params?: { limit?: number }) {
		return api.get<ApiResponse<{ briefs: DesignBriefProposal[] }>>(
			'/admin/design/briefs',
			params as Record<string, number>
		);
	},

	/** Accept a brief: it becomes a slice somebody can claim. Answers 409
	 *  once it has been decided either way. */
	publishBrief(id: string) {
		return api.post<ApiResponse<{ brief: DesignBriefProposal }>>(
			`/admin/design/briefs/${id}/publish`
		);
	},

	/** Refuse a brief, saying why. Twenty characters minimum, and the author
	 *  reads it — a refusal with no reason comes back next week as the same
	 *  brief. */
	rejectBrief(id: string, feedback: string) {
		return api.post<ApiResponse<{ brief: DesignBriefProposal }>>(
			`/admin/design/briefs/${id}/reject`,
			{ feedback }
		);
	},

	// ── Accusations of copying ───────────────────────────────────

	/**
	 * Open plagiarism cases, oldest first.
	 *
	 * Cross-domain, not design-only: an entry copied into a security contest
	 * is the same case as one copied into a design contest. Gated by
	 * `plagiarism_reviewer` or `admin`.
	 */
	plagiarismQueue(params?: { limit?: number }) {
		return api.get<ApiResponse<PlagiarismCase[]>>(
			'/admin/plagiarism',
			params as Record<string, number>
		);
	},

	/**
	 * Decide a case.
	 *
	 * Upholding disqualifies the entry; dismissing clears it. Either way the
	 * decision needs eighty characters, because an accusation dropped without
	 * a word leaves the accusation standing in everybody's memory.
	 */
	decidePlagiarism(id: string, upheld: boolean, decisionMd: string) {
		return api.post<ApiResponse<PlagiarismCase>>(`/admin/plagiarism/${id}/decide`, {
			upheld,
			decision_md: decisionMd
		});
	},

	// ── The weekly featuring ─────────────────────────────────────

	/** Who is featured in a domain this week. Returns `null` rather than 404
	 *  when nobody is: a quiet week is a normal week. */
	featuredThisWeek(domain: SkillDomain) {
		return api.get<ApiResponse<{ featured: FeaturedTalent | null }>>(`/featured/${domain}`);
	},

	/** The last weeks of a domain, newest first. */
	featuredRecent(domain: SkillDomain, params?: { limit?: number }) {
		return api.get<ApiResponse<{ featured: FeaturedTalent[] }>>(
			`/featured/${domain}/recent`,
			params as Record<string, number>
		);
	},

	/**
	 * Put somebody forward for a week.
	 *
	 * One per domain per week — two people featured in one week means neither
	 * was, and the scarcity is the whole value. Refused for a date that is
	 * not a Monday rather than rounded to one: rounding somebody's intent is
	 * how a featuring lands on the wrong week. Also refused for anybody with
	 * nothing verified in the domain.
	 */
	feature(body: {
		skill_domain: SkillDomain;
		/** The Monday of the week, `YYYY-MM-DD`. */
		week_of: string;
		user_id: string;
		/** Published as written. Forty characters minimum. */
		reason_md: string;
		/** Optional: somebody can be put forward for a body of work rather
		 *  than one piece. */
		deliverable_id?: string;
	}) {
		return api.post<ApiResponse<{ featured: FeaturedTalent }>>('/admin/featured', body);
	},

	/**
	 * The post a person will send.
	 *
	 * Returned, never published. Nothing here posts to a social network on a
	 * schedule: publishing somebody's name and work to a third party with no
	 * human between the decision and the post is not a feature.
	 */
	featuredCard(domain: SkillDomain, week: string) {
		return api.get<ApiResponse<{ card: FeaturedCard }>>(
			`/admin/featured/${domain}/${week}/card`
		);
	},

	// ── Profile and score ────────────────────────────────────────

	/**
	 * A designer's public profile: craft score, its breakdown, validated
	 * artefacts with their round counts, contest standings, trades and
	 * attestations.
	 *
	 * Addressed by username, not by id — it is the public profile route. A
	 * hidden profile answers 404, the same answer as a nonexistent user, so
	 * the endpoint cannot be used to enumerate who exists.
	 */
	profile(username: string) {
		return api.get<ApiResponse<DesignProfile>>(
			`/users/${encodeURIComponent(username)}/design-profile`
		);
	},

	/** The craft-score ladder and the weights behind it. */
	tiers() {
		return api.get<ApiResponse<DesignTiersResponse>>('/design/tiers');
	}
};

/** The floor the backend puts on a plagiarism decision, either way. */
export const PLAGIARISM_DECISION_MIN = 80;

/** The floor on a brief refusal. */
export const BRIEF_FEEDBACK_MIN = 20;

/** The floor on a featuring reason. It is published as written. */
export const FEATURED_REASON_MIN = 40;

/**
 * The Monday of the week containing `date`, as `YYYY-MM-DD`.
 *
 * The featuring endpoint refuses anything that is not a Monday, so the form
 * offers Mondays rather than letting somebody discover the rule from a 400.
 */
export function mondayOf(date: Date): string {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	// getUTCDay: 0 = Sunday. Sunday belongs to the week that started six days
	// earlier, not to the one starting tomorrow.
	const shift = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - shift);
	return d.toISOString().slice(0, 10);
}
