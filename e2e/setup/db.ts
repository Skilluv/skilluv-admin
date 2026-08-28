// Shared DB helpers for E2E specs. Every spec that seeds fixtures or reads
// back post-condition state should route through here so we don't scatter
// `new pg.Client()` boilerplate + connection-URL fallbacks across 10 files.
import pg from 'pg';

/** Lu à chaque appel, pas à l'import : `playwright.config` charge `.env` dans
 *  son corps alors que les imports ES sont évalués avant lui. Une constante de
 *  module figerait la valeur d'avant chargement. */
export const pgUrl = () =>
	process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

/**
 * Acquire a short-lived pg client, run `fn`, and close it — regardless of
 * throw. Cheap to open on staging Postgres (~ms), keeps helpers linear.
 */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
	const client = new pg.Client({ connectionString: pgUrl() });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

/**
 * Return a URL-safe token unique to the test. Used as suffix for
 * emails/usernames/slugs so seeds don't collide across parallel runs.
 */
export function uniq(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Insert a bare user with the columns the admin app needs (email, username,
 * display_name, skill_domain). password_hash is a placeholder — this user
 * cannot log in and doesn't need to for the flows we test.
 */
export interface SeedUserOptions {
	role?: 'user' | 'enterprise' | 'admin' | 'mentor';
	totpEnabled?: boolean;
	prefix?: string;
}
export async function seedUser(opts: SeedUserOptions = {}) {
	const id = uniq();
	const prefix = opts.prefix ?? 'e2e';
	return withDb(async (client) => {
		const email = `${prefix}-${id}@skilluv.test`;
		const username = `${prefix}${id}`.slice(0, 30);
		const display_name = `${prefix} ${id}`;
		const totpSecret = opts.totpEnabled ? Buffer.alloc(20, 1) : null;
		const { rows } = await client.query(
			`INSERT INTO users
			   (email, username, password_hash, first_name, last_name, display_name, skill_domain,
			    role, totp_secret, totp_enabled)
			 VALUES ($1, $2, 'noop', 'First', 'Last', $3, 'code', $4, $5, $6)
			 RETURNING id`,
			[email, username, display_name, opts.role ?? 'user', totpSecret, opts.totpEnabled ?? false]
		);
		return { id: rows[0].id as string, email, username, display_name };
	});
}

// ─── P26 v2 fixtures — workflow challenge ────────────────────────────────
// The P26 admin screens all hang off projects → slices → validators, so the
// seeds live here rather than being re-declared in each of the four specs.

export type ValidatorDomain =
	| 'code'
	| 'design'
	| 'game'
	| 'security'
	| 'ops'
	| 'ai'
	| 'soft_skills';
export type Rank = 'apprenti' | 'ranger' | 'artisan' | 'maitre' | 'doyen';

export interface SeedProjectOptions {
	ownerId: string;
	slugPrefix?: string;
	curatedByAdmin?: boolean;
	githubRepoOwner?: string | null;
	githubRepoName?: string | null;
	curatedLabels?: string[];
	sliceIngestionMode?: 'auto' | 'curator_review' | 'manual_only';
	skillDomains?: ValidatorDomain[];
}

/** Insert a project already wired for challenge ingestion. Used by the specs
 *  that need a project to exist rather than testing its creation. */
export async function seedProject(opts: SeedProjectOptions) {
	const id = uniq();
	const slug = `${opts.slugPrefix ?? 'e2e-p26'}-${id}`;
	const name = `E2E P26 ${id}`;
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO projects
			   (slug, name, owner_type, owner_id, curated_by_admin,
			    github_repo_owner, github_repo_name, curated_labels,
			    slice_ingestion_mode, skill_domains)
			 VALUES ($1, $2, 'user', $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id`,
			[
				slug,
				name,
				opts.ownerId,
				opts.curatedByAdmin ?? true,
				opts.githubRepoOwner ?? 'skilluv',
				opts.githubRepoName ?? 'skilluv-backend',
				opts.curatedLabels ?? ['skilluv-challenge'],
				opts.sliceIngestionMode ?? 'curator_review',
				opts.skillDomains ?? ['code']
			]
		);
		return { id: rows[0].id as string, slug, name };
	});
}

export interface SeedSliceOptions {
	projectId: string;
	status?: string;
	primaryDomain?: ValidatorDomain;
	difficulty?: number;
	requiredOrientationSlugs?: string[];
	minRank?: Rank | null;
	claimedByUserId?: string | null;
	validatedByUserId?: string | null;
	/** Hours ago the validation happened — the analytics endpoints filter on a
	 *  rolling window, so a fixture that must appear has to be recent. */
	validatedHoursAgo?: number;
	pickedByValidatorId?: string | null;
	pickedHoursAgo?: number;
}

export async function seedSlice(opts: SeedSliceOptions) {
	const id = uniq();
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO project_slices
			   (project_id, slice_type, external_ref, title, description,
			    primary_domain, difficulty, status,
			    required_orientation_slugs, min_rank,
			    claimed_by_user_id, claimed_at,
			    validated_by_user_id, validated_at,
			    picked_by_validator_id, picked_at)
			 VALUES ($1, 'github_issue', $2, $3, 'Seeded by the P26 e2e suite.',
			         $4, $5, $6, $7, $8,
			         $9, CASE WHEN $9::uuid IS NULL THEN NULL ELSE NOW() END,
			         $10, CASE WHEN $11::int IS NULL THEN NULL
			                   ELSE NOW() - ($11 || ' hours')::interval END,
			         $12, CASE WHEN $13::int IS NULL THEN NULL
			                   ELSE NOW() - ($13 || ' hours')::interval END)
			 RETURNING id`,
			[
				opts.projectId,
				`https://github.com/skilluv/skilluv-backend/issues/${Math.floor(Math.random() * 9000) + 1000}`,
				`E2E slice ${id}`,
				opts.primaryDomain ?? 'code',
				opts.difficulty ?? 2,
				opts.status ?? 'open',
				opts.requiredOrientationSlugs ?? [],
				opts.minRank ?? null,
				opts.claimedByUserId ?? null,
				opts.validatedByUserId ?? null,
				opts.validatedHoursAgo ?? null,
				opts.pickedByValidatorId ?? null,
				opts.pickedHoursAgo ?? null
			]
		);
		return { id: rows[0].id as string };
	});
}

