import { test, expect } from '@playwright/test';
import { withDb, uniq } from '../setup/db';

// Phase 3 — catalog admin CRUD: orientations + badge rules + tenants.
// Grouped here because each individually is short but shares the /catalog
// tab surface + similar seed patterns.

// ─── Orientations ────────────────────────────────────────────────────────

async function readOrientation(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			// La colonne s'appelle `name` : `display_name` n'existe pas sur
			// `orientations` (elle existe sur `badge_rules`, d'où la confusion).
			'SELECT id, name, description FROM orientations WHERE slug = $1',
			[slug]
		);
		return rows[0] as { id: string; name: string; description: string | null } | undefined;
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

	// Attendre le chargement de l'onglet : cliquer avant l'hydratation ne
	// déclenche rien et la modale ne s'ouvre jamais.
	// L'onglet lit le catalogue public `/orientations` ; seules les mutations
	// passent par `/admin/orientations`.
	const listed = page.waitForResponse(
		(r) => r.url().includes('/orientations') && r.request().method() === 'GET'
	);
	await page.goto('/catalog');
	await listed;

	// Libellé réel : « Créer une orientation » (i18n `orientations.createBtn`).
	await page.getByRole('button', { name: /créer une orientation/i }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 5_000 });

	// Les champs sont des <Input label=…>, donc adressables par leur libellé
	// plutôt que par un id ou un placeholder qui n'existent pas.
	await dialog.getByLabel(/slug/i).first().fill(slug);
	await dialog.getByLabel(/nom affiché/i).first().fill(displayName);

	// La modale n'est pas un <form> : `requestSubmit()` n'avait rien à appeler.
	// Le bouton primaire des actions est le point de soumission.
	const req = page.waitForResponse(
		(r) => r.url().includes('/admin/orientations') && r.request().method() === 'POST'
	);
	await dialog.getByRole('button', { name: /^créer$/i }).click();
	expect((await req).status(), 'orientation POST').toBeLessThan(300);

	const created = await readOrientation(slug);
	expect(created?.name).toBe(displayName);

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
			`INSERT INTO badge_rules (slug, output_type, display_name, description, conditions)
			 VALUES ($1, 'medal', $2, 'E2E test rule', '{}'::jsonb)
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

	// Attendre le premier chargement de l'onglet par défaut avant de basculer :
	// un clic avant hydratation ne change pas d'onglet.
	const orientationsLoaded = page.waitForResponse(
		(r) => r.url().includes('/orientations') && r.request().method() === 'GET'
	);
	await page.goto('/catalog');
	await orientationsLoaded;

	const rulesLoaded = page.waitForResponse((r) => r.url().includes('/badge-rules'));
	await page.getByRole('button', { name: 'Badge rules' }).click();
	await rulesLoaded;

	// Cibler la ligne de la règle seedée : `.first()` cliquait la première
	// règle de la liste, donc la requête attendue ne partait jamais.
	const row = page.locator('tbody tr', { hasText: rule.slug });
	await expect(row).toBeVisible({ timeout: 10_000 });
	await row.getByRole('button', { name: /déprécier|deprecate/i }).click();

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

	// Les ids de la modale tenant sont préfixés `t-` : `#slug` ne matchait rien.
	await dialog.locator('#t-slug').fill(slug);
	await dialog.locator('#t-name').fill(name);
	// Contact email is required by the create endpoint.
	await dialog.locator('#t-email').fill(`${slug}@e2e.test`);

	const req = page.waitForResponse(
		(r) => r.url().includes('/admin/tenants') && r.request().method() === 'POST'
	);
	await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await req).status(), 'tenant POST').toBeLessThan(300);

	const created = await readTenant(slug);
	expect(created?.name).toBe(name);

	await cleanupTenant(slug);
});
