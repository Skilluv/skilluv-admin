/**
 * P26 v2 — admin wrappers for the challenge workflow (SKI-98 / SKI-99 /
 * SKI-100). These pin the request shape, which is the part the backend
 * contract cares about: path, verb, and query serialisation.
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

describe('adminApi project challenge config (SKI-110)', () => {
	it('sends the five P26 fields on create', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { id: 'p1', slug: 'sqlx' }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.createAdminProject({
			slug: 'sqlx',
			name: 'sqlx',
			owner_type: 'user',
			owner_id: 'u1',
			github_repo_owner: 'launchbadge',
			github_repo_name: 'sqlx',
			curated_labels: ['skilluv-challenge'],
			slice_ingestion_mode: 'curator_review',
			skill_domains: ['code']
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/projects');
		expect(init.method).toBe('POST');
		const body = JSON.parse(init.body as string);
		expect(body.github_repo_owner).toBe('launchbadge');
		expect(body.github_repo_name).toBe('sqlx');
		expect(body.curated_labels).toEqual(['skilluv-challenge']);
		expect(body.slice_ingestion_mode).toBe('curator_review');
		expect(body.skill_domains).toEqual(['code']);
	});

	it('patches the ingestion mode alone', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { slug: 'sqlx', updated: true }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.patchAdminProject('sqlx', { slice_ingestion_mode: 'auto' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/projects/sqlx');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body as string)).toEqual({ slice_ingestion_mode: 'auto' });
	});
});

describe('adminApi.getProjectChallengeStats (SKI-124)', () => {
	it('GETs the stats endpoint with the window', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					window_days: 30,
					slices: { open: 3, validated: 1 },
					avg_time_to_submit_hours: 12.5,
					avg_time_to_validate_hours: null,
					avg_time_to_merge_hours: null,
					validated_to_merged_ratio: 0,
					domain_source_distribution: { label: 2, project_default: 2 }
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.getProjectChallengeStats('sqlx', 30);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/projects/sqlx/stats?window_days=30');
		expect(res.data.window_days).toBe(30);
	});

	it('defaults the window to 90 days', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.getProjectChallengeStats('sqlx');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/projects/sqlx/stats?window_days=90');
	});
});

describe('adminApi.triggerProjectIngest (SKI-110)', () => {
	it('POSTs the ingest trigger and returns the report', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					issues_seen: 12,
					slices_created: 3,
					slices_skipped_existing: 9,
					mode: 'curator_review',
					labels_matched: ['skilluv-challenge']
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.triggerProjectIngest('skilluv-backend');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/projects/skilluv-backend/ingest');
		expect(init.method).toBe('POST');
		// No body: the slug in the path is the whole input.
		expect(init.body).toBeUndefined();
		expect(res.data.slices_created).toBe(3);
	});
});

describe('adminApi slice config (SKI-106)', () => {
	it('reads a slice from the public detail endpoint', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { slice: { id: 's1', title: 'Fix flaky test' } }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.getSlice('s1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/slices/s1');
		expect(res.data.slice.id).toBe('s1');
	});

	it('PATCHes the override, using null to clear a field', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { slice: { id: 's1' } }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.patchSliceConfig('s1', {
			required_orientation_slugs: null,
			min_rank: 'artisan',
			note: 'sensibilité surestimée par les labels'
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/slices/s1/config');
		expect(init.method).toBe('PATCH');
		const body = JSON.parse(init.body as string);
		expect(body.required_orientation_slugs).toBeNull();
		expect(body.min_rank).toBe('artisan');
	});

	it('lists open slices filtered by project', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], pagination: { total: 0 }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.listOpenSlices({ project_id: 'p1', per_page: 50 });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/slices?project_id=p1&per_page=50');
	});
});

describe('adminApi validator corps (SKI-81 / SKI-82 / SKI-107)', () => {
	it('lists applications with the filters as query params', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], pagination: { total: 0 }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.listValidatorApplications({
			status: 'pending',
			domain: 'code',
			page: 2,
			per_page: 25
		});
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe(
			'/api/admin/validator-applications?status=pending&domain=code&page=2&per_page=25'
		);
	});

	it('omits unset filters rather than sending empty values', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], pagination: { total: 0 }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.listValidatorApplications({ origin: 'invitation' });
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validator-applications?origin=invitation');
	});

	it('POSTs an approval with no body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { application: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.approveValidatorApplication('a1');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validator-applications/a1/approve');
		expect(init.method).toBe('POST');
	});

	it('POSTs a rejection with the reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { application: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.rejectValidatorApplication('a1', 'pas assez de PRs sur le domaine');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validator-applications/a1/reject');
		expect(JSON.parse(init.body as string)).toEqual({
			reason: 'pas assez de PRs sur le domaine'
		});
	});

	it('POSTs an invitation', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { application: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.inviteValidator({ user_id: 'u1', domain: 'security', notes: 'ex-pentester' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validators/invite');
		expect(JSON.parse(init.body as string)).toEqual({
			user_id: 'u1',
			domain: 'security',
			notes: 'ex-pentester'
		});
	});

	it('percent-encodes the colon when revoking a validator capability', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revoked: true }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.revokeCapability('u1', 'challenge_validator:code');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/capabilities/challenge_validator%3Acode');
		expect(init.method).toBe('DELETE');
	});

	it('leaves colon-free capability slugs untouched', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revoked: true }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.revokeCapability('u1', 'mentor');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/capabilities/mentor');
	});
});

describe('adminApi validation analytics (SKI-108)', () => {
	it('GETs per-validator stats', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { window_days: 30, validators: [] }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.listValidatorStats(30);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validators/stats?window_days=30');
	});

	it('GETs the collusion matrix with both thresholds', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					window_days: 90,
					min_count: 5,
					flag_ratio_threshold: 0.5,
					note: 'Phase 1 dogfooding',
					matrix: []
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.getValidatorCollusionMatrix(90, 5);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/validators/collusion-matrix?window_days=90&min_count=5');
	});
});
