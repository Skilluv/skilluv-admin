/**
 * ADM-M4 — smoke tests for enterprises admin API wrappers.
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

describe('adminApi enterprises (ADM-M4)', () => {
	it('listAdminEnterprises GETs /admin/enterprises with filters', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.listAdminEnterprises({
			type: 'staffing_agency',
			verified: true,
			page: 2,
			per_page: 50
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(
			'/api/admin/enterprises?type=staffing_agency&verified=true&page=2&per_page=50'
		);
	});

	it('patchEnterpriseType PATCHes /admin/enterprises/{id}/type with body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { enterprise: { id: 'e1', enterprise_type: 'staffing_agency', type_config: {} } }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.patchEnterpriseType('e1', {
			enterprise_type: 'staffing_agency',
			reason: 'conversion validated'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/enterprises/e1/type');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body)).toEqual({
			enterprise_type: 'staffing_agency',
			reason: 'conversion validated'
		});
	});

	it('patchEnterpriseType with dryRun appends ?dry_run=true', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { enterprise: { id: 'e1', enterprise_type: 'direct_hire', type_config: {} } }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.patchEnterpriseType(
			'e1',
			{ enterprise_type: 'remote_international', reason: 'preview' },
			true
		);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/enterprises/e1/type?dry_run=true');
	});

	it('getEnterpriseTypeConfig GETs /admin/enterprises/{id}/type-config', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { enterprise_type: 'staffing_agency', type_config: { commission_rate: 0.15 } }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.getEnterpriseTypeConfig('e1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/enterprises/e1/type-config');
		expect(res.data.enterprise_type).toBe('staffing_agency');
		expect(res.data.type_config).toEqual({ commission_rate: 0.15 });
	});

	it('listEnterpriseAgencyClients GETs /admin/enterprises/{id}/agency-clients', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { clients: [] }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.listEnterpriseAgencyClients('e1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/enterprises/e1/agency-clients');
		expect(res.data.clients).toEqual([]);
	});
});
