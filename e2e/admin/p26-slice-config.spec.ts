import { test, expect } from '@playwright/test';
import {
	seedUser,
	seedProject,
	seedSlice,
	readSlice,
	cleanupProject,
	cleanupUser
} from '../setup/db';

// P26 v2 SKI-98 partie 2 — /slices/{id}/config, l'échappatoire manuelle aux
// deux garde-fous de claim (SKI-78 rang plancher, SKI-79 orientations).
//
// Le point délicat que ces specs verrouillent : « vider un champ » doit
// envoyer `null` (efface l'override) et non `[]` (restreint à rien). Les deux
// se ressemblent dans l'UI et ont des effets opposés sur qui peut claim.

test.describe('SKI-98 partie 2 — override de config par slice', () => {
	test('poser un rang plancher et des orientations écrit bien en base', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26cfg' });
		const project = await seedProject({ ownerId: owner.id });
		const slice = await seedSlice({ projectId: project.id, status: 'open' });

		await page.goto(`/slices/${slice.id}/config`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		// Orientations : TagInput, Entrée valide.
		const orientations = page.getByPlaceholder(/frontend-svelte/i);
		await orientations.fill('frontend-svelte');
		await orientations.press('Enter');
		await expect(page.getByRole('button', { name: /retirer frontend-svelte/i })).toBeVisible();

		// Rang plancher.
		await page.getByRole('button', { name: /aucun plancher/i }).click();
		await page.getByRole('option', { name: /^artisan$/i }).click();

		// La raison est obligatoire : tant qu'elle est vide, on ne peut pas
		// enregistrer, et la page le dit.
		await expect(page.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
		await expect(page.getByText(/une raison est requise/i)).toBeVisible();

		await page.locator('#override-note').fill('Issue touchant la migration SQL, réservée artisan+.');

		const patchReq = page.waitForResponse(
			(r) =>
				r.url().includes(`/admin/slices/${slice.id}/config`) && r.request().method() === 'PATCH'
		);
		await page.getByRole('button', { name: /enregistrer/i }).click();
		const res = await patchReq;

		if (res.status() === 404 || res.status() === 405) {
			await expect(page.getByText(/endpoint backend pas encore déployé/i)).toBeVisible();
			await expect(page.getByText('SKI-106')).toBeVisible();
		} else {
			expect(res.status(), 'config PATCH').toBeLessThan(300);

			const stored = await readSlice(slice.id);
			expect(stored?.required_orientation_slugs).toEqual(['frontend-svelte']);
			expect(stored?.min_rank).toBe('artisan');

			// Le corps envoyé doit porter la raison — c'est elle qui alimente
			// l'audit, et c'est la seule trace du pourquoi.
			const body = JSON.parse(res.request().postData() ?? '{}');
			expect(body.note).toContain('migration SQL');
		}

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('vider les champs efface l’override au lieu de tout restreindre', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26clear' });
		const project = await seedProject({ ownerId: owner.id });
		const slice = await seedSlice({
			projectId: project.id,
			status: 'open',
			requiredOrientationSlugs: ['frontend-svelte'],
			minRank: 'doyen'
		});

		await page.goto(`/slices/${slice.id}/config`);

		// L'état stocké doit être pré-rempli — sinon l'admin efface sans le voir.
		await expect(page.getByRole('button', { name: /retirer frontend-svelte/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /doyen/i })).toBeVisible();

		await page.getByRole('button', { name: /retirer frontend-svelte/i }).click();
		await page.getByRole('button', { name: /doyen/i }).click();
		await page.getByRole('option', { name: /aucun plancher/i }).click();
		await page.locator('#override-note').fill('Ouverture à tous : la sensibilité était surestimée.');

		const patchReq = page.waitForResponse(
			(r) =>
				r.url().includes(`/admin/slices/${slice.id}/config`) && r.request().method() === 'PATCH'
		);
		await page.getByRole('button', { name: /enregistrer/i }).click();
		const res = await patchReq;

		// Contrat SKI-106 : `null` = efface l'override. Envoyer `[]` voudrait
		// dire « restreint à aucune orientation », ce qui bloquerait tout le
		// monde — c'est l'inverse de l'intention.
		const body = JSON.parse(res.request().postData() ?? '{}');
		expect(body.required_orientation_slugs, 'null et non []').toBeNull();
		expect(body.min_rank, 'null et non ""').toBeNull();

		if (res.status() < 300) {
			const stored = await readSlice(slice.id);
			expect(stored?.required_orientation_slugs).toEqual([]);
			expect(stored?.min_rank).toBeNull();
		}

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('un slug d’orientation malformé est refusé côté front', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26slug' });
		const project = await seedProject({ ownerId: owner.id });
		const slice = await seedSlice({ projectId: project.id, status: 'open' });

		await page.goto(`/slices/${slice.id}/config`);

		const orientations = page.getByPlaceholder(/frontend-svelte/i);
		// Majuscules : refusé par le backend, doit être refusé avant l'envoi.
		await orientations.fill('Frontend-Svelte');
		await orientations.press('Enter');
		await expect(page.getByText(/minuscules, chiffres et tirets/i)).toBeVisible();

		// Trop court.
		await orientations.fill('ab');
		await orientations.press('Enter');
		await expect(page.getByText(/entre 3 et 60 caractères/i)).toBeVisible();

		// Aucun tag n'a été accepté.
		await expect(page.getByRole('button', { name: /^retirer /i })).toHaveCount(0);

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});

	test('une slice inexistante rend un état vide, pas une erreur brute', async ({ page }) => {
		// UUID valide mais absent : le 404 backend doit devenir un message.
		await page.goto('/slices/00000000-0000-0000-0000-000000000000/config');
		await expect(page.getByText(/aucune slice avec l'identifiant/i)).toBeVisible();
	});

	test('la page affiche le contexte de la slice et son historique', async ({ page }) => {
		const owner = await seedUser({ prefix: 'p26ctx' });
		const project = await seedProject({ ownerId: owner.id });
		const slice = await seedSlice({
			projectId: project.id,
			status: 'open',
			primaryDomain: 'security',
			difficulty: 4
		});

		await page.goto(`/slices/${slice.id}/config`);

		// Le contexte doit suffire à décider sans ouvrir une autre page.
		await expect(page.getByText('open')).toBeVisible();
		await expect(page.getByText('security')).toBeVisible();
		await expect(page.getByText(/difficulté 4/i)).toBeVisible();
		await expect(page.getByRole('heading', { name: /historique des changements/i })).toBeVisible();

		await cleanupProject(project.id);
		await cleanupUser(owner.id);
	});
});
