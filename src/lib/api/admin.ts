import type {
	UserPrivate,
	Challenge,
	ChallengeDifficulty,
	ChallengeMode,
	ChallengeTone,
	ProjectListItem,
	ProjectListFilters,
	ProjectDetail,
	ProjectCreateBody,
	ProjectPatchBody,
	Report,
	ReportStatus,
	ReportTargetType,
	SkillDomain,
	ApiResponse,
	ApiPaginatedResponse,
	Capability,
	UserCapability,
	FraudFlaggedDeliverable,
	FraudSuspectedUser,
	FraudSuspectGroup,
	FraudScanOutcome,
	FraudLlmEvaluation,
	Orientation,
	OrientationDomain,
	CreateOrientationBody,
	PatchOrientationBody,
	AttachSkillBody,
	BadgeRule,
	BadgeRuleCatalogEntry,
	CreateBadgeRuleBody,
	PatchBadgeRuleBody,
	EnterpriseType,
	EnterpriseAdmin,
	EnterpriseTypeConfig,
	AgencyClient,
	PatchEnterpriseTypeBody,
	UserOrientationEntry,
	UserBadgesResponse,
	UserRankHistoryEntry,
	RecomputeProofsBody,
	RecomputeProofsDryRunPreview,
	RecomputeProofsReport,
	RankOverrideBody,
	RankOverrideResult,
	Rank,
	ProofHooksSweepDryRun,
	ProofHooksSweepResult,
	AdminGdprExportTrigger,
	AdminGdprExportResult,
	CreateBadgeEventBody,
	BadgeEvent,
	SkillNodeAdmin,
	SkillNodeDomain,
	CreateSkillNodeBody,
	UpdateSkillNodeBody,
	RecomputeCapabilitiesResult,
	AdminSlice,
	AdminSliceFilters,
	SliceConfigBody,
	ProjectChallengeStats,
	ProjectIngestReport,
	ValidatorDomain,
	ValidatorApplication,
	ValidatorApplicationRow,
	ValidatorApplicationFilters,
	ValidatorInviteBody,
	ValidatorStatsResponse,
	CollusionMatrixResponse
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

// --- Types ---

interface UserSummary {
	id: string;
	username: string;
	display_name: string;
	email: string;
	role: string;
	skill_domain: SkillDomain;
	title: string;
	total_fragments: number;
	profile_active: boolean;
	is_banned: boolean;
	created_at: string;
}

interface UserDetail {
	// Backend enriches this beyond the shared UserPrivate shape (Trello
	// xHnNZa5G + gWSCzyz0 + RXEWNI6y): admin panel needs the 2FA + passkey
	// posture so we can decide reset-2fa eligibility without a psql hop.
	// `totp_enabled` + `email_2fa_enabled` are already on UserPrivate ;
	// `webauthn_credentials_count` is admin-only, added via intersection.
	user: UserPrivate & { webauthn_credentials_count: number };
	reports_against: number;
	total_submissions: number;
}

interface ReportEntry {
	id: string;
	target_type: ReportTargetType;
	target_id: string;
	reason: string;
	details: string | null;
	status: ReportStatus;
	reporter_id: string;
	reporter_username: string;
	created_at: string;
}

interface AuditEntry {
	id: string;
	admin_id: string;
	admin_username: string;
	action: string;
	target_type: string;
	target_id: string;
	details: string | null;
	created_at: string;
}

interface AdminStats {
	users: { total: number; active_30d: number; banned: number };
	challenges: { total: number; published: number; draft: number; archived: number };
	submissions: { total: number; today: number };
	websocket: { connections: number };
}

interface ModerationDashboard {
	banned_users: number;
	reports: { pending: number; resolved: number; dismissed: number; total: number };
	recent_bans_30d: number;
	admin_actions_today: number;
}

interface CommunityChallenge {
	challenge: Challenge;
	creator: { id: string; username: string; display_name: string };
}

// --- API ---

export const adminApi = {
	// --- Users ---

	listUsers(params?: { role?: string; banned?: boolean; q?: string; page?: number; per_page?: number }) {
		return api.get<ApiPaginatedResponse<UserSummary>>('/admin/users', params as Record<string, string | number>);
	},

	getUser(id: string) {
		return api.get<ApiResponse<UserDetail>>(`/admin/users/${id}`);
	},

	banUser(id: string, reason: string) {
		return api.post<ApiResponse<{ message: string; reason: string }>>(`/admin/users/${id}/ban`, { reason });
	},

	unbanUser(id: string) {
		return api.post<ApiResponse<{ message: string }>>(`/admin/users/${id}/unban`);
	},

	resetUser2fa(id: string, reason: string) {
		return api.post<ApiResponse<{ reset: boolean; user_id: string; message: string }>>(
			`/admin/users/${id}/reset-2fa`,
			{ reason }
		);
	},

	// --- Capabilities (P18.4) ---

	/** Public endpoint but useful in admin panel to list a user's active caps.
	 *  Backend excludes revoked and expired entries. */
	listUserCapabilities(userId: string) {
		return api.get<ApiResponse<{ user_id: string; capabilities: UserCapability[] }>>(
			`/users/${userId}/capabilities`
		);
	},

	grantCapability(
		userId: string,
		payload: { capability: Capability; granted_reason: string; expires_at?: string }
	) {
		return api.post<ApiResponse<{ granted: boolean; user_id: string; capability: Capability }>>(
			`/admin/users/${userId}/capabilities`,
			payload
		);
	},

	/** Backend generates the revoke reason server-side as
	 *  `admin_revoke:by_{admin_id}`; DELETE accepts no body.
	 *  The slug is encoded because P26 v2 capabilities carry a colon
	 *  (`challenge_validator:code`) — a no-op for every other value. */
	revokeCapability(userId: string, capability: Capability) {
		return api.delete<ApiResponse<{ revoked: boolean; user_id: string; capability: Capability }>>(
			`/admin/users/${userId}/capabilities/${encodeURIComponent(capability)}`
		);
	},

	// --- Fraud (P14.5) ---

	fraudQueue(params?: { threshold?: number; limit?: number }) {
		return api.get<ApiResponse<{
			flagged_deliverables: FraudFlaggedDeliverable[];
			suspected_users: FraudSuspectedUser[];
		}>>('/admin/fraud/queue', params as Record<string, string | number>);
	},

	markDeliverableValid(deliverableId: string) {
		return api.post<ApiResponse<{ marked_valid: boolean }>>(
			`/admin/fraud/deliverables/${deliverableId}/mark-valid`
		);
	},

	revokeDeliverable(deliverableId: string, reason?: string) {
		return api.post<ApiResponse<{ revoked: boolean }>>(
			`/admin/fraud/deliverables/${deliverableId}/revoke`,
			reason ? { reason } : undefined
		);
	},

	markUserValid(userId: string) {
		return api.post<ApiResponse<{ marked_valid: boolean }>>(
			`/admin/fraud/users/${userId}/mark-valid`
		);
	},

	scanDeliverable(
		deliverableId: string,
		params?: { threshold?: number; window_days?: number }
	) {
		const qs = new URLSearchParams();
		if (params?.threshold !== undefined) qs.set('threshold', String(params.threshold));
		if (params?.window_days !== undefined) qs.set('window_days', String(params.window_days));
		const suffix = qs.toString() ? `?${qs.toString()}` : '';
		return api.post<ApiResponse<FraudScanOutcome>>(
			`/admin/fraud/scan-deliverable/${deliverableId}${suffix}`
		);
	},

	detectMultiAccounts(body?: { window_hours?: number; min_group_size?: number }) {
		return api.post<
			ApiResponse<{
				groups_detected: number;
				users_flagged: number;
				groups: FraudSuspectGroup[];
			}>
		>('/admin/fraud/detect-multi-accounts', body ?? {});
	},

	llmEvaluateDeliverable(deliverableId: string) {
		return api.post<ApiResponse<FraudLlmEvaluation>>(
			`/admin/fraud/llm-evaluate/${deliverableId}`
		);
	},

	/**
	 * IA-B — Deep plagiarism scan. Slower (2-5s IA + Redis queue), stricter
	 * than the cosine `scanDeliverable` (P14.3). Query params tune the
	 * comparison pool + threshold. Result is merged into
	 * `deliverables.verification_signal.deep_plagiarism` (JSONB).
	 * Rate-limited via admin_destructive.
	 */
	deepScanDeliverable(deliverableId: string, opts?: { threshold?: number; window_days?: number; pool_cap?: number }) {
		const params = new URLSearchParams();
		if (opts?.threshold !== undefined) params.set('threshold', String(opts.threshold));
		if (opts?.window_days !== undefined) params.set('window_days', String(opts.window_days));
		if (opts?.pool_cap !== undefined) params.set('pool_cap', String(opts.pool_cap));
		const qs = params.toString();
		return api.post<
			ApiResponse<{
				deliverable_id: string;
				deep_plagiarism: {
					similarity_score?: number;
					verdict?: string;
					flagged_at?: string;
					comparison_pool_size?: number;
				};
			}>
		>(`/admin/fraud/deep-scan/${deliverableId}${qs ? `?${qs}` : ''}`);
	},

	// --- Reports ---

	listReports(params?: { status?: ReportStatus; target_type?: ReportTargetType; page?: number; per_page?: number }) {
		return api.get<ApiPaginatedResponse<ReportEntry>>('/admin/reports', params as Record<string, string | number>);
	},

	resolveReport(id: string, status: 'resolved' | 'dismissed', adminNote?: string) {
		return api.put<ApiResponse<{ report: ReportEntry; message: string }>>(`/admin/reports/${id}`, {
			status,
			admin_note: adminNote
		});
	},

	// --- Audit Log ---

	auditLog(params?: { action?: string; page?: number; per_page?: number }) {
		return api.get<ApiPaginatedResponse<AuditEntry>>('/admin/audit-log', params as Record<string, string | number>);
	},

	auditLogGeneric(params?: {
		actor_type?: string;
		actor_id?: string;
		action?: string;
		target_type?: string;
		target_id?: string;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<AuditGenericEntry>>(
			'/admin/audit-log/generic',
			params as Record<string, string | number>
		);
	},

	// --- One-shot operations ---

	dissolveGuild(id: string, reason?: string) {
		return api.post<ApiResponse<{ dissolved: boolean }>>(
			`/admin/guilds/${id}/dissolve`,
			reason ? { reason } : {}
		);
	},

	concludeGuildWar(id: string, winnerGuildId: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(`/guild-wars/${id}/conclude`, {
			winner_guild_id: winnerGuildId
		});
	},

	aiHiddenGems(payload?: Record<string, unknown>) {
		return api.post<ApiResponse<{ job_id: string }>>('/admin/ai/hidden-gems', payload ?? {});
	},

	aiChurn(payload?: Record<string, unknown>) {
		return api.post<ApiResponse<{ job_id: string }>>('/admin/ai/churn', payload ?? {});
	},

	runWeeklyDigest() {
		return api.post<ApiResponse<{ digest: Record<string, unknown> }>>('/admin/digest/run-weekly', {});
	},

	syncGithub(userId: string) {
		return api.post<ApiResponse<{ sync: Record<string, unknown> }>>(
			`/admin/github/sync/${userId}`,
			{}
		);
	},

	accountingExportUrl(year: number, month: number): string {
		return `/api/admin/accounting/export?year=${year}&month=${month}`;
	},

	// --- Dashboard ---

	stats() {
		return api.get<ApiResponse<AdminStats>>('/admin/stats');
	},

	moderationDashboard() {
		return api.get<ApiResponse<ModerationDashboard>>('/admin/dashboard/moderation');
	},

	dashboardOverview() {
		return api.get<ApiResponse<DashboardOverview>>('/admin/dashboard/overview');
	},

	dashboardFinancial() {
		return api.get<ApiResponse<DashboardFinancial>>('/admin/dashboard/financial');
	},

	dashboardModerationQueue() {
		return api.get<ApiResponse<DashboardModerationQueue>>('/admin/dashboard/moderation-queue');
	},

	dashboardHealth() {
		return api.get<ApiResponse<DashboardHealth>>('/admin/dashboard/health');
	},

	// --- Challenges ---

	createChallenge(data: ChallengeCreateBody) {
		return api.post<ApiResponse<{ challenge: Challenge }>>('/admin/challenges', data);
	},

	/** Convention `{data: T[], pagination}` — le backend a aligné toutes les
	 *  listes admin dessus (cf. BUGS_BACK P3). Le type disait encore
	 *  `{challenges: […]}`, donc la page lisait `undefined`. */
	listChallenges() {
		return api.get<ApiPaginatedResponse<Challenge>>('/admin/challenges');
	},

	updateChallenge(id: string, data: ChallengePatchBody) {
		return api.put<ApiResponse<{ challenge: Challenge }>>(`/admin/challenges/${id}`, data);
	},

	publishChallenge(id: string) {
		return api.post<ApiResponse<{ challenge: Challenge }>>(`/admin/challenges/${id}/publish`);
	},

	archiveChallenge(id: string) {
		return api.post<ApiResponse<{ challenge: Challenge }>>(`/admin/challenges/${id}/archive`);
	},

	/**
	 * IA-C.1 — Generate a harder/easier variant of an existing challenge.
	 * Backend delegates to the AI gRPC service; rate-limited by
	 * admin_destructive (10/min, 100/hr). `target_param` is a free-form hint
	 * used by the AI prompt (e.g. "increase branching factor").
	 */
	generateChallengeVariant(id: string, body: { variant_type: 'harder' | 'easier'; target_param?: string }) {
		return api.post<ApiResponse<{ challenge: Challenge; message?: string }>>(
			`/admin/challenges/${id}/variant`,
			body
		);
	},

	rebuildLeaderboards() {
		return api.post<ApiResponse<{ message: string }>>('/admin/leaderboards/rebuild');
	},

	// --- Admin projects (content-strategy §4, annexes E + F) ---

	listAdminProjects(filters?: ProjectListFilters) {
		const params = new URLSearchParams();
		if (filters?.is_flagship !== undefined) params.set('is_flagship', String(filters.is_flagship));
		if (filters?.curated_by_admin !== undefined)
			params.set('curated_by_admin', String(filters.curated_by_admin));
		if (filters?.partnership_level !== undefined)
			params.set('partnership_level', String(filters.partnership_level));
		if (filters?.include_archived) params.set('include_archived', 'true');
		if (filters?.page) params.set('page', String(filters.page));
		if (filters?.per_page) params.set('per_page', String(filters.per_page));
		const qs = params.toString();
		return api.get<
			ApiPaginatedResponse<ProjectListItem>
		>(`/admin/projects${qs ? `?${qs}` : ''}`);
	},

	getAdminProject(slug: string) {
		return api.get<ApiResponse<ProjectDetail>>(`/admin/projects/${slug}`);
	},

	createAdminProject(data: ProjectCreateBody) {
		return api.post<ApiResponse<{ id: string; slug: string }>>('/admin/projects', data);
	},

	patchAdminProject(slug: string, data: ProjectPatchBody) {
		return api.patch<ApiResponse<{ slug: string; updated: boolean }>>(
			`/admin/projects/${slug}`,
			data
		);
	},

	archiveAdminProject(slug: string) {
		return api.delete<ApiResponse<{ slug: string; archived: boolean }>>(
			`/admin/projects/${slug}`
		);
	},

	// --- P26 v2 — challenge workflow (SKI-98 / SKI-99 / SKI-100) ---

	/** SKI-124 — per-repo workflow health. `window_days` is clamped 7..365
	 *  backend-side; anything outside that range comes back adjusted. */
	getProjectChallengeStats(slug: string, windowDays = 90) {
		return api.get<ApiResponse<ProjectChallengeStats>>(`/admin/projects/${slug}/stats`, {
			window_days: windowDays
		});
	},

	/** SKI-110 — force one ingestion pass on this project instead of waiting for
	 *  the hourly poller. Read-only against GitHub, like the poller itself.
	 *  Returns 400 when the project has no repo wired or is `manual_only`. */
	triggerProjectIngest(slug: string) {
		return api.post<ApiResponse<ProjectIngestReport>>(`/admin/projects/${slug}/ingest`);
	},

	/** Public list endpoint, admin-consumed: only `status='open'` slices come
	 *  back. Enough to reach a slice's config page from its project. */
	listOpenSlices(params?: {
		project_id?: string;
		domain?: ValidatorDomain;
		difficulty?: number;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<AdminSlice>>(
			'/slices',
			params as Record<string, string | number>
		);
	},

	/** SKI-112 — liste admin des slices, sans le filtre implicite `status='open'`
	 *  de l'endpoint public. `status` accepte plusieurs valeurs séparées par des
	 *  virgules ; un statut inconnu est refusé en 400. */
	listAdminSlices(filters?: AdminSliceFilters) {
		return api.get<ApiPaginatedResponse<AdminSlice>>('/admin/slices', {
			project_id: filters?.project_id,
			status: filters?.status?.length ? filters.status.join(',') : undefined,
			domain: filters?.domain,
			claimed_by_user_id: filters?.claimed_by_user_id,
			q: filters?.q || undefined,
			page: filters?.page,
			per_page: filters?.per_page
		});
	},

	/** Public detail endpoint — returns the slice whatever its status. */
	getSlice(id: string) {
		return api.get<ApiResponse<{ slice: AdminSlice }>>(`/slices/${id}`);
	},

	/** SKI-106 — override the claim gates (orientation sensitivity + rank floor)
	 *  on a single slice. `null` on a field clears the override. */
	patchSliceConfig(id: string, body: SliceConfigBody) {
		return api.patch<ApiResponse<{ slice: AdminSlice }>>(`/admin/slices/${id}/config`, body);
	},

	// Validator corps

	/** SKI-107 — candidacies + invitations with the applicant's live stats
	 *  embedded, so the review screen needs a single request. */
	listValidatorApplications(filters?: ValidatorApplicationFilters) {
		return api.get<ApiPaginatedResponse<ValidatorApplicationRow>>('/admin/validator-applications', {
			status: filters?.status,
			domain: filters?.domain,
			origin: filters?.origin,
			page: filters?.page,
			per_page: filters?.per_page
		});
	},

	/** SKI-82 — grants `challenge_validator:{domain}` to the applicant. */
	approveValidatorApplication(id: string) {
		return api.post<ApiResponse<{ application: ValidatorApplication }>>(
			`/admin/validator-applications/${id}/approve`
		);
	},

	rejectValidatorApplication(id: string, reason: string) {
		return api.post<ApiResponse<{ application: ValidatorApplication }>>(
			`/admin/validator-applications/${id}/reject`,
			{ reason }
		);
	},

	/** SKI-82 — admin-initiated path. Bypasses the candidacy thresholds but
	 *  still requires the invitee to accept before the capability is granted. */
	inviteValidator(body: ValidatorInviteBody) {
		return api.post<ApiResponse<{ application: ValidatorApplication }>>(
			'/admin/validators/invite',
			body
		);
	},

	/** SKI-108 — per-validator activity over a rolling window. The window is
	 *  clamped 1..730 backend-side. */
	listValidatorStats(windowDays = 90) {
		return api.get<ApiResponse<ValidatorStatsResponse>>('/admin/validators/stats', {
			window_days: windowDays
		});
	},

	/** SKI-108 — validator x claimant concentration. Advisory: the backend
	 *  flags rows, it never blocks anyone. */
	getValidatorCollusionMatrix(windowDays = 90, minCount = 5) {
		return api.get<ApiResponse<CollusionMatrixResponse>>('/admin/validators/collusion-matrix', {
			window_days: windowDays,
			min_count: minCount
		});
	},

	// --- Community ---

	/** Même convention `{data: T[]}` : la page lisait `data.challenges` et
	 *  n'affichait donc jamais la file de revue. */
	communityReview() {
		return api.get<ApiPaginatedResponse<CommunityChallenge>>('/admin/community/review');
	},

	approveCommunity(id: string) {
		return api.post<ApiResponse<{ challenge: Challenge; message: string }>>(`/admin/community/${id}/approve`);
	},

	rejectCommunity(id: string, feedback: string) {
		return api.post<ApiResponse<{ challenge: Challenge; message: string }>>(`/admin/community/${id}/reject`, { feedback });
	},

	// --- Enterprise SSO sessions ---

	listSsoSessions(params?: { enterprise_id?: string; page?: number; per_page?: number }) {
		return api.get<ApiPaginatedResponse<SsoSession>>(
			'/admin/sso/sessions',
			params as Record<string, string | number>
		);
	},

	revokeSsoSession(id: string, reason?: string) {
		return api.post<ApiResponse<{ revoked: boolean }>>(
			`/admin/sso/sessions/${id}/revoke`,
			reason ? { reason } : undefined
		);
	},

	// --- Enterprise KYC ---

	/** Même convention `{data: T[]}` que les autres listes admin : le type
	 *  annonçait `{queue: […]}`, donc la page affichait une file vide alors
	 *  que des dossiers attendaient. */
	listKycQueue() {
		return api.get<ApiPaginatedResponse<KycEntry>>('/admin/enterprise-kyc');
	},

	decideKyc(enterpriseId: string, body: KycDecisionBody) {
		return api.post<ApiResponse<{ decided: boolean; action: 'approve' | 'reject' }>>(
			`/admin/enterprise-kyc/${enterpriseId}/decide`,
			body
		);
	},

	// --- Sponsored challenges ---

	listSponsoredRequests() {
		return api.get<ApiPaginatedResponse<SponsoredRequest>>('/admin/sponsored-challenges');
	},

	decideSponsored(id: string, body: SponsoredDecisionBody) {
		return api.post<ApiResponse<{ id: string; status: SponsoredStatus }>>(
			`/admin/sponsored-challenges/${id}/decide`,
			body
		);
	},

	linkSponsored(id: string, body: SponsoredLinkBody) {
		return api.post<ApiResponse<{ linked: boolean; challenge_id: string }>>(
			`/admin/sponsored-challenges/${id}/link`,
			body
		);
	},

	// --- Seasons ---

	createSeason(body: CreateSeasonBody) {
		return api.post<ApiResponse<{ season: Season }>>('/admin/seasons', body);
	},

	updateSeasonStatus(id: string, status: string) {
		return api.post<ApiResponse<{ season: Season }>>(`/admin/seasons/${id}/status`, { status });
	},

	closeSeason(id: string, reason?: string) {
		return api.post<ApiResponse<{ close_report: SeasonCloseReport }>>(
			`/admin/seasons/${id}/close`,
			reason ? { reason } : {}
		);
	},

	// --- Tournaments ---

	createTournament(body: CreateTournamentBody) {
		return api.post<ApiResponse<{ tournament: Tournament }>>('/admin/tournaments', body);
	},

	updateTournamentStatus(id: string, status: string) {
		return api.post<ApiResponse<{ tournament: Tournament }>>(`/admin/tournaments/${id}/status`, { status });
	},

	scoreTournament(id: string, body: TournamentScoreBody) {
		return api.post<ApiResponse<{ updated: boolean }>>(`/admin/tournaments/${id}/score`, body);
	},

	concludeTournament(id: string, reason?: string) {
		return api.post<ApiResponse<{ conclusion: Record<string, unknown> }>>(
			`/admin/tournaments/${id}/conclude`,
			reason ? { reason } : {}
		);
	},

	// --- ADM-M3.1 — Orientations catalog (backend mig 0088, routes admin_orientations.rs) ---

	/** Liste publique paginée du catalogue orientations. Le back n'expose pas
	 *  de GET admin-scoped ; la vue admin filtre côté client sur ces données. */
	listOrientationsCatalog(params?: {
		domain?: OrientationDomain;
		tag?: string;
		limit?: number;
		offset?: number;
		include_archived?: boolean;
	}) {
		return api.get<ApiResponse<{ orientations: Orientation[]; total: number }>>(
			'/orientations',
			params as Record<string, string | number | boolean>
		);
	},

	/** Détail d'une orientation + skills mappés. */
	getOrientation(slug: string) {
		return api.get<
			ApiResponse<{
				orientation: Orientation;
				skills: Array<{
					id: string;
					slug: string;
					name: string;
					is_core: boolean;
					is_recommended: boolean;
					weight: number;
				}>;
			}>
		>(`/orientations/${slug}`);
	},

	createOrientation(body: CreateOrientationBody) {
		return api.post<ApiResponse<{ orientation: Orientation }>>('/admin/orientations', body);
	},

	patchOrientation(slug: string, body: PatchOrientationBody, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		return api.patch<
			ApiResponse<{ orientation: Orientation }> & {
				meta: { dry_run_preview?: { before: Orientation; after: Orientation } };
			}
		>(`/admin/orientations/${slug}${suffix}`, body);
	},

	attachOrientationSkill(slug: string, body: AttachSkillBody) {
		return api.post<
			ApiResponse<{ attached: boolean; orientation_slug: string; skill_id: string }>
		>(`/admin/orientations/${slug}/skills`, body);
	},

	detachOrientationSkill(slug: string, skillId: string) {
		return api.delete<ApiResponse<{ detached: boolean }>>(
			`/admin/orientations/${slug}/skills/${skillId}`
		);
	},

	// --- ADM-M3.2 — Badge rules (backend mig 0090, routes admin_badge_rules.rs) ---

	/** Catalogue public (rules non dépréciées uniquement). */
	listBadgeRulesCatalog() {
		return api.get<ApiResponse<{ rules: BadgeRuleCatalogEntry[] }>>('/badge-rules');
	},

	createBadgeRule(body: CreateBadgeRuleBody) {
		return api.post<ApiResponse<{ rule: BadgeRule }>>('/admin/badge-rules', body);
	},

	patchBadgeRule(slug: string, body: PatchBadgeRuleBody, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		return api.patch<
			ApiResponse<{ rule: BadgeRule }> & {
				meta: {
					dry_run_preview?: {
						before: BadgeRule;
						patch: PatchBadgeRuleBody;
						users_impacted_count: number;
					};
				};
			}
		>(`/admin/badge-rules/${slug}${suffix}`, body);
	},

	deprecateBadgeRule(slug: string, reason: string, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		return api.post<
			ApiResponse<{ deprecated: boolean; slug: string; deprecated_at?: string }> & {
				meta: { dry_run_preview?: { users_with_badge_count: number } };
			}
		>(`/admin/badge-rules/${slug}/deprecate${suffix}`, { reason });
	},

	// --- ADM-M4 — Enterprise type manager (backend P24, routes admin_enterprises.rs) ---

	listAdminEnterprises(params?: {
		type?: EnterpriseType;
		verified?: boolean;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<EnterpriseAdmin>>(
			'/admin/enterprises',
			params as Record<string, string | number | boolean>
		);
	},

	patchEnterpriseType(id: string, body: PatchEnterpriseTypeBody, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		return api.patch<
			ApiResponse<{ enterprise: { id: string; enterprise_type: EnterpriseType; type_config: Record<string, unknown> } }> & {
				meta: { dry_run_preview?: { will_reset_type_config: boolean; target_type: EnterpriseType } };
			}
		>(`/admin/enterprises/${id}/type${suffix}`, body);
	},

	getEnterpriseTypeConfig(id: string) {
		return api.get<ApiResponse<EnterpriseTypeConfig>>(
			`/admin/enterprises/${id}/type-config`
		);
	},

	listEnterpriseAgencyClients(id: string) {
		return api.get<ApiResponse<{ clients: AgencyClient[] }>>(
			`/admin/enterprises/${id}/agency-clients`
		);
	},

	/** GET /admin/enterprises/{id} — fiche complète (comble le gap : la
	 *  détail page utilisait un scan paginé de la liste avant Phase 6). */
	getAdminEnterprise(id: string) {
		return api.get<ApiResponse<{ enterprise: EnterpriseAdmin }>>(
			`/admin/enterprises/${id}`
		);
	},

	// --- ADM-M5 — Users enrichment (backend routes admin_users.rs + public reads) ---

	/** GET public : orientations d'un user (respecte profile_active). */
	getUserOrientations(userId: string) {
		return api.get<ApiResponse<{ orientations: UserOrientationEntry[] }>>(
			`/users/${userId}/orientations`
		);
	},

	/** GET public : badges polymorphiques d'un user (P17.5). */
	getUserBadges(userId: string) {
		return api.get<ApiResponse<UserBadgesResponse>>(`/users/${userId}/badges`);
	},

	/** GET public : historique des transitions de rank (ADM-M5+). */
	getUserRankHistory(userId: string) {
		return api.get<ApiResponse<{ history: UserRankHistoryEntry[] }>>(
			`/users/${userId}/rank-history`
		);
	},

	/** POST admin : recompute proof engine (capabilities + badges + rank) pour un user. */
	recomputeUserProofs(userId: string, body: RecomputeProofsBody = {}, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		if (dryRun) {
			return api.post<ApiResponse<RecomputeProofsDryRunPreview>>(
				`/admin/users/${userId}/recompute-proofs${suffix}`,
				body
			);
		}
		return api.post<ApiResponse<RecomputeProofsReport>>(
			`/admin/users/${userId}/recompute-proofs${suffix}`,
			body
		);
	},

	/** ADM-M5+ : POST /admin/proof-hooks/sweep — recompute batch pour tous
	 *  les users ayant eu de l'activité récente. Dry-run = preview count. */
	sweepProofHooks(withinDays: number, dryRun = false) {
		const qs = new URLSearchParams();
		qs.set('within_days', String(withinDays));
		if (dryRun) qs.set('dry_run', 'true');
		if (dryRun) {
			return api.post<ApiResponse<ProofHooksSweepDryRun>>(
				`/admin/proof-hooks/sweep?${qs.toString()}`
			);
		}
		return api.post<ApiResponse<ProofHooksSweepResult>>(
			`/admin/proof-hooks/sweep?${qs.toString()}`
		);
	},

	/** ADM-M5+ : POST /admin/users/{id}/gdpr-export — déclenche l'export
	 *  admin-side (background task, envoi par email au user cible). */
	triggerUserGdprExport(userId: string, body: AdminGdprExportTrigger) {
		return api.post<ApiResponse<AdminGdprExportResult>>(
			`/admin/users/${userId}/gdpr-export`,
			body
		);
	},

	/** Extras Phase 5 — POST /admin/badge-events (Hacktoberfest, Skilluv Fest…). */
	createBadgeEvent(body: CreateBadgeEventBody) {
		return api.post<ApiResponse<{ event: BadgeEvent }>>('/admin/badge-events', body);
	},

	/** Phase 6 gap-fix — GET /admin/badge-events (paginé, filtres is_active/is_partner). */
	listBadgeEvents(params?: {
		is_active?: boolean;
		is_partner?: boolean;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<BadgeEvent & { description: string; is_active: boolean; created_at: string }>>(
			'/admin/badge-events',
			params as Record<string, string | number | boolean>
		);
	},

	/** Extras Phase 5 — POST /admin/users/{id}/recompute-capabilities (scope réduit). */
	recomputeUserCapabilities(userId: string) {
		return api.post<ApiResponse<RecomputeCapabilitiesResult>>(
			`/admin/users/${userId}/recompute-capabilities`,
			{}
		);
	},

	/** Extras Phase 5 — GET /admin/skills (list + filter + pagination). */
	listAdminSkills(params?: {
		domain?: SkillNodeDomain;
		parent_id?: string;
		is_skilluv_specific?: boolean;
		q?: string;
		page?: number;
		per_page?: number;
	}) {
		return api.get<ApiPaginatedResponse<SkillNodeAdmin>>(
			'/admin/skills',
			params as Record<string, string | number | boolean>
		);
	},

	/** Extras Phase 5 — POST /admin/skills (create skill node). */
	createSkillNode(body: CreateSkillNodeBody) {
		return api.post<ApiResponse<{ skill: SkillNodeAdmin }>>('/admin/skills', body);
	},

	/** Extras Phase 5 — PUT /admin/skills/{id} (edit skill node). */
	updateSkillNode(id: string, body: UpdateSkillNodeBody) {
		return api.put<ApiResponse<{ updated: boolean; id: string }>>(
			`/admin/skills/${id}`,
			body
		);
	},

	/** POST admin : force le rank d'un user (cas exceptionnel, audité). */
	overrideUserRank(userId: string, body: RankOverrideBody, dryRun = false) {
		const suffix = dryRun ? '?dry_run=true' : '';
		if (dryRun) {
			return api.post<
				ApiResponse<{
					dry_run: true;
					would_override: {
						user_id: string;
						old_rank: Rank;
						new_rank: Rank;
						peers_at_new_rank: number;
					};
				}>
			>(`/admin/users/${userId}/rank-override${suffix}`, body);
		}
		return api.post<ApiResponse<RankOverrideResult>>(
			`/admin/users/${userId}/rank-override${suffix}`,
			body
		);
	}
};

export type KycLevel = 'none' | 'basic' | 'full';
export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface KycEntry {
	enterprise_id: string;
	company_name: string;
	level: KycLevel;
	status: KycStatus;
	monthly_spend_eur_cents: number;
	documents_count: number;
	updated_at: string;
}

export interface KycDecisionBody {
	action: 'approve' | 'reject';
	level?: 'basic' | 'full';
	reason?: string;
}

export interface ChallengeCreateBody {
	title: string;
	description: string;
	instructions: string;
	skill_domain: SkillDomain;
	difficulty: ChallengeDifficulty;
	mode?: ChallengeMode;
	duration_minutes?: number | null;
	ai_allowed?: boolean;
	tone?: ChallengeTone;
	language?: string | null;
	prerequisite_fragments?: number;
	reward_fragments?: number;
	is_onboarding?: boolean;
	expected_output?: string | null;
	test_cases?: unknown;
}

export type ChallengePatchBody = Partial<ChallengeCreateBody>;

export type SponsoredStatus = 'pending' | 'approved' | 'negotiating' | 'rejected' | 'linked';

export interface SponsoredRequest {
	id: string;
	enterprise_id: string;
	proposed_title: string;
	status: SponsoredStatus;
	brief: string;
	skill_domain: string;
	difficulty: number;
	duration_days: number;
	budget_eur_cents: number;
	challenge_id: string | null;
	created_at: string;
}

export interface SponsoredDecisionBody {
	action: 'approve' | 'reject' | 'negotiate';
	admin_notes?: string;
}

export interface DashboardOverview {
	signups_today: number;
	enterprises_total: number;
	paying_enterprises: number;
	hires_this_month: number;
	mrr_eur_cents: number;
	refund_rate_pct_30d: number;
}

export interface DashboardFinancial {
	month_revenue_ttc_cents: number;
	month_invoices_count: number;
	primary_currency: string;
	purchases_breakdown: Array<{ session_group: string; purchases: number; credits_total: number }>;
}

export interface DashboardModerationQueue {
	reports_pending: number;
	kyc_pending: number;
	sponsored_requests_pending: number;
	banned_last_30d: number;
}

export interface AuditGenericEntry {
	id: string;
	actor_type: string;
	actor_id: string | null;
	action: string;
	target_type: string | null;
	target_id: string | null;
	metadata: Record<string, unknown>;
	ip: string | null;
	user_agent: string | null;
	created_at: string;
}

export interface Season {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	starts_at: string;
	ends_at: string;
	status: string;
	closed_at: string | null;
	created_at: string;
}

export interface CreateSeasonBody {
	slug: string;
	name: string;
	description?: string;
	starts_at: string;
	ends_at: string;
}

export interface SeasonCloseReport {
	season_id: string;
	guilds_reset: number;
	promotions: number;
	relegations: number;
}

export type TournamentKind = 'individual' | 'guild_war' | 'hackathon';
export type TournamentFormat = 'swiss' | 'bracket' | 'ladder';

export interface Tournament {
	id: string;
	season_id: string | null;
	slug: string;
	name: string;
	description: string | null;
	kind: TournamentKind;
	format: TournamentFormat;
	prize_pool_fragments: number;
	prize_pool_gp: number;
	sponsor_enterprise_id: string | null;
	sponsor_logo_url: string | null;
	sponsor_blurb: string | null;
	registration_opens_at: string | null;
	starts_at: string;
	ends_at: string;
	status: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateTournamentBody {
	season_id?: string;
	slug: string;
	name: string;
	description?: string;
	kind: TournamentKind;
	format?: TournamentFormat;
	prize_pool_fragments?: number;
	prize_pool_gp?: number;
	sponsor_enterprise_id?: string;
	sponsor_logo_url?: string;
	sponsor_blurb?: string;
	registration_opens_at?: string;
	starts_at: string;
	ends_at: string;
}

export interface TournamentScoreBody {
	participant_type: 'user' | 'guild';
	participant_id: string;
	score: number;
}

export interface DashboardHealth {
	database: { pool_size: number; pool_idle: number };
	websocket: { connections: number; rooms: number; users: number };
	recent_error_events_30m: number;
}

export interface SponsoredLinkBody {
	challenge_id: string;
	sponsor_logo_url?: string;
	sponsor_blurb?: string;
	sponsor_visible_until: string;
	free_contact_until: string;
}

export interface SsoSession {
	session_id: string;
	user_id: string;
	user_email: string;
	user_username: string;
	enterprise_id: string | null;
	enterprise_slug: string | null;
	company_name: string | null;
	ip: string | null;
	user_agent: string | null;
	created_at: string;
	last_used_at: string;
}
