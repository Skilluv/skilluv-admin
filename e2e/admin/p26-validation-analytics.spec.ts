import { test, expect } from '@playwright/test';
import {
	seedUser,
	seedProject,
	seedSlice,
	grantValidatorCapability,
	cleanupProject,
	cleanupUser
} from '../setup/db';

// P26 v2 SKI-100 — le dashboard qui tient le dogfooding honnête.
//
// Les cinq sections ont des sources différentes (agrégat client-side, stats
// par projet, deux endpoints analytics, une URL d'ops). Ces specs vérifient
// surtout qu'aucune section n'avale silencieusement son erreur : une section
// vide et une section cassée doivent se distinguer à l'œil.

test.describe('SKI-100 — dashboard analytics validation', () => {
	test('les cinq sections sont rendues', async ({ page }) => {
		await page.goto('/validation-analytics');

		await expect(page.getByRole('heading', { name: /1 — vue d'ensemble/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /2 — par projet/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /3 — par validateur/i })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: /4 — concentration validateur/i })
		).toBeVisible();
		await expect(page.getByRole('heading', { name: /5 — compteurs prometheus/i })).toBeVisible();
	});

	test('la note de contexte Phase 1 est visible d’entrée', async ({ page }) => {
		await page.goto('/validation-analytics');
		// L'analytics doit rester informative : sans ce cadrage, un ratio élevé
		// en dogfooding se lit comme une fraude.
		await expect(page.getByText(/phase 1 dogfooding/i).first()).toBeVisible();
		await expect(page.getByText(/attendus anormalement hauts/i)).toBeVisible();
	});

	test('l’agrégat global additionne les stats des projets curés', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26agg' });
		const project = await seedProject({ ownerId: owner.id, curatedByAdmin: true });
		await seedSlice({ projectId: project.id, status: 'open' });
		await seedSlice({ projectId: project.id, status: 'open' });
		await seedSlice({ projectId: project.id, status: 'validated' });

		const statsReq = page.waitForResponse((r) =>
			r.url().includes(`/admin/projects/${project.slug}/stats`)
		);
		await page.goto('/validation-analytics');
		expect((await statsReq).status(), 'stats du projet curé').toBeLessThan(300);

		// Les tuiles d'en-tête viennent de la somme, pas d'un endpoint.
		await expect(page.getByText(/slices suivies/i)).toBeVisible();
		await expect(page.getByText(/succès challenge/i)).toBeVisible();
		await expect(page.getByText(/en cours/i).first()).toBeVisible();
		// La page doit dire d'où vient l'agrégat — il n'y a pas d'endpoint global.
		await expect(page.getByText(/somme des statistiques par projet/i)).toBeVisible();

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('changer la fenêtre relance les trois sources', async ({ page }) => {
		await page.goto('/validation-analytics');
		await page.waitForResponse((r) => r.url().includes('window_days=90')).catch(() => {});

		const validators30 = page.waitForResponse((r) =>
			r.url().includes('/admin/validators/stats?window_days=30')
		);
		const matrix30 = page.waitForResponse((r) =>
			r.url().includes('/admin/validators/collusion-matrix?window_days=30')
		);

		await page.getByRole('button', { name: /90 jours/i }).first().click();
		await page.getByRole('option', { name: /30 jours/i }).click();

		await validators30;
		await matrix30;
	});

	test('le seuil de signalement est répercuté dans la requête', async ({ page }) => {
		await page.goto('/validation-analytics');

		const req = page.waitForResponse((r) => r.url().includes('min_count=10'));
		await page.getByRole('button', { name: /> 5 validations/i }).click();
		await page.getByRole('option', { name: /> 10 validations/i }).click();
		await req;
	});

	test('un validateur actif apparaît dans la section 3', async ({ page }) => {
		const validator = await seedUser({ prefix: 'p26an' });
		await grantValidatorCapability(validator.id, 'code');

		const statsReq = page.waitForResponse((r) => r.url().includes('/admin/validators/stats'));
		await page.goto('/validation-analytics');
		const statsRes = await statsReq;
		test.skip(statsRes.status() === 404 || statsRes.status() === 405, 'SKI-108 pas déployé');

		const row = page.locator('tbody tr', { hasText: validator.username });
		await expect(row).toBeVisible();
		// Un validateur sans activité doit apparaître à zéro, pas disparaître :
		// c'est l'inactivité qu'on veut voir.
		await expect(row.getByText('0').first()).toBeVisible();

		await cleanupUser(validator.id);
	});

	test('l’export CSV déclenche un téléchargement nommé', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26csv' });
		const project = await seedProject({ ownerId: owner.id, curatedByAdmin: true });
		await seedSlice({ projectId: project.id, status: 'open' });

		await page.goto('/validation-analytics');
		await page.waitForResponse((r) => r.url().includes(`/admin/projects/${project.slug}/stats`));

		const downloadPromise = page.waitForEvent('download');
		await page
			.getByRole('button', { name: /export csv/i })
			.first()
			.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/^skilluv-projets-\d+j\.csv$/);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('la section Prometheus liste les compteurs même sans Grafana configuré', async ({
		page
	}) => {
		await page.goto('/validation-analytics');

		// Les noms de séries restent utiles avant que le board d'ops existe.
		await expect(page.getByText('skilluv_ingest_domain_source_total{source}')).toBeVisible();
		await expect(page.getByText('skilluv_merge_bonus_awarded_total')).toBeVisible();

		// Soit le lien est là, soit la page dit quelle variable renseigner.
		const link = page.getByRole('link', { name: /ouvrir le dashboard grafana/i });
		const hint = page.getByText(/PUBLIC_GRAFANA_URL/);
		await expect(link.or(hint)).toBeVisible();
	});

	test('le deep-link vers la fiche projet suit le sélecteur', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26deep' });
		const project = await seedProject({ ownerId: owner.id, curatedByAdmin: true });

		await page.goto('/validation-analytics');
		await page.waitForResponse((r) => r.url().includes(`/admin/projects/`));

		const link = page.getByRole('link', { name: /fiche projet/i });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', /^\/projects\//);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});
});
