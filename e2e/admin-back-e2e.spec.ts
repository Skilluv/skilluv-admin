/**
 * Real end-to-end proof : browser → admin front → backend → PG.
 *
 * Runs against a full stack :
 *   - Postgres on :5433 (Skilluv main DB, seeded via migrations)
 *   - skilluv-backend `cargo run` on :3001
 *   - skilluv-admin `npm run dev` on :5174 (vite proxy /api → :3001)
 *
 * The test seeds a fresh admin user directly in PG (bypassing the register
 * endpoint to speed up + grants admin capability + inserts a fake webauthn
 * credential to bypass BE-A "2FA setup required" middleware).
 *
 * Prereqs :
 *   - backend running   (from skilluv-backend :  cargo run)
 *   - postgres running  (docker-compose up postgres)
 *   - admin dev spawned by Playwright itself (webServer config).
 *
 * Skip auto : if PG unreachable OR backend unreachable, tests skip gracefully.
 */

import { expect, test } from '@playwright/test';
import argon2 from 'argon2';
import pg from 'pg';

// Serial mode — this spec seeds a shared admin in PG, so parallel workers
// would race on the unique email/username. One worker, one seed, one cleanup.
test.describe.configure({ mode: 'serial' });

const PG_URL = process.env.SKILLUV_PG_URL ?? 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';
const BACKEND = process.env.SKILLUV_BACKEND ?? 'http://localhost:3001';
const TEST_ADMIN_EMAIL = 'e2e-admin@t.com';
const TEST_ADMIN_PASSWORD = 'e2e-Admin-Password-123!';

let seededAdminId: string | null = null;
let backendReachable = false;

test.beforeAll(async () => {
	// Preflight : backend reachable?
	try {
		const res = await fetch(`${BACKEND}/api/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(3000)
		});
		backendReachable = res.ok;
	} catch {
		backendReachable = false;
	}
	if (!backendReachable) {
		return; // tests will skip
	}

	// Seed admin directly in PG.
	const client = new pg.Client({ connectionString: PG_URL });
	try {
		await client.connect();
	} catch {
		backendReachable = false;
		return;
	}
	try {
		// Seed direct SQL — bypasse le rate-limit /api/auth/register (5/h par IP)
		// et évite d'exiger un backend joignable pour créer le user (utile CI).
		// Le hash argon2 est produit ici avec les mêmes paramètres par défaut
		// que le backend (argon2 crate Rust : Argon2::default = argon2id).
		const passwordHash = await argon2.hash(TEST_ADMIN_PASSWORD, { type: argon2.argon2id });

		const upsert = await client.query<{ id: string }>(
			`INSERT INTO users
			   (email, username, password_hash, first_name, last_name,
			    display_name, skill_domain, role, email_verified, profile_active)
			 VALUES ($1, $2, $3, 'E2E', 'Admin', 'E2E Admin', 'code', 'admin', TRUE, TRUE)
			 ON CONFLICT (email) DO UPDATE
			   SET password_hash = EXCLUDED.password_hash,
			       role = 'admin',
			       email_verified = TRUE
			 RETURNING id`,
			[TEST_ADMIN_EMAIL, 'e2e_admin', passwordHash]
		);
		seededAdminId = upsert.rows[0].id;

		// Promote to admin + grant admin capability + fake webauthn credential
		// to satisfy BE-A (admin_gate ensure_admin_2fa).
		await client.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [seededAdminId]);
		await client.query(
			`INSERT INTO user_capabilities (user_id, capability, granted_reason)
			 VALUES ($1, 'admin', 'e2e-seed') ON CONFLICT DO NOTHING`,
			[seededAdminId]
		);
		await client.query(
			`INSERT INTO webauthn_credentials (user_id, credential_id, credential, label)
			 VALUES ($1, $2, '{"stub":true}'::jsonb, 'e2e-passkey')
			 ON CONFLICT DO NOTHING`,
			[seededAdminId, Buffer.from(`e2e-cred-${seededAdminId}`)]
		);
	} finally {
		await client.end();
	}
});

test.afterAll(async () => {
	// Cleanup — best-effort, ne pas faire échouer les tests si ça rate.
	if (!seededAdminId) return;
	const client = new pg.Client({ connectionString: PG_URL });
	try {
		await client.connect();
		// user_capabilities + webauthn_credentials FK cascade sur users delete.
		await client.query(`DELETE FROM users WHERE id = $1`, [seededAdminId]);
	} catch {
		// ignore
	} finally {
		await client.end().catch(() => {});
	}
});

test('login flow: admin credentials → cookie → redirect to /', async ({ page }) => {
	test.skip(!backendReachable, 'Backend unreachable');
	await page.goto('/auth/login');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	// Wait for JS hydration : the form onsubmit handler must be bound
	// before we click, otherwise the form submits with its default GET action
	// (which stays on /auth/login with just a "?" query) and no /auth/login
	// POST call ever fires. We also target inputs by DOM position — the
	// generated `id` off Input.svelte is non-deterministic across SSR/CSR.
	await page.waitForLoadState('networkidle');
	const inputs = page.locator('form input');
	await inputs.nth(0).fill(TEST_ADMIN_EMAIL);
	await inputs.nth(1).fill(TEST_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

	// Post-login redirect target is `/` by default.
	await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 });
});

test('after login: /catalog page loads and shows the orientations table', async ({ page }) => {
	test.skip(!backendReachable, 'Backend unreachable');
	// Login first.
	await page.goto('/auth/login');
	// Wait for JS hydration : the form onsubmit handler must be bound
	// before we click, otherwise the form submits with its default GET action
	// (which stays on /auth/login with just a "?" query) and no /auth/login
	// POST call ever fires. We also target inputs by DOM position — the
	// generated `id` off Input.svelte is non-deterministic across SSR/CSR.
	await page.waitForLoadState('networkidle');
	const inputs = page.locator('form input');
	await inputs.nth(0).fill(TEST_ADMIN_EMAIL);
	await inputs.nth(1).fill(TEST_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
	await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 });

	// Navigate to /catalog — proves : admin_gate origin check + ensure_admin_2fa
	// + require_capability("admin") + real fetch to /api/orientations succeed.
	await page.goto('/catalog');
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/catalog|catalogue/i);

	// Wait for at least 1 orientation row (mig 0088 seeds 31 curated).
	await expect(page.getByText(/dev-frontend/i).first()).toBeVisible({ timeout: 10_000 });
});

test('after login: /enterprises page loads and consumes the paginated list route', async ({
	page
}) => {
	test.skip(!backendReachable, 'Backend unreachable');
	await page.goto('/auth/login');
	// Wait for JS hydration : the form onsubmit handler must be bound
	// before we click, otherwise the form submits with its default GET action
	// (which stays on /auth/login with just a "?" query) and no /auth/login
	// POST call ever fires. We also target inputs by DOM position — the
	// generated `id` off Input.svelte is non-deterministic across SSR/CSR.
	await page.waitForLoadState('networkidle');
	const inputs = page.locator('form input');
	await inputs.nth(0).fill(TEST_ADMIN_EMAIL);
	await inputs.nth(1).fill(TEST_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
	await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 });

	await page.goto('/enterprises');
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/enterprises|entreprises/i);
});