export async function readSlice(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT status, required_orientation_slugs, min_rank
			 FROM project_slices WHERE id = $1`,
			[id]
		);
		return rows[0] as
			| { status: string; required_orientation_slugs: string[]; min_rank: string | null }
			| undefined;
	});
}

export interface SeedValidatorApplicationOptions {
	userId: string;
	domain?: ValidatorDomain;
	origin?: 'candidacy' | 'invitation';
	status?: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
	motivation?: string;
}

export async function seedValidatorApplication(opts: SeedValidatorApplicationOptions) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO validator_applications (user_id, domain, origin, status, motivation)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id`,
			[
				opts.userId,
				opts.domain ?? 'code',
				opts.origin ?? 'candidacy',
				opts.status ?? 'pending',
				opts.motivation ?? 'Seeded by the P26 e2e suite.'
			]
		);
		return { id: rows[0].id as string };
	});
}

export async function readValidatorApplication(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT status, review_notes, reviewed_at, admin_actor_id
			 FROM validator_applications WHERE id = $1`,
			[id]
		);
		return rows[0] as
			| {
					status: string;
					review_notes: string | null;
					reviewed_at: Date | null;
					admin_actor_id: string | null;
			  }
			| undefined;
	});
}

/** Grant `challenge_validator:{domain}` directly. The specs that assert on the
 *  active-validators roster need the capability to pre-exist; going through the
 *  approval flow for that would test the wrong thing twice. */
export async function grantValidatorCapability(userId: string, domain: ValidatorDomain) {
	await withDb(async (client) => {
		await client.query(
			`INSERT INTO user_capabilities (user_id, capability, granted_reason)
			 VALUES ($1, $2, 'e2e:p26-fixture')`,
			[userId, `challenge_validator:${domain}`]
		);
	});
}

export async function readValidatorCapability(userId: string, domain: ValidatorDomain) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT granted_at, revoked_at FROM user_capabilities
			 WHERE user_id = $1 AND capability = $2
			 ORDER BY granted_at DESC LIMIT 1`,
			[userId, `challenge_validator:${domain}`]
		);
		return rows[0] as { granted_at: Date; revoked_at: Date | null } | undefined;
	});
}

/** Grant an arbitrary capability. The Post-MVP moderation routes
 *  (external signals, vouchings) are capability-gated rather than
 *  role-gated, so the e2e admin needs one granted before those screens do
 *  anything but 403. Idempotent — a second run must not violate the
 *  uniqueness of a live grant. */
