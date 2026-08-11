import { test, expect, type Page } from '@playwright/test';
import { withDb, uniq, seedUser, seedProject, cleanupProject, cleanupUser } from '../setup/db';

// P26 v2 SKI-98 — parties 1 et 3 : le CRUD projet enrichi (repo GitHub,
// labels curés, mode d'ingestion, domaines) et le forçage d'ingestion.
//
// Ce que ces specs prouvent que les tests unitaires ne peuvent pas : que les
// cinq champs saisis dans le formulaire arrivent réellement en base avec les
// bonnes valeurs. Les tests unitaires vérifient le corps de la requête ; ici
// on vérifie la colonne.

interface ProjectRow {
	id: string;
	name: string;
	github_repo_owner: string | null;
	github_repo_name: string | null;
	curated_labels: string[];
	slice_ingestion_mode: string;
	skill_domains: string[];
	archived_at: Date | null;
}

async function readProject(slug: string): Promise<ProjectRow | undefined> {
	return withDb(async (client) => {
		const { rows } = await client.query(
			`SELECT id, name, github_repo_owner, github_repo_name, curated_labels,
			        slice_ingestion_mode, skill_domains, archived_at
			 FROM projects WHERE slug = $1`,
			[slug]
		);
		return rows[0] as ProjectRow | undefined;
	});
}

async function cleanupBySlug(slug: string) {
	await withDb(async (client) => {
		await client.query('DELETE FROM projects WHERE slug = $1', [slug]);
	});
}

/** Ouvre la modale de création et renvoie son locator. */
async function openCreateDialog(page: Page) {
	const initialLoad = page.waitForResponse(
		(r) => r.url().includes('/api/admin/projects') && r.request().method() === 'GET'
	);
	await page.goto('/projects');
	await initialLoad;
	await page
		.getByRole('button', { name: /nouveau projet/i })
		.first()
		.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	return dialog;
}

