/**
 * Platform levers — client contract.
 *
 * Two things worth pinning beyond the paths: the content-ops runs answer in
 * a different envelope from everything else, and a null cache-hit rate must
 * survive as null.
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

describe('platformApi — feature flags', () => {
	it('GETs the flags', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { flags: [] }, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.featureFlags();
		expect(lastUrl()).toBe('/api/admin/feature-flags');
	});

	it('upserts through one route, keyed on the key', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { flag: { key: 'x' } }, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.upsertFeatureFlag({ key: 'new_editor', enabled: false, rollout_percent: 10 });
		expect(lastUrl()).toBe('/api/admin/feature-flags');
		expect(lastBody()).toEqual({ key: 'new_editor', enabled: false, rollout_percent: 10 });
	});

	it('encodes a key on delete', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { removed: true, key: 'a/b' }, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.deleteFeatureFlag('a/b');
		expect(lastUrl()).toBe('/api/admin/feature-flags/a%2Fb');
		expect(lastCall()[1].method).toBe('DELETE');
	});
});

describe('platformApi — the content-ops envelope', () => {
	it('reads a mirror run as {ok, data}, not {data, meta}', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				ok: true,
				data: { mirrored: 3, failed: 1, skipped: 0, mirrored_ids: [], failed_details: [] }
			})
		);
		const { platformApi } = await import('./platform');
		const res = await platformApi.helloWallMirrorRun();
		expect(lastUrl()).toBe('/api/admin/hello-wall/mirror-run');
		// The older shape, kept deliberately on the backend because the admin
		// panel branches on `ok`. Typed apart so a caller cannot read one as
		// the other and silently get undefined.
		expect(res.ok).toBe(true);
		expect(res.data.mirrored).toBe(3);
	});

	it('reads a README sync the same way', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ ok: true, data: { synced: 5, failed: 0, skipped_no_readme: 2, synced_ids: [] } })
		);
		const { platformApi } = await import('./platform');
		const res = await platformApi.profileReadmeSyncRun();
		expect(lastUrl()).toBe('/api/admin/profile-readme/sync-run');
		// Skipped is not failed: a profile with no README is not an error.
		expect(res.data.skipped_no_readme).toBe(2);
		expect(res.data.failed).toBe(0);
	});

	it('reports both halves of a badge recompute', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ ok: true, data: { awarded: ['a'], revoked: ['b', 'c'], unchanged: 9 } })
		);
		const { platformApi } = await import('./platform');
		const res = await platformApi.recomputeBadgesForUser('u1');
		expect(lastUrl()).toBe('/api/admin/badges/recompute/u1');
		// A recompute that revokes is the engine doing its job. Hiding that
		// half would make "why did they lose it?" unanswerable from the screen
		// that caused it.
		expect(res.data.revoked).toHaveLength(2);
	});
});

describe('platformApi — the rest of the levers', () => {
	it('POSTs an expire-lapsed run', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { expired: 4 }, meta: {} }));
		const { platformApi } = await import('./platform');
		const res = await platformApi.expireLapsedCertifications();
		expect(lastUrl()).toBe('/api/admin/certifications/expire-lapsed');
		expect(res.data.expired).toBe(4);
	});

	it('POSTs a tag with its category', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { tag: {} }, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.createTag({ slug: 'rust', name: 'Rust', category: 'language' });
		expect(lastUrl()).toBe('/api/admin/tags');
		expect(lastBody()).toEqual({ slug: 'rust', name: 'Rust', category: 'language' });
	});

	it('POSTs a placement commission in cents', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.mentoringPlacementCommission({
			mentor_user_id: 'm1',
			mentee_user_id: 'm2',
			enterprise_id: 'e1',
			placement_amount_cents: 4500000
		});
		expect(lastUrl()).toBe('/api/admin/mentoring/placement-commission');
		// Cents, and an integer. A euro figure multiplied on the client is a
		// rounding error waiting for a salary with an odd number in it.
		expect((lastBody() as Record<string, number>).placement_amount_cents).toBe(4500000);
	});

	it('addresses project curation by slug', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { curated: true }, meta: {} }));
		const { platformApi } = await import('./platform');
		await platformApi.setProjectCurated('my/project', true);
		expect(lastUrl()).toBe('/api/admin/projects/my%2Fproject/curated');
		expect(lastBody()).toEqual({ curated: true });
	});

	it('lists the six tag categories', async () => {
		const { TAG_CATEGORIES } = await import('./platform');
		expect(TAG_CATEGORIES).toEqual([
			'language',
			'topic',
			'level',
			'framework',
			'tool',
			'other'
		]);
	});
});

describe('platformApi — the assistant', () => {
	it('GETs the aggregates with a window', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					stats: {
						window_days: 30,
						total_requests: 0,
						billed_calls: 0,
						cache_hits: 0,
						cache_hit_rate: null,
						tokens_total: 0,
						refused_burst: 0,
						refused_daily_quota: 0,
						worker_failures: 0,
						distinct_users: 0,
						by_interaction_type: {},
						by_status: {},
						top_consumers: []
					},
					policy: {
						daily_quota: 10,
						burst_max: 3,
						burst_window_secs: 60,
						cache_ttl_secs: 3600
					}
				},
				meta: {}
			})
		);
		const { platformApi } = await import('./platform');
		const res = await platformApi.assistantStats({ window_days: 30, top: 10 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/assistant/stats');
		expect(url.searchParams.get('window_days')).toBe('30');
		// Null on an empty window, not 0.0 — which would read as a broken
		// cache rather than as nothing having been asked.
		expect(res.data.stats.cache_hit_rate).toBeNull();
		// The policy travels with the figures so the screen never hard-codes
		// the thresholds it is reporting on.
		expect(res.data.policy.daily_quota).toBe(10);
	});

	it('GETs one user disclosure ledger separately', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { user_id: 'u1', interactions: [], total: 0, limit: 50, offset: 0 },
				meta: {}
			})
		);
		const { platformApi } = await import('./platform');
		await platformApi.userAssistantInteractions('u1', { limit: 50, undisclosed_only: true });
		const url = new URL(lastUrl(), 'http://x');
		// A separate endpoint because it carries prompts. The aggregate above
		// carries none, and the two should not be reachable by the same call.
		expect(url.pathname).toBe('/api/admin/users/u1/assistant-interactions');
		expect(url.searchParams.get('undisclosed_only')).toBe('true');
	});
});