export async function grantCapability(userId: string, capability: string) {
	await withDb(async (client) => {
		await client.query(
			`INSERT INTO user_capabilities (user_id, capability, granted_reason)
			 VALUES ($1, $2, 'e2e:post-mvp-fixture')
			 ON CONFLICT DO NOTHING`,
			[userId, capability]
		);
	});
}

/** Resolve a user id from its email. Used to reach the bootstrapped e2e
 *  admin, whose id is not written to `admin-credentials.json`. */
export async function findUserIdByEmail(email: string): Promise<string | undefined> {
	return withDb(async (client) => {
		const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
		return rows[0]?.id as string | undefined;
	});
}

/** Insert a self-declared (unverified) external signal — the state the
 *  moderation queue is built to review. */
export async function seedExternalSignal(opts: {
	userId: string;
	provider?: string;
	url?: string;
	title?: string;
}) {
	const id = uniq();
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO external_signals (user_id, provider, url, title)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id`,
			[
				opts.userId,
				opts.provider ?? 'medium',
				opts.url ?? `https://medium.com/@e2e/${id}`,
				opts.title ?? `E2E declared post ${id}`
			]
		);
		return { id: rows[0].id as string };
	});
}

export async function readExternalSignal(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT verified_at, verification_method FROM external_signals WHERE id = $1',
			[id]
		);
		return rows[0] as
			| { verified_at: Date | null; verification_method: string | null }
			| undefined;
	});
}

export async function countTimelineEvents(userId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT COUNT(*)::int AS n FROM user_timeline_events WHERE user_id = $1',
			[userId]
		);
		return rows[0].n as number;
	});
}

export async function setUserRank(userId: string, rank: Rank) {
	await withDb(async (client) => {
		await client.query(
			`INSERT INTO user_ranks (user_id, rank) VALUES ($1, $2)
			 ON CONFLICT (user_id) DO UPDATE SET rank = EXCLUDED.rank`,
			[userId, rank]
		);
	});
}

/** Remove a project and everything hanging off it. `project_slices` cascades
 *  on the FK, but being explicit keeps the intent readable at the call site. */
export async function cleanupProject(projectId: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM project_slices WHERE project_id = $1', [projectId]);
		await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
	});
}

export async function cleanupUser(userId: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM users WHERE id = $1', [userId]);
	});
}

// ─── Skilluv Cyber fixtures — reported vulnerabilities ───────────────────
//
// A finding points at exactly one target, and the CHECK enforces it: a
// `platform` finding names a host and no mission, a `mission` finding names
// a mission and no host. The seed only builds the `platform` shape, which is
// the one the triage queue is about.

export interface SeedFindingOptions {
	reporterId: string;
	title?: string;
	severity?: 'critical' | 'high' | 'medium' | 'low' | 'informational';
	status?: string;
	targetHost?: string;
}

export async function seedSecurityFinding(opts: SeedFindingOptions) {
	const id = uniq();
	const severity = opts.severity ?? 'high';
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO security_findings
			   (reporter_user_id, target_kind, target_host, affected_endpoint,
			    title, description_md, reproduction_steps_md,
			    severity_reported_tier, severity_tier, status)
			 VALUES ($1, 'platform', $2, 'POST /api/auth/login', $3, $4, $5, $6, $6, $7)
			 RETURNING id`,
			[
				opts.reporterId,
				opts.targetHost ?? 'staging.skill-uv.com',
				opts.title ?? `E2E finding ${id}`,
				// The CHECK asks for fifty characters of description and
				// thirty of reproduction: a report saying "it is broken"
				// satisfies `<> ''` and is exactly what the floor refuses.
				`An end-to-end fixture describing a vulnerability in enough detail to clear the fifty-character floor. ${id}`,
				`1. Send the request. 2. Observe the response. 3. Repeat with a second account. ${id}`,
				severity,
				opts.status ?? 'submitted'
			]
		);
		return { id: rows[0].id as string, title: opts.title ?? `E2E finding ${id}` };
	});
}

export async function readSecurityFinding(id: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT status, severity_tier, triaged_at, triage_notes_md, withheld_reason
			   FROM security_findings WHERE id = $1`,
			[id]
		);
		return rows[0] as
			| {
					status: string;
					severity_tier: string;
					triaged_at: Date | null;
					triage_notes_md: string | null;
					withheld_reason: string | null;
			  }
			| undefined;
	});
}

