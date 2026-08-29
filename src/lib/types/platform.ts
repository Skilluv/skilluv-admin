/**
 * Platform levers: flags, tags, one-off runs, and the assistant ledger.
 *
 * Re-exported by `types/index.ts`.
 *
 * What these have in common is that none of them is a queue. They are
 * switches somebody throws and jobs somebody starts — which is why they live
 * on `/operations` beside the other one-off runs rather than getting a page
 * each.
 */

export interface FeatureFlag {
	key: string;
	enabled: boolean;
	/** 0–100. A flag can be on and still reach nobody, which is a different
	 *  state from off and worth being able to see. */
	rollout_percent: number;
	description: string | null;
	updated_at: string;
	updated_by: string | null;
}

export interface FeatureFlagUpsert {
	key: string;
	enabled: boolean;
	rollout_percent?: number;
	description?: string;
}

/** `services::social::VALID_TAG_CATEGORIES`. */
export type TagCategory = 'language' | 'topic' | 'level' | 'framework' | 'tool' | 'other';

export interface CreateTagInput {
	slug: string;
	name: string;
	description?: string;
	category: TagCategory;
	color?: string;
}

/**
 * What a content-ops run did.
 *
 * These three answer in `{ok, data}` rather than the `{data, meta}` envelope
 * the rest of the API uses. The backend keeps the older shape deliberately —
 * the admin panel branches on `ok` — so the client mirrors it rather than
 * pretending they match.
 */
export interface AdminOpsEnvelope<T> {
	ok: boolean;
	data: T;
}

export interface HelloWallMirrorReport {
	mirrored: number;
	failed: number;
	skipped: number;
	mirrored_ids: string[];
	failed_details: unknown[];
}

export interface ProfileReadmeSyncReport {
	synced: number;
	failed: number;
	skipped_no_readme: number;
	synced_ids: string[];
}

/** Awarded and revoked are both lists of badge slugs. A recompute that
 *  revokes is doing its job — the engine is the authority and a badge whose
 *  proof went away should go with it. */
export interface BadgeRecomputeReport {
	awarded: string[];
	revoked: string[];
	unchanged: number;
}

// ─────────────────────────────────────────────────────────────────────
// The assistant ledger
// ─────────────────────────────────────────────────────────────────────

export interface AssistantTopConsumer {
	user_id: string;
	username: string;
	display_name: string;
	requests: number;
	tokens_used: number;
}

export interface AssistantStats {
	window_days: number;
	total_requests: number;
	/** Requests that actually reached the worker and were billed. */
	billed_calls: number;
	cache_hits: number;
	/** Null when neither a hit nor a billed call happened. A rate of 0.0 on
	 *  an empty window would read as "the cache is broken" rather than
	 *  "nothing was asked". */
	cache_hit_rate: number | null;
	tokens_total: number;
	refused_burst: number;
	refused_daily_quota: number;
	/** Worker unreachable or erroring — the gRPC side of the story, kept
	 *  apart from the refusals, which are the guard rails working. */
	worker_failures: number;
	distinct_users: number;
	by_interaction_type: Record<string, number>;
	by_status: Record<string, number>;
	top_consumers: AssistantTopConsumer[];
}

/** Echoed with the stats so a dashboard can render "3 / 10 used" without
 *  hard-coding the policy it is reporting on. */
export interface AssistantPolicy {
	daily_quota: number;
	burst_max: number;
	burst_window_secs: number;
	cache_ttl_secs: number;
}

export interface AssistantStatsResponse {
	stats: AssistantStats;
	policy: AssistantPolicy;
}

/**
 * One row of a user's disclosure ledger.
 *
 * This is the answer to "was this specific piece of work assisted", which is
 * a different question from the aggregate above and is why the two endpoints
 * are separate. The prompt is here; it is not in the stats, and it should
 * not be read without a reason.
 */
export interface AssistantInteraction {
	id: string;
	user_id: string;
	interaction_type: string;
	prompt: string;
	skill_slug: string | null;
	status: string;
	disclosure_label: string;
	model_version: string | null;
	tokens_used: number;
	disclosed_on_deliverable_id: string | null;
	disclosed_at: string | null;
	request_hash: string | null;
	/** Stored rather than inferred from `tokens_used`: migration 0444 says
	 *  why, and a cached answer with zero tokens is not the same as a failed
	 *  one with zero tokens. */
	cached: boolean;
	refusal_kind: string | null;
	created_at: string;
}

export interface AssistantLedgerResponse {
	user_id: string;
	interactions: AssistantInteraction[];
	total: number;
	limit: number;
	offset: number;
}

// ─────────────────────────────────────────────────────────────────────
// Platform counters
// ─────────────────────────────────────────────────────────────────────

/**
 * The same counters Prometheus scrapes, as JSON.
 *
 * Gated by the `admin` capability since SKI-31 — it used to be public, and
 * a headcount plus a pending-report total is enough to read the health of a
 * platform from outside it.
 */
export interface MetricsSummary {
	users: {
		total: number;
		/** Non-banned, profile active. */
		active: number;
		/** Distinct users with at least one activity row today, UTC. */
		today_active: number;
	};
	challenges: {
		published: number;
		total_submissions: number;
		/** Started in the last 24 hours. */
		today_submissions: number;
	};
	enterprises: number;
	moderation: { pending_reports: number };
	messaging: { active_conversations: number };
	websocket: { connections: number; rooms: number; users: number };
	database: { pool_size: number; pool_idle: number };
}
