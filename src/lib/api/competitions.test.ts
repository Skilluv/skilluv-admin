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

	it('does not write seasons: that half goes through /admin/seasons', async () => {
		const mod = await import('./competitions');
		const names = Object.keys(mod.competitionsApi);
		// Two backend modules write the one `seasons` table with different
		// column sets. This app writes through `adminApi`, and a second writer
		// here would produce rows missing whatever the other module records.
		expect(names.some((n) => /createSeason|activateSeason/i.test(n))).toBe(false);
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