export async function countFindingEvents(findingId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT COUNT(*)::int AS n FROM security_finding_events WHERE finding_id = $1',
			[findingId]
		);
		return rows[0].n as number;
	});
}

export async function cleanupSecurityFinding(id: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM security_finding_events WHERE finding_id = $1', [id]);
		await client.query('DELETE FROM security_finding_rounds WHERE finding_id = $1', [id]);
		await client.query('DELETE FROM security_findings WHERE id = $1', [id]);
	});
}

// ─── Mission fixtures — the stuck queue an arbiter works ─────────────────
//
// A mission needs an enterprise, a mission type and — once it is
// `in_progress` — an assignee, because the CHECK refuses a mission in
// progress that nobody is doing. The delivery with no decision is what makes
// it stuck, which is the state the admin surface exists for.

export async function seedEnterprise(ownerId: string) {
	const id = uniq();
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO enterprises (owner_id, company_name, slug, company_size)
			 VALUES ($1, $2, $3, '11-50')
			 RETURNING id`,
			[ownerId, `E2E Co ${id}`, `e2e-co-${id}`]
		);
		return { id: rows[0].id as string, name: `E2E Co ${id}` };
	});
}

/** Any active type in the domain. Types are seeded rows, not code, so the
 *  fixture reads one rather than inventing a slug the FK would refuse. */
export async function anyMissionType(skillDomain: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT id, slug FROM mission_types
			  WHERE skill_domain = $1 AND is_active = TRUE
			  ORDER BY sort_order LIMIT 1`,
			[skillDomain]
		);
		return rows[0] as { id: string; slug: string } | undefined;
	});
}

export interface SeedMissionOptions {
	enterpriseId: string;
	missionTypeId: string;
	skillDomain: string;
	assignedUserId: string;
	title?: string;
	status?: string;
}

export async function seedMission(opts: SeedMissionOptions) {
	const id = uniq();
	const title = opts.title ?? `E2E mission ${id}`;
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO missions
			   (slug, enterprise_id, mission_type_id, skill_domain, title, description,
			    acceptance_criteria, deliverable_format, payment_model, budget_eur,
			    status, assigned_user_id, assigned_at, published_at)
			 VALUES ($1, $2, $3, $4, $5,
			         'An end-to-end fixture mission.',
			         'The deliverable matches the brief.',
			         'consulting_report', 'fixed_price', 1000,
			         $6, $7, NOW(), NOW())
			 RETURNING id, slug`,
			[
				`e2e-mission-${id}`,
				opts.enterpriseId,
				opts.missionTypeId,
				opts.skillDomain,
				title,
				opts.status ?? 'in_progress',
				opts.assignedUserId
			]
		);
		return { id: rows[0].id as string, slug: rows[0].slug as string, title };
	});
}

/** A hand-in nobody has answered. One of these, old enough, is the whole
 *  definition of a stuck mission. */
export async function seedMissionDelivery(opts: {
	missionId: string;
	deliveredBy: string;
	round?: number;
	daysAgo?: number;
}) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO mission_deliveries
			   (mission_id, round, delivered_by, artifact_url, notes_md, delivered_at)
			 VALUES ($1, $2, $3, 'https://example.test/e2e-deliverable',
			         'Round handed in by the e2e fixture.',
			         NOW() - ($4::INTEGER * INTERVAL '1 day'))
			 RETURNING id`,
			[opts.missionId, opts.round ?? 1, opts.deliveredBy, opts.daysAgo ?? 40]
		);
		return { id: rows[0].id as string };
	});
}

export async function readMissionArbitration(missionId: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT outcome, reason_md FROM mission_arbitrations WHERE mission_id = $1',
			[missionId]
		);
		return rows[0] as { outcome: string; reason_md: string } | undefined;
	});
}

export async function cleanupMission(missionId: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM mission_arbitrations WHERE mission_id = $1', [missionId]);
		await client.query('DELETE FROM mission_deliveries WHERE mission_id = $1', [missionId]);
		await client.query('DELETE FROM missions WHERE id = $1', [missionId]);
	});
}

export async function cleanupEnterprise(enterpriseId: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM enterprises WHERE id = $1', [enterpriseId]);
	});
}
