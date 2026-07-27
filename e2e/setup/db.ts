// Shared DB helpers for E2E specs. Every spec that seeds fixtures or reads
// back post-condition state should route through here so we don't scatter
// `new pg.Client()` boilerplate + connection-URL fallbacks across 10 files.
import pg from 'pg';

export const PG_URL =
	process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

/**
 * Acquire a short-lived pg client, run `fn`, and close it — regardless of
 * throw. Cheap to open on staging Postgres (~ms), keeps helpers linear.
 */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
	const client = new pg.Client({ connectionString: PG_URL });
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
