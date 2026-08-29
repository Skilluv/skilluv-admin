// ============================================
// Types Skilluv — basés sur API-ROUTES.md
// ============================================

/** The B2B lines — pipeline, contracts, renewals, revenue. A different
 *  subject from the platform types below and a large one, so it lives in its
 *  own file and is re-exported here: `$lib/types` stays the one import path
 *  every screen uses. */
export * from './business';

/** The game domain's reviewer surface — mods, jams, attestations,
 *  featurings. Same reasoning as above: a subject of its own, one import
 *  path for the screens. */
export * from './game';

/** The ops domain's practice surface — incidents, objectives, cost work. */
export * from './ops';

/** Domain dashboards and the moderation queues that come with them. */
export * from './oversight';

/** Platform levers: flags, tags, one-off runs, the assistant ledger. */
export * from './platform';

/** Reviewer queues served outside `/admin`, gated by capability. */
export * from './review';

// --- Enums ---

/** Backend P16.1 — primary_domain enum côté orientations (mig 0088).
 *  Sur-ensemble strict de `SkillDomain` (challenges) : orientations couvrent
 *  aussi `soft_skills`, `ai`, `ops` qui ne sont pas des domaines de challenge. */
export type OrientationDomain =
	| 'code'
	| 'design'
	| 'game'
	| 'security'
	| 'soft_skills'
	| 'ai'
	| 'ops';

/** Backend P17.1 — output_type des badge_rules (mig 0090). */
export type BadgeOutputType =
	| 'skill_patch'
	| 'rank'
	| 'guild_crest'
	| 'challenge_seal'
	| 'event_stamp'
	| 'medal';

/** Backend P17.1 — rarity des badge_rules. `auto` = dérivée par l'engine
 *  depuis `min_count` (skill_patch surtout). */
export type BadgeRarity = 'auto' | 'common' | 'rare' | 'epic' | 'legendary';

export type SkillDomain = 'code' | 'design' | 'game' | 'security';
export type Title = 'apprenti' | 'artisan' | 'maitre' | 'legende';
export type ChallengeDifficulty = 1 | 2 | 3 | 4 | 5;
export type ChallengeMode = 'solo' | 'team';
export type ChallengeTone = 'serious' | 'fun' | 'educational';
export type ChallengeStatus = 'draft' | 'published' | 'archived';
export type CommunityStatus = 'draft' | 'review' | 'approved' | 'rejected' | null;
export type LeaderboardDomain = 'global' | 'code' | 'design' | 'game' | 'security';
export type LeaderboardPeriod = 'alltime' | 'weekly' | 'monthly';
export type ReportTargetType = 'user' | 'challenge' | 'message' | 'enterprise';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'cheating' | 'fake_profile' | 'other';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type InterestStatus = 'pending' | 'accepted' | 'declined';
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';
export type UserRole = 'user' | 'recruiter' | 'enterprise' | 'admin';
export type ThemeBase = 'forge' | 'neon' | 'arena' | 'terminal' | 'sakura';
export type ThemeMode = 'dark' | 'light';
export type Theme = ThemeBase | `${ThemeBase}-light`;

/** Backend P18.4 — a capability slug, as stored in
 *  `user_capabilities.capability` and enumerated by
 *  `GET /api/admin/capabilities` (SKI-351).
 *
 *  Deliberately a `string` and not a union. The authority used to be a CHECK
 *  constraint restated wholesale on every extension; migration 0404 replaced
 *  it with the `capability_catalog` table and put a trigger on `orientations`
 *  behind it, so adding a trade with a review family makes
 *  `{domain}_reviewer:{family}` grantable in the same statement. The set is a
 *  function of the trade catalogue, and no migration has to remember.
 *
 *  A union here would be a copy of that table: correct until somebody adds an
 *  orientation, then wrong, and wrong silently. It already was. The grant
 *  dropdown enumerated sixteen plain capabilities and four reviewer families,
 *  which meant `mission_arbiter`, `security_triager` and
 *  `domain_curator:design` could not be granted to anybody from this panel
 *  while the backend accepted all three — and those three gate screens that
 *  shipped the same week.
 *
 *  Nothing is lost by widening it. `user_capabilities.capability` is a
 *  foreign key to the catalogue since 0404, so an invented string is refused
 *  by the database rather than stored and silently never matched. */
export type Capability = string;

/** One row of `GET /api/admin/capabilities`.
 *
 *  Read in full rather than sampled: the three flags below are the
 *  difference between an operator granting the right thing and spending an
 *  afternoon on a revoke that does not stick. */
export interface CapabilityCatalogueEntry {
	/** What goes in `POST /admin/users/{id}/capabilities`. */
	capability: Capability;
	/** The part before the colon. */
	family: string;
	/** The part after it, `null` when the capability carries no scope. */
	scope: string | null;
	/** What holding it lets somebody do. Served rather than translated here:
	 *  an operator choosing between `domain_curator:design` and
	 *  `community_curator` on the slugs alone picks the wider one. */
	description: string;
	/** Maintained by the orientations trigger of migration 0404. Rows like
	 *  this appear in no migration and move when a trade changes family. */
	is_derived: boolean;
	/** Granted and re-granted by `services::capabilities_engine`. Still
	 *  grantable by hand; it is the revoke that does not stick, because the
	 *  engine puts it back on the next recompute. */
	engine_managed: boolean;
	/** How many people hold it right now — not revoked, not expired. */
	held_by: number;
}

export interface UserCapability {
	capability: Capability;
	granted_at: string;
	granted_reason: string;
	/** Only populated on non-null `expires_at`. Backend excludes expired entries
	 *  from the active list, so a value here means the capability is still live
	 *  but will lapse. */
	expires_at: string | null;
}

// --- Fraud (P14.5) ---

/** Backend `plagiarism_score` is NUMERIC(4,3) in [0.0, 1.0], serialized as
 *  string by sqlx BigDecimal. Frontend parses to number for display. */
export interface FraudFlaggedDeliverable {
	deliverable_id: string;
	plagiarism_score: string | number;
	similar_to: string | null;
}

export interface FraudSuspectedUser {
	user_id: string;
	flagged_at: string | null;
	reason: string | null;
}

/** Result of a multi-account detection run. `shared_ip` and `shared_ua` are
 *  SHA-256 hashes — never plaintext. */
export interface FraudSuspectGroup {
	shared_ip: string;
	shared_ua: string;
	user_ids: string[];
}

export interface FraudScanOutcome {
	deliverable_id: string;
	best_match_id: string | null;
	best_score: number;
	compared_count: number;
}

export interface FraudLlmEvaluation {
	deliverable_id: string;
	new_status: 'verified' | 'pending_manual_review' | string;
	score: number | null;
	llm_reachable: boolean;
	notes: string | null;
}

// --- ADM-M3 — Orientations catalog (backend P16.1 / mig 0088) ---

export interface Orientation {
	id: string;
	slug: string;
	name: string;
	description: string;
	primary_domain: OrientationDomain;
	secondary_domains: string[];
	tags: string[];
	is_curated: boolean;
	is_archived: boolean;
}

/** Payload for `POST /api/admin/orientations` (ADM-M3.1). Slug is immutable
 *  once created — `PATCH` refuses any `slug` field. */
export interface CreateOrientationBody {
	slug: string;
	name: string;
	description?: string;
	primary_domain: OrientationDomain;
	secondary_domains?: string[];
	tags?: string[];
	is_curated?: boolean;
}

export type PatchOrientationBody = Partial<Omit<CreateOrientationBody, 'slug'>> & {
	is_archived?: boolean;
};

export interface AttachSkillBody {
	skill_id: string;
	is_core?: boolean;
	is_recommended?: boolean;
	weight?: number;
}

// --- ADM-M3 — Badge rules (backend P17.1 / mig 0090) ---

export interface BadgeRule {
	id: string;
	slug: string;
	output_type: BadgeOutputType;
	output_variant: string | null;
	display_name: string;
	description: string;
	icon_key: string | null;
	conditions: Record<string, unknown>;
	rarity: BadgeRarity;
	admin_editable: boolean;
	ui_metadata: Record<string, unknown>;
	deprecated_at?: string | null;
}

/** Public catalog projection (from `GET /api/badge-rules`) — used by the
 *  admin list view. Some backend-only fields (`id`, `admin_editable`,
 *  `ui_metadata`, `deprecated_at`) are absent, so we widen `BadgeRule` to
 *  optional partiality when we consume the public shape. */
export type BadgeRuleCatalogEntry = Pick<
	BadgeRule,
	'slug' | 'output_type' | 'output_variant' | 'display_name' | 'description' | 'icon_key' | 'conditions' | 'rarity'
