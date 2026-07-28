import { test, expect } from '@playwright/test';
import { withDb, uniq } from '../setup/db';

// Phase 3 — catalog admin CRUD: orientations + badge rules + tenants.
// Grouped here because each individually is short but shares the /catalog
// tab surface + similar seed patterns.

// ─── Orientations ────────────────────────────────────────────────────────

async function readOrientation(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT id, display_name, description FROM orientations WHERE slug = $1',
			[slug]
		);
		return rows[0] as { id: string; display_name: string; description: string | null } | undefined;
	});
}

async function cleanupOrientation(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM orientations WHERE slug = $1', [slug]);
	});
}

test('admin creates an orientation from /catalog', async ({ page }) => {
	const id = uniq();
	const slug = `e2e-orient-${id}`;
	const displayName = `E2E Orientation ${id}`;

	await page.goto('/catalog');
	// Orientations tab — most catalog pages have a segmented control.
	await page.getByRole('button', { name: /orientations?/i }).first().click().catch(() => {});

	// Open create form (a button labelled "Nouvelle orientation" per fr.ts).
	await page.getByRole('button', { name: /nouvelle orientation|new orientation|créer/i }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 5_000 });

	await dialog.locator('input[placeholder*="slug"], input[name="slug"], #slug').first().fill(slug);
	await dialog.getByRole('textbox', { name: /nom|display name/i }).first().fill(displayName);

	const req = page.waitForResponse(
		(r) => r.url().includes('/admin/orientations') && r.request().method() === 'POST'
	);
	await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await req).status(), 'orientation POST').toBeLessThan(300);

	const created = await readOrientation(slug);
	expect(created?.display_name).toBe(displayName);

	await cleanupOrientation(slug);
});

// ─── Badge rules ────────────────────────────────────────────────────────

async function readBadgeRule(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT id, display_name, deprecated_at FROM badge_rules WHERE slug = $1',
			[slug]
		);
		return rows[0] as
			| { id: string; display_name: string; deprecated_at: Date | null }
			| undefined;
	});
}

async function seedBadgeRule() {
	const id = uniq();
	const slug = `e2e-badge-${id}`;
	return withDb(async (client) => {
		const { rows } = await client.query(
			`INSERT INTO badge_rules (slug, display_name, description, kind, rule_expr, reward_fragments)
			 VALUES ($1, $2, 'E2E test rule', 'proof', '{}'::jsonb, 0)
			 RETURNING id`,
			[slug, `E2E Badge ${id}`]
		);
		return { id: rows[0].id as string, slug };
	});
}

async function cleanupBadgeRule(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM badge_rules WHERE slug = $1', [slug]);
	});
}

test('admin deprecates a badge rule from /catalog', async ({ page }) => {
	const rule = await seedBadgeRule();

	await page.goto('/catalog');
	await page.getByRole('button', { name: /badge/i }).first().click().catch(() => {});

	// Locate our seeded rule's row + trigger the deprecate action.
	const row = page.locator(`text=${rule.slug}`).first();
	await expect(row).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: /déprécier|deprecate/i }).first().click();

	// Deprecate is destructive → reason required.
	await page.getByTestId('confirm-dangerous-reason').fill('E2E — rule superseded by newer criteria');
	const req = page.waitForResponse(
		(r) => r.url().includes(`/admin/badge-rules/${rule.slug}/deprecate`) && r.request().method() === 'POST'
	);
	await page.getByTestId('confirm-dangerous-action').click();
	expect((await req).status(), 'deprecate POST').toBeLessThan(300);

	const state = await readBadgeRule(rule.slug);
	expect(state?.deprecated_at, 'deprecated_at set').not.toBeNull();

	await cleanupBadgeRule(rule.slug);
});

// ─── Tenants ────────────────────────────────────────────────────────────

async function readTenant(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			'SELECT id, name, plan FROM tenants WHERE slug = $1',
			[slug]
		);
		return rows[0] as { id: string; name: string; plan: string } | undefined;
	});
}

async function cleanupTenant(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM tenants WHERE slug = $1', [slug]);
	});
}

test('admin creates a tenant from /tenants', async ({ page }) => {
	const id = uniq();
	const slug = `e2e-tenant-${id}`.slice(0, 40);
	const name = `E2E Tenant ${id}`;

	await page.goto('/tenants');
	await page.waitForResponse((r) => r.url().includes('/api/admin/tenants') && r.request().method() === 'GET');

	await page.getByRole('button', { name: /nouveau tenant|new tenant|créer/i }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await dialog.locator('input[placeholder*="slug"], input[name="slug"], #slug').first().fill(slug);
	await dialog.getByRole('textbox', { name: /nom|company|name/i }).first().fill(name);
	// Contact email is required by the create endpoint.
	await dialog.locator('input[type="email"]').first().fill(`${slug}@e2e.test`);

	const req = page.waitForResponse(
		(r) => r.url().includes('/admin/tenants') && r.request().method() === 'POST'
	);
	await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await req).status(), 'tenant POST').toBeLessThan(300);

	const created = await readTenant(slug);
	expect(created?.name).toBe(name);

	await cleanupTenant(slug);
});
