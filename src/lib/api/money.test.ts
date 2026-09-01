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
	return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('moneyApi reads', () => {
	it('GETs the overview', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { paid_but_undelivered: 0 } }));
		const { moneyApi } = await import('./money');
		await moneyApi.overview();
		expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/money/overview');
	});

	it('passes the undelivered filter through as a query parameter', async () => {
		// The one query an operator runs first: money taken, nothing given.
		fetchMock.mockResolvedValueOnce(okJson({ data: { payments: [] } }));
		const { moneyApi } = await import('./money');
		await moneyApi.payments({ undelivered: true });
		expect(String(fetchMock.mock.calls[0][0])).toContain('undelivered=true');
	});

	it('GETs payouts, routes and methods on their own endpoints', async () => {
		fetchMock.mockResolvedValue(okJson({ data: { payouts: [], routes: [], methods: [] } }));
		const { moneyApi } = await import('./money');
		await moneyApi.payouts();
		await moneyApi.routes();
		await moneyApi.methods();
		expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/money/payouts');
		expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/money/routes');
		expect(fetchMock.mock.calls[2][0]).toBe('/api/admin/money/methods');
	});
});

describe('moneyApi toggles', () => {
	it('sends the direction with a route toggle', async () => {
		// The two route tables have separate id spaces. Without the direction
		// the server would eventually close the wrong corridor.
		fetchMock.mockResolvedValueOnce(okJson({ data: { enabled: false } }));
		const { moneyApi } = await import('./money');
		await moneyApi.toggleRoute('r1', false, 'out');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/money/routes/r1/toggle');
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ enabled: false, direction: 'out' }));
	});

	it('toggles a method without a direction', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { enabled: true } }));
		const { moneyApi } = await import('./money');
		await moneyApi.toggleMethod('m1', true);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/money/methods/m1/toggle');
		expect(init.body).toBe(JSON.stringify({ enabled: true }));
	});
});

describe('disputeQueueApi', () => {
	it('lists only what is waiting on a person', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { disputes: [] } }));
		const { disputeQueueApi } = await import('./money');
		await disputeQueueApi.list();
		expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/disputes');
	});

	it('sends the outcome and the note both sides will read', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { status: 'refunded' } }));
		const { disputeQueueApi } = await import('./money');
		await disputeQueueApi.decide('d1', 'payer', 'no session took place');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/disputes/d1/decide');
		expect(init.body).toBe(
			JSON.stringify({ in_favour_of: 'payer', note: 'no session took place' })
		);
	});
});

describe('emailPreviewApi', () => {
	it('GETs the index of previewable kinds', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { kinds: [], locales: [], themes: [] } }));
		const { emailPreviewApi } = await import('./money');
		await emailPreviewApi.index();
		expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/email-preview/index');
	});

	it('builds a preview URL rather than fetching it', async () => {
		// The response is a whole HTML document; it belongs in an iframe, not
		// in a variable.
		const { emailPreviewApi } = await import('./money');
		const url = emailPreviewApi.url('payout.sent', 'fr', 'forge');
		expect(url).toBe('/api/admin/email-preview?kind=payout.sent&locale=fr&theme=forge');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('escapes a kind that would otherwise break the query string', async () => {
		const { emailPreviewApi } = await import('./money');
		expect(emailPreviewApi.url('a&b', 'fr', 'forge')).toContain('kind=a%26b');
	});
});
