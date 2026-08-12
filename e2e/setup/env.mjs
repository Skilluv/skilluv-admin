import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '..', '.env');

/**
 * Charge `.env` dans `process.env` sans écraser ce qui est déjà défini.
 *
 * `vite.config.ts` le fait déjà pour le serveur de dev, mais la suite E2E a
 * trois autres points d'entrée qui tournent hors de Vite — `playwright.config`
 * (et donc `global-setup` + `e2e/setup/db.ts`), `preflight.mjs` et
 * `bootstrap-admin.mjs`. Sans ce chargement, chacun retombait silencieusement
 * sur `localhost:3001` / `localhost:5433` alors que `.env` pointe ailleurs, et
 * l'échec (`ECONNREFUSED`) ne disait pas pourquoi.
 *
 * Les variables déjà présentes dans l'environnement gagnent, pour qu'un
 * `BACKEND_URL=… npm run test:e2e` ponctuel reste possible.
 */
export function loadDotEnv() {
	if (!existsSync(ENV_PATH)) return;
	for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
		const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (m && process.env[m[1]] === undefined) {
			process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
		}
	}
}
