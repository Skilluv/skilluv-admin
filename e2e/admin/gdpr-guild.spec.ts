import { test, expect } from '@playwright/test';
import { withDb, uniq, seedUser } from '../setup/db';

// Phase 3 — admin operations that mutate a specific user/entity:
//   1. GDPR export triggered from /users/[id]
//   2. Guild dissolve triggered from /operations
//
// Both are admin_destructive rate-limited; both require a valid target
// entity in the DB (user for GDPR, guild for dissolve).

async function seedGuild(ownerId: string) {
	const id = uniq();
	return withDb(async (client) => {
		const { rows } = await client.query(
			// La colonne s'appelle `founder_id` : `owner_id` n'existe pas.
			// `tag` est NOT NULL — c'est le trigramme affiché à côté du nom.
			`INSERT INTO guilds (name, slug, tag, founder_id, description)
			 VALUES ($1, $2, $3, $4, 'E2E test guild')
			 RETURNING id`,
			[
				`E2E Guild ${id}`,
				`e2e-guild-${id}`.slice(0, 60),
				id.slice(0, 5).toUpperCase(),
				ownerId
			]
		);
		return { id: rows[0].id as string };
	});
}

test('admin triggers GDPR export from a user detail page', async ({ page }) => {
	const victim = await seedUser({ prefix: 'gdpr' });

	const detailLoad = page.waitForResponse(
		(r) => r.url().includes(`/api/admin/users/${victim.id}`) && r.request().method() === 'GET'
	);
	await page.goto(`/users/${victim.id}`);
	await detailLoad;

	// GDPR trigger lives in a dedicated `<UserGdprSection>`. Button label
	// contains "GDPR" or "RGPD" per i18n.
	const gdprBtn = page.getByRole('button', { name: /gdpr|rgpd|export/i }).first();
	await gdprBtn.scrollIntoViewIfNeeded();
	await expect(gdprBtn).toBeVisible();

	const req = page.waitForResponse(
		(r) => r.url().includes(`/admin/users/${victim.id}/gdpr-export`) && r.request().method() === 'POST'
	);
	await gdprBtn.click();

	// Some UIs require typing a reason in a confirm dialog — fill if present.
	const reasonField = page.getByTestId('confirm-dangerous-reason');
	if (await reasonField.isVisible().catch(() => false)) {
		await reasonField.fill('E2E — legitimate compliance drill');
		await page.getByTestId('confirm-dangerous-action').click();
	}
	expect((await req).status(), 'gdpr-export POST').toBeLessThan(300);
});

test('admin dissolves a guild from /operations', async ({ page }) => {
	const owner = await seedUser({ prefix: 'guildowner' });
	const guild = await seedGuild(owner.id);

	await page.goto('/operations');
	// Guild dissolve is behind a form + ConfirmDangerousDialog. The UI expects
	// the guild UUID pasted into an input, then the "Dissolve" button opens
	// the confirm dialog.
	// Le champ n'a pas de <label for>, donc `getByLabel` ne le trouve pas :
	// on cible son id.
	const guildIdInput = page.locator('#op-gid');
	await expect(guildIdInput).toBeVisible();
	await guildIdInput.fill(guild.id);
	await page.getByRole('button', { name: /dissoudre|dissolve/i }).first().click();

	await page.getByTestId('confirm-dangerous-reason').fill('E2E — dissolve inactive guild');
	const req = page.waitForResponse(
		(r) => r.url().includes(`/admin/guilds/${guild.id}/dissolve`) && r.request().method() === 'POST'
	);
	await page.getByTestId('confirm-dangerous-action').click();
	expect((await req).status(), 'dissolve POST').toBeLessThan(300);

	// La dissolution est un soft-delete : `disbanded_at` est horodaté.
	const dissolved = await withDb(async (client) => {
		const { rows } = await client.query(
			// La colonne s'appelle `disbanded_at` ; il n'y a pas de `status`.
			`SELECT disbanded_at FROM guilds WHERE id = $1`,
			[guild.id]
		);
		return rows[0] as { disbanded_at: Date | null };
	});
	// One of the two invariants should hold once dissolve fires.
	expect(dissolved.disbanded_at, 'guilde dissoute').not.toBeNull();
});
