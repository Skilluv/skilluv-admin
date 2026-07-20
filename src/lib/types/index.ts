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
	| 'community_curator';

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
