/**
 * Running a domain, and the moderation queues that come with it.
 *
 * Re-exported by `types/index.ts`.
 *
 * The domain routes are per-domain rather than per-design on purpose, and
 * the backend explains why in `admin_domains.rs`: every figure on a design
 * dashboard is the same question asked of a different `skill_domain`, so
 * seven copies would drift and the sixth would be written by somebody who
 * had forgotten what the first meant. The design admin passes `design`.
 */
import type { CohortListEntry, TalentOfferListing } from './index';

// ─────────────────────────────────────────────────────────────────────
// Domain dashboard
// ─────────────────────────────────────────────────────────────────────

export interface DomainOverview {
	skill_domain: string;
	window_days: number;
	/** People who declare a trade in this domain and have not left it. */
	declared_trades: number;
	/** Of those, how many did something inside the window. **The gap between
	 *  the two is the figure worth watching**: a domain with two hundred
	 *  declarations and four active people has a problem no total will show,
	 *  which is why the screen puts them side by side. */
	active_contributors: number;
	challenges_published: number;
	challenges_draft: number;
	contests_running: number;
	contests_concluded_in_window: number;
	missions_in_progress: number;
	missions_delivered_in_window: number;
	/** Slices waiting for a reviewer to pick them up. */
	reviews_pending: number;
	/** The oldest of them. A queue's length says how much work there is; its
	 *  age says whether anybody is doing it. Null when nothing waits — not
	 *  zero, which would read as "something just arrived". */
	oldest_pending_review_hours: number | null;
	/** Mean rounds to an approval. A health figure, not a target: rounds are
	 *  how somebody learns, so it is meant to be read next to the approval
	 *  rate rather than alone. */
	mean_rounds_to_approval: number | null;
	last_featured_week: string | null;
}

export interface DomainReviewerStats {
	user_id: string;
	username: string;
	display_name: string;
	/** Every review capability they hold in this domain, so a curator can see
	 *  who is spread across five families and who covers one. */
	families: string[];
	decisions_total: number;
	approved: number;
	iterations_asked: number;
	rejected: number;
	/** Null for somebody who has decided nothing yet, rather than zero —
	 *  never having reviewed is not reviewing instantly. */
	mean_hours_to_decide: number | null;
	/** Picked up and still undecided: the figure that says a reviewer has
	 *  taken on more than they are getting through. */
	open_now: number;
}

export interface DomainFeaturedCandidate {
	user_id: string;
	username: string;
	display_name: string;
	craft_score: number;
	/** What the list is ordered by. The reason to feature somebody is work,
	 *  not a cumulative score — which would return the same five names every
	 *  week forever. */
	approved_in_window: number;
	/** Somebody featured recently is still listed rather than filtered out: a
	 *  curator featuring somebody twice should do it knowingly, not be
	 *  prevented. */
	last_featured_on: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Credentials issued elsewhere
// ─────────────────────────────────────────────────────────────────────

/** A certification somebody else issued, as the review queue sees it.
 *
 *  It arrives claimed and stays claimed until a reviewer opens the issuer's
 *  page. The person who added it is the person it belongs to, which is
 *  exactly why their word is not the check. */
export interface PendingCredential {
	id: string;
	username: string;
	issuer: string;
	name: string;
	level: string | null;
	evidence_url: string;
	issued_on: string;
	expires_on: string | null;
	/** False once the expiry date has passed. A lapsed certification is still
	 *  a true statement about the past, so it is shown rather than hidden. */
	is_current: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Cohorts and talent offers, as moderation sees them
// ─────────────────────────────────────────────────────────────────────

/** The public listing plus the two things moderation needs and discovery
 *  does not. Extended rather than restated: the backend serves the same
 *  projection with extra columns, and a second copy of the cohort shape here
 *  would be a second thing to keep in step. */
export interface AdminCohortEntry extends CohortListEntry {
	/** Whether the chat is alive. A cohort with forty members and no messages
	 *  is a different problem from an empty one, and the discovery listing
	 *  cannot tell them apart. */
	message_count: number;
	organizer_user_id: string | null;
	organizer_username: string | null;
}

export interface AdminCohortsResponse {
	cohorts: AdminCohortEntry[];
	total: number;
	limit: number;
	offset: number;
}

export interface AdminTalentOffer extends TalentOfferListing {
	active: boolean;
	moderation_held_at: string | null;
	moderation_reason: string | null;
	moderated_by: string | null;
	/** Why the offer is not in the public browse, when it is not. Null means
	 *  it is listed. One of `paused_by_author`, `moderation_hold`,
	 *  `author_hidden`, `author_banned`, `rank_below_bar` — and the
	 *  distinction matters: only one of those five is a moderator's doing. */
	hidden_reason: string | null;
	created_at: string;
	updated_at: string;
}

export interface AdminTalentOffersResponse {
	offers: AdminTalentOffer[];
	total: number;
	limit: number;
	offset: number;
}

/** One challenge in a trade's catalogue, as the readiness call returns it. */
export interface DraftChallenge {
	id: string;
	title: string;
	description: string;
	instructions: string;
	difficulty: number;
	status: string;
	/** False while the brief is still what the seeding migration wrote. The
	 *  server decides where that line is; this client does not re-measure it. */
	written: boolean;
}

/**
 * How ready one trade's catalogue is to be opened to learners.
 *
 * `blockers` is the field the screen is built around. It is empty exactly
 * when publishing would succeed, and each entry is a sentence naming one
 * thing to fix, in the order somebody would fix them — so the screen renders
 * the server's sentences rather than deriving its own from the counters.
 * Two readings of "ready" would eventually disagree, and the one next to the
 * UPDATE is the one that matters.
 */
export interface TradeReadiness {
	orientation_slug: string;
	orientation_name: string;
	/** The review family. Null for a trade that has none — which is itself a
	 *  blocker, because nothing then decides who may judge a submission. */
	reviewer_group: string | null;
	total: number;
	published: number;
	/** Drafts whose brief is still the seeded stub. */
	unwritten: number;
	/** How many people could review a submission to this trade today. */
	reviewers: number;
	blockers: string[];
	challenges: DraftChallenge[];
}
