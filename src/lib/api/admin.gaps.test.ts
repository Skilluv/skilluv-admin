/**
 * Phase 6 gap-fix — GET /admin/enterprises/{id} + GET /admin/events.
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

describe('adminApi.getAdminEnterprise', () => {
	it('GETs /admin/enterprises/{id}', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					enterprise: {
						id: 'e1',
						company_name: 'Gap Corp',
						slug: 'gap-corp',
						industry: 'Fintech',
						verified: true,
						enterprise_type: 'direct_hire',
						type_config: {},
						created_at: '2026-01-01T00:00:00Z'
					}
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.getAdminEnterprise('e1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/enterprises/e1');
		expect(res.data.enterprise.slug).toBe('gap-corp');
	});
});

describe('adminApi.listBadgeEvents', () => {
	it('GETs /admin/events with query params', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: [],
				pagination: { page: 1, per_page: 30, total: 0, total_pages: 0 },
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.listBadgeEvents({
			is_active: true,
			is_partner: false,
			page: 1,
			per_page: 20
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(
			'/api/admin/events?is_active=true&is_partner=false&page=1&per_page=20'
		);
	});

	it('GETs /admin/events without params', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: [],
				pagination: { page: 1, per_page: 30, total: 0, total_pages: 0 },
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.listBadgeEvents();
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/events');
	});
});