>;

export interface CreateBadgeRuleBody {
	slug: string;
	output_type: BadgeOutputType;
	output_variant?: string;
	display_name: string;
	description?: string;
	icon_key?: string;
	conditions: Record<string, unknown>;
	rarity?: BadgeRarity;
	admin_editable?: boolean;
	ui_metadata?: Record<string, unknown>;
}

export type PatchBadgeRuleBody = Partial<Omit<CreateBadgeRuleBody, 'slug'>>;

// --- ADM-M4 — Enterprise types manager (backend P24 / mig 0095-0097) ---

export type EnterpriseType = 'direct_hire' | 'staffing_agency' | 'remote_international';

export interface EnterpriseAdmin {
	id: string;
	company_name: string;
	slug: string;
	industry: string | null;
	verified: boolean;
	enterprise_type: EnterpriseType;
	type_config: Record<string, unknown>;
	created_at: string;
}

export interface EnterpriseTypeConfig {
	enterprise_type: EnterpriseType;
	type_config: Record<string, unknown>;
}

export interface AgencyClient {
	id: string;
	client_name: string;
	client_contact_email: string | null;
	notes: string | null;
	active: boolean;
	created_at: string;
}

export interface PatchEnterpriseTypeBody {
	enterprise_type: EnterpriseType;
	reason: string;
}

// --- ADM-M5 — Users enrichment (backend P16.3, P17.4-5, P18.2, P19) ---

/** Backend P17.4 rank enum (mig 0092). Note : le Title enum historique
 *  (`apprenti | artisan | maitre | legende`) sur users.title est différent
 *  et sera dépréquié en P18. Ce type est la source de vérité rank moderne. */
export type Rank = 'apprenti' | 'ranger' | 'artisan' | 'maitre' | 'doyen';

export interface UserOrientationEntry {
	orientation_slug: string;
	orientation_name: string;
	mode: 'learning' | 'active';
	is_primary: boolean;
	picked_at: string;
}

export interface UserBadgeItem {
	rule_slug: string | null;
	output_type: string | null;
	output_variant: string | null;
	display_name: string | null;
	rarity: string;
	earned_at: string;
	source_proofs_count: number;
}

export interface UserBadgesResponse {
	user_id: string;
	rank: {
		rank: Rank;
		achieved_at: string;
		previous_rank: Rank | null;
	};
	skill_patches: UserBadgeItem[];
	medals: UserBadgeItem[];
	challenge_seals_count: number;
	event_stamps_count: number;
	guild_crests: UserBadgeItem[];
	total_badges: number;
}

export interface UserRankHistoryEntry {
	from_rank: Rank | null;
	to_rank: Rank;
	achieved_at: string;
	reason: string | null;
}

export interface RecomputeProofsBody {
	scope?: 'capabilities' | 'badges' | 'ranks' | 'all';
	reason?: string;
}

export interface RecomputeProofsDryRunPreview {
	dry_run: true;
	current_state: {
		rank: Rank | null;
		capabilities_active_count: number;
		badges_active_count: number;
	};
	would_recompute: string;
}

export interface RecomputeProofsReport {
	recomputed: {
		capabilities_added: string[];
		capabilities_removed: string[];
		badges_added: string[];
		badges_removed: string[];
		rank_before: Rank;
		rank_after: Rank;
		errors: string[];
	};
}

export interface RankOverrideBody {
	new_rank: Rank;
	reason: string;
}

export interface RankOverrideResult {
	user_id: string;
	old_rank: Rank;
	new_rank: Rank;
	override_id: string;
}

// --- ADM-M5+ — Ops (sweep proof engine + admin-triggered GDPR export) ---

export interface ProofHooksSweepDryRun {
	dry_run: true;
	within_days: number;
	would_process_count: number;
}

export interface ProofHooksSweepResult {
	within_days: number;
	processed_count: number;
	user_ids: string[];
}

export interface AdminGdprExportTrigger {
	reason: string;
}

export interface AdminGdprExportResult {
	status: 'queued';
	target_user_id: string;
	message: string;
}

// --- Extras Phase 5 : badge events (P17.6) + skill nodes CRUD + recompute-capabilities ---

export interface CreateBadgeEventBody {
	slug: string;
	name: string;
	description?: string;
	starts_at: string; // RFC3339
	ends_at?: string;
	visual_theme?: Record<string, unknown>;
	is_partner?: boolean;
}

export interface BadgeEvent {
	id: string;
	slug: string;
	name: string;
	starts_at: string;
	ends_at: string | null;
	visual_theme: Record<string, unknown>;
	is_partner: boolean;
}

/** Alias sur SkillDomain (challenges) — les skill_nodes utilisent le domain étendu
 *  identique à `OrientationDomain` : code/design/game/security/soft_skills/ai/ops. */
export type SkillNodeDomain = OrientationDomain;

export interface SkillNodeAdmin {
	id: string;
	slug: string;
	display_name: string;
	description: string | null;
	domain: SkillNodeDomain;
	parent_id: string | null;
	is_skilluv_specific: boolean;
}

export interface CreateSkillNodeBody {
	slug: string;
	display_name: string;
	description?: string;
	domain: SkillNodeDomain;
	parent_id?: string;
	aliases?: string[];
	external_refs?: Record<string, unknown>;
	is_skilluv_specific?: boolean;
}

export interface UpdateSkillNodeBody {
	display_name?: string;
	description?: string;
	domain?: SkillNodeDomain;
	/** `Some(null)` clears parent, `undefined` preserves current value. */
	parent_id?: string | null;
	aliases?: string[];
	external_refs?: Record<string, unknown>;
	is_skilluv_specific?: boolean;
}

export interface RecomputeCapabilitiesResult {
	granted: string[];
	already_active: string[];
}

export type NotificationType =
	| 'interest_request_received'
	| 'interest_accepted'
	| 'interest_declined'
	| 'new_message'
	| 'challenge_approved'
	| 'challenge_rejected'
	| 'account_banned'
	| 'account_unbanned';

// --- Modèles principaux ---

export interface UserPrivate {
	id: string;
	email: string;
	username: string;
	first_name: string;
	last_name: string;
	display_name: string;
	/** Global role — 'user' (candidate), 'recruiter', 'enterprise' (workspace
	 * owner), or 'admin'. Drives the enterprise layout guard client-side. */
	role: UserRole;
	/** NULL until the OAuth/magic-link user picks their domain during onboarding. */
	skill_domain: SkillDomain | null;
	/** True once the user has picked a skill_domain AND accepted the terms. Drives the
	 * onboarding gate in `hooks.server.ts`. */
	profile_completed: boolean;
	title: Title;
	golden_stars: number;
	total_fragments: number;
	streak_current: number;
	trust_score: number;
	country: string | null;
	city: string | null;
	bio: string | null;
	avatar_url: string | null;
	github: string | null;
	linkedin: string | null;
	website: string | null;
	twitter: string | null;
	email_verified: boolean;
	totp_enabled: boolean;
	email_2fa_enabled: boolean;
	profile_active: boolean;
	created_at: string;
}

export interface UserPublic {
	username: string;
	display_name: string;
	title: Title;
	golden_stars: number;
	skill_domain: SkillDomain;
	country: string | null;
	city: string | null;
	bio: string | null;
	avatar_url: string | null;
	github: string | null;
	linkedin: string | null;
	website: string | null;
	twitter: string | null;
	member_since: string;
}

