/**
 * ADM-M3 — smoke tests for orientations + badge_rules admin API wrappers.
 * Ensures each method hits the right URL + method + body shape (no live back).
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

describe('adminApi orientations catalog (ADM-M3.1)', () => {
	it('createOrientation POSTs to /admin/orientations with body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { orientation: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.createOrientation({
			slug: 'dev-x',
			name: 'Dev X',
			primary_domain: 'code',
			tags: ['web']
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/orientations');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({
			slug: 'dev-x',
			name: 'Dev X',
			primary_domain: 'code',
			tags: ['web']
		});
	});

	it('patchOrientation without dry_run PATCHes /admin/orientations/{slug}', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { orientation: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.patchOrientation('dev-frontend', { name: 'FE Ninja' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/orientations/dev-frontend');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body)).toEqual({ name: 'FE Ninja' });
	});

	it('patchOrientation with dry_run appends ?dry_run=true', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { orientation: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.patchOrientation('dev-frontend', { is_archived: true }, true);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/orientations/dev-frontend?dry_run=true');
	});

	it('attachOrientationSkill POSTs to /admin/orientations/{slug}/skills', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { attached: true, orientation_slug: 'dev-frontend', skill_id: 'x' }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.attachOrientationSkill('dev-frontend', {
			skill_id: '00000000-0000-0000-0000-000000000001',
			is_core: true,
			weight: 2.0
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/orientations/dev-frontend/skills');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({
			skill_id: '00000000-0000-0000-0000-000000000001',
			is_core: true,
			weight: 2.0
		});
	});

	it('detachOrientationSkill DELETEs /admin/orientations/{slug}/skills/{skill_id}', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { detached: true }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.detachOrientationSkill('dev-frontend', 'sk-1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/orientations/dev-frontend/skills/sk-1');
		expect(init.method).toBe('DELETE');
	});

	it('listOrientationsCatalog GETs /orientations with query params', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { orientations: [], total: 0 }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.listOrientationsCatalog({
			domain: 'code',
			include_archived: true,
			limit: 50
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/orientations?domain=code&include_archived=true&limit=50');
	});
});

describe('adminApi badge rules (ADM-M3.2)', () => {
	it('createBadgeRule POSTs to /admin/badge-rules with body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { rule: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.createBadgeRule({
			slug: 'test_rule',
			output_type: 'skill_patch',
			display_name: 'Test',
			conditions: { min_count: 5 },
			rarity: 'common'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/badge-rules');
		expect(init.method).toBe('POST');
		const body = JSON.parse(init.body);
		expect(body.slug).toBe('test_rule');
		expect(body.output_type).toBe('skill_patch');
		expect(body.conditions).toEqual({ min_count: 5 });
	});

	it('patchBadgeRule with dry_run appends ?dry_run=true', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { rule: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.patchBadgeRule('test_rule', { display_name: 'New name' }, true);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/badge-rules/test_rule?dry_run=true');
		expect(init.method).toBe('PATCH');
	});

	it('deprecateBadgeRule POSTs to /admin/badge-rules/{slug}/deprecate with reason', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { deprecated: true, slug: 'test_rule' }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.deprecateBadgeRule('test_rule', 'obsolete for MVP season');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/badge-rules/test_rule/deprecate');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ reason: 'obsolete for MVP season' });
	});

	it('deprecateBadgeRule with dry_run appends query', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { deprecated: false, slug: 'test_rule' }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.deprecateBadgeRule('test_rule', 'preview count', true);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/badge-rules/test_rule/deprecate?dry_run=true');
	});

	it('listBadgeRulesCatalog GETs /badge-rules', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { rules: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.listBadgeRulesCatalog();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/badge-rules');
		expect(init?.method ?? 'GET').toBe('GET');
	});
});
