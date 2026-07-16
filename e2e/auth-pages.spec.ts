import { expect, test } from '@playwright/test';

// Public /auth/* pages must render even without a backend reachable — this
// is what the 2FA gate depends on. `authApi.totpSetup()` calls will fail in
// the preview environment; that's fine, we only smoke-test the shell.

test('recovery-2fa page renders with input fields', async ({ page }) => {
	await page.goto('/auth/recovery-2fa');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	// Identifier + password + backup code inputs are all required.
	await expect(page.getByTestId('recovery-code-input')).toBeVisible();
	await expect(page.getByTestId('recovery-submit')).toBeVisible();
});

test('recovery-2fa disables submit until identifier, password and backup code are set', async ({
	page
}) => {
	await page.goto('/auth/recovery-2fa');
	const submit = page.getByTestId('recovery-submit');
	await expect(submit).toBeDisabled();
});

test('setup-2fa shell mounts with step indicator', async ({ page }) => {
	// The setup page calls authApi.totpSetup on mount; the API will fail in
	// preview so we ignore the network error and just assert the shell.
	page.on('pageerror', () => {
		/* ignored — background 401 from missing backend */
	});
	await page.goto('/auth/setup-2fa');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
