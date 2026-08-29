/**
 * Skilluv Cyber — the side of a vulnerability report that decides.
 *
 * ## Three people, not one "admin"
 *
 * `admin` in the path says which surface this is, not who may reach it. The
 * backend recognises three actors here and they are deliberately unequal:
 *
 *   * `security_triager` — reads the incoming queue and decides what is worth
 *     a reviewer's afternoon. May not confirm anything.
 *   * `security_reviewer:{family}` (or `challenge_validator:security`) —
 *     reproduces, argues severity, opens rounds, rules duplicates.
 *   * `admin` — publishes, withholds, grants an extension, curates the
 *     catalogue. The decisions that cannot be taken back.
 *
 * Publication is the only one reserved to an administrator alone, and the
 * reason is that the internet keeps a copy: every other move here can be
 * corrected by making another one.
 *
 * This module calls the routes as they are, so a 403 on `publish` from an
 * account that triages is the system working. The screens surface it rather
 * than hiding the button — a hidden action teaches nobody which capability
 * they are missing.
 *
 * ## What is deliberately not here
 *
 * Nothing writes a proof file, and nothing renders one inline. A proof of an
 * unfixed vulnerability lives in a private bucket and is exchanged for a
 * short-lived signed URL, one key at a time, through {@link securityApi.proofUrl}.
 */
