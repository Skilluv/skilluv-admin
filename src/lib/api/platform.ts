/**
 * Platform levers — twelve routes across seven backend modules.
 *
 * Flags, tags, one-off runs, one toggle, and the assistant's two admin
 * reads. None of them is a queue: they are switches somebody throws and jobs
 * somebody starts, which is why they belong on `/operations` beside the
 * other one-off runs rather than getting a page each.
 *
 * ## Two envelopes, and the difference is not cosmetic
 *
 * The three content-ops runs answer `{ok, data}`; everything else answers
 * `{data, meta}`. The backend keeps the older shape on purpose and says so
 * in a comment — the admin panel branches on `ok`. Typing them differently
 * here means a caller cannot read one as the other and silently get
 * `undefined`.
 *
 * ## Why the assistant has two endpoints and not one
 *
 * `assistantStats` answers "what is this costing us and are the guard rails
 * holding" and carries no prompt text. `userAssistantInteractions` answers
 * "was this specific piece of work assisted" and carries every prompt. They
 * are separate because the second is a disclosure ledger about one person
 * and should be opened for a reason, not browsed.
 */
import type {
	AdminOpsEnvelope,
	ApiResponse,
	AssistantLedgerResponse,
	AssistantStatsResponse,
	BadgeRecomputeReport,
	CreateTagInput,
	FeatureFlag,
	FeatureFlagUpsert,
	HelloWallMirrorReport,
	MetricsSummary,
	ProfileReadmeSyncReport
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const platformApi = {
	// --- Feature flags (SKI-33) ---

	featureFlags() {
		return api.get<ApiResponse<{ flags: FeatureFlag[] }>>('/admin/feature-flags');
	},

	/** Create or update, idempotently — one route for both, keyed on `key`. */
	upsertFeatureFlag(body: FeatureFlagUpsert) {
		return api.post<ApiResponse<{ flag: FeatureFlag }>>('/admin/feature-flags', body);
	},

	/** Deleting a flag is not the same as disabling it: the code that reads
	 *  it falls back to its compiled default, which may be on. Disable first
	 *  and delete when the branch is gone. */
	deleteFeatureFlag(key: string) {
		return api.delete<ApiResponse<{ removed: boolean; key: string }>>(
			`/admin/feature-flags/${encodeURIComponent(key)}`
		);
	},

	// --- Tags ---

	createTag(input: CreateTagInput) {
		return api.post<ApiResponse<{ tag: unknown }>>('/admin/tags', input);
	},

	// --- One-off runs ---

	/** Pushes unmirrored hello-wall entries to the community repository.
	 *  Answers 503 without a bot token rather than reporting a run that did
	 *  nothing. */
	helloWallMirrorRun() {
		return api.post<AdminOpsEnvelope<HelloWallMirrorReport>>('/admin/hello-wall/mirror-run');
	},

	profileReadmeSyncRun() {
		return api.post<AdminOpsEnvelope<ProfileReadmeSyncReport>>('/admin/profile-readme/sync-run');
	},

	/** The engine is the authority, so a recompute that revokes is doing its
	 *  job: a badge whose proof went away should go with it. The report names
	 *  both sides for exactly that reason. */
	recomputeBadgesForUser(userId: string) {
		return api.post<AdminOpsEnvelope<BadgeRecomputeReport>>(
			`/admin/badges/recompute/${userId}`
		);
	},

	/** Marks certifications past their validity as expired. Idempotent. */
	expireLapsedCertifications() {
		return api.post<ApiResponse<{ expired: number }>>('/admin/certifications/expire-lapsed');
	},

	/** A mentee was hired: pay the mentor who got them there. Refused below
	 *  the volunteer threshold, on hours already paid, or on a duplicate — so
	 *  a double click cannot pay twice. */
	mentoringPlacementCommission(body: {
		mentor_user_id: string;
		mentee_user_id: string;
		enterprise_id: string;
		placement_amount_cents: number;
	}) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			'/admin/mentoring/placement-commission',
			body
		);
	},

	// --- Curation ---

	/** Addressed by slug, not id: it is what the project is known by
	 *  everywhere else in this app. */
	setProjectCurated(slug: string, curated: boolean) {
		return api.post<ApiResponse<{ curated: boolean }>>(
			`/admin/projects/${encodeURIComponent(slug)}/curated`,
			{ curated }
		);
	},

	// --- Platform counters ---

	/** The same counters Prometheus scrapes, as JSON, for a dashboard that
	 *  speaks JSON. Gated by `admin` since SKI-31 — it used to be public. */
	metricsSummary() {
		return api.get<ApiResponse<MetricsSummary>>('/metrics/summary');
	},

	// --- Assistant ---

	/** Aggregates only. No prompt text crosses this endpoint. */
	assistantStats(params?: { window_days?: number; top?: number }) {
		return api.get<ApiResponse<AssistantStatsResponse>>(
			'/admin/assistant/stats',
			params as Record<string, number>
		);
	},

	/** One person's disclosure ledger, prompts included. Opened for a reason,
	 *  not browsed — which is why it hangs off a user rather than off a
	 *  global list. */
	userAssistantInteractions(
		userId: string,
		params?: { limit?: number; offset?: number; undisclosed_only?: boolean }
	) {
		return api.get<ApiResponse<AssistantLedgerResponse>>(
			`/admin/users/${userId}/assistant-interactions`,
			params as Record<string, string | number | boolean>
		);
	}
};

/** `services::social::VALID_TAG_CATEGORIES`. */
export const TAG_CATEGORIES = [
	'language',
	'topic',
	'level',
	'framework',
	'tool',
	'other'
] as const;

/** `ai_companion::MAX_STATS_WINDOW_DAYS`. Asking for more is clamped rather
 *  than refused, so the control offers what is actually available. */
export const ASSISTANT_MAX_WINDOW_DAYS = 365;
