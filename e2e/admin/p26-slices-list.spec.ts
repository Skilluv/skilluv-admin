import { test, expect } from '@playwright/test';
import { seedUser, seedProject, seedSlice, cleanupProject, cleanupUser } from '../setup/db';

// SKI-112 — la liste admin des slices, tous statuts.
//
// Ce que ces specs verrouillent, c'est le trou que le ticket décrit : avant,
// une slice qui n'était plus `open` n'était atteignable que par son UUID. Les
// assertions portent donc surtout sur les statuts NON ouverts — c'est là que
// se trouve la valeur, et c'est ce qu'une régression casserait en premier.

test.describe('SKI-112 — liste des slices', () => {
	test('affiche les slices quel que soit leur statut', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26list' });
		const project = await seedProject({ ownerId: owner.id });
		const claimer = await seedUser({ prefix: 'p26claim' });

		await seedSlice({ projectId: project.id, status: 'open' });
		await seedSlice({
			projectId: project.id,
			status: 'pending_validation',
			claimedByUserId: claimer.id
		});
		await seedSlice({ projectId: project.id, status: 'merged' });

		const listReq = page.waitForResponse((r) => r.url().includes('/admin/slices'));
		await page.goto(`/slices?project_id=${project.id}`);
		expect((await listReq).status(), 'liste admin').toBeLessThan(300);

		// Les trois statuts doivent être là — c'est tout l'intérêt de l'écran.
		await expect(page.getByRole('cell', { name: /ouverte/i })).toBeVisible();
		await expect(page.getByRole('cell', { name: /à valider/i })).toBeVisible();
		await expect(page.getByRole('cell', { name: /mergée/i })).toBeVisible();

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
		await cleanupUser(claimer.id);
	});

	test('le filtre de statut est porté par l’URL et par la requête', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26filt' });
		const project = await seedProject({ ownerId: owner.id });
		await seedSlice({ projectId: project.id, status: 'open' });
		await seedSlice({ projectId: project.id, status: 'submitted' });

		await page.goto(`/slices?project_id=${project.id}`);
		await page.waitForResponse((r) => r.url().includes('/admin/slices'));

		const filtered = page.waitForResponse((r) => r.url().includes('status=submitted'));
		await page.getByRole('button', { name: /^tous$/i }).first().click();
		await page.getByRole('option', { name: /pr soumise/i }).click();
		expect((await filtered).status(), 'liste filtrée').toBeLessThan(300);

		// L'URL doit refléter le filtre : la page est partageable et rechargeable.
		await expect(page).toHaveURL(/status=submitted/);
		await expect(page.getByRole('cell', { name: /pr soumise/i })).toBeVisible();
		await expect(page.getByRole('cell', { name: /^ouverte$/i })).toHaveCount(0);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('un deep-link arrive déjà filtré', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26deeplink' });
		const project = await seedProject({ ownerId: owner.id });
		await seedSlice({ projectId: project.id, status: 'open' });
		await seedSlice({ projectId: project.id, status: 'ci_green' });

		// C'est la forme d'URL que produisent les compteurs cliquables.
		const req = page.waitForResponse((r) => r.url().includes('status=ci_green'));
		await page.goto(`/slices?project_id=${project.id}&status=ci_green`);
		await req;

		await expect(page.getByRole('cell', { name: /ci verte/i })).toBeVisible();
		await expect(page.getByRole('cell', { name: /^ouverte$/i })).toHaveCount(0);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('chaque ligne mène à sa page de config', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26nav' });
		const project = await seedProject({ ownerId: owner.id });
		const slice = await seedSlice({ projectId: project.id, status: 'claimed' });

		await page.goto(`/slices?project_id=${project.id}`);
		await page.waitForResponse((r) => r.url().includes('/admin/slices'));

		await page.getByRole('link', { name: /configurer/i }).first().click();
		await expect(page).toHaveURL(new RegExp(`/slices/${slice.id}/config`));
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('les compteurs de la fiche projet mènent à la liste filtrée', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26count' });
		const project = await seedProject({ ownerId: owner.id });
		await seedSlice({ projectId: project.id, status: 'submitted' });

		await page.goto(`/projects/${project.slug}`);
		await page.waitForResponse((r) => r.url().includes(`/admin/projects/${project.slug}/stats`));

		// Le dashboard disait *combien* sans permettre de voir *lesquelles* :
		// le compteur non nul doit désormais être un lien.
		const counter = page.getByRole('link', { name: /voir les \d+ slice\(s\) au statut pr soumise/i });
		await expect(counter).toBeVisible();
		await counter.click();

		await expect(page).toHaveURL(/\/slices\?project_id=.*status=submitted/);
		await expect(page.getByRole('cell', { name: /pr soumise/i })).toBeVisible();

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('un statut inconnu dans l’URL remonte l’erreur du backend', async ({ page }) => {
		// Le backend refuse en 400 ; la page doit le dire plutôt que d'afficher
		// une liste vide qui ressemblerait à « aucun résultat ».
		const req = page.waitForResponse((r) => r.url().includes('/admin/slices'));
		await page.goto('/slices?status=nawak');
		const res = await req;
		expect(res.status()).toBe(400);
		await expect(page.getByText(/invalid|must be one of/i).first()).toBeVisible();
	});
});
