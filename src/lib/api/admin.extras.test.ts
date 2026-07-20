/**
 * Extras Phase 5 — badge events + recompute-cap + skills CRUD.
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

describe('adminApi.createBadgeEvent', () => {
	it('POSTs to /admin/badge-events with body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { event: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.createBadgeEvent({
			slug: 'hacktoberfest-2026',
			name: 'Hacktoberfest 2026',
			starts_at: '2026-10-01T00:00:00Z',
			ends_at: '2026-10-31T23:59:59Z',
			is_partner: false
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/badge-events');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body).slug).toBe('hacktoberfest-2026');
	});
});

describe('adminApi.recomputeUserCapabilities', () => {
	it('POSTs to /admin/users/{id}/recompute-capabilities', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { granted: [], already_active: ['challenger'] }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.recomputeUserCapabilities('u1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/recompute-capabilities');
		expect(init.method).toBe('POST');
		expect(res.data.already_active).toEqual(['challenger']);
	});
});

describe('adminApi skills CRUD', () => {
	it('listAdminSkills GETs /admin/skills with query params', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: [], pagination: { page: 1, per_page: 30, total: 0, total_pages: 0 }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.listAdminSkills({
			domain: 'code',
			q: 'react',
			is_skilluv_specific: false,
			page: 2,
			per_page: 20
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/skills?domain=code&q=react&is_skilluv_specific=false&page=2&per_page=20');
	});

	it('createSkillNode POSTs to /admin/skills with body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { skill: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.createSkillNode({
			slug: 'react-hooks',
			display_name: 'React Hooks',
			domain: 'code',
			aliases: ['useState', 'react-state-hooks']
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/skills');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body).aliases).toEqual(['useState', 'react-state-hooks']);
	});

	it('updateSkillNode PUTs to /admin/skills/{id} with body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { updated: true, id: 'sk-1' }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.updateSkillNode('sk-1', {
			display_name: 'New name',
			is_skilluv_specific: true
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/skills/sk-1');
		expect(init.method).toBe('PUT');
		expect(JSON.parse(init.body)).toEqual({
			display_name: 'New name',
			is_skilluv_specific: true
		});
	});

	it('updateSkillNode with parent_id=null clears parent', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { updated: true, id: 'sk-1' }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.updateSkillNode('sk-1', { parent_id: null });
		const [, init] = fetchMock.mock.calls[0];
		expect(JSON.parse(init.body)).toEqual({ parent_id: null });
	});
});
