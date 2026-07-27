import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentCode } from './setup/totp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = resolve(HERE, 'setup/admin-credentials.json');

// Phase 2 — end-to-end login through the UI *with* 2FA. The nav-smoke suite
// reuses a storageState so it never exercises the login form; this spec is the
// safeguard proving the login form + TOTP challenge actually work together.

test.use({ storageState: { cookies: [], origins: [] } });

test('admin logs in through the UI with 2FA and reaches the dashboard', async ({ page }) => {
	test.skip(!existsSync(CREDS_PATH), 'e2e/setup/admin-credentials.json missing — run bootstrap');
	const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));

	page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()));
	page.on('response', (r) => {
		if (r.url().includes('/api/auth/login')) {
			console.log(`[login POST] ${r.status()} ${r.url()}`);
		}
	});

	await page.goto('/auth/login', { waitUntil: 'networkidle' });
	// Ensure Svelte has hydrated by asserting a client-only interactive attribute
	// (submit button becomes reactive to `loading` state). Force-clicking too
	// early on a Svelte 5 dev page silently no-ops because the onsubmit handler
	// isn't attached yet.
	const signIn = page.locator('form button[type="submit"]');
	await expect(signIn).toBeEnabled();
	await page.getByRole('textbox', { name: /email|pseudo|username/i }).fill(creds.email);
	await page.locator('input[type="password"]').fill(creds.password);
	const firstLogin = page.waitForResponse((r) => r.url().includes('/api/auth/login'));
	// Press Enter inside the password field — form-level submission is a more
	// reliable trigger than a click when Svelte hydration timing is uncertain.
	await page.locator('input[type="password"]').press('Enter');
	await firstLogin;

	const totpField = page.getByRole('textbox', { name: /totp/i });
	await totpField.waitFor({ state: 'visible', timeout: 5_000 });
	await totpField.fill(currentCode(creds.totp_secret_base32));
	const secondLogin = page.waitForResponse((r) => r.url().includes('/api/auth/login'));
	await totpField.press('Enter');
	await secondLogin;

	await page.waitForURL((url) => !/\/auth\//.test(url.pathname), { timeout: 10_000 });
	await expect(page.getByRole('navigation').first()).toBeVisible();
});
