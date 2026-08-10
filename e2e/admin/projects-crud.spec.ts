import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 3 — projects admin CRUD: create → verify DB → archive → verify DB.
// Edit is exercised by the create-then-list-then-edit path in Phase 2's
// challenge-lifecycle pattern; here we focus on the create + archive endpoints.

async function readProject(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT id, name, is_flagship, is_oss, curated_by_admin, archived_at
			 FROM projects WHERE slug = $1`,
			[slug]
		);
		return rows[0] as
			| {
					id: string;
					name: string;
					is_flagship: boolean;
					is_oss: boolean;
					curated_by_admin: boolean;
					archived_at: Date | null;
			  }
			| undefined;
	});
}

async function cleanupProject(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM projects WHERE slug = $1', [slug]);
	});
}

test('admin creates a curated OSS project then archives it via the UI', async ({ page }) => {
	// Seed an owner user via SQL — the project needs a real owner_id.
	const owner = await seedUser({ prefix: 'projowner' });

	const id = uniq();
	const slug = `e2e-proj-${id}`;
	const name = `E2E Project ${id}`;

	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/projects') && r.request().method() === 'GET'
	);
	await page.goto('/projects');
	await initialLoad;

	// ─── Create ─────────────────────────────────────────────────────
	await page.getByRole('button', { name: /nouveau projet|new project/i }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await dialog.locator('#slug').fill(slug);
	await dialog.locator('#name').fill(name);
	await dialog.locator('#owner_id').fill(owner.id);

	const createReq = page.waitForResponse(
		(r) => r.url().includes('/admin/projects') && r.request().method() === 'POST'
	);
	await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
	expect((await createReq).status(), 'create POST').toBeLessThan(300);

	const created = await readProject(slug);
	expect(created?.name).toBe(name);
	expect(created?.archived_at, 'not archived yet').toBeNull();

	// ─── Archive ────────────────────────────────────────────────────
	// Auto-confirm the browser confirm() dialog used by the archive button.
	page.on('dialog', (d) => void d.accept());
	// L'archivage est un DELETE sur la ressource, pas un POST sur un
	// sous-chemin /archive : c'est ce que `archiveAdminProject` envoie et ce
	// que le backend expose.
	const archiveReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/projects/${slug}`) && r.request().method() === 'DELETE'
	);
	// Find the row for our project and click its archive button.
	const row = page.locator(`text=${slug}`).first();
	await expect(row).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: /archiver|archive/i }).first().click();
	expect((await archiveReq).status(), 'archive DELETE').toBeLessThan(300);

	const archived = await readProject(slug);
	expect(archived?.archived_at, 'archived_at set').not.toBeNull();

	await cleanupProject(slug);
});
