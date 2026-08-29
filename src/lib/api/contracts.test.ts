/**
 * The enterprise-product register — client contract.
 *
 * What the tests hold in place: an empty optional is omitted rather than
 * sent, because on this surface an empty string is not the same as absent
 * and the backend refuses on the difference.
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

describe('contractsApi', () => {
	it('GETs the renewals with a horizon', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { renewals: [] }, meta: {} }));
		const { contractsApi } = await import('./contracts');
		await contractsApi.renewals({ within_days: 60 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/enterprise-products/renewals');
		expect(url.searchParams.get('within_days')).toBe('60');
	});

	it('GETs one company products', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { products: [] }, meta: {} }));
		const { contractsApi } = await import('./contracts');
		await contractsApi.productsOf('e1');
		expect(lastUrl()).toBe('/api/admin/enterprises/e1/products');
	});

	it('POSTs an engagement with its renewal date', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { product: { id: 'p1' } }, meta: {} }));
		const { contractsApi } = await import('./contracts');
		await contractsApi.recordProduct('e1', {
			product_type: 'annual_sponsorship',
			renews_at: '2027-01-01T00:00:00.000Z',
			contract_value: '12000.00',
			currency: 'EUR'
		});
		expect(lastUrl()).toBe('/api/admin/enterprises/e1/products');
		const body = lastBody() as Record<string, string>;
		// Without this the engagement never reaches a renewal list and lapses
		// because nobody was told to ask — which is what the backend says when
		// it refuses a recurring product with no date.
		expect(body.renews_at).toBe('2027-01-01T00:00:00.000Z');
		expect(body.contract_value).toBe('12000.00');
	});

	it('carries a reason when cancelling and none when not', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { product: {} }, meta: {} }));
		const { contractsApi } = await import('./contracts');
		await contractsApi.setStatus('p1', { status: 'cancelled', reason: 'client folded' });
		expect(lastUrl()).toBe('/api/admin/enterprise-products/p1/status');
		expect(lastBody()).toEqual({ status: 'cancelled', reason: 'client folded' });

		fetchMock.mockResolvedValueOnce(okJson({ data: { product: {} }, meta: {} }));
		await contractsApi.setStatus('p1', { status: 'completed' });
		expect(lastBody()).toEqual({ status: 'completed' });
	});

	it('grants a flag with no amount and a metered kind with one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { contractsApi } = await import('./contracts');
		await contractsApi.grantEntitlement('p1', { kind: 'priority_support' });
		expect(lastUrl()).toBe('/api/admin/enterprise-products/p1/entitlements');
		// No `granted` key at all. A flag carrying an amount is refused, and
		// an empty string would be an amount.
		expect(lastBody()).toEqual({ kind: 'priority_support' });

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await contractsApi.grantEntitlement('p1', { kind: 'search_credits', granted: '500' });
		expect(lastBody()).toEqual({ kind: 'search_credits', granted: '500' });
	});

	it('names cancelled as the one status that needs an explanation', async () => {
		const { PRODUCT_STATUSES, statusNeedsReason } = await import('./contracts');
		expect(PRODUCT_STATUSES).toEqual([
			'pending',
			'active',
			'completed',
			'cancelled',
			'lapsed'
		]);
		expect(PRODUCT_STATUSES.filter(statusNeedsReason)).toEqual(['cancelled']);
	});
});
