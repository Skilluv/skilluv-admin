import { test, expect } from '@playwright/test';
import {
	cleanupSecurityFinding,
	cleanupUser,
	countFindingEvents,
	readSecurityFinding,
	seedSecurityFinding,
	seedUser
} from '../setup/db';

// SKI-127 / SKI-120 — triage a reported vulnerability.
//
// The two things worth asserting end-to-end are the two the unit tests
// cannot reach: that the queue's filters survive a reload through the URL,
// and that a transition taken from the detail screen actually moves the row
// and leaves an audit event behind.
//
// The e2e admin holds `role = 'admin'`, which the backend accepts as the
// strongest actor here — so every transition in the state machine is
// available to it, publication included.

test('the queue filters live in the URL and survive a reload', async ({ page }) => {
	const reporter = await seedUser({ prefix: 'secrep' });
	const finding = await seedSecurityFinding({
		reporterId: reporter.id,
		severity: 'critical',
		status: 'submitted'
	});

	try {
		const firstLoad = page.waitForResponse(
			(r) =>
				r.url().includes('/api/admin/security/findings') && r.request().method() === 'GET'
		);
		await page.goto('/security?status=submitted&severity=critical');
		const res = await firstLoad;
		expect(res.status(), 'queue GET').toBeLessThan(300);

		// The filters were read from the URL, not defaulted.
		expect(res.url()).toContain('status=submitted');
		expect(res.url()).toContain('severity=critical');

		await expect(page.getByText(finding.title, { exact: false })).toBeVisible({
			timeout: 10_000
		});

		// A reload asks for the same thing: the filter is shareable, which is
		// the point of putting it in the URL.
		const secondLoad = page.waitForResponse(
			(r) =>
				r.url().includes('/api/admin/security/findings') &&
				r.url().includes('severity=critical')
		);
		await page.reload();
		await secondLoad;
		await expect(page.getByText(finding.title, { exact: false })).toBeVisible();
	} finally {
		await cleanupSecurityFinding(finding.id);
		await cleanupUser(reporter.id);
	}
});

test('an admin triages a finding from its detail screen', async ({ page }) => {
	const reporter = await seedUser({ prefix: 'secrep' });
	const finding = await seedSecurityFinding({
		reporterId: reporter.id,
		severity: 'medium',
		status: 'submitted'
	});

	try {
		const detailLoad = page.waitForResponse(
			(r) =>
				r.url().includes(`/api/admin/security/findings/${finding.id}`) &&
				r.request().method() === 'GET'
		);
		await page.goto(`/security/findings/${finding.id}`);
		expect((await detailLoad).status(), 'detail GET').toBeLessThan(300);

		await expect(page.getByRole('heading', { name: finding.title })).toBeVisible({
			timeout: 10_000
		});

		// Open the transition dialog. `submitted` offers triaged first.
		await page.getByRole('button', { name: /^déplacer$|^move$|^نقل$/i }).first().click();

		// The dialog's submit carried the same label as the button that opens
		// it, so this used to reach for `.last()` and hope. Disambiguating by
		// position means the test silently clicks the wrong thing the day the
		// DOM order shifts — and a click that lands nowhere useful surfaces
		// thirty seconds later as a bare "Test timeout", naming nothing. The
		// submit has a testid now.
		//
		// Asserting the dialog is up before submitting is the other half: if
		// it never opened, the failure says so instead of blaming the POST.
		const dialog = page.getByRole('dialog');
		await expect(dialog, 'the move dialog opened').toBeVisible({ timeout: 10_000 });

		const transition = page.waitForResponse(
			(r) => r.url().endsWith('/transition') && r.request().method() === 'POST'
		);
		await page.getByTestId('transition-submit').click();
		expect((await transition).status(), 'transition POST').toBeLessThan(300);

		const after = await readSecurityFinding(finding.id);
		expect(after?.status, 'the finding moved').toBe('triaged');
		expect(after?.triaged_at, 'a triage names when it happened').not.toBeNull();

		// Every decision leaves a trail. That is the property the whole
		// disclosure programme is judged on when somebody asks later.
		expect(await countFindingEvents(finding.id)).toBeGreaterThan(0);
	} finally {
		await cleanupSecurityFinding(finding.id);
		await cleanupUser(reporter.id);
	}
});
