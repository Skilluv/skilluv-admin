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

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

function hostOf(url) {
	try {
		return new URL(url).hostname.replace(/^\[|\]$/g, '');
	} catch {
		return null;
	}
}

/**
 * Refuse une suite E2E dont l'API et la base ne sont pas au même endroit.
 *
 * `BACKEND_URL` dit à qui la suite parle ; `DATABASE_URL` dit où elle sème et
 * où elle vérifie. Les deux doivent désigner le même environnement, sinon la
 * suite lit une base et pilote une autre application — c'est la panne décrite
 * en SKI-365, où la CI a piloté la production pendant trois semaines pendant
 * que ses fixtures atterrissaient dans la base du job.
 *
 * Le cas dangereux n'est pas l'échec des tests, c'est ce qui le précède :
 * `bootstrap-admin.mjs` **inscrit un compte** via `BACKEND_URL` avant de
 * l'élever via `DATABASE_URL`. Une API distante avec une base locale crée
 * donc un vrai compte là-bas, puis échoue à l'élever ici.
 *
 * Viser une API distante est légitime — pour regarder l'admin avec de vraies
 * données, par exemple. Ce garde ne l'interdit pas : il interdit de le faire
 * *à moitié*, et il ne se déclenche que dans les points d'entrée de la suite
 * E2E, jamais dans le serveur de dev.
 */
export function assertConsistentTargets(context) {
	const backend = process.env.BACKEND_URL || 'http://localhost:3001';
	const db = process.env.DATABASE_URL || 'postgres://skilluv:skilluv_secret@localhost:5433/skilluv';

	const backendHost = hostOf(backend);
	const dbHost = hostOf(db);
	if (!backendHost || !dbHost) return;

	const backendLocal = LOCAL_HOSTS.has(backendHost);
	const dbLocal = LOCAL_HOSTS.has(dbHost);
	if (backendLocal === dbLocal) return;

	throw new Error(
		`${context} : l'API et la base ne sont pas au même endroit.
` +
			`  BACKEND_URL  -> ${backendHost} (${backendLocal ? 'local' : 'distant'})
` +
			`  DATABASE_URL -> ${dbHost} (${dbLocal ? 'local' : 'distant'})
` +
			`La suite sèmerait ses données d'un côté et piloterait l'application de ` +
			`l'autre. Pire, le bootstrap inscrirait un compte sur ${backendHost}.
` +
			`Alignez les deux dans .env — les deux en local pour la suite E2E.`
	);
}
