import type {
	UserPrivate,
	Challenge,
	ChallengeDifficulty,
	ChallengeMode,
	ChallengeTone,
	Report,
	ReportStatus,
	ReportTargetType,
	SkillDomain,
	ApiResponse,
	ApiPaginatedResponse
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
	banned: boolean;
	created_at: string;
}

interface UserDetail {
	user: UserPrivate;
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

	dissolveGuild(id: string) {
		return api.post<ApiResponse<{ dissolved: boolean }>>(`/admin/guilds/${id}/dissolve`, {});
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

	listChallenges() {
		return api.get<ApiResponse<{ challenges: Challenge[]; total: number }>>('/admin/challenges');
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

	rebuildLeaderboards() {
		return api.post<ApiResponse<{ message: string }>>('/admin/leaderboards/rebuild');
	},

	// --- Community ---

	communityReview() {
		return api.get<ApiResponse<{ challenges: CommunityChallenge[]; total: number }>>('/admin/community/review');
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

	revokeSsoSession(id: string) {
		return api.post<ApiResponse<{ revoked: boolean }>>(`/admin/sso/sessions/${id}/revoke`);
	},

	// --- Enterprise KYC ---

	listKycQueue() {
		return api.get<ApiResponse<{ queue: KycEntry[] }>>('/admin/enterprise-kyc');
	},

	decideKyc(enterpriseId: string, body: KycDecisionBody) {
		return api.post<ApiResponse<{ decided: boolean; action: 'approve' | 'reject' }>>(
			`/admin/enterprise-kyc/${enterpriseId}/decide`,
			body
		);
	},

	// --- Sponsored challenges ---

	listSponsoredRequests() {
		return api.get<ApiResponse<{ requests: SponsoredRequest[] }>>('/admin/sponsored-challenges');
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

	closeSeason(id: string) {
		return api.post<ApiResponse<{ close_report: SeasonCloseReport }>>(`/admin/seasons/${id}/close`, {});
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

	concludeTournament(id: string) {
		return api.post<ApiResponse<{ conclusion: Record<string, unknown> }>>(
			`/admin/tournaments/${id}/conclude`,
			{}
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
