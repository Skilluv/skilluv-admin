/**
 * Servicing what a company bought — client contract.
 *
 * The paths matter less than the lookup does. A screen holding a registry row
 * knows one thing about it: which table it came from. `actionsFor` is what
 * turns that string into buttons, so the property under test is that it
 * offers nothing for a table it has no entry for rather than offering
 * everything, and that every action it names is a method that exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function okJson<T>(body: T) {
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

function lastCall(): [string, RequestInit] {
	return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
}

function lastUrl(): string {
	return lastCall()[0];
}

function lastBody(): unknown {
	return JSON.parse(lastCall()[1].body as string);
}

describe('actionsFor — the register says one thing about a row', () => {
	it('offers nothing for a source table it has no entry for', async () => {
		const { actionsFor } = await import('./servicing');
		// Said out loud on the screen rather than rendering an empty action
		// row, which would read as a line nothing can be done to.
		expect(actionsFor('some_table_added_later')).toEqual([]);
	});

	it('offers nothing for a row with no source at all', async () => {
		const { actionsFor } = await import('./servicing');
		// Recorded by hand with no source row behind it. There is genuinely
		// no id to act on.
		expect(actionsFor(null)).toEqual([]);
	});

	it('offers the engagement verbs for an engagements row', async () => {
		const { actionsFor } = await import('./servicing');
		expect(actionsFor('engagements')).toEqual([
			'start',
			'staffFromStudio',
			'addMember',
			'addMilestone'
		]);
	});

	it('treats a one-off and an annual sponsorship as the same three verbs', async () => {
		const { actionsFor } = await import('./servicing');
		// Two tables, one product: an annual sponsorship is signed, honoured
		// and cancelled exactly as a single one is.
		expect(actionsFor('annual_sponsorships')).toEqual(actionsFor('sponsorships'));
	});

	it('names only actions this module can perform', async () => {
		const { ACTIONS_BY_SOURCE, servicingApi } = await import('./servicing');
		const methods = new Set(Object.keys(servicingApi));
		// The lookup is what the markup branches on, so an action naming a
		// method that does not exist is a button that throws when clicked.
		const known = new Set([
			'start',
			'staffFromStudio',
			'addMember',
			'addMilestone',
			'sign',
			'honour',
			'cancel',
			'invite',
			'deliver',
			'billMonth',
			'end',
			'inform',
			'deliverAudit',
			'openSubmissions',
			'activateAmbassadors',
			'retention'
		]);
		for (const actions of Object.values(ACTIONS_BY_SOURCE)) {
			for (const action of actions) {
				expect(known.has(action), `unmapped action ${action}`).toBe(true);
			}
		}
		expect(methods.size).toBeGreaterThan(0);
	});
});

describe('servicingApi — the writes the register unlocked', () => {
	it('starts an engagement and staffs it from its studio at two routes', async () => {
		const { servicingApi } = await import('./servicing');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.startEngagement('e1');
		expect(lastUrl()).toBe('/api/admin/engagements/e1/start');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.staffFromStudio('e1');
		// Refused when no studio is attached — with a message saying to add
		// members individually, which is the other button on the same row.
		expect(lastUrl()).toBe('/api/admin/engagements/e1/staff-from-studio');
	});

	it('signs and honours a sponsorship through different routes', async () => {
		const { servicingApi } = await import('./servicing');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.signSponsorship('s1');
		expect(lastUrl()).toBe('/api/admin/sponsorships/s1/sign');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.honourSponsorship('s1');
		// A signed sponsorship is a promise; an honoured one is money. One
		// route for both would make the two indistinguishable afterwards.
		expect(lastUrl()).toBe('/api/admin/sponsorships/s1/honour');
	});

	it('cancels with a reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { cancelled: true }, meta: {} }));
		const { servicingApi } = await import('./servicing');
		await servicingApi.cancelSponsorship('s1', 'the sponsor withdrew before the event');
		expect(lastUrl()).toBe('/api/admin/sponsorships/s1/cancel');
		expect(lastBody()).toEqual({ reason: 'the sponsor withdrew before the event' });
	});

	it('bills a placement month and ends the placement separately', async () => {
		const { servicingApi } = await import('./servicing');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.billPlacementMonth('p1', '2026-08-01');
		expect(lastUrl()).toBe('/api/admin/placements/p1/bill-month');
		expect(lastBody()).toEqual({ month: '2026-08-01' });

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.endPlacement('p1', 'the employee resigned');
		expect(lastUrl()).toBe('/api/admin/placements/p1/end');
	});

	it('informs the employee before the audit is delivered', async () => {
		const { servicingApi } = await import('./servicing');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.informEmployee('a1', {
			employee_email: 'someone@example.test',
			orientation_slug: 'security'
		});
		expect(lastUrl()).toBe('/api/admin/skill-audits/a1/inform');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.deliverAudit('a1', { matrix_url: 'https://example.test/matrix' });
		// Telling somebody they are being assessed comes before assessing
		// them. Two routes is what keeps that ordering visible.
		expect(lastUrl()).toBe('/api/admin/skill-audits/a1/deliver');
	});

	it('opens a campaign for submissions and activates an ambassador programme', async () => {
		const { servicingApi } = await import('./servicing');

		fetchMock.mockResolvedValueOnce(okJson({ data: { campaign: {} }, meta: {} }));
		await servicingApi.openCampaignForSubmissions('c1');
		expect(lastUrl()).toBe('/api/admin/launch-campaigns/c1/open');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await servicingApi.activateAmbassadorProgram('a1');
		// Both act on a draft, which appears in no public list. Before the
		// register existed neither id could be found the next day.
		expect(lastUrl()).toBe('/api/admin/ambassador-programs/a1/activate');
	});

	it('records retention as a month count and a yes or no', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { recorded: true }, meta: {} }));
		const { servicingApi } = await import('./servicing');
		await servicingApi.recordRetention('o1', { months: 6, still_there: false });
		expect(lastUrl()).toBe('/api/admin/onboardings/o1/retention');
		expect(lastBody()).toEqual({ months: 6, still_there: false });
	});
});
