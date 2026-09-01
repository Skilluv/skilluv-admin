/**
 * Post-MVP Tier 1 / 2 / 3 (SKI-36 → SKI-47) — client contract.
 *
 * These assert the wire shape, not the rendering: URL, method and body are
 * the only things this layer owns, and they are exactly what silently drifts
 * when the backend renames a route.
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

function noContent() {
	return {
		ok: true,
		status: 204,
		json: () => Promise.reject(new Error('no body'))
	} as unknown as Response;
}

function lastCall(): [string, RequestInit | undefined] {
	return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
		string,
		RequestInit | undefined
	];
}

describe('engagementApi — timeline (SKI-39)', () => {
	it('GETs the public timeline with its filters', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { events: [], total: 0, limit: 25, offset: 0 }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.getUserTimeline('u1', {
			event_type: 'rank_promoted',
			limit: 25,
			offset: 50
		});
		const [url] = lastCall();
		expect(url).toBe('/api/users/u1/timeline?event_type=rank_promoted&limit=25&offset=50');
		expect(res.data.total).toBe(0);
	});

	it('omits absent filters instead of sending empty values', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { events: [], total: 0, limit: 50, offset: 0 }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		await engagementApi.getUserTimeline('u1');
		const [url] = lastCall();
		expect(url).toBe('/api/users/u1/timeline');
	});

	it('POSTs the admin backfill and returns the report', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					user_id: 'u1',
					rows_inserted: 3,
					detail: {
						signup: 1,
						orientation_added: 0,
						deliverable_verified: 2,
						rank_promoted: 0,
						capability_granted: 0,
						attestation_received: 0,
						event_participation: 0,
						first_bounty_earned: 0,
						first_mentor_session: 0
					}
				},
				meta: {}
			})
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.backfillUserTimeline('u1');
		const [url, init] = lastCall();
		expect(url).toBe('/api/admin/users/u1/backfill-timeline');
		expect(init?.method).toBe('POST');
		expect(res.data.rows_inserted).toBe(3);
	});
});

describe('engagementApi — external signals (SKI-42)', () => {
	it('GETs the moderation queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { pending: [] }, meta: {} }));
		const { engagementApi } = await import('./engagement');
		await engagementApi.listPendingExternalSignals({ limit: 100 });
		const [url] = lastCall();
		expect(url).toBe('/api/moderation/external-signals?limit=100');
	});

	it('POSTs a verify on the moderation route, not an admin one', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { signal: { id: 's1', verified_at: '2026-08-17T00:00:00Z' } }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.verifyExternalSignal('s1');
		const [url, init] = lastCall();
		expect(url).toBe('/api/moderation/external-signals/s1/verify');
		expect(init?.method).toBe('POST');
		expect(res.data.signal.verified_at).not.toBeNull();
	});

	it('DELETEs a signal with its reason, and tolerates the 204 with no body', async () => {
		fetchMock.mockResolvedValueOnce(noContent());
		const { engagementApi } = await import('./engagement');
		await expect(
			engagementApi.deleteExternalSignal('s1', 'fabricated certification')
		).resolves.toBeUndefined();
		const [url, init] = lastCall();
		// The reason travels in the query string because the route is a
		// DELETE and the backend reads it from there. Sending none was a
		// guaranteed 400 — the screens had never managed a deletion.
		expect(url).toBe('/api/moderation/external-signals/s1?reason=fabricated%20certification');
		expect(init?.method).toBe('DELETE');
	});

	it('GETs one profile\'s signals split into buckets', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { verified: [{ id: 'a' }], declared: [{ id: 'b' }], disclaimer: 'x' },
				meta: {}
			})
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.getUserExternalSignals('u1');
		const [url] = lastCall();
		expect(url).toBe('/api/users/u1/external-signals');
		expect(res.data.verified).toHaveLength(1);
		expect(res.data.declared).toHaveLength(1);
	});
});

describe('engagementApi — vouchings (SKI-46)', () => {
	it('GETs the live vouchings of a user', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { vouchings: [], count: 0 }, meta: {} }));
		const { engagementApi } = await import('./engagement');
		await engagementApi.getUserVouchings('u1');
		const [url] = lastCall();
		expect(url).toBe('/api/users/u1/vouchings');
	});

	it('POSTs a break with the reason in the body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					vouching: { id: 'v1' },
					penalty_applied: true,
					voucher_rank_before: 'doyen',
					voucher_rank_effective: 'maitre',
					penalty_until: '2026-11-15T00:00:00Z'
				},
				meta: {}
			})
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.breakVouching('v1', 'confirmed plagiarism case');
		const [url, init] = lastCall();
		expect(url).toBe('/api/moderation/vouchings/v1/break');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(init?.body as string)).toEqual({ reason: 'confirmed plagiarism case' });
		expect(res.data.penalty_applied).toBe(true);
	});
});

describe('engagementApi — skill tree (SKI-47)', () => {
	it('GETs a user tree, optionally narrowed to one domain', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { user_id: 'u1', tree: [], counts: {} }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		await engagementApi.getUserSkillTree('u1', { domain: 'code' });
		const [url] = lastCall();
		expect(url).toBe('/api/users/u1/skill-tree?domain=code');
	});

	it('PUTs the full prerequisite list', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { skill_id: 'sk1', prerequisite_skill_ids: ['a', 'b'] }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		const res = await engagementApi.setSkillPrerequisites('sk1', ['a', 'b']);
		const [url, init] = lastCall();
		expect(url).toBe('/api/admin/skills/sk1/prerequisites');
		expect(init?.method).toBe('PUT');
		expect(JSON.parse(init?.body as string)).toEqual({ prerequisite_skill_ids: ['a', 'b'] });
		expect(res.data.prerequisite_skill_ids).toEqual(['a', 'b']);
	});

	it('sends an empty array to clear prerequisites', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { skill_id: 'sk1', prerequisite_skill_ids: [] }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		await engagementApi.setSkillPrerequisites('sk1', []);
		const [, init] = lastCall();
		// An empty list is meaningful here — it must reach the wire, not be
		// dropped as a falsy body.
		expect(JSON.parse(init?.body as string)).toEqual({ prerequisite_skill_ids: [] });
	});
});

describe('engagementApi — cohorts (SKI-40)', () => {
	it('GETs the discovery listing with filters', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { cohorts: [], limit: 25, offset: 0 }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		await engagementApi.listCohorts({
			orientation: 'backend-rust',
			upcoming_only: true,
			limit: 25,
			offset: 25
		});
		const [url] = lastCall();
		expect(url).toBe(
			'/api/cohorts?orientation=backend-rust&upcoming_only=true&limit=25&offset=25'
		);
	});

	it('GETs members and milestones on their own routes', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { members: [] }, meta: {} }));
		const { engagementApi } = await import('./engagement');
		await engagementApi.getCohortMembers('c1');
		expect(lastCall()[0]).toBe('/api/cohorts/c1/members');

		fetchMock.mockResolvedValueOnce(okJson({ data: { milestones: [] }, meta: {} }));
		await engagementApi.getCohortMilestones('c1');
		expect(lastCall()[0]).toBe('/api/cohorts/c1/milestones');
	});
});

describe('engagementApi — talent offers (SKI-45)', () => {
	it('GETs the public browse with filters', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { offers: [], limit: 25, offset: 0 }, meta: {} })
		);
		const { engagementApi } = await import('./engagement');
		await engagementApi.browseTalentOffers({
			offer_type: 'code_review',
			skill: 'rust',
			free_only: true,
			limit: 25,
			offset: 0
		});
		const [url] = lastCall();
		expect(url).toBe(
			'/api/talent-offers?offer_type=code_review&skill=rust&free_only=true&limit=25&offset=0'
		);
	});
});

describe('engagementApi — constants', () => {
	it('mirrors the backend enums', async () => {
		const { TALENT_OFFER_TYPES, TIMELINE_EVENT_TYPES, EXTERNAL_SIGNAL_PROVIDERS } =
			await import('./engagement');
		expect(TALENT_OFFER_TYPES).toHaveLength(5);
		expect(TIMELINE_EVENT_TYPES).toHaveLength(9);
		expect(EXTERNAL_SIGNAL_PROVIDERS).toHaveLength(9);
	});
});
