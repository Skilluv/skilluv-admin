import { test, expect } from '@playwright/test';
import {
	seedUser,
	setUserRank,
	seedValidatorApplication,
	readValidatorApplication,
	grantValidatorCapability,
	readValidatorCapability,
	cleanupUser
} from '../setup/db';

// P26 v2 SKI-99 — le corps des validateurs : candidatures, invitations,
// roster actif.
//
// L'enjeu de ces specs est l'effet de bord, pas le rendu : approuver une
// candidature doit réellement accorder `challenge_validator:{domaine}`, et
// révoquer doit réellement le retirer. Une UI qui affiche « approuvé » sans
// que la capability suive est le pire des cas — silencieux et faux.

test.describe('SKI-99 — candidatures', () => {
	test('approuver une candidature accorde la capability', async ({ page }) => {
		const candidate = await seedUser({ prefix: 'p26cand' });
		await setUserRank(candidate.id, 'artisan');
		const app = await seedValidatorApplication({
			userId: candidate.id,
			domain: 'code',
			motivation: 'Je relis déjà des PRs backend depuis six mois.'
		});

		const listReq = page.waitForResponse((r) =>
			r.url().includes('/admin/validator-applications')
		);
		await page.goto('/validators/applications');
		const listRes = await listReq;

		test.skip(
			listRes.status() === 404 || listRes.status() === 405,
			'SKI-107 (GET /admin/validator-applications) pas déployé'
		);

		const card = page.locator('article', { hasText: candidate.username });
		await expect(card).toBeVisible();
		await expect(card.getByText('code')).toBeVisible();
		// Les stats live doivent être là — c'est ce qui évite N appels côté front.
		await expect(card.getByText(/rang/i)).toBeVisible();
		await expect(card.getByText(/prs validées/i)).toBeVisible();
		await expect(card.getByText(/ancienneté/i)).toBeVisible();
		await expect(card.getByText('artisan')).toBeVisible();

		const approveReq = page.waitForResponse(
			(r) => r.url().includes(`/validator-applications/${app.id}/approve`)
		);
		await card.getByRole('button', { name: /approuver/i }).click();
		expect((await approveReq).status(), 'approve POST').toBeLessThan(300);

		const stored = await readValidatorApplication(app.id);
		expect(stored?.status).toBe('accepted');
		expect(stored?.reviewed_at, 'traçabilité : date de décision').not.toBeNull();
		expect(stored?.admin_actor_id, 'traçabilité : qui a tranché').not.toBeNull();

		// L'effet réel : la capability est accordée.
		const cap = await readValidatorCapability(candidate.id, 'code');
		expect(cap, 'challenge_validator:code accordée').toBeDefined();
		expect(cap?.revoked_at).toBeNull();

		await cleanupUser(candidate.id);
	});

	test('rejeter exige une raison, qui est conservée', async ({ page }) => {
		const candidate = await seedUser({ prefix: 'p26rej' });
		const app = await seedValidatorApplication({ userId: candidate.id, domain: 'design' });

		const listReq = page.waitForResponse((r) =>
			r.url().includes('/admin/validator-applications')
		);
		await page.goto('/validators/applications');
		const listRes = await listReq;
		test.skip(listRes.status() === 404 || listRes.status() === 405, 'SKI-107 pas déployé');

		const card = page.locator('article', { hasText: candidate.username });
		await card.getByRole('button', { name: /rejeter/i }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		// Sans raison, pas de rejet possible.
		await expect(dialog.getByRole('button', { name: /confirmer le rejet/i })).toBeDisabled();

		const reason = 'Pas encore assez de PRs validées sur le domaine design.';
		await dialog.locator('#reject-reason').fill(reason);

		const rejectReq = page.waitForResponse((r) =>
			r.url().includes(`/validator-applications/${app.id}/reject`)
		);
		await dialog.getByRole('button', { name: /confirmer le rejet/i }).click();
		expect((await rejectReq).status(), 'reject POST').toBeLessThan(300);

		const stored = await readValidatorApplication(app.id);
		expect(stored?.status).toBe('rejected');
		expect(stored?.review_notes).toBe(reason);

		// Aucune capability ne doit avoir été accordée au passage.
		expect(await readValidatorCapability(candidate.id, 'design')).toBeUndefined();

		await cleanupUser(candidate.id);
	});

	test('le filtre de statut recharge la liste avec le bon paramètre', async ({ page }) => {
		await page.goto('/validators/applications');
		await page
			.waitForResponse((r) => r.url().includes('status=pending'))
			.catch(() => {
				// Endpoint absent : le filtre reste testable via l'URL demandée.
			});

		const acceptedReq = page.waitForResponse((r) => r.url().includes('status=accepted'));
		await page.getByRole('button', { name: /en attente/i }).first().click();
		await page.getByRole('option', { name: /acceptées/i }).click();
		await acceptedReq;
	});
});

test.describe('SKI-99 — invitations', () => {
	test('inviter un utilisateur crée une candidature d’origine invitation', async ({ page }) => {
		const invitee = await seedUser({ prefix: 'p26inv' });

		await page.goto('/validators/invitations');
		await page.getByRole('button', { name: /nouvelle invitation/i }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();

		// Recherche debouncée : taper puis attendre la réponse.
		const searchReq = page.waitForResponse((r) => r.url().includes('/admin/users?'));
		await dialog.locator('#invite-search').fill(invitee.username);
		await searchReq;
		await dialog.getByRole('button', { name: new RegExp(invitee.username, 'i') }).first().click();

		// Domaine.
		await dialog.getByRole('button', { name: /^code$/i }).click();
		await page.getByRole('option', { name: /^security$/i }).click();

		// Les notes sont obligatoires : c'est la trace de la décision.
		await expect(dialog.getByRole('button', { name: /envoyer l'invitation/i })).toBeDisabled();
		await dialog.locator('#invite-notes').fill('Ex-pentester, invité sur le domaine sécurité.');

		const inviteReq = page.waitForResponse(
			(r) => r.url().includes('/admin/validators/invite') && r.request().method() === 'POST'
		);
		await dialog.getByRole('button', { name: /envoyer l'invitation/i }).click();
		expect((await inviteReq).status(), 'invite POST').toBeLessThan(300);

		const body = JSON.parse((await inviteReq).request().postData() ?? '{}');
		expect(body.user_id).toBe(invitee.id);
		expect(body.domain).toBe('security');
		expect(body.notes).toContain('pentester');

		// Une invitation ne doit PAS accorder la capability : l'invité doit
		// encore accepter. C'est la différence de fond avec l'approbation.
		expect(
			await readValidatorCapability(invitee.id, 'security'),
			'pas de capability avant acceptation'
		).toBeUndefined();

		await cleanupUser(invitee.id);
	});

	test('l’historique montre la date d’envoi et celle de décision', async ({ page }) => {
		const invitee = await seedUser({ prefix: 'p26hist' });
		await seedValidatorApplication({
			userId: invitee.id,
			domain: 'ops',
			origin: 'invitation',
			status: 'pending'
		});

		const listReq = page.waitForResponse((r) =>
			r.url().includes('/admin/validator-applications')
		);
		await page.goto('/validators/invitations');
		const listRes = await listReq;
		test.skip(listRes.status() === 404 || listRes.status() === 405, 'SKI-107 pas déployé');

		await expect(page.getByRole('columnheader', { name: /envoyée le/i })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: /décidée le/i })).toBeVisible();

		const row = page.locator('tbody tr', { hasText: invitee.username });
		await expect(row).toBeVisible();
		await expect(row.getByText(/en attente d'acceptation/i)).toBeVisible();
		// Pas encore décidée → tiret dans la colonne de décision.
		await expect(row.getByText('—')).toBeVisible();

		await cleanupUser(invitee.id);
	});
});

test.describe('SKI-99 — validateurs actifs', () => {
	test('un porteur de capability apparaît au roster avec sa date de grant', async ({ page }) => {
		const validator = await seedUser({ prefix: 'p26active' });
		await grantValidatorCapability(validator.id, 'code');

		const statsReq = page.waitForResponse((r) => r.url().includes('/admin/validators/stats'));
		await page.goto('/validators/active');
		const statsRes = await statsReq;
		test.skip(
			statsRes.status() === 404 || statsRes.status() === 405,
			'SKI-108 (GET /admin/validators/stats) pas déployé'
		);

		const row = page.locator('tbody tr', { hasText: validator.username });
		await expect(row).toBeVisible();
		await expect(row.getByText('code')).toBeVisible();
		// La date de grant vient d'un second appel par validateur.
		await expect(row.getByText(/depuis le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

		await cleanupUser(validator.id);
	});

	test('révoquer retire réellement la capability', async ({ page }) => {
		const validator = await seedUser({ prefix: 'p26revoke' });
		await grantValidatorCapability(validator.id, 'game');

		const statsReq = page.waitForResponse((r) => r.url().includes('/admin/validators/stats'));
		await page.goto('/validators/active');
		const statsRes = await statsReq;
		test.skip(statsRes.status() === 404 || statsRes.status() === 405, 'SKI-108 pas déployé');

		const row = page.locator('tbody tr', { hasText: validator.username });
		await row.getByRole('button', { name: /révoquer challenge_validator:game/i }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/ne pourra plus prendre en charge/i)).toBeVisible();

		// Le slug porte deux-points : il doit être encodé dans l'URL, sinon la
		// route backend ne matche pas.
		const revokeReq = page.waitForResponse(
			(r) =>
				r.url().includes('challenge_validator%3Agame') && r.request().method() === 'DELETE'
		);
		await dialog.getByRole('textbox').fill('Inactif depuis trois mois.');
		await dialog.getByRole('button', { name: /révoquer/i }).last().click();
		expect((await revokeReq).status(), 'revoke DELETE').toBeLessThan(300);

		const cap = await readValidatorCapability(validator.id, 'game');
		expect(cap?.revoked_at, 'capability révoquée').not.toBeNull();

		await cleanupUser(validator.id);
	});

	test('le filtre par domaine restreint le roster', async ({ page }) => {
		const codeValidator = await seedUser({ prefix: 'p26fcode' });
		const designValidator = await seedUser({ prefix: 'p26fdesign' });
		await grantValidatorCapability(codeValidator.id, 'code');
		await grantValidatorCapability(designValidator.id, 'design');

		const statsReq = page.waitForResponse((r) => r.url().includes('/admin/validators/stats'));
		await page.goto('/validators/active');
		const statsRes = await statsReq;
		test.skip(statsRes.status() === 404 || statsRes.status() === 405, 'SKI-108 pas déployé');

		await expect(page.locator('tbody tr', { hasText: codeValidator.username })).toBeVisible();
		await expect(page.locator('tbody tr', { hasText: designValidator.username })).toBeVisible();

		// Le filtre est appliqué côté client sur `active_domains`.
		await page.getByRole('button', { name: /^tous$/i }).first().click();
		await page.getByRole('option', { name: /^code$/i }).click();

		await expect(page.locator('tbody tr', { hasText: codeValidator.username })).toBeVisible();
		await expect(page.locator('tbody tr', { hasText: designValidator.username })).toBeHidden();

		await cleanupUser(codeValidator.id);
		await cleanupUser(designValidator.id);
	});
});
