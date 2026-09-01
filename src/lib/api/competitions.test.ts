/**
 * Series, seasons, contests and awards — client contract.
 *
 * The season calls are the ones worth pinning: this app reads through one
 * module's surface and writes through another's, over a single table, and a
 * future reader will want to know that was deliberate.
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

describe('competitionsApi — seasons', () => {
	it('reads the list from /seasons, which is the only listing there is', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { seasons: [] }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.seasons();
		// `/admin/seasons` has no GET. Without this call the tournaments page
		// could create and close seasons without ever showing one — an action
		// with no list in front of it.
		expect(lastUrl()).toBe('/api/seasons');
	});

	it('reads and writes seasons in the one module now', async () => {
		const mod = await import('./competitions');
		const names = Object.keys(mod.competitionsApi);
		// This used to assert the opposite. Two backend modules wrote the one
		// `seasons` table with different column sets, so the reads lived here
		// and the writes lived on `adminApi` to keep the two shapes apart.
		// The backend removed the second writer; there is one shape, and the
		// reads and writes belong together.
		expect(names).toContain('createSeason');
		expect(names).toContain('activateSeason');
	});
});

describe('competitionsApi — series', () => {
	it('GETs the series list', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { series: [] }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.series();
		expect(lastUrl()).toBe('/api/series');
	});

	it('POSTs a series with instants for its window', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { series: { id: 's1' } }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.createSeries({
			slug: 'awards-2026',
			name: 'Awards 2026',
			kind: 'awards_edition',
			starts_at: '2026-09-01T00:00:00.000Z',
			ends_at: '2026-12-01T00:00:00.000Z'
		});
		expect(lastUrl()).toBe('/api/admin/series');
		expect((lastBody() as Record<string, string>).kind).toBe('awards_edition');
	});

	it('attaches a contest with a category, and without one for a sprint', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.attachTournament('awards-2026', 't1', 'motion');
		expect(lastUrl()).toBe('/api/admin/series/awards-2026/tournaments');
		expect(lastBody()).toEqual({ tournament_id: 't1', category: 'motion' });

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await competitionsApi.attachTournament('winter-sprint', 't2');
		// Absent, not empty: a sprint's contest is the whole of its series, and
		// an empty category would be a category.
		expect(lastBody()).toEqual({ tournament_id: 't2' });
	});

	it('encodes a slug that needs it', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.attachTournament('a/b', 't1');
		expect(lastUrl()).toBe('/api/admin/series/a%2Fb/tournaments');
	});

	it('lists the three series kinds the backend accepts', async () => {
		const { SERIES_KINDS } = await import('./competitions');
		expect(SERIES_KINDS).toEqual(['awards_edition', 'sprint', 'programme']);
	});
});

describe('competitionsApi — contests and awards', () => {
	it('concludes a contest and reads the booked revenue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revenue_booked: '3400.00' }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		const res = await competitionsApi.concludeContest('c1');
		expect(lastUrl()).toBe('/api/admin/contests/c1/conclude');
		expect(res.data.revenue_booked).toBe('3400.00');
	});

	it('GETs an awards edition by year', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { edition: {}, nominees: [] }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.awardsEdition(2026);
		expect(lastUrl()).toBe('/api/awards/2026');
	});

	it('sends the whole shortlist, not a delta', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { shortlisted: 3 }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.shortlistNominees(['n1', 'n2', 'n3']);
		expect(lastUrl()).toBe('/api/awards/nominees/shortlist');
		// A shortlist is a set. Patching it one id at a time is how two
		// curators end up with different ballots.
		expect(lastBody()).toEqual({ nominee_ids: ['n1', 'n2', 'n3'] });
	});
});

describe('competitionsApi — judging', () => {
	it('reads the entries of one contest by slug', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { submissions: [], blinded: true, blind_until: null }, meta: {} })
		);
		const { competitionsApi } = await import('./competitions');
		const res = await competitionsApi.tournamentSubmissions('design-cup-2026');
		expect(lastUrl()).toBe('/api/tournaments/design-cup-2026/submissions');
		// `blinded` is carried, not dropped. During the window a non-juror
		// sees only their own entry, and a list of one that did not say so
		// would read as a contest nobody entered.
		expect(res.data.blinded).toBe(true);
	});

	it('escapes a slug rather than pasting it into the path', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { submissions: [], blinded: false, blind_until: null }, meta: {} })
		);
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.tournamentSubmissions('a b/c');
		expect(lastUrl()).toBe('/api/tournaments/a%20b%2Fc/submissions');
	});

	it('sends a score with an acceptance and lets the backend refuse it', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { submission: {} }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.judgeSubmission('s1', { status: 'accepted', judge_score: 82 });
		expect(lastUrl()).toBe('/api/submissions/s1/judge');
		expect(lastBody()).toEqual({ status: 'accepted', judge_score: 82 });
	});

	it('names the three verdicts', async () => {
		const { JUDGE_STATUSES } = await import('$lib/types');
		expect(JUDGE_STATUSES).toEqual(['accepted', 'rejected', 'disqualified']);
	});
});

describe('competitionsApi — seasons are one surface again', () => {
	it('creates through the one surviving writer, with a theme', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { season: {} }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.createSeason({
			slug: 'saison-q1-2026',
			name: 'Saison Q1 2026',
			theme: 'shipping in public',
			starts_at: '2026-01-01T00:00:00Z',
			ends_at: '2026-03-31T23:59:59Z'
		});
		// Not `/admin/seasons`: that writer recorded a description into the
		// same table and the backend removed it. A theme is what a season has.
		expect(lastUrl()).toBe('/api/seasons');
		expect(lastBody()).toEqual({
			slug: 'saison-q1-2026',
			name: 'Saison Q1 2026',
			theme: 'shipping in public',
			starts_at: '2026-01-01T00:00:00Z',
			ends_at: '2026-03-31T23:59:59Z'
		});
	});

	it('activates by slug, and sends no status', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { season: {} }, meta: {} }));
		const { competitionsApi } = await import('./competitions');
		await competitionsApi.activateSeason('saison-q1-2026');
		expect(lastUrl()).toBe('/api/seasons/saison-q1-2026/activate');
		// There is no general status write any more. Activation promotes one
		// season and demotes another; closing is a different route entirely.
		expect(lastCall()[1].body).toBeUndefined();
	});

	it('keeps the removed writer out of the client', async () => {
		const { competitionsApi } = await import('./competitions');
		const { adminApi } = await import('./admin');
		const names = [...Object.keys(competitionsApi), ...Object.keys(adminApi)];
		expect(names).not.toContain('updateSeasonStatus');
		// Closing survives, and stayed on `adminApi` because it is addressed
		// by id and answers with a report rather than with a season.
		expect(Object.keys(adminApi)).toContain('closeSeason');
	});
});
