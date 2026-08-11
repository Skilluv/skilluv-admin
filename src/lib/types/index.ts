// ============================================
// Types Skilluv — basés sur API-ROUTES.md
// ============================================

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

/** Backend P18.4 — capability slugs stored in `user_capabilities.capability`.
 *  Kept in sync with migrations/0094_user_capabilities.sql +
 *  migrations/0098_community_moderator_capabilities.sql.
 *  Adding a value here requires a matching backend migration. */
export type Capability =
	| 'challenger'
	| 'mentor'
	| 'project_steward'
	| 'pr_reviewer'
	| 'bounty_funder'
	| 'issue_proposer'
	| 'jury_tournament'
	| 'admin'
	| 'enterprise_recruiter'
	| 'community_moderator'
	| 'forum_moderator'
	| 'plagiarism_reviewer'
	| 'kyc_reviewer'
	| 'community_curator'
	/** P26 v2 SKI-80 — one enum value per validator domain (migration 0120).
	 *  Held by users allowed to pick up + approve/reject a slice validation
	 *  whose `primary_domain` matches. */
	| `challenge_validator:${ValidatorDomain}`;

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