export interface Challenge {
	id: string;
	title: string;
	description: string;
	instructions: string;
	skill_domain: SkillDomain;
	difficulty: ChallengeDifficulty;
	mode: ChallengeMode;
	duration_minutes: number | null;
	ai_allowed: boolean;
	tone: ChallengeTone;
	language: string | null;
	prerequisite_fragments: number;
	reward_fragments: number;
	is_onboarding: boolean;
	status: ChallengeStatus;
	is_community: boolean;
	community_status: CommunityStatus;
	featured: boolean;
	vote_count: number;
	test_cases: unknown | null;
	expected_output: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Submission {
	id: string;
	challenge_id: string;
	user_id: string;
	code: string;
	language: string | null;
	status: string;
	fragments_earned: number;
	started_at: string;
	submitted_at: string | null;
	evaluated_at: string | null;
}

export interface Notification {
	id: string;
	user_id: string;
	notification_type: NotificationType;
	title: string;
	body: string | null;
	data: unknown | null;
	read: boolean;
	created_at: string;
}

export interface Message {
	id: string;
	conversation_id: string;
	sender_id: string;
	content: string;
	read_at: string | null;
	created_at: string;
}

export interface Conversation {
	id: string;
	closed: boolean;
	other_party: {
		type: 'user' | 'enterprise';
		name: string;
		username?: string;
	};
	last_message?: Message;
	unread_count: number;
	created_at: string;
}

export interface InterestRequest {
	id: string;
	talent_id?: string;
	talent_username?: string;
	talent_display_name?: string;
	enterprise_id?: string;
	enterprise_name?: string;
	enterprise_logo?: string;
	status: InterestStatus;
	initial_message: string;
	created_at: string;
}

export interface Enterprise {
	id: string;
	company_name: string;
	description: string | null;
	website: string | null;
	logo_url: string | null;
	industry: string | null;
	company_size: CompanySize;
	country: string | null;
}

export interface SkillNode {
	domain: SkillDomain;
	total_fragments: number;
	skills: {
		name: string;
		fragments: number;
		max_fragments: number;
	}[];
}

export interface HeatmapEntry {
	activity_date: string;
	challenges_completed: number;
	fragments_earned: number;
}

export interface LeaderboardEntry {
	rank: number;
	user_id: string;
	username: string;
	display_name: string;
	title: Title;
	golden_stars: number;
	country: string | null;
	score: number;
}

export interface TalentCard {
	id: string;
	username: string;
	display_name: string;
	skill_domain: SkillDomain;
	title: Title;
	golden_stars: number;
	total_fragments: number;
	streak_current: number;
	country: string | null;
	member_since: string;
	top_skills?: { name: string; fragments: number }[];
	badge_count?: number;
	is_bookmarked?: boolean;
}

export interface Report {
	id: string;
	target_type: ReportTargetType;
	target_id: string;
	reason: ReportReason;
	details: string | null;
	status: ReportStatus;
	created_at: string;
}

export interface PrivacySettings {
	show_email: boolean;
	show_heatmap: boolean;
	show_skill_tree: boolean;
	show_badges: boolean;
	show_streak: boolean;
	allow_interest_requests: boolean;
}

export interface Team {
	id: string;
	name: string;
	challenge_id: string;
	max_members: number | null;
	members: { user_id: string; username: string; display_name: string }[];
	member_count: number;
}

export interface SandboxExecution {
	execution: {
		stdout: string | null;
		stderr: string | null;
		compile_output: string | null;
		time: string | null;
		memory: number | null;
		status: { id: number; description: string };
	};
	verdict: string;
	success: boolean;
}

export interface SandboxLanguage {
	id: number;
	name: string;
}

// --- Réponses API ---

export interface ApiMeta {
	request_id: string;
	timestamp: string;
}

export interface ApiPagination {
	page: number;
	per_page: number;
	total: number;
	total_pages: number;
}

export interface ApiResponse<T> {
	data: T;
	meta: ApiMeta;
}

export interface ApiPaginatedResponse<T> {
	data: T[];
	pagination: ApiPagination;
	meta: ApiMeta;
}

export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		details?: unknown;
		/** Present on AUTH_SSO_REQUIRED — points at the enterprise SSO start URL
		 * the user must redirect to. */
		start_url?: string;
	};
	meta: ApiMeta;
}

/** How the current session was authenticated. Drives the mandatory-TOTP
 * bypass for `role in ('enterprise', 'recruiter')` when set to `sso` (the
 * external IdP is responsible for MFA). */
export type LoginMethod = 'password' | 'oauth' | 'sso' | 'magic_link' | 'webauthn';

/** Response payload from GET /api/enterprise/sso/discover?email=x@y */
export interface SsoDiscoverResponse {
	sso_available: boolean;
	start_url?: string;
}

/** Extension to login/register responses: when true, the caller must complete
 * TOTP setup before accessing `/enterprise/*` endpoints. */
export interface RequiresTotpSetup {
	requires_totp_setup?: boolean;
}

// --- Codes d'erreur connus ---

export const ERROR_CODES = {
	RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
	AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
	AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
	AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	AUTH_TOTP_REQUIRED: 'AUTH_TOTP_REQUIRED',
	AUTH_TOTP_INVALID: 'AUTH_TOTP_INVALID',
	/** Enterprise/recruiter account tried to access `/enterprise/*` without
	 * having completed TOTP setup. Redirect to /settings/security. */
	AUTH_TOTP_SETUP_REQUIRED: 'AUTH_TOTP_SETUP_REQUIRED',
	/** Password login refused because the email domain is behind an enforced
	 * SSO. Redirect to `error.start_url`. */
	AUTH_SSO_REQUIRED: 'AUTH_SSO_REQUIRED',
	/** Write endpoints and /enterprise/* refuse the call until the user has
	 * clicked the verification link in their email. The EmailVerificationBanner
	 * (mounted in the root layout) is the standing prompt to resend. */
	AUTH_EMAIL_VERIFY_REQUIRED: 'AUTH_EMAIL_VERIFY_REQUIRED',
	AUTH_EMAIL_2FA_INVALID: 'AUTH_EMAIL_2FA_INVALID',
	CHALLENGE_PREREQUISITE_NOT_MET: 'CHALLENGE_PREREQUISITE_NOT_MET',
	RATE_LIMITED: 'RATE_LIMITED',
	CONTACT_COOLDOWN_ACTIVE: 'CONTACT_COOLDOWN_ACTIVE',
	CONTACT_ALREADY_REQUESTED: 'CONTACT_ALREADY_REQUESTED',
	CONTACT_BLOCKED: 'CONTACT_BLOCKED',
	CONVERSATION_CLOSED: 'CONVERSATION_CLOSED'
} as const;

// ─── Admin projects — content-strategy-2027-2028 §4 + annexes E, F ───────────

export type ProjectOwnerType = 'user' | 'guild';
export type PartnershipLevel = 1 | 2 | 3;

/** Row returned by `GET /admin/projects` list endpoint. */
export interface ProjectListItem {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	repo_url: string | null;
	is_flagship: boolean;
	curated_by_admin: boolean;
	skilluv_partnership_level: PartnershipLevel | null;
	flagship_steward_user_id: string | null;
	created_at: string;
	archived_at: string | null;
}

/** P26 v2 SKI-110 — how the P11 ingestor treats issues found on the repo.
 *  `auto` publishes slices straight to `open`, `curator_review` parks them in
 *  `draft` for a steward, `manual_only` disables ingestion entirely. */
export type SliceIngestionMode = 'auto' | 'curator_review' | 'manual_only';

/** P26 v2 SKI-110 — the five challenge-workflow fields the admin form owns.
 *  Shared by create + patch bodies and by the detail DTO. */
export interface ProjectChallengeConfig {
	github_repo_owner: string | null;
	github_repo_name: string | null;
	curated_labels: string[];
	slice_ingestion_mode: SliceIngestionMode;
	skill_domains: ValidatorDomain[];
}

/** Full row returned by `GET /admin/projects/{slug}`.
 *
 *  The five `ProjectChallengeConfig` fields are optional here on purpose:
 *  the backend accepts them on POST/PATCH (SKI-110) but the GET handler does
 *  not echo them back yet, so the edit form must tolerate their absence
 *  rather than clobber stored values with `undefined`. Tracked as SKI-109. */
export interface ProjectDetail extends ProjectListItem, Partial<ProjectChallengeConfig> {
	demo_url: string | null;
	tech_stack: string[];
	is_oss: boolean;
	looking_for_contributors: boolean;
	owner_type: ProjectOwnerType;
	owner_id: string;
	skilluv_editorial_notes: string | null;
	updated_at: string;
}

/** Payload for `POST /admin/projects`. */
export interface ProjectCreateBody {
	slug: string;
	name: string;
	description?: string | null;
	repo_url?: string | null;
	demo_url?: string | null;
	tech_stack?: string[];
	is_oss?: boolean;
	looking_for_contributors?: boolean;
	owner_type: ProjectOwnerType;
	owner_id: string;
	curated_by_admin?: boolean;
	is_flagship?: boolean;
	flagship_steward_user_id?: string | null;
	skilluv_partnership_level?: PartnershipLevel | null;
	skilluv_editorial_notes?: string | null;

	// P26 v2 SKI-110
	github_repo_owner?: string | null;
	github_repo_name?: string | null;
	curated_labels?: string[];
	slice_ingestion_mode?: SliceIngestionMode;
	skill_domains?: ValidatorDomain[];
}

