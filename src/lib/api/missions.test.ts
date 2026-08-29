/**
 * Paid missions — client contract.
 *
 * Three routes, and the interesting thing about them is what is not there:
 * no `/admin/design-missions`, no `/admin/cyber-missions`, and no way for an
 * admin to run a mission. These tests pin both — the paths, and the single
 * write.
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

describe('missionsApi — the board', () => {
	it('GETs the board with no query when nothing is filtered', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { missionsApi } = await import('./missions');
		await missionsApi.list();
		expect(lastUrl()).toBe('/api/admin/missions');
	});

	it('narrows a domain rather than reaching for a domain-specific route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { missionsApi } = await import('./missions');
		await missionsApi.list({ skill_domain: 'design' });
		const url = new URL(lastUrl(), 'http://x');
		// The whole point: there is no /admin/design-missions. A design
		// mission is a mission with skill_domain = design.
		expect(url.pathname).toBe('/api/admin/missions');
		expect(url.searchParams.get('skill_domain')).toBe('design');
	});

	it('carries the stuck queue filters', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { missionsApi } = await import('./missions');
		await missionsApi.list({
			skill_domain: 'security',
			mission_type: 'pentest_web',
			status: 'in_progress',
			stuck_only: true,
			stuck_after_days: 30,
			page: 2,
			per_page: 20
		});
		const url = new URL(lastUrl(), 'http://x');
		expect(url.searchParams.get('mission_type')).toBe('pentest_web');
		expect(url.searchParams.get('status')).toBe('in_progress');
		expect(url.searchParams.get('stuck_only')).toBe('true');
		expect(url.searchParams.get('stuck_after_days')).toBe('30');
		expect(url.searchParams.get('page')).toBe('2');
		expect(url.searchParams.get('per_page')).toBe('20');
	});

	it('GETs one mission by slug, encoded', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					mission: { slug: 'a/b' },
					ip_terms: 'x',
					nda_required: false,
					rounds: [],
					invoices: [],
					arbitration: null
				},
				meta: {}
			})
		);
		const { missionsApi } = await import('./missions');
		await missionsApi.detail('a/b');
		expect(lastUrl()).toBe('/api/admin/missions/a%2Fb');
	});

	it('GETs the mission types from the public route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { mission_types: [] }, meta: {} }));
		const { missionsApi } = await import('./missions');
		await missionsApi.types();
		expect(lastUrl()).toBe('/api/missions/types');
	});
});

describe('missionsApi — the one decision', () => {
	it('POSTs an arbitration with its outcome and reason', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					mission: { slug: 'm1' },
					ip_terms: 'x',
					nda_required: false,
					rounds: [],
					invoices: [],
					arbitration: { outcome: 'accepted' }
				},
				meta: {}
			})
		);
		const { missionsApi } = await import('./missions');
		const reason = 'r'.repeat(120);
		const res = await missionsApi.arbitrate('m1', 'accepted', reason);
		expect(lastUrl()).toBe('/api/admin/missions/m1/arbitrate');
		const body = JSON.parse(lastCall()[1].body as string);
		expect(body).toEqual({ outcome: 'accepted', reason_md: reason });
		// The endpoint answers with the mission as it now stands, so the
		// screen never has to re-fetch to show what it just did.
		expect(res.data.arbitration?.outcome).toBe('accepted');
	});

	it('states the reason floor the backend enforces', async () => {
		const { ARBITRATION_REASON_MIN } = await import('./missions');
		// Both sides read the reason and one of them has just lost. The
		// constant is shared so the form and the server cannot drift.
		expect(ARBITRATION_REASON_MIN).toBe(80);
	});
});

describe('the mission vocabulary', () => {
	it('carries every status the CHECK on missions accepts', async () => {
		const { MISSION_STATUSES } = await import('$lib/types');
		expect(MISSION_STATUSES).toHaveLength(7);
		expect(MISSION_STATUSES).toContain('applications_closed');
		expect(MISSION_STATUSES).toContain('delivered');
	});
});

describe('missionsApi — the board is paginated', () => {
	it('reads the standard paginated envelope', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: [],
				pagination: { page: 2, per_page: 50, total: 137, total_pages: 3 },
				meta: {}
			})
		);
		const { missionsApi } = await import('./missions');
		const res = await missionsApi.list({ page: 2, per_page: 50 });
		// Before SKI-338 this was `ApiResponse<Row[]>` and the pager could only
		// guess whether one more page existed.
		expect(res.pagination.total).toBe(137);
		expect(res.pagination.total_pages).toBe(3);
	});
});

describe('missionsApi — taking a mission off the board', () => {
	it('POSTs cancelled with its reason to the status route', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					mission: { slug: 'm1', status: 'cancelled' },
					ip_terms: 'x',
					nda_required: false,
					rounds: [],
					invoices: [],
					arbitration: null
				},
				meta: {}
			})
		);
		const { missionsApi } = await import('./missions');
		const reason = 'The scope names a client system the enterprise does not own.';
		const res = await missionsApi.takeDown('m1', reason);
		expect(lastUrl()).toBe('/api/admin/missions/m1/status');
		expect(JSON.parse(lastCall()[1].body as string)).toEqual({
			status: 'cancelled',
			reason
		});
		// Answers with the mission as it now stands, so the screen never has to
		// re-fetch to show what it just did.
		expect(res.data.mission.status).toBe('cancelled');
	});

	it('encodes a slug that needs it', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { missionsApi } = await import('./missions');
		await missionsApi.takeDown('a/b', 'r'.repeat(30));
		expect(lastUrl()).toBe('/api/admin/missions/a%2Fb/status');
	});

	it('states the reason floor, lower than an arbitration but not absent', async () => {
		const { TAKEDOWN_REASON_MIN, ARBITRATION_REASON_MIN } = await import('./missions');
		expect(TAKEDOWN_REASON_MIN).toBe(20);
		// A take-down settles nothing between the parties, so it asks for less
		// than an arbitration — but two people still read it.
		expect(TAKEDOWN_REASON_MIN).toBeLessThan(ARBITRATION_REASON_MIN);
	});
});
