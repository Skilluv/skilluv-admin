import { test, expect } from '@playwright/test';
import { withDb, uniq } from '../setup/db';

// Phase 3 — skills catalog CRUD: create via UI → verify DB → edit → verify DB.
// The delete/deprecate path isn't exposed in the current UI (backend has no
// DELETE either); this spec covers the two mutations users can trigger.

async function readSkillBySlug(slug: string) {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT id, display_name, description, domain, is_skilluv_specific
			 FROM skill_nodes WHERE slug = $1`,
			[slug]
		);
		return rows[0] as
			| {
					id: string;
					display_name: string;
					description: string | null;
					domain: string;
					is_skilluv_specific: boolean;
			  }
			| undefined;
	});
}

async function cleanupSkill(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM skill_nodes WHERE slug = $1', [slug]);
	});
}

test('admin creates then edits a skill node via the UI', async ({ page }) => {
	const id = uniq();
	const slug = `e2e-skill-${id}`;
	const displayName = `E2E Skill ${id}`;

	// Wait for the initial list fetch fired by $effect on mount before typing
	// in the modal — otherwise the openCreate click can race the hydration.
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/skills') && r.request().method() === 'GET'
	);
	await page.goto('/skills');
	await initialLoad;

	// ─── Create ─────────────────────────────────────────────────────
	// Le bouton est rendu en SSR, son `onclick` n'existe qu'après hydratation :
	// un clic trop tôt ne fait rien. On réessaie jusqu'à ce que la modale
	// s'ouvre plutôt que de poser une attente arbitraire.
	const dialog = page.getByRole('dialog');
	await expect(async () => {
		await page.getByRole('button', { name: /créer un skill/i }).click();
		await expect(dialog).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	await expect(dialog).toBeVisible();

	await dialog.getByRole('textbox', { name: /slug/i }).fill(slug);
	await dialog.getByRole('textbox', { name: /nom.*affiché|display name/i }).fill(displayName);

	const createReq = page.waitForResponse(
		(r) => r.url().includes('/admin/skills') && r.request().method() === 'POST'
	);
	await dialog.getByRole('button', { name: /créer|create/i }).last().click();
	expect((await createReq).status(), 'create POST').toBeLessThan(300);

	const created = await readSkillBySlug(slug);
	expect(created?.display_name).toBe(displayName);
	expect(created?.domain).toBe('code');

	// ─── Edit ────────────────────────────────────────────────────────
	// Search for our just-created skill so it's the only row.
	await page.getByPlaceholder(/slug ou nom/i).first().fill(slug);
	const editReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/skills/${created!.id}`) && r.request().method() === 'PUT'
	);
	// Attendre que le filtre ait rechargé la liste : cliquer pendant le
	// re-rendu ne fait rien, et l'échec se lit alors comme « pas de modale ».
	const editDialog = page.getByRole('dialog');
	await expect(async () => {
		await page.getByRole('button', { name: /modifier|edit|éditer/i }).first().click();
		await expect(editDialog).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });

	const newDisplayName = `${displayName} (edited)`;
	const nameField = editDialog.getByRole('textbox', { name: /nom.*affiché|display name/i });
	await nameField.fill(newDisplayName);
	await editDialog.getByRole('button', { name: /modifier|save|enregistrer|mettre à jour/i }).last().click();
	expect((await editReq).status(), 'edit PUT').toBeLessThan(300);

	const edited = await readSkillBySlug(slug);
	expect(edited?.display_name, 'edit persisted').toBe(newDisplayName);

	await cleanupSkill(slug);
});