/** Payload for `PATCH /admin/projects/{slug}`. All fields optional. */
export interface ProjectPatchBody {
	name?: string;
	description?: string | null;
	repo_url?: string | null;
	demo_url?: string | null;
	tech_stack?: string[];
	is_oss?: boolean;
	looking_for_contributors?: boolean;
	curated_by_admin?: boolean;
	is_flagship?: boolean;
	flagship_steward_user_id?: string | null;
	skilluv_partnership_level?: PartnershipLevel | null;
	skilluv_editorial_notes?: string | null;

	// P26 v2 SKI-110
	github_repo_owner?: string | null;
	github_repo_name?: string | null;
	curated_labels?: string[];
	slice_ingestion_mode?: SliceIngestionMode;
	skill_domains?: ValidatorDomain[];
}

export interface ProjectListFilters {
	is_flagship?: boolean;
	curated_by_admin?: boolean;
	partnership_level?: PartnershipLevel;
	include_archived?: boolean;
	page?: number;
	per_page?: number;
}

// ─── P26 v2 — workflow challenge complet ─────────────────────────────────────
// Project "P26 v2 — Workflow challenge complet via Skilluv (Phase 1 dogfooding)".
// Admin-side slice of the model: challenge config on projects + slices, the
// validator corps (candidacies, invitations, active grants), and the analytics
// that keep the dogfooding honest.

/** The 7 validator/skill domains (backend `VALID_DOMAINS`, SKI-80).
 *  Structurally identical to `OrientationDomain` but a distinct name: this one
 *  is the validator-capability axis, the other is the learning-path axis. */
export type ValidatorDomain =
	| 'code'
	| 'design'
	| 'game'
	| 'security'
	| 'ops'
	| 'ai'
	| 'soft_skills';

export const VALIDATOR_DOMAINS: ValidatorDomain[] = [
	'code',
	'design',
	'game',
	'security',
	'ops',
	'ai',
	'soft_skills'
];

/** SKI-77 — the ten lifecycle states a slice moves through. Order matters:
 *  it is the display order of the workflow funnel. */
export type SliceStatus =
	| 'draft'
	| 'open'
	| 'claimed'
	| 'in_progress'
	| 'submitted'
	| 'ci_green'
	| 'pending_validation'
	/** Design only (migration 0232): a critique was delivered and another
	 *  version is owed. The CHECK forbids it on any other `slice_type`, and
	 *  it loops back to `pending_validation` on the next submission — it is
	 *  not a step forward in the funnel. */
	| 'in_iteration'
	| 'validated'
	| 'merged'
	| 'closed';

export const SLICE_STATUSES: SliceStatus[] = [
	'draft',
	'open',
	'claimed',
	'in_progress',
	'submitted',
	'ci_green',
	'pending_validation',
	'in_iteration',
	'validated',
	'merged',
	'closed'
];

/** Subset of `project_slices` the admin screens actually read, from the public
 *  `GET /api/slices/{id}`. The backend row is wider; everything omitted here is
 *  challenger-facing detail the admin never edits. */
export interface AdminSlice {
	id: string;
	project_id: string;
	slice_type: string;
	/** Only ever set on `slice_type = 'design_artifact'` (migration 0231).
	 *  Decides which preview is generated, which automatic checks apply and
	 *  how large the artefact may be. */
	design_subtype?: DesignSubtype | null;
	external_ref: string | null;
	title: string;
	description: string;
	primary_domain: ValidatorDomain;
	difficulty: number;
	status: SliceStatus;
	claimed_by_user_id: string | null;
	claimed_at: string | null;
	validated_at: string | null;
	validated_by_user_id: string | null;
	/** SKI-79 — empty = no orientation restriction on claim. */
	required_orientation_slugs: string[];
	/** SKI-78 — null = no rank floor on claim. */
	min_rank: Rank | null;
	submitted_pr_url: string | null;
	submitted_at: string | null;
	picked_by_validator_id: string | null;
	picked_at: string | null;
	validation_reject_reason: string | null;
	attestation_hash: string | null;
	created_at: string;
	updated_at: string;
}

/** Filtres de `GET /api/admin/slices` (SKI-112).
 *
 *  Distinct de la liste publique `GET /api/slices`, qui force `status='open'` :
 *  celle-ci voit tous les statuts, ce qui est précisément l'intérêt côté admin
 *  — une slice bloquée en `submitted` ou `pending_validation` n'est plus
 *  introuvable. */
export interface AdminSliceFilters {
	project_id?: string;
	/** Sérialisé en CSV côté client. Vide = tous les statuts. */
	status?: SliceStatus[];
	domain?: ValidatorDomain;
	claimed_by_user_id?: string;
	/** Recherche libre sur le titre ou la référence externe. */
	q?: string;
	page?: number;
	per_page?: number;
}

/** Payload for `PATCH /api/admin/slices/{id}/config` (SKI-106).
 *  Each field is independently optional; an explicit `null` clears the
 *  override and restores the algorithmic default. */
export interface SliceConfigBody {
	required_orientation_slugs?: string[] | null;
	min_rank?: Rank | null;
	note?: string;
}

/** Compte-rendu de `POST /api/admin/projects/{slug}/ingest` (SKI-110).
 *
 *  Le poller P11 tourne à l'heure ; ce déclenchement manuel sert à valider une
 *  config d'ingestion tout de suite après l'avoir saisie. Le compte-rendu doit
 *  permettre de distinguer « la config est mauvaise » de « il n'y a rien à
 *  ingérer » — d'où `issues_seen` en plus des slices créées. */
export interface ProjectIngestReport {
	issues_seen: number;
	slices_created: number;
	slices_skipped_existing: number;
	mode: SliceIngestionMode;
	labels_matched: string[];
	/** Issues que l'ingestor n'a pas su traiter. Renvoyé par le backend mais
	 *  absent de la spec du ticket — sans lui, une passe qui échoue à moitié
	 *  ressemble à une passe qui n'a rien trouvé. */
	errors?: number;
}

/** `GET /api/admin/projects/{slug}/stats` (SKI-124). */
export interface ProjectChallengeStats {
	window_days: number;
	slices: Record<SliceStatus, number>;
	/** Hours between claim and PR submission. `null` when no slice in the
	 *  window reached `submitted`. */
	avg_time_to_submit_hours: number | null;
	avg_time_to_validate_hours: number | null;
	avg_time_to_merge_hours: number | null;
	/** merged / (validated + merged) — how often our validation is confirmed
	 *  by the upstream maintainer. */
	validated_to_merged_ratio: number;
	/** SKI-101 enricher adoption: how many slices got their domain from a
	 *  `domain:*` label vs. falling back to the project default. */
	domain_source_distribution: {
		label: number;
		project_default: number;
	};
}

// ─── Validator corps (SKI-81 / SKI-82) ───────────────────────────────────────

export type ValidatorApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
/** `candidacy` = the user self-nominated (SKI-81). `invitation` = an admin
 *  reached out first and the user still has to accept (SKI-82). */
export type ValidatorApplicationOrigin = 'candidacy' | 'invitation';

export interface ValidatorApplication {
	id: string;
	user_id: string;
	domain: ValidatorDomain;
	origin: ValidatorApplicationOrigin;
	status: ValidatorApplicationStatus;
	/** User-written on a candidacy; admin-written notes on an invitation. */
	motivation: string | null;
	admin_actor_id: string | null;
	reviewed_at: string | null;
	review_notes: string | null;
	created_at: string;
	updated_at: string;
}

/** Eligibility floor for a *candidacy* (SKI-81), echoed on every row so the
 *  UI never hardcodes a threshold the backend could move. Invitations bypass
 *  these entirely. */
export interface ValidatorThresholds {
	min_rank: Rank;
	min_merged_prs: number;
	min_repos_covered: number;
	min_tenure_days: number;
}

/** Live eligibility signals the backend computes per applicant so the admin
 *  screen does not have to fan out one request per row (SKI-107). */
export interface ValidatorApplicantStats {
	/** Defaults to `apprenti` backend-side when the user has no rank row. */
	rank: Rank;
	/** Slices claimed by the applicant on this domain that reached
	 *  `validated` or `merged`. */
	validated_prs_on_domain: number;
	distinct_repos_covered: number;
	tenure_days: number;
	thresholds: ValidatorThresholds;
}

/** Row of `GET /api/admin/validator-applications` (SKI-107).
 *
 *  Deliberately not an extension of `ValidatorApplication`: the list projects
 *  a narrower column set (no `review_notes`, no `updated_at`) and nests the
 *  user snapshot, so the two shapes are siblings rather than parent/child. */
export interface ValidatorApplicationRow {
	id: string;
	user_id: string;
	domain: ValidatorDomain;
	origin: ValidatorApplicationOrigin;
	status: ValidatorApplicationStatus;
	motivation: string | null;
	admin_actor_id: string | null;
	reviewed_at: string | null;
	created_at: string;
	user: {
		username: string | null;
		display_name: string | null;
		avatar_url: string | null;
	};
	live_stats: ValidatorApplicantStats;
}