test.describe('SKI-98 partie 1 — CRUD projet enrichi', () => {
	test('les cinq champs P26 saisis dans le formulaire arrivent en base', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26owner' });
		const id = uniq();
		const slug = `e2e-p26-create-${id}`;

		const dialog = await openCreateDialog(page);

		await dialog.locator('#slug').fill(slug);
		await dialog.locator('#name').fill(`E2E P26 ${id}`);
		await dialog.locator('#owner_id').fill(owner.id);

		// ─── Les cinq champs P26 ────────────────────────────────────
		await dialog.locator('#gh_owner').fill('launchbadge');
		await dialog.locator('#gh_name').fill('sqlx');

		// TagInput : Entrée valide le label courant.
		const labels = dialog.locator('#curated_labels');
		await labels.fill('skilluv-challenge');
		await labels.press('Enter');
		await labels.fill('good first issue');
		await labels.press('Enter');
		await expect(dialog.getByRole('button', { name: /retirer skilluv-challenge/i })).toBeVisible();
		await expect(dialog.getByRole('button', { name: /retirer good first issue/i })).toBeVisible();

		// SegmentedControl du mode d'ingestion.
		await dialog.getByRole('button', { name: /^auto$/i }).click();

		// MultiSelect des domaines : ouvrir puis cocher deux entrées.
		await dialog.getByText('Aucun domaine').click();
		await page.getByRole('option', { name: /^code$/i }).click();
		await page.getByRole('option', { name: /^ops$/i }).click();
		await page.keyboard.press('Escape');

		const createReq = page.waitForResponse(
			(r) => r.url().includes('/admin/projects') && r.request().method() === 'POST'
		);
		await dialog.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
		expect((await createReq).status(), 'create POST').toBeLessThan(300);

		const created = await readProject(slug);
		expect(created, 'projet créé').toBeDefined();
		expect(created?.github_repo_owner).toBe('launchbadge');
		expect(created?.github_repo_name).toBe('sqlx');
		expect(created?.curated_labels).toEqual(['skilluv-challenge', 'good first issue']);
		expect(created?.slice_ingestion_mode).toBe('auto');
		expect(created?.skill_domains).toEqual(expect.arrayContaining(['code', 'ops']));

		await cleanupBySlug(slug);
		await cleanupUser(owner.id);
	});

	test('un owner GitHub sans repo bloque la soumission', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26pair' });
		const id = uniq();
		const slug = `e2e-p26-pair-${id}`;

		const dialog = await openCreateDialog(page);
		await dialog.locator('#slug').fill(slug);
		await dialog.locator('#name').fill(`E2E pair ${id}`);
		await dialog.locator('#owner_id').fill(owner.id);
		// Volontairement dépareillé : le back refuse, le front doit refuser avant.
		await dialog.locator('#gh_owner').fill('launchbadge');

		await expect(dialog.getByText(/doivent être renseignés ensemble/i)).toBeVisible();
		await expect(dialog.getByRole('button', { name: /^créer$/i })).toBeDisabled();

		// Rien ne doit être parti au backend.
		expect(await readProject(slug), 'aucun projet créé').toBeUndefined();

		// Compléter la paire lève le blocage.
		await dialog.locator('#gh_name').fill('sqlx');
		await expect(dialog.getByText(/doivent être renseignés ensemble/i)).toBeHidden();
		await expect(dialog.getByRole('button', { name: /^créer$/i })).toBeEnabled();

		await cleanupUser(owner.id);
	});

	test('mode auto sans label curé affiche l’avertissement de no-op', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26warn' });
		const dialog = await openCreateDialog(page);
		await dialog.locator('#owner_id').fill(owner.id);

		// Par défaut : curator_review + aucun label → pas d'avertissement.
		await expect(dialog.getByText(/l'ingestor ne remontera aucune issue/i)).toBeHidden();

		await dialog.getByRole('button', { name: /^auto$/i }).click();
		await expect(dialog.getByText(/l'ingestor ne remontera aucune issue/i)).toBeVisible();

		// Ajouter un label le fait disparaître — c'est bien la combinaison qui
		// est signalée, pas le mode seul.
		const labels = dialog.locator('#curated_labels');
		await labels.fill('skilluv-challenge');
		await labels.press('Enter');
		await expect(dialog.getByText(/l'ingestor ne remontera aucune issue/i)).toBeHidden();

		await cleanupUser(owner.id);
	});

	test('la fiche projet affiche la config d’ingestion et les stats', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26detail' });
		const project = await seedProject({
			ownerId: owner.id,
			githubRepoOwner: 'skilluv',
			githubRepoName: 'skilluv-admin',
			curatedLabels: ['skilluv-challenge'],
			sliceIngestionMode: 'curator_review',
			skillDomains: ['code']
		});

		const statsReq = page.waitForResponse((r) =>
			r.url().includes(`/admin/projects/${project.slug}/stats`)
		);
		await page.goto(`/projects/${project.slug}`);
		expect((await statsReq).status(), 'stats GET').toBeLessThan(300);

		await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
		await expect(page.getByRole('heading', { name: /configuration challenge/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /santé du workflow/i })).toBeVisible();
		await expect(page.getByRole('heading', { name: /cycle de vie des slices/i })).toBeVisible();

		// SKI-109 est livré : le GET détail renvoie les cinq champs, donc la config
		// d'ingestion doit s'afficher pour de vrai. L'assertion était auparavant
		// permissive (« repo affiché OU non exposé ») le temps que l'endpoint
		// arrive — plus besoin.
		await expect(page.getByRole('link', { name: /skilluv\/skilluv-admin/ })).toBeVisible();
		await expect(page.getByText('skilluv-challenge')).toBeVisible();
		await expect(page.getByText(/non exposé par l'API/i)).toHaveCount(0);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('le sélecteur de fenêtre relance la requête de stats', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26window' });
		const project = await seedProject({ ownerId: owner.id });

		await page.goto(`/projects/${project.slug}`);
		await page.waitForResponse((r) => r.url().includes('/stats?window_days=90'));

		const req30 = page.waitForResponse((r) => r.url().includes('/stats?window_days=30'));
		await page.getByRole('button', { name: /90 jours/i }).click();
		await page.getByRole('option', { name: /30 jours/i }).click();
		expect((await req30).status(), 'stats 30j').toBeLessThan(300);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});
});

test.describe('SKI-98 partie 3 — forçage d’ingestion (SKI-110)', () => {
	test('le bouton déclenche l’ingestion et rend le compte-rendu', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26ingest' });
		const project = await seedProject({
			ownerId: owner.id,
			githubRepoOwner: 'skilluv',
			githubRepoName: 'skilluv-admin',
			curatedLabels: ['skilluv-challenge'],
			sliceIngestionMode: 'curator_review'
		});

		await page.goto(`/projects/${project.slug}`);

		const ingestReq = page.waitForResponse((r) =>
			r.url().includes(`/admin/projects/${project.slug}/ingest`)
		);
		await page.getByRole('button', { name: /forcer l'ingestion/i }).click();
		const res = await ingestReq;

		if (res.status() === 404 || res.status() === 405) {
			// SKI-110 pas encore déployé : la page doit dire pourquoi, pas planter.
			await expect(page.getByText(/endpoint backend pas encore déployé/i)).toBeVisible();
			await expect(page.getByText('SKI-110')).toBeVisible();
		} else {
			expect(res.status(), 'ingest POST').toBeLessThan(300);
			await expect(page.getByRole('heading', { name: /dernière ingestion forcée/i })).toBeVisible();
			await expect(page.getByText(/issues vues/i)).toBeVisible();
			await expect(page.getByText(/slices créées/i)).toBeVisible();
			// Le mode du compte-rendu doit refléter celui du projet.
			await expect(page.getByText('curator_review')).toBeVisible();
		}

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('un projet sans repo câblé remonte l’erreur du backend', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26norepo' });
		const project = await seedProject({
			ownerId: owner.id,
			githubRepoOwner: null,
			githubRepoName: null,
			sliceIngestionMode: 'manual_only'
		});

		await page.goto(`/projects/${project.slug}`);

		const ingestReq = page.waitForResponse((r) =>
			r.url().includes(`/admin/projects/${project.slug}/ingest`)
		);
		await page.getByRole('button', { name: /forcer l'ingestion/i }).click();
		const res = await ingestReq;

		// Le front ne peut pas désactiver le bouton en amont (SKI-109 : il ne
		// relit pas ces champs), donc c'est le 400 du backend qui doit porter
		// le message. Un 404 signifie simplement que SKI-110 n'est pas déployé.
		expect([400, 404, 405]).toContain(res.status());
		if (res.status() === 400) {
			await expect(page.getByRole('status').or(page.getByRole('alert'))).toBeVisible();
		}

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});
});
