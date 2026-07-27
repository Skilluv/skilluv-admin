import { chromium, request as pwRequest, type FullConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentCode } from './setup/totp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = resolve(HERE, 'setup/admin-credentials.json');
export const STORAGE_STATE = resolve(HERE, 'setup/admin-storage-state.json');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_ORIGIN = 'http://localhost:5174';

export default async function globalSetup(_config: FullConfig) {
	if (!existsSync(CREDS_PATH)) {
		throw new Error(
			`Missing ${CREDS_PATH}. Run: node e2e/setup/bootstrap-admin.mjs (needs backend on :3001)`
		);
	}
	const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));

	// 1. API login — hits the backend directly with the admin Origin so cookies
	//    are issued exactly as they would be from the real admin app.
	const api = await pwRequest.newContext({ baseURL: BACKEND, extraHTTPHeaders: { Origin: ADMIN_ORIGIN } });
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
