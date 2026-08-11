import pg from 'pg';
import { loadDotEnv } from './setup/env.mjs';

loadDotEnv();

/** Compte admin dédié produit par `bootstrap-admin.mjs` : il doit survivre au
 *  nettoyage, sinon le `storageState` du run suivant pointe sur un utilisateur
 *  supprimé. Surchargeable comme dans le bootstrap. */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@skilluv.test';

/**
 * Purge les fixtures E2E laissées en base.
 *
 * Les specs nettoient en fin de test, mais **un test qui échoue n'atteint
 * jamais cette ligne**. Sur une base partagée, les rebuts s'accumulent à chaque
 * run raté — et une liste polluée finit par fausser les tests suivants (un
 * roster de validateurs qui déborde, un sélecteur de projet qui matche deux
 * lignes). D'où ce filet en teardown, qui tourne quoi qu'il arrive.
 *
 * Les motifs sont volontairement étroits et sans ambiguïté : `e2e-*` pour les
 * slugs de projets, `@skilluv.test` pour les emails. Aucune donnée réelle ne
 * peut y correspondre.
 */
export default async function globalTeardown() {
	const url = process.env.DATABASE_URL;
	if (!url) return;

	const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
	try {
		await client.connect();
	} catch {
		// Pas de base joignable (run `public` seul, tunnel fermé) : rien à purger.
		return;
	}

	try {
		// Ordre imposé par les clés étrangères : slices → projets, puis users.
		const slices = await client.query(
			`DELETE FROM project_slices
			  WHERE project_id IN (SELECT id FROM projects WHERE slug LIKE 'e2e-%')`
		);
		const projects = await client.query(`DELETE FROM projects WHERE slug LIKE 'e2e-%'`);

		// Tous les FK vers `users` ne cascadent pas — `challenge_templates.created_by`
		// bloque, par exemple. Un DELETE global échouerait donc en bloc à cause
		// d'une poignée de lignes : on supprime utilisateur par utilisateur et on
		// signale ce qui résiste, plutôt que de tout abandonner ou de masquer
		// l'échec.
		const { rows: candidates } = await client.query<{ id: string }>(
			`SELECT id FROM users WHERE email LIKE '%@skilluv.test' AND email <> $1`,
			[ADMIN_EMAIL]
		);
		let deleted = 0;
		const blocked: string[] = [];
		for (const { id } of candidates) {
			try {
				await client.query('DELETE FROM users WHERE id = $1', [id]);
				deleted += 1;
			} catch (e) {
				await client.query('ROLLBACK').catch(() => {});
				blocked.push((e as { constraint?: string }).constraint ?? 'contrainte inconnue');
			}
		}

		const total = (slices.rowCount ?? 0) + (projects.rowCount ?? 0) + deleted;
		if (total > 0) {
			console.log(
				`[global-teardown] fixtures purgées — ${projects.rowCount} projet(s), ` +
					`${slices.rowCount} slice(s), ${deleted} utilisateur(s)`
			);
		}
		if (blocked.length) {
			const byConstraint = [...new Set(blocked)].join(', ');
			console.warn(
				`[global-teardown] ${blocked.length} utilisateur(s) non supprimable(s) — ` +
					`référencés par : ${byConstraint}. Ils resteront en base.`
			);
		}
	} finally {
		await client.end();
	}
}
