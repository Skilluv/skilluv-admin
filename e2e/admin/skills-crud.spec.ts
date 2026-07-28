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
	await page.getByRole('button', { name: /nouveau|new|créer/i }).first().click();
	const dialog = page.getByRole('dialog');
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
	await page.getByPlaceholder(/recherche|search|filtrer/i).first().fill(slug);
	const editReq = page.waitForResponse(
		(r) => r.url().includes(`/admin/skills/${created!.id}`) && r.request().method() === 'PUT'
	);
	// The row's edit button — anchor via the skill's slug text in the table.
	await page.getByRole('button', { name: /modifier|edit|éditer/i }).first().click();
	const editDialog = page.getByRole('dialog');
	await expect(editDialog).toBeVisible();

	const newDisplayName = `${displayName} (edited)`;
	const nameField = editDialog.getByRole('textbox', { name: /nom.*affiché|display name/i });
	await nameField.fill(newDisplayName);
	await editDialog.getByRole('button', { name: /modifier|save|enregistrer|mettre à jour/i }).last().click();
	expect((await editReq).status(), 'edit PUT').toBeLessThan(300);

	const edited = await readSkillBySlug(slug);
	expect(edited?.display_name, 'edit persisted').toBe(newDisplayName);

	await cleanupSkill(slug);
});
