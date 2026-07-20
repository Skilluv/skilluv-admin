/**
 * ADM-M5 — smoke tests for users enrichment admin API wrappers.
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

describe('adminApi users enrichment reads (ADM-M5)', () => {
	it('getUserOrientations GETs /users/{id}/orientations', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { orientations: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		const res = await adminApi.getUserOrientations('u1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/users/u1/orientations');
		expect(res.data.orientations).toEqual([]);
	});

	it('getUserBadges GETs /users/{id}/badges', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					user_id: 'u1',
					rank: { rank: 'ranger', achieved_at: '2026-01-01T00:00:00Z', previous_rank: null },
					skill_patches: [],
					medals: [],
					challenge_seals_count: 0,
					event_stamps_count: 0,
					guild_crests: [],
					total_badges: 0
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.getUserBadges('u1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/users/u1/badges');
		expect(res.data.rank.rank).toBe('ranger');
	});

	it('getUserRankHistory GETs /users/{id}/rank-history', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { history: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		const res = await adminApi.getUserRankHistory('u1');
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/users/u1/rank-history');
		expect(res.data.history).toEqual([]);
	});
});

describe('adminApi recomputeUserProofs (ADM-M5)', () => {
	it('POSTs to /admin/users/{id}/recompute-proofs with body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					recomputed: {
						capabilities_added: [],
						capabilities_removed: [],
						badges_added: [],
						badges_removed: [],
						rank_before: 'apprenti',
						rank_after: 'apprenti',
						errors: []
					}
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.recomputeUserProofs('u1', { scope: 'all', reason: 'engine fix' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/recompute-proofs');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ scope: 'all', reason: 'engine fix' });
	});

	it('with dryRun appends ?dry_run=true', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					dry_run: true,
					current_state: { rank: 'ranger', capabilities_active_count: 3, badges_active_count: 5 },
					would_recompute: 'all'
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.recomputeUserProofs('u1', {}, true);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/recompute-proofs?dry_run=true');
		expect((res.data as { dry_run?: boolean }).dry_run).toBe(true);
	});
});

describe('adminApi overrideUserRank (ADM-M5)', () => {
	it('POSTs to /admin/users/{id}/rank-override with body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { user_id: 'u1', old_rank: 'apprenti', new_rank: 'maitre', override_id: 'ov1' },
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		await adminApi.overrideUserRank('u1', { new_rank: 'maitre', reason: 'honorary elder' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/rank-override');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ new_rank: 'maitre', reason: 'honorary elder' });
	});

	it('with dryRun appends ?dry_run=true and returns peers count', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					dry_run: true,
					would_override: {
						user_id: 'u1',
						old_rank: 'ranger',
						new_rank: 'maitre',
						peers_at_new_rank: 42
					}
				},
				meta: {}
			})
		);
		const { adminApi } = await import('./admin');
		const res = await adminApi.overrideUserRank(
			'u1',
			{ new_rank: 'maitre', reason: 'preview only' },
			true
		);
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/admin/users/u1/rank-override?dry_run=true');
		const data = res.data as {
			dry_run?: boolean;
			would_override?: { peers_at_new_rank: number };
		};
		expect(data.dry_run).toBe(true);
		expect(data.would_override?.peers_at_new_rank).toBe(42);
	});
});
