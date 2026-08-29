/**
 * Data line — client contract.
 *
 * The interesting assertions here are about consent, because that is what
 * this line sells and what it can get wrong. Two in particular: the purpose
 * travels with a delivery rather than being inferred, and no call in this
 * module writes consent on somebody's behalf.
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

describe('dataApi — cohorts', () => {
	it('GETs the cohort sizes and their floor', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					cohorts: [{ purpose: 'research_licensing', people: 12, publishable: false }],
					floor: 30
				},
				meta: {}
			})
		);
		const { dataApi } = await import('./data');
		const res = await dataApi.cohorts();
		expect(lastUrl()).toBe('/api/admin/data/cohorts');
		// The server decides publishability rather than the screen comparing
		// against a copied constant: one number, written once.
		expect(res.data.cohorts[0].publishable).toBe(false);
		expect(res.data.floor).toBe(30);
	});
});

describe('dataApi — reports', () => {
	it('GETs the commissioned reports', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { reports: [] }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.reports();
		expect(lastUrl()).toBe('/api/admin/data/reports');
	});

	it('POSTs a commission with the fee as a string', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { report: { id: 'r1' } }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.commissionReport({
			client_type: 'development_bank',
			client_org: 'AfDB',
			title: 'Skills in three markets',
			scope_md: 'three countries, two trades',
			fee: '18000.00',
			currency: 'EUR'
		});
		expect(lastUrl()).toBe('/api/admin/data/reports');
		const body = lastBody() as Record<string, string>;
		expect(body.fee).toBe('18000.00');
	});

	it('names the consent a delivery rests on', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revenue_booked: '18000.00' }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.deliverReport('r1', 'https://docs.example/report.pdf', 'research_licensing');
		expect(lastUrl()).toBe('/api/admin/data/reports/r1/deliver');
		// The purpose is sent, not inferred. A report drawn from research
		// consent and one drawn from commercial consent are different datasets
		// with different people in them, and only the caller knows which.
		expect(lastBody()).toEqual({
			document_url: 'https://docs.example/report.pdf',
			purpose: 'research_licensing'
		});
	});
});

describe('dataApi — licences', () => {
	it('GETs the licence contracts', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { licences: [] }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.licences();
		expect(lastUrl()).toBe('/api/admin/data/licences');
	});

	it('POSTs a licence with bare days for the term', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { licence: { id: 'l1' } }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.openLicence({
			licensee_org: 'Institut X',
			licensee_type: 'research_lab',
			purpose: 'research_licensing',
			contract_purpose_md: 'a longitudinal study',
			starts_on: '2026-09-01',
			total_fee: '9000.00',
			talents_share_percent: '40'
		});
		const body = lastBody() as Record<string, string>;
		expect(body.starts_on).toBe('2026-09-01');
		// The share is what the people in the dataset get. Sent as a string
		// like every other figure that has to add up.
		expect(body.talents_share_percent).toBe('40');
	});

	it('POSTs a settlement and reads back what it paid', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { people_paid: 214, amount_each: '16.82' }, meta: {} })
		);
		const { dataApi } = await import('./data');
		const res = await dataApi.settleLicence('l1', '2026-07-01', '2026-09-30');
		expect(lastUrl()).toBe('/api/admin/data/licences/l1/settle');
		expect(lastBody()).toEqual({ period_start: '2026-07-01', period_end: '2026-09-30' });
		expect(res.data.people_paid).toBe(214);
		expect(res.data.amount_each).toBe('16.82');
	});
});

describe('dataApi — white-label deployments', () => {
	it('GETs the deployments', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { deployments: [] }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.deployments();
		expect(lastUrl()).toBe('/api/admin/data/deployments');
	});

	it('POSTs a provision with its recognition scope as a list', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { deployment: { id: 'd1' } }, meta: {} }));
		const { dataApi } = await import('./data');
		await dataApi.provisionDeployment({
			partner_org: 'Universite Y',
			partner_type: 'university',
			deployment_host: 'skills.univ-y.edu',
			official_recognition_scope: ['diploma_supplement']
		});
		expect(lastUrl()).toBe('/api/admin/data/deployments');
		const body = lastBody() as Record<string, unknown>;
		expect(body.official_recognition_scope).toEqual(['diploma_supplement']);
	});

	it('POSTs go-live and reads the booked setup fee', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { setup_fee_booked: '4500.00' }, meta: {} }));
		const { dataApi } = await import('./data');
		const res = await dataApi.goLive('d1');
		expect(lastUrl()).toBe('/api/admin/data/deployments/d1/go-live');
		expect(res.data.setup_fee_booked).toBe('4500.00');
	});
});

describe('the data vocabulary', () => {
	it('lists the four consent purposes', async () => {
		const { DATA_PURPOSES } = await import('./data');
		expect(DATA_PURPOSES).toEqual([
			'public_score_api',
			'research_licensing',
			'commercial_licensing',
			'identity_aggregation'
		]);
	});

	it('lists the six licensee types and the five partner types', async () => {
		const { DATA_LICENSEE_TYPES, DATA_PARTNER_TYPES } = await import('./data');
		expect(DATA_LICENSEE_TYPES).toHaveLength(6);
		expect(DATA_PARTNER_TYPES).toHaveLength(5);
		expect(DATA_PARTNER_TYPES).toContain('government');
	});

	it('exposes no way to grant consent on somebody else behalf', async () => {
		const mod = await import('./data');
		// Not a style preference. Everything this line sells describes people
		// who are not the customer, and their own revocable agreement is the
		// only thing between them and a dataset. The backend has no such route
		// and this client must not grow one by accident.
		const names = Object.keys(mod.dataApi);
		expect(names.some((n) => /consent/i.test(n))).toBe(false);
	});
});
