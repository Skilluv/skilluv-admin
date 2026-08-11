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
