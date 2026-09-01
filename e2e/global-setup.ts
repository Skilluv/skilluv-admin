import { chromium, request as pwRequest, type FullConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentCode } from './setup/totp.mjs';
import { assertConsistentTargets } from './setup/env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = resolve(HERE, 'setup/admin-credentials.json');
export const STORAGE_STATE = resolve(HERE, 'setup/admin-storage-state.json');

// Lu à l'appel, pas à l'import : playwright.config charge .env dans son corps,
// or les imports ES sont évalués avant. Une constante de module capturerait
// la valeur d'avant chargement et retomberait sur localhost.
const backendUrl = () => process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_ORIGIN = 'http://localhost:5174';

export default async function globalSetup(_config: FullConfig) {
	// Refuse une suite qui sèmerait dans une base et piloterait une autre
	// application. Posé ici plutôt que dans un spec : le mal est déjà fait
	// quand le premier test s'exécute.
	assertConsistentTargets('suite E2E');

	// No credentials → skip the auth bootstrap instead of failing the whole run.
	// The `public` project needs no session, so it must stay runnable on a
	// machine that has no backend/DB (see qa/README.md). The `admin` project
	// will then fail fast on its missing storageState, which is the right
	// signal — but only for the specs that actually need it.
	if (!existsSync(CREDS_PATH)) {
		console.warn(
			`[global-setup] ${CREDS_PATH} not found — skipping admin login.\n` +
				`  Only the \`public\` Playwright project will run.\n` +
				`  To enable the \`admin\` project: node e2e/setup/bootstrap-admin.mjs ` +
				`(needs BACKEND_URL + DATABASE_URL).`
		);
		return;
	}
	const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));

	// 1. API login — hits the backend directly with the admin Origin so cookies
	//    are issued exactly as they would be from the real admin app.
	const api = await pwRequest.newContext({ baseURL: backendUrl(), extraHTTPHeaders: { Origin: ADMIN_ORIGIN } });
	const loginRes = await api.post('/api/auth/login', {
		data: {
			identifier: creds.email,
			password: creds.password,
			totp_code: currentCode(creds.totp_secret_base32)
		}
	});
	if (!loginRes.ok()) {
		throw new Error(`API login failed: ${loginRes.status()} ${await loginRes.text()}`);
	}
	const cookies = (await api.storageState()).cookies;
	await api.dispose();

	// 2. Rewrite the cookies to target the admin dev host (127.0.0.1:5174) so the
	//    browser will send them on subsequent /api/* calls proxied by vite.
	const browserCookies = cookies.map((c) => ({
		...c,
		domain: '127.0.0.1',
		path: '/'
	}));

	// 3. Launch a browser, inject the cookies, save storageState for reuse.
	const browser = await chromium.launch();
	const context = await browser.newContext({ baseURL: ADMIN_ORIGIN });
	await context.addCookies(browserCookies);
	await context.storageState({ path: STORAGE_STATE });
	await browser.close();
}