export interface ValidatorApplicationFilters {
	status?: ValidatorApplicationStatus;
	domain?: ValidatorDomain;
	origin?: ValidatorApplicationOrigin;
	page?: number;
	per_page?: number;
}

export interface ValidatorInviteBody {
	user_id: string;
	domain: ValidatorDomain;
	notes: string;
}

// ─── Validation analytics (SKI-108 / SKI-100) ────────────────────────────────

/** One validator grant: the domain plus when it was awarded. The date comes
 *  from `user_capabilities.granted_at` and is served inline, so the roster
 *  needs no per-user follow-up request. */
export interface ValidatorActiveDomain {
	domain: ValidatorDomain;
	granted_at: string;
}

/** Row of `GET /api/admin/validators/stats`. The population is every user
 *  holding a non-revoked `challenge_validator:*` capability, so a validator
 *  with no activity in the window still appears with zeroes. */
export interface ValidatorStatsRow {
	user: {
		id: string;
		username: string | null;
		display_name: string | null;
	};
	validations_count: number;
	approve_count: number;
	reject_count: number;
	/** approve / (approve + reject). `0` — not null — when nothing was decided
	 *  in the window. */
	approve_ratio: number;
	avg_pickup_to_decision_hours: number | null;
	/** Domains stripped of the `challenge_validator:` prefix, each with its
	 *  grant date. */
	active_domains: ValidatorActiveDomain[];
}

export interface ValidatorStatsResponse {
	window_days: number;
	validators: ValidatorStatsRow[];
	pagination?: {
		page: number;
		per_page: number;
		total: number;
		total_pages: number;
	};
}

/** One claimant a validator has repeatedly validated. */
export interface CollusionTarget {
	claimant_id: string;
	claimant_username: string | null;
	count: number;
	/** count / total validations by this validator, in the window. */
	ratio: number;
	/** Backend verdict — ratio above `flag_ratio_threshold` and count above
	 *  `min_count`. Advisory only: nothing is enforced automatically. */
	flagged: boolean;
}

export interface CollusionMatrixRow {
	validator: {
		id: string;
		username: string | null;
	};
	top_targets: CollusionTarget[];
}

export interface CollusionMatrixResponse {
	window_days: number;
	min_count: number;
	/** Ratio above which a pair is flagged. Fixed backend-side; surfaced so
	 *  the UI can state the rule instead of restating a hardcoded 50 %. */
	flag_ratio_threshold: number;
	/** Backend-authored caveat about the current phase. */
	note: string;
	matrix: CollusionMatrixRow[];
}

// ============================================================
// Post-MVP Tier 1 / 2 / 3 (SKI-36 → SKI-47)
// Admin- and moderator-facing projections of the engagement
// features. Everything here mirrors a backend response shape
// one-for-one; nothing is derived client-side.
// ============================================================

/** SKI-39 — event kinds materialized in `user_timeline_events`. */
export type TimelineEventType =
	| 'signup'
	| 'orientation_added'
	| 'deliverable_verified'
	| 'rank_promoted'
	| 'capability_granted'
	| 'attestation_received'
	| 'event_participation'
	| 'first_bounty_earned'
	| 'first_mentor_session';

export interface TimelineEvent {
	id: string;
	user_id: string;
	event_type: TimelineEventType;
	event_at: string;
	metadata: Record<string, unknown>;
	dedup_key: string;
}

export interface TimelineResponse {
	events: TimelineEvent[];
	total: number;
	limit: number;
	offset: number;
}

/** Per-kind row counts from a backfill run. */
export interface TimelineBackfillDetail {
	signup: number;
	orientation_added: number;
	deliverable_verified: number;
	rank_promoted: number;
	capability_granted: number;
	attestation_received: number;
	event_participation: number;
	first_bounty_earned: number;
	first_mentor_session: number;
}

export interface TimelineBackfillResult {
	user_id: string;
	/** Idempotent: 0 means the timeline was already complete. */
	rows_inserted: number;
	detail: TimelineBackfillDetail;
}

/** SKI-42 — providers accepted for an external signal. */
export type ExternalSignalProvider =
	| 'github'
	| 'medium'
	| 'dev_to'
	| 'conf_ref'
	| 'behance'
	| 'dribbble'
	| 'artstation'
	| 'vimeo'
	| 'foundry';

export interface ExternalSignal {
	id: string;
	user_id: string;
	provider: ExternalSignalProvider;
	url: string;
	title: string;
	/** Null while the claim is only declared. */
	verified_at: string | null;
	verification_method: string | null;
	verified_by: string | null;
	meta: Record<string, unknown>;
	created_at: string;
}

/** The backend keeps the two categories apart on purpose — an external
 *  signal is context, never a Skilluv proof. The UI must not merge them. */
export interface ExternalSignalBuckets {
	verified: ExternalSignal[];
	declared: ExternalSignal[];
	disclaimer: string;
}

/** SKI-46 — a live vouching backing a user, voucher resolved. */
export interface UserVouching {
	id: string;
	voucher_id: string;
	voucher_display_name: string;
	statement: string;
	active_until: string;
	at_stake_kind: 'rank_temporary' | 'reputation_only';
}

export interface Vouching {
	id: string;
	voucher_id: string;
	vouched_id: string;
	active_until: string;
	at_stake_kind: string;
	statement: string;
	broken_at: string | null;
	break_reason: string | null;
	broken_by: string | null;
	created_at: string;
}

/** What breaking a vouching cost the voucher. */
export interface VouchingBreakReport {
	vouching: Vouching;
	penalty_applied: boolean;
	voucher_rank_before: string;
	voucher_rank_effective: string;
	penalty_until: string | null;
}

/** SKI-47 — per-node state in a user's skill tree. */
export type SkillTreeStatus = 'locked' | 'unlocked' | 'in_progress' | 'mastered';

export interface MissingPrerequisite {
	id: string;
	slug: string;
	display_name: string;
}

export interface SkillTreeNode {
	id: string;
	slug: string;
	display_name: string;
	domain: SkillNodeDomain;
	display_category: string;
	parent_id: string | null;
	prerequisite_skill_ids: string[];
	missing_prerequisites: MissingPrerequisite[];
	status: SkillTreeStatus;
	proven_count: number;
	proficiency_level: number;
	children: SkillTreeNode[];
}

export interface SkillTreeResponse {
	user_id: string;
	tree: SkillTreeNode[];
	/** Status → node count, tallied backend-side over the whole tree. */
	counts: Partial<Record<SkillTreeStatus, number>>;
}

/** Minimal skill identity used to pick prerequisites. Flattened from the
 *  skill-tree response, which is the only endpoint returning the full
 *  catalog together with the prerequisites already recorded. */
export interface SkillCatalogEntry {
	id: string;
	slug: string;
	display_name: string;
}

export interface SetPrerequisitesResult {
	skill_id: string;
	prerequisite_skill_ids: string[];
}