import type {
	ApiResponse,
	ExternalBountyClaim,
	ExternalBountyProgramme,
	NewSecurityChallenge,
	SecurityDedupPair,
	SecurityFindingDetailResponse,
	SecurityFindingRow,
	SecurityFindingStatus,
	SecurityHallOfFame,
	SecurityOverview,
	SecurityResearchToken,
	SecurityRoundKind,
	SecuritySeverityTier,
	SecurityTargetKind
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

/** What a transition needs, beyond the target status.
 *
 *  The backend refuses a move that arrives without what the destination
 *  requires — `fixed` without a fix URL, `published` without a write-up,
 *  `duplicate` without the finding it duplicates — so the form asks for them
 *  rather than letting the server say no. */
export interface FindingTransition {
	to: SecurityFindingStatus;
	reason?: string;
	/** Required to reach `fixed`. */
	fix_url?: string;
	/** Required to reach `published`. */
	writeup_url?: string;
	/** Required to reach `duplicate`. */
	duplicate_of?: string;
	/** Recorded on a triage. */
	triage_notes_md?: string;
}

/** A severity change, with the argument written down.
 *
 *  A vector is preferred over a tier because it says which metric the
 *  reviewer disagrees about. The reason is required by the database as well
 *  as by the API: an unexplained override is the thing researchers leave a
 *  platform over. */
export interface SeverityOverride {
	cvss_vector?: string;
	severity_tier?: SecuritySeverityTier;
	reason: string;
}

/** A programme being put forward, or re-dated.
 *
 *  `curated_at` moves on every write, because the date is the whole claim. */
export interface CuratedBountyInput {
	platform: string;
	program_slug: string;
	program_url: string;
	organisation_name: string;
	scope_summary?: string;
	skill_topics?: string[];
	payout_range?: string;
	pays_money?: boolean;
	discloses_reports?: boolean;
	is_active?: boolean;
	retired_reason?: string;
}

/** An extra question added to a lab built from a finding. Already answered by
 *  the operator, because the answer is hashed and never stored. */
export interface LabExtraQuestion {
	id: string;
	question: string;
	answer: string;
	hint?: string;
}

/** Everything after the artefact export.
 *
 *  The artefact itself is supplied rather than extracted: the request log
 *  lives in the reverse proxy, and redacting it is a judgement about other
 *  people's requests that no endpoint should be making. */
export interface LabFromFindingInput {
	artifact_key: string;
	artifact_bytes: number;
	estimated_minutes: number;
	extra_questions?: LabExtraQuestion[];
	/** Said out loud by the operator: the artefact has been read and nothing
	 *  in it identifies anybody who was not part of the attack. */
	redaction_confirmed: boolean;
}

export const securityApi = {
	// ── The queue ────────────────────────────────────────────────

	/**
	 * The incoming queue, ordered by severity then by age.
	 *
	 * Not by arrival: that buries a critical filed on a Friday under a week
	 * of informationals. Capped at 200 server-side.
	 */
	queue(params?: {
		status?: SecurityFindingStatus;
		severity?: SecuritySeverityTier;
		target_kind?: SecurityTargetKind;
		/** Only the ones a scanner thought resembled something else. */
		suspected_duplicates?: boolean;
		limit?: number;
	}) {
		return api.get<ApiResponse<{ findings: SecurityFindingRow[] }>>(
			'/admin/security/findings',
			params as Record<string, string | number | boolean>
		);
	},

	/** One finding in full: the report, the audit trail, the rounds, the
	 *  look-alikes. */
	detail(id: string) {
		return api.get<ApiResponse<SecurityFindingDetailResponse>>(
			`/admin/security/findings/${id}`
		);
	},

	// ── Deciding ─────────────────────────────────────────────────

	/** Move a finding along. Refused with 409 when the move is not a legal
	 *  one for the caller's actor — which is the state machine working, not
	 *  a client bug. */
	transition(id: string, body: FindingTransition) {
		return api.post<ApiResponse<{ status: SecurityFindingStatus }>>(
			`/admin/security/findings/${id}/transition`,
			body
		);
	},

	/** Change a severity. Reviewer or admin only — a severity decides a
	 *  payout tier, so a triager may not set one. */
	overrideSeverity(id: string, body: SeverityOverride) {
		return api.post<ApiResponse<{ severity_tier: SecuritySeverityTier }>>(
			`/admin/security/findings/${id}/severity`,
			body
		);
	},

	/** Ask the researcher for something. Capped at five rounds by the
	 *  database, and one open at a time. */
	openRound(id: string, kind: SecurityRoundKind, notesMd: string) {
		return api.post<ApiResponse<{ round_no: number }>>(
			`/admin/security/findings/${id}/rounds`,
			{ kind, notes_md: notesMd }
		);
	},

	/** Close the open round: `satisfied` or `insufficient`. */
	resolveRound(id: string, resolution: 'satisfied' | 'insufficient', note?: string) {
		return api.post<ApiResponse<{ resolved: boolean }>>(
			`/admin/security/findings/${id}/rounds/resolve`,
			{ resolution, note }
		);
	},

	/** Record that the owner of the system has been told. Starts the clock
	 *  the embargo runs on. */
	markVendorNotified(id: string) {
		return api.post<ApiResponse<{ notified: boolean }>>(
			`/admin/security/findings/${id}/vendor-notified`
		);
	},

	/** The owner asks for more time. Recorded here; granting it is a
	 *  separate, administrator-only act. */
	requestExtension(id: string, reason: string) {
		return api.post<ApiResponse<{ requested: boolean }>>(
			`/admin/security/findings/${id}/extension`,
			{ reason }
		);
	},

	/** Grant it, moving the clock. Administrator only: an extension is the
	 *  platform telling a researcher that the promise it made has changed. */
	grantExtension(id: string, days: number) {
		return api.post<ApiResponse<{ granted_days: number }>>(
			`/admin/security/findings/${id}/extension/grant`,
			{ days }
		);
	},

	/** Decide this one is never published. Administrator only, and the
	 *  reason is stored on the row. */
	withhold(id: string, reason: string) {
		return api.post<ApiResponse<{ withheld: boolean }>>(
			`/admin/security/findings/${id}/withhold`,
			{ reason }
		);
	},

	/** Look again for look-alikes. Returns how many candidates the scan
	 *  found; merging any of them stays a human decision. */
	rescan(id: string) {
		return api.post<ApiResponse<{ candidates: number }>>(
			`/admin/security/findings/${id}/rescan`
		);
	},

	/**
	 * The state of the queue, on one snapshot.
	 *
	 * The only aggregate the disclosure surface has, and the reason it
	 * exists is `breaching_triage_sla`: the platform promises a triage
	 * delay in its safe harbour, and nothing else says whether it holds.
	 *
	 * Read in one statement backend-side, so every number describes the
	 * same instant. Two counts a second apart can contradict each other on
	 * the same finding, and nothing on screen would say so.
	 */
	overview() {
		return api.get<ApiResponse<SecurityOverview>>('/admin/security/overview');
	},

	/**
	 * Leave an internal note on a finding.
	 *
	 * Three characters minimum on both sides: `ok` clears a not-empty
	 * check and is exactly what the floor refuses. Append-only — there is
	 * no edit and no delete, because a note that decided how a finding was
	 * handled is part of how it was handled.
	 *
	 * Never notified to the reporter, never on the public finding route.
	 * People write frankly because they believe it is internal, so a note
	 * that leaks is worse than no note at all.
	 */
	addComment(id: string, bodyMd: string) {
		return api.post<ApiResponse<{ id: string }>>(
			`/admin/security/findings/${id}/comments`,
			{ body_md: bodyMd }
		);
	},

	// ── Deduplication and the clock ──────────────────────────────

	/** Everything a scanner thought resembled something else. Nothing here
	 *  is merged automatically: a merge decides who is paid. */
	dedupQueue() {
		return api.get<ApiResponse<{ pairs: SecurityDedupPair[]; note: string }>>(
			'/admin/security/dedup-queue'
		);
	},

	/** Walk the embargo clocks now rather than waiting for the sweep.
	 *  Publishes nothing — an expired embargo becomes an item on a list. */
	sweepEmbargoes() {
		return api.post<ApiResponse<{ expired: number; reminded: number; note: string }>>(
			'/admin/security/embargo-sweep'
		);
	},

	// ── The catalogue ────────────────────────────────────────────

	/**
	 * Create a machine-graded challenge — a CTF flag or a defensive lab.
	 *
	 * The one place a flag or a set of answers enters the system, and the
	 * reason it is an endpoint rather than a migration: whoever creates it
	 * has to have solved it. The secrets are hashed server-side, so the
	 * request is the last time anybody sees the plaintext.
	 *
	 * Created as a draft, deliberately: publish it once somebody other than
	 * its author has solved it from the instructions alone.
	 */
	createChallenge(body: NewSecurityChallenge) {
		return api.post<ApiResponse<{ id: string; status: string; note: string }>>(
			'/admin/security/challenges',
			body
		);
	},

	/** Turn a confirmed finding into a defensive exercise. */
	labFromFinding(findingId: string, body: LabFromFindingInput) {
		return api.post<ApiResponse<{ challenge_id: string; status: string; note: string }>>(
			`/admin/security/findings/${findingId}/blue-lab`,
			body
		);
	},

	// ── Programmes elsewhere ─────────────────────────────────────

	/** Every curated programme, retired ones included. */
	listBountyProgrammes() {
		return api.get<ApiResponse<{ programmes: ExternalBountyProgramme[] }>>(
			'/admin/security/external-bounties'
		);
	},

	/** Add a programme, or re-date one that was already there. Upserts on
	 *  (platform, slug). */
	curateBountyProgramme(body: CuratedBountyInput) {
		return api.post<ApiResponse<{ id: string }>>('/admin/security/external-bounties', body);
	},

	/** Claims waiting on somebody opening the disclosure and reading it. */
	bountyClaims() {
		return api.get<ApiResponse<{ claims: ExternalBountyClaim[] }>>(
			'/admin/security/bounty-claims'
		);
	},

	/** Accept a claim, at the severity the reviewer settled on — which need
	 *  not be the one the other platform rated it. */
	verifyBountyClaim(id: string, severity: SecuritySeverityTier) {
		return api.post<ApiResponse<{ verification_code: string }>>(
			`/admin/security/bounty-claims/${id}/verify`,
			{ severity }
		);
	},

	/** Refuse it, with the reason the person will read. */
	refuseBountyClaim(id: string, reason: string) {
		return api.post<ApiResponse<{ refused: boolean }>>(
			`/admin/security/bounty-claims/${id}/refuse`,
			{ reason }
		);
	},

	/**
	 * Every research token, so the revoke below is reachable at all.
	 *
	 * Administrator only, deliberately narrower than the finding queue: a
	 * token names a person and how much traffic they run, which is not
	 * part of judging a vulnerability report.
	 *
	 * The token itself never comes back — only its prefix, which is what
	 * matches a log line, and the id, which is what revokes it.
	 */
	researchTokens(params?: { active_only?: boolean; q?: string; limit?: number }) {
		return api.get<ApiResponse<{ tokens: SecurityResearchToken[]; note: string }>>(
			'/admin/security/research-tokens',
			params as Record<string, string | number | boolean>
		);
	},

	/** Revoke a research token by id. Administrator only. */
	revokeResearchToken(id: string) {
		return api.post<ApiResponse<{ revoked: boolean }>>(
			`/admin/security/research-tokens/${id}/revoke`
		);
	},

	// ── Reads that are public, and used here anyway ──────────────

	/**
	 * The public disclosure record: contributors, published findings, the
	 * counts and the scope.
	 *
	 * Public, and read here because it is the only aggregate the backend
	 * computes — there is no `/admin/security/overview`. Cached for five
	 * minutes server-side, so a refresh does not always move.
	 */
	hallOfFame() {
		return api.get<ApiResponse<SecurityHallOfFame>>('/security/hall-of-fame');
	},

	/**
	 * A short-lived signed URL for one proof key.
	 *
	 * The key comes from `finding.proof_keys` and nowhere else: the backend
	 * refuses anything outside the `security-proofs/` prefix, and checks that
	 * the caller may read this particular finding before it signs.
	 */
	proofUrl(key: string) {
		return api.get<ApiResponse<{ url: string; expires_in_seconds: number }>>(
			'/security/proofs',
			{ key }
		);
	}
};

/** Ordered worst-first, which is the order a queue is worked in. */
export function severityWeight(tier: SecuritySeverityTier): number {
	switch (tier) {
		case 'critical':
			return 5;
		case 'high':
			return 4;
		case 'medium':
			return 3;
		case 'low':
			return 2;
		default:
			return 1;
	}
}

/**
 * Which statuses this finding can legally move to, mirroring
 * `services::security_findings::allowed_transition`.
 *
 * Duplicated deliberately, and only to decide which buttons to render: the
 * server decides, and a client that has drifted shows a button that answers
 * 409 rather than one that silently does the wrong thing. `withdrawn` is
 * absent because it is the reporter's move and no admin surface offers it.
 */
export function nextStatuses(from: SecurityFindingStatus): SecurityFindingStatus[] {
	switch (from) {
		case 'submitted':
			return ['triaged', 'not_applicable', 'duplicate'];
		case 'triaged':
			return ['confirmed', 'duplicate', 'not_applicable'];
		case 'confirmed':
			return ['fixed', 'duplicate', 'published'];
		case 'fixed':
			return ['published'];
		default:
			return [];
	}
}
