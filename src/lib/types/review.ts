/**
 * The reviewer queues that do not live under `/admin`.
 *
 * Re-exported by `types/index.ts`.
 *
 * These are staff surfaces gated by a capability rather than by a path
 * prefix — `apprentice_verifier`, `quality_reviewer:{family}`,
 * `community_moderator`, `forum_moderator`. The audit that missed them for a
 * day was scoped to `/admin/**`, which is why the snapshot now records the
 * guard instead of trusting the prefix.
 */

// ─────────────────────────────────────────────────────────────────────
// Apprentice verifications (P26)
// ─────────────────────────────────────────────────────────────────────

/** `apprentice_verification::VERDICT_*`. Abstain exists so a compagnon who
 *  cannot judge a submission can say so rather than guessing — which is a
 *  different and more honest answer than rejecting. */
export type ApprenticeVerdict = 'approved' | 'rejected' | 'abstain';

export interface PendingApprenticeVerification {
	id: string;
	apprentice_user_id: string;
	apprentice_username: string;
	template_id: string;
	challenge_title: string;
	/** Free-form JSON: the questions the apprentice was asked and what they
	 *  answered. Shaped by the template, so it is rendered generically. */
	answers: unknown;
	created_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Quality — defect reports and test runs
// ─────────────────────────────────────────────────────────────────────

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface QualityBugReport {
	id: string;
	slice_id: string;
	reporter_user_id: string;
	title: string;
	repro_steps_md: string;
	expected_md: string;
	observed_md: string;
	/** `{"os": …, "browser": …, "build": …}`. Free-form on purpose: the
	 *  useful keys are not the same for a web app, a game build and a CLI. */
	environment: unknown;
	severity: string;
	reproducibility: string;
	attachment_urls: string[];
	fix_url: string | null;
	fix_confirmed_at: string | null;
	reviewed_at: string | null;
	severity_adjusted_to: string | null;
	rejected_reason: string | null;
	created_at: string;
}

export interface BugReviewDecision {
	/** `accept` or `reject`. */
	decision: 'accept' | 'reject';
	/** Absent means the reviewer agreed with the reporter's severity. */
	severity_adjusted_to?: BugSeverity;
	/** Required on a rejection. A rejection with no reason is a refusal with
	 *  no appeal, and the person who has to act on it cannot. */
	reason?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Vouchings — the queue behind an action this app already had
// ─────────────────────────────────────────────────────────────────────

export type VouchingStatus = 'live' | 'broken' | 'expired';

export interface VouchingQueueRow {
	id: string;
	status: string;
	voucher_id: string;
	voucher_username: string | null;
	voucher_display_name: string | null;
	/** The voucher's raw rank. What is at stake is read from here, so a
	 *  moderator sees the cost before imposing it. */
	voucher_rank: string;
	vouched_id: string;
	vouched_username: string | null;
	vouched_display_name: string | null;
	/** True when the backed user is already under suspicion. **This is the
	 *  column that turns a listing into a queue** — it is what a moderator
	 *  sorts on, and the screen surfaces it as such. */
	vouched_user_flagged: boolean;
	at_stake_kind: string;
	statement: string;
	active_until: string;
}

export interface VouchingQueueResponse {
	vouchings: VouchingQueueRow[];
	status: string;
	total: number;
	limit: number;
	offset: number;
}

// ─────────────────────────────────────────────────────────────────────
// Forum moderation
// ─────────────────────────────────────────────────────────────────────

export type ForumPostAction = 'hide' | 'lock' | 'unlock' | 'unhide';

export interface ModeratePostBody {
	action: ForumPostAction;
	reason: string;
}

export interface MuteUserBody {
	/** Hours. Twenty-four by default; a forum moderator is capped at 168. */
	duration_hours?: number;
	reason: string;
	/** `forum`, `community` or `all`. */
	scope?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Translation reviews (communication domain)
// ─────────────────────────────────────────────────────────────────────

export interface TranslationReview {
	id: string;
	reviewer_username: string;
	language: string;
	/** From the reviewer's declared languages. Null when they never declared
	 *  a level for it — which is worth showing beside their verdict. */
	proficiency: string | null;
	notes_md: string;
	reviewed_at: string;
}

export interface ReviewTranslationBody {
	/** One of the slice's target languages, and one the caller has declared
	 *  they read. Both are checked server-side. */
	language: string;
	notes_md?: string;
}