/** SKI-40 — a bounded learning cycle, distinct from teams and guilds. */
export interface Cohort {
	id: string;
	slug: string;
	name: string;
	description: string;
	starts_at: string;
	ends_at: string;
	max_members: number;
	orientation_id: string | null;
	created_by: string | null;
	is_public: boolean;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CohortListEntry {
	cohort: Cohort;
	orientation_slug: string | null;
	member_count: number;
	seats_left: number;
}

export interface CohortDetail extends CohortListEntry {
	/** Role of the calling admin, null when not a member. */
	my_role: string | null;
}

export interface CohortMember {
	user_id: string;
	display_name: string;
	role: 'member' | 'organizer';
	joined_at: string;
}

export interface CohortMilestone {
	id: string;
	cohort_id: string;
	title: string;
	description: string;
	target_date: string;
	created_at: string;
}

/** SKI-45 — reverse marketplace offer kinds. */
export type TalentOfferType =
	| 'pair_programming'
	| 'code_review'
	| 'whiteboard'
	| 'mock_interview'
	| 'career_advice';

/** Browse projection: the offer plus its author, as returned publicly. */
export interface TalentOfferListing {
	id: string;
	user_id: string;
	display_name: string;
	username: string;
	rank: string;
	offer_type: TalentOfferType;
	skill_id: string | null;
	skill_slug: string | null;
	availability_hours: number;
	/** Null for a free offer. */
	price_cents_per_hour: number | null;
	description: string;
	created_at: string;
}

// ============================================================
// Skilluv Design — 26 orientations, workflow first-class
// (projet Linear « Skilluv Design », branche backend
//  feat/design-orientations-workflow)
//
// Design does not reuse the code validation workflow: there is
// no CI signal saying the work is ready to look at, and the
// verdict is not binary — the ordinary outcome of a design
// review is "go one more round". Everything below mirrors that.
// ============================================================

/** What a design challenge is expected to produce. Mirrors the CHECK on
 *  `project_slices.design_subtype` (migration 0231). */
export type DesignSubtype =
	| 'interface'
	| 'design_system'
	| 'brand_kit'
	| 'illustration_set'
	| 'icon_set'
	| 'motion'
	| 'video'
	| 'three_d_scene'
	| 'sound'
	| 'type_family'
	| 'copy_deck'
	| 'research_document';

export const DESIGN_SUBTYPES: DesignSubtype[] = [
	'interface',
	'design_system',
	'brand_kit',
	'illustration_set',
	'icon_set',
	'motion',
	'video',
	'three_d_scene',
	'sound',
	'type_family',
	'copy_deck',
	'research_document'
];

/** The three verdicts a design review can carry (migration 0232).
 *
 *  `iterate` is the one that does not exist in code review, and the reason
 *  the whole module is separate: recording a coaching round as a rejection
 *  would corrupt both the designer's history and `approve_ratio`. */
export type DesignReviewVerdict = 'approve' | 'iterate' | 'reject';

/** Why a review is not an approval. Mirrors the CHECK added by migration
 *  0232 — the first seven are design-specific, the last three are shared
 *  with every domain. */
export type DesignBlockingReason =
	| 'brief_unmet'
	| 'direction_mismatch'
	| 'craft_gap'
	| 'accessibility'
	| 'system_inconsistent'
	| 'rights_unclear'
	| 'derivative'
	| 'docs_missing'
	| 'scope_mismatch'
	| 'out_of_depth';

export const DESIGN_BLOCKING_REASONS: DesignBlockingReason[] = [
	'brief_unmet',
	'direction_mismatch',
	'craft_gap',
	'accessibility',
	'system_inconsistent',
	'rights_unclear',
	'derivative',
	'docs_missing',
	'scope_mismatch',
	'out_of_depth'
];

/** One round of the critique trail. Rounds are capped at five by migration
 *  0184 — past that the problem is the brief, not the work. */
export interface DesignReviewRound {
	round: number;
	decision: DesignReviewVerdict;
	blocking_reason: DesignBlockingReason | null;
	/** The written critique. At least 40 characters when not an approval. */
	reason: string | null;
	/** The exact version the reviewer had in front of them. Without it the
	 *  trail is a list of opinions with nothing to check them against. */
	reviewed_artifact_url: string | null;
	reviewed_artifact_notes_md: string | null;
	/** The family grid, filled in. Free-form JSON so a grid can be revised
	 *  without a migration; the criteria live in `review_grids`. */
	grid_scores: Record<string, unknown> | null;
	decided_at: string;
}

/** A validated design deliverable, as the public profile shows it. */
export interface DesignArtefact {
	deliverable_id: string;
	title: string;
	artifact_url: string;
	trade: string | null;
	subtype: DesignSubtype | null;
	/** How many critique rounds it took. Converging at four is worth more
	 *  than passing at one, which is the point of publishing it. */
	rounds: number | null;
	/** Average of the grids received, serialized as a string (NUMERIC). */
	grid_average: string | null;
	verified_at: string | null;
}

/** One line of the craft score, so a number is never shown unexplained. */
export interface CraftScoreTerm {
	term: string;
	/** What was counted: a whole number for `count` terms, the raw figure
	 *  for the scaled ones. */
	measured: number;
	points: number;
	explanation: string;
}

export interface CraftScore {
	score: number;
	tier_slug: string;
	tier_name: string;
	tier_description: string;
	/** Absent at the top of the ladder. */
	next_tier_at: number | null;
	breakdown: CraftScoreTerm[];
	/** True when the total hit the ceiling — stated rather than inferred. */
	capped: boolean;
}

export interface DesignProfileContest {
	name: string;
	rank: number | null;
	entrants: number;
}

export interface DesignProfileTrade {
	trade: string;
	validated: number;
}

export interface DesignProfileAttestation {
	basis: string;
	title: string;
	verification_code: string;
}

export interface DesignProfile {
	username: string;
	craft_score: CraftScore;
	artefacts: DesignArtefact[];
	contests: DesignProfileContest[];
	trades: DesignProfileTrade[];
	attestations: DesignProfileAttestation[];
}

export interface DesignTier {
	slug: string;
	name: string;
	min_score: number;
	max_score: number | null;
	description: string;
}

export interface CraftScoreWeight {
	term: string;
	/** Serialized as a string (NUMERIC) so no precision is lost in transit. */
	weight: string;
	kind: string;
	explanation: string;
}

export interface DesignTiersResponse {
	/** Score ceiling. Published because a ranking whose rules are private is
	 *  one nobody can argue with. */
	cap: number;
	tiers: DesignTier[];
	weights: CraftScoreWeight[];
}

// ============================================================
// Skilluv Design — curation surfaces
// (Linear project « Skilluv Design », tickets SKI-205, SKI-233,
//  SKI-312)
//
// The critique loop above is what a reviewer works. What follows
// is what a curator works: the briefs that become challenges,
// the accusations raised against contest entries, and the weekly
// featuring. Three different queues, one admin.
// ============================================================

/** Where a brief proposal is in the queue. Mirrors the CHECK on
 *  `design_brief_proposals.status`. */
export type DesignBriefStatus = 'pending' | 'published' | 'rejected' | 'withdrawn';

/** A challenge somebody proposed, before it is one.
 *
 *  Publishing turns it into a `project_slices` row anybody may claim, which
 *  is why the queue is a curation surface and not a moderation one: nothing
 *  here is being removed, something is being brought into existence. */
export interface DesignBriefProposal {
	id: string;
	proposed_by: string;
	/** Null once the author's account is gone. The brief survives them. */
	author_username: string | null;
	title: string;
	brief_md: string;
	orientation_id: string;
	orientation_slug: string | null;
	design_subtype: DesignSubtype;
	difficulty: number;
	estimated_hours: number | null;
	expected_rounds: number | null;
	/** `individual` or `contest`. */
	format: string;
	status: DesignBriefStatus;
	/** Why it was refused, shown to the author. */
	review_feedback: string | null;
	/** The slice it became, once published. */
	published_slice_id: string | null;
	created_at: string;
}

/** An accusation of copying raised against a contest entry.
 *
 *  Open cases are not public: an allegation published before it is decided
 *  ruins somebody even when it is dismissed. */
export interface PlagiarismCase {
	id: string;
	submission_id: string;
	accused_username: string | null;
	/** Absent once the accuser's account is gone — the accusation stands on
	 *  its evidence, not on who made it. */
	raised_by_username: string | null;
	reason_md: string;
	evidence_url: string;
	raised_at: string;
	/** The deadline the accused has to answer before a reviewer may decide. */
	respond_by: string;
	response_md: string | null;
	responded_at: string | null;
	/** `open`, `upheld` or `dismissed`. */
	status: string;
	decision_md: string | null;
	decided_at: string | null;
	/** Cases against this person already upheld. Shown to the reviewer,
	 *  acted on by nobody — it is context, not evidence. */
	upheld_against_accused: number;
}

/** Who the platform put forward in a domain, for one week. */
export interface FeaturedTalent {
	skill_domain: SkillDomain;
	/** The Monday of the week. */
	week_of: string;
	user_id: string;
	username: string | null;
	display_name: string | null;
	avatar_url: string | null;
	reason_md: string;
	deliverable_id: string | null;
	created_at: string;
}

/** The post a person will send. Composed by the backend so the same words go
 *  to every network, and returned rather than published — nothing here posts
 *  to a third party on a schedule. */
export interface FeaturedCard {
	headline: string;
	body: string;
	profile_url: string;
	deliverable_url: string | null;
	avatar_url: string | null;
}

/** One automated check on a design artefact (a11y, contrast, motion budget,
 *  token linting). Advisory: no check here decides a verdict. */
export interface DesignAutoCheck {
	round: number;
	check_type: string;
	/** `info`, `warning` or `error`. */
	severity: string;
	message: string;
	details: Record<string, unknown> | null;
	ran_at: string;
}

/** One reviewed version of an artefact, at the round it was reviewed. */
export interface DesignVersionAtRound {
	round: number;
	/** Null on rounds recorded before the trail snapshotted the artefact —
	 *  the comparison is then honestly unavailable rather than quietly
	 *  wrong. */
	artifact_url: string | null;
	author_notes_md: string | null;
	decision: DesignReviewVerdict;
	blocking_reason: DesignBlockingReason | null;
	reason: string | null;
	grid_scores: Record<string, unknown> | null;
	decided_at: string;
}

/** Two versions and everything said between them. */
export interface DesignComparison {
	slice_id: string;
	design_subtype: DesignSubtype | null;
	/** Which diff is meaningful for this kind of artefact. The pixels are
	 *  diffed by whoever has them; this only says which comparison to make. */
	diff_strategy: string | null;
	from: DesignVersionAtRound;
	to: DesignVersionAtRound;
	critiques_between: DesignReviewRound[];
}

// ============================================================
// Skilluv Cyber — findings, disclosure and the catalogue
// (Linear project « Skilluv Cyber », tickets SKI-120, SKI-127,
//  plus the W-01..W-05 workflow tickets)
//
// A finding is not a report that gets approved. It is a claim
// about a real system that moves through triage, reproduction,
// an embargo and, sometimes, publication — and each of those
// steps is taken by a different person with different rights.
// ============================================================

/** Where a finding is. Mirrors the CHECK on `security_findings.status`
 *  (migration 0547). */
export type SecurityFindingStatus =
	| 'submitted'
	| 'triaged'
	| 'confirmed'
	| 'duplicate'
	| 'not_applicable'
	| 'withdrawn'
	| 'fixed'
	| 'published';

export const SECURITY_FINDING_STATUSES: SecurityFindingStatus[] = [
	'submitted',
	'triaged',
	'confirmed',
	'duplicate',
	'not_applicable',
	'withdrawn',
	'fixed',
	'published'
];

/** How bad it is. The reported tier is kept next to the final one: the
 *  disagreement is information. */
export type SecuritySeverityTier = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export const SECURITY_SEVERITY_TIERS: SecuritySeverityTier[] = [
	'critical',
	'high',
	'medium',
	'low',
	'informational'
];

/** What was attacked. A finding points at exactly one of the three. */
export type SecurityTargetKind = 'platform' | 'mission' | 'project';

export const SECURITY_TARGET_KINDS: SecurityTargetKind[] = ['platform', 'mission', 'project'];

/** How far the disclosure clock has run. */
export type SecurityDisclosureStage =
	| 'embargoed'
	| 'extension_requested'
	| 'partially_disclosed'
	| 'public'
	| 'withheld';

/** What a scanner thought, and what a person decided about it. Nothing is
 *  merged automatically: a merge decides who is paid. */
export type SecurityDedupState = 'original' | 'suspected' | 'duplicate_confirmed';

/** Who filed it. An anonymous reporter is shown as anonymous everywhere,
 *  including here — the alias is stable so a triager can still see that two
 *  findings came from the same person. */
export interface SecurityReporter {
	username?: string;
	display_name?: string;
	anonymous?: boolean;
	rank?: string | null;
	/** Findings by this person already confirmed. Track record, not proof. */
	confirmed_findings?: number;
}

/** One row of the triage queue. */
export interface SecurityFindingRow {
	id: string;
	title: string;
	status: SecurityFindingStatus;
	severity_tier: SecuritySeverityTier;
	severity_reported_tier: SecuritySeverityTier;
	cvss_vector: string | null;
	cvss_score: string | number | null;
	cwe_id: string | null;
	target_kind: SecurityTargetKind;
	target_host: string | null;
	affected_endpoint: string | null;
	reporter: SecurityReporter;
	triage_skipped_reason: string | null;
	dedup_state: SecurityDedupState;
	similar_count: number;
	/** Hours since it arrived. The queue is ordered by severity then age, so
	 *  this is the column that says whether the SLA is holding. */
	age_hours: number;
	created_at: string;
	/** True while a question to the reporter is unanswered. */
	open_round: boolean;
}

/** The full row, as `to_jsonb` returns it: everything the queue carries plus
 *  the report itself, the disclosure clock and the resolution. */
export interface SecurityFindingDetail
	extends Omit<SecurityFindingRow, 'similar_count' | 'age_hours' | 'open_round'> {
	description_md: string;
	reproduction_steps_md: string;
	impact_md: string | null;
	proposed_fix_md: string | null;
	/** Keys in the private bucket, never public URLs. Exchanged for a signed
	 *  URL one at a time — a proof of an unfixed vulnerability is not public
	 *  material. */
	proof_keys: string[];
	reporter_is_anonymous: boolean;
	mission_id: string | null;
	project_id: string | null;
	severity_override_reason: string | null;
	triage_notes_md: string | null;
	triaged_at: string | null;
	duplicate_of_finding_id: string | null;
	similar_finding_ids: string[];
	similarity_scores: number[];
	similarity_scanned_at: string | null;
	disclosure_stage: SecurityDisclosureStage | null;
	disclosure_policy_days: number;
	embargo_ends_at: string | null;
	vendor_notified_at: string | null;
	vendor_patch_confirmed_at: string | null;
	extension_requested_at: string | null;
	extension_granted_days: number | null;
	withheld_reason: string | null;
	fix_url: string | null;
	fixed_at: string | null;
	writeup_url: string | null;
	published_at: string | null;
	updated_at: string;
}

/** One entry of the audit trail. Every decision leaves one. */
export interface SecurityFindingEvent {
	event: string;
	from: SecurityFindingStatus | null;
	to: SecurityFindingStatus | null;
	reason: string | null;
	detail: Record<string, unknown> | null;
	at: string;
	/** Null when the actor's account is gone, or when the system acted. */
	actor: string | null;
}

/** A question put to the reporter, and their answer. Capped at five by the
 *  database: a report iterated five times and still not reproducible is a
 *  decision, not another round. */
export interface SecurityFindingRound {
	round_no: number;
	/** A slug from `revision_round_kinds`. */
	kind: string;
	/** The human name of that kind, when the slug resolves. */
	name: string | null;
	notes_md: string;
	requested_at: string;
	answer_md: string | null;
	answered_at: string | null;
	/** `satisfied` or `insufficient`, once closed. */
	resolution: string | null;
	resolved_at: string | null;
}

/** Something a scanner thought looked like this one. */
export interface SecuritySimilarFinding {
	id: string;
	title: string;
	status: SecurityFindingStatus;
	severity_tier: SecuritySeverityTier;
	created_at: string;
	/** Trigram similarity, 0..1. A reason to look, never a verdict. */
	score: number;
}

export interface SecurityFindingDetailResponse {
	finding: SecurityFindingDetail;
	events: SecurityFindingEvent[];
	rounds: SecurityFindingRound[];
	similar: SecuritySimilarFinding[];
	/** Internal notes. Only this route carries them. */
	comments: SecurityFindingComment[];
}

/** One line of the deduplication queue: a finding and everything that
 *  resembles it. */
export interface SecurityDedupPair {
	id: string;
	title: string;
	created_at: string;
	severity_tier: SecuritySeverityTier;
	candidates: SecuritySimilarFinding[] | null;
}

/** The six question kinds a reviewer can put to a reporter (migration
 *  0547). Kept here so the round form does not invent a slug the database
 *  will refuse. */
export const SECURITY_ROUND_KINDS = [
	'sec_repro_insufficient',
	'sec_proof_insufficient',
	'sec_severity_disputed',
	'sec_patch_requested',
	'sec_scope_question',
	'sec_impact_unclear'
] as const;

export type SecurityRoundKind = (typeof SECURITY_ROUND_KINDS)[number];

/** A bug bounty programme somebody at Skilluv has read and put forward. */
export interface ExternalBountyProgramme {
	id: string;
	platform: string;
	program_slug: string;
	program_url: string;
	organisation_name: string;
	scope_summary: string | null;
	skill_topics: string[];
	payout_range: string | null;
	pays_money: boolean;
	discloses_reports: boolean;
	is_active: boolean;
	retired_reason: string | null;
	/** When somebody last looked. The date is the whole claim: a programme
	 *  nobody has checked for a year is shown with that date rather than
	 *  presented as current. */
	curated_at: string;
	curated_by: string | null;
	created_at: string;
	updated_at: string;
}

/** Work done on another platform, claimed here. Verified by a person reading
 *  the public disclosure, never by a scraper. */
export interface ExternalBountyClaim {
	id: string;
	username: string;
	platform: string;
	organisation: string;
	report_url: string;
	claimed_severity: SecuritySeverityTier;
	cwe_id: string | null;
	summary_md: string | null;
	disclosed_on: string | null;
	created_at: string;
	/** Claims by this person already accepted. */
	other_claims_by_this_person: number;
}

/** The public disclosure record, as the hall of fame publishes it. */
export interface SecurityHallOfFameContributor {
	reporter: {
		username?: string;
		display_name?: string;
		avatar_url?: string | null;
		alias?: string;
	};
	findings: number;
	/** 1..5, the highest severity reached. */
	top_severity: number;
	first_finding_at: string;
	rank: string | null;
}

export interface SecurityHallOfFameEntry {
	id: string;
	title: string;
	severity_tier: SecuritySeverityTier;
	published_at: string | null;
	writeup_url: string | null;
	reporter: { username?: string; alias?: string };
}

export interface SecurityHallOfFameStats {
	confirmed: number;
	published: number;
	fixed: number;
	by_severity: Partial<Record<SecuritySeverityTier, number>> | null;
	/** Null while nothing has been published. */
	median_days_to_publication: string | number | null;
	reporters: number;
}

export interface SecurityHallOfFame {
	top_contributors: SecurityHallOfFameContributor[];
	recent_findings: SecurityHallOfFameEntry[];
	stats: SecurityHallOfFameStats;
	scope: string[];
}

/** A question on a defensive lab, with its answer in plaintext. The answer is
 *  hashed by the backend and never stored — this shape only ever travels one
 *  way. */
export interface NewLabQuestion {
	id: string;
	/** `text` or `choice`. */
	kind: string;
	question: string;
	answer: string;
	choices: string[];
	hint: string | null;
	case_sensitive: boolean;
}

/** A machine-graded security challenge, before it exists.
 *
 *  Only the two kinds that need a secret are created this way; the ones a
 *  person grades by reading a write-up are seeded like every other domain's
 *  catalogue. */
export interface NewSecurityChallenge {
	title: string;
	description: string;
	instructions: string;
	/** `ctf_flag` or `defensive_lab`. */
	kind: 'ctf_flag' | 'defensive_lab';
	difficulty: number;
	difficulty_tier: string;
	reward_fragments: number;
	duration_minutes?: number | null;
	flag?: string | null;
	flag_format?: string | null;
	target_url?: string | null;
	lab_artifact_key?: string | null;
	lab_artifact_bytes?: number | null;
	questions?: NewLabQuestion[];
	pass_percent?: number | null;
	max_attempts?: number | null;
	attribution_md?: string | null;
}

// ============================================================
// Paid missions — the admin's one decision
// (Linear tickets SKI-162 cyber M-10, SKI-249 design M-08)
//
// Missions are one mechanism for every domain: a design mission
// is a mission with `skill_domain = 'design'`. There is no
// second surface for design and no third for security, and the
// filter is what tells them apart.
// ============================================================

/** Mission lifecycle. Mirrors the CHECK on `missions.status`
 *  (migration 0192). */
export type MissionStatus =
	| 'draft'
	| 'published'
	| 'applications_closed'
	| 'in_progress'
	| 'delivered'
	| 'closed'
	| 'cancelled';

export const MISSION_STATUSES: MissionStatus[] = [
	'draft',
	'published',
	'applications_closed',
	'in_progress',
	'delivered',
	'closed',
	'cancelled'
];

/** One kind of paid work, per domain. Rows, not code: design needed twelve
 *  of them and got twelve rows. */
export interface MissionType {
	slug: string;
	skill_domain: SkillDomain;
	name: string;
	description: string;
}

/** One row of the mission board, seen from outside the two parties. */
export interface AdminMissionRow {
	id: string;
	slug: string;
	title: string;
	skill_domain: SkillDomain;
	mission_type_slug: string;
	status: MissionStatus;
	enterprise_name: string;
	assigned_username: string | null;
	published_at: string | null;
	last_delivered_at: string | null;
	rounds: number;
	/** A hand-in nobody has answered, for longer than the threshold. This is
	 *  what "stuck" means — not a slow mission, an unanswered one. */
	awaiting_decision: boolean;
	arbitrated: boolean;
}

/** One hand-in and what became of it. */
export interface MissionDeliveryRound {
	round: number;
	delivered_by: string | null;
	artifact_url: string | null;
	notes_md: string | null;
	delivered_at: string;
	/** `accepted`, `changes_requested`, or null while it waits. */
	decision: string | null;
	decision_reason: string | null;
	decided_at: string | null;
	beyond_agreed_rounds: boolean;
}

/** Money raised against a mission, shown next to the work rather than on
 *  another page. */
export interface MissionInvoice {
	id: string;
	label: string;
	amount: string;
	currency: string;
	status: string;
	captured_at: string | null;
	released_at: string | null;
	issued_at: string | null;
}

/** The decision taken by somebody outside, where there has been one. */
export interface MissionArbitration {
	/** `accepted` or `cancelled`. */
	outcome: string;
	reason_md: string;
	arbiter: string | null;
	decided_at: string;
}

export interface AdminMissionDetail {
	mission: AdminMissionRow;
	/** What the mission says about who owns the work. Shown because it is
	 *  what an arbitration turns on, and because nobody reads a contract
	 *  they have to go and find. */
	ip_terms: string;
	nda_required: boolean;
	rounds: MissionDeliveryRound[];
	invoices: MissionInvoice[];
	arbitration: MissionArbitration | null;
}

// ============================================================
// Contest administration — juries, prizes, vote integrity
// (Linear tickets SKI-150 cyber P-03, SKI-200 / SKI-205 design)
// ============================================================

/** Somebody asked to judge, and what they answered. Public on purpose: a
 *  contest whose panel is secret cannot be trusted. */
export interface JuryInvitation {
	tournament_id: string;
	juror_user_id: string;
	invited_by_user_id: string | null;
	invited_at: string;
	accepted_at: string | null;
	declined_at: string | null;
	decline_reason: string | null;
}

/** An entry whose vote count spiked inside a window. A reason to look, never
 *  a verdict — deciding a vote was bought stays a human judgement. */
export interface VoteBurst {
	submission_id: string;
	votes: number;
}

/** A contest that has ended and is still holding its prize. Each one owes an
 *  award or a refund, and nothing decides which automatically. */
export interface OutstandingPrize {
	tournament_id: string;
	name: string;
}

// ============================================================
// The six surfaces SKI-338 added, consumed here
// ============================================================

/**
 * The state of the disclosure queue, on one snapshot.
 *
 * Computed in a single statement backend-side, which matters more than it
 * sounds: a status tally and an SLA count read a second apart can disagree
 * about the same finding, and nothing on screen would say that is what
 * happened.
 *
 * Withdrawn and not-applicable findings are excluded — counting closed
 * business makes the backlog look like work that is not there.
 */
export interface SecurityOverview {
	/** Only the statuses that have at least one finding. */
	by_status: Partial<Record<SecurityFindingStatus, number>>;
	by_severity: Partial<Record<SecuritySeverityTier, number>>;
	/** `null` when nothing is waiting. Not zero: zero hours reads as
	 *  "something just arrived", which is the opposite. */
	oldest_untriaged_hours: number | null;
	/** Untriaged past the SLA. Findings whose triage was skipped by rank do
	 *  not count — they were answered the moment they arrived. */
	breaching_triage_sla: number;
	/** The threshold the count above is measured against, sent rather than
	 *  hard-coded here so the screen can name what it compares to. */
	triage_sla_days: number;
	open_rounds: number;
	embargoes_expiring_7d: number;
	/** Already past and still embargoed — a different sentence from the week
	 *  ahead: one is a deadline, the other is a missed one. */
	embargoes_overdue: number;
	suspected_duplicates: number;
}

/**
 * An internal note on a finding.
 *
 * Append-only: the backend exposes no edit and no delete, because a note that
 * decided how a finding was handled is part of how it was handled. Never
 * reaches the reporter — the table is joined by one reader, and that is what
 * makes it a property rather than a promise.
 */
export interface SecurityFindingComment {
	id: string;
	body_md: string;
	at: string;
	author: string;
	author_display_name: string | null;
}

/**
 * A research token, as the revoke surface needs to see it.
 *
 * The token itself never comes back — only `token_prefix`, which is what
 * matches a line in an access log.
 */
export interface SecurityResearchToken {
	id: string;
	username: string;
	display_name: string | null;
	token_prefix: string;
	label: string | null;
	issued_at: string;
	expires_at: string;
	expired: boolean;
	revoked_at: string | null;
	revoked_reason: string | null;
	last_used_at: string | null;
	requests_seen: number;
	/** Findings filed under this token. Counted from a column the backend
	 *  added for it rather than guessed from a date range on the holder — a
	 *  guess would credit the token for reports filed without it. */
	findings: number;
	findings_confirmed: number;
}
