/**
 * Domain dashboards and the moderation queues — client contract.
 *
 * The assertions that matter here are about what a screen is allowed to
 * conclude from a value: a null is not a zero, and only one of five
 * `hidden_reason` values is a moderator's doing.
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

describe('oversightApi — the domain dashboard', () => {
	it('GETs the overview for one domain and window', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					skill_domain: 'design',
					window_days: 30,
					declared_trades: 210,
					active_contributors: 4,
					challenges_published: 12,
					challenges_draft: 3,
					contests_running: 1,
					contests_concluded_in_window: 0,
					missions_in_progress: 2,
					missions_delivered_in_window: 1,
					reviews_pending: 0,
					oldest_pending_review_hours: null,
					mean_rounds_to_approval: 2.4,
					last_featured_week: '2026-08-24'
				},
				meta: {}
			})
		);
		const { oversightApi } = await import('./oversight');
		const res = await oversightApi.domainOverview('design', { days: 30 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/domains/design/overview');
		expect(url.searchParams.get('days')).toBe('30');
		// Null, not zero, when nothing waits. Zero hours would read as
		// "something just arrived", which is the opposite.
		expect(res.data.oldest_pending_review_hours).toBeNull();
		// The pair the screen must show together: a healthy-looking total
		// beside four active people is the whole point of the endpoint.
		expect(res.data.declared_trades).toBe(210);
		expect(res.data.active_contributors).toBe(4);
	});

	it('reads a reviewer who has decided nothing as null, not fast', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: [
					{
						user_id: 'u1',
						username: 'ada',
						display_name: 'Ada',
						families: ['brand'],
						decisions_total: 0,
						approved: 0,
						iterations_asked: 0,
						rejected: 0,
						mean_hours_to_decide: null,
						open_now: 2
					}
				],
				meta: {}
			})
		);
		const { oversightApi } = await import('./oversight');
		const res = await oversightApi.domainReviewers('design');
		expect(lastUrl()).toBe('/api/admin/domains/design/reviewers');
		// Never having reviewed is not reviewing instantly.
		expect(res.data[0].mean_hours_to_decide).toBeNull();
	});

	it('GETs the featuring queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.domainFeaturedQueue('game', { days: 90 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/domains/game/featured-queue');
		expect(url.searchParams.get('days')).toBe('90');
	});
});

describe('oversightApi — credentials issued elsewhere', () => {
	it('GETs the pending queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { credentials: [] }, meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.pendingCredentials();
		expect(lastUrl()).toBe('/api/admin/credentials/pending');
	});

	it('POSTs a verification carrying the note', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { verified: true }, meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.verifyCredential('c1', 'opened the issuer registry, name and id match');
		expect(lastUrl()).toBe('/api/admin/credentials/c1/verify');
		expect(JSON.parse(lastCall()[1].body as string)).toEqual({
			note: 'opened the issuer registry, name and id match'
		});
	});

	it('refuses to a different route than it verifies', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { refused: true }, meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.refuseCredential('c1', 'the registry has no record under that id');
		expect(lastUrl()).toBe('/api/admin/credentials/c1/refuse');
	});

	it('states the note floor the backend enforces', async () => {
		const { CREDENTIAL_NOTE_MIN } = await import('./oversight');
		// "OK" is not a record of having opened an issuer's page.
		expect(CREDENTIAL_NOTE_MIN).toBe(20);
	});
});

describe('oversightApi — cohorts and offers, as moderation sees them', () => {
	it('asks for private and archived cohorts explicitly', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { cohorts: [], total: 0, limit: 25, offset: 0 }, meta: {} })
		);
		const { oversightApi } = await import('./oversight');
		await oversightApi.adminCohorts({ include_private: true, include_archived: false });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/cohorts');
		expect(url.searchParams.get('include_private')).toBe('true');
		expect(url.searchParams.get('include_archived')).toBe('false');
	});

	it('POSTs an archive with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { cohort: {} }, meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.archiveCohort('c1', 'organiser asked, nobody has posted in four months');
		expect(lastUrl()).toBe('/api/admin/cohorts/c1/archive');
	});

	it('GETs the offers including the ones nobody can see', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { offers: [], total: 0, limit: 25, offset: 0 }, meta: {} })
		);
		const { oversightApi } = await import('./oversight');
		await oversightApi.adminTalentOffers({ include_inactive: true, held_only: false });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/talent-offers');
		expect(url.searchParams.get('include_inactive')).toBe('true');
	});

	it('POSTs a take-down with a reason and a reinstate without one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { offer: {} }, meta: {} }));
		const { oversightApi } = await import('./oversight');
		await oversightApi.deactivateTalentOffer('o1', 'the description advertises off-platform work');
		expect(lastUrl()).toBe('/api/admin/talent-offers/o1/deactivate');

		fetchMock.mockResolvedValueOnce(okJson({ data: { offer: {} }, meta: {} }));
		await oversightApi.reinstateTalentOffer('o1');
		expect(lastUrl()).toBe('/api/admin/talent-offers/o1/reinstate');
		// Putting something back needs no justification; taking it down does.
		expect(lastCall()[1].body).toBeUndefined();
	});

	it('treats only one of the five hidden reasons as a moderator decision', async () => {
		const { OFFER_HIDDEN_REASONS, isModerationHold } = await import('./oversight');
		expect(OFFER_HIDDEN_REASONS).toHaveLength(5);
		// The distinction the reinstate button depends on. Offering it on an
		// offer whose author is banned would change nothing while looking like
		// it had.
		expect(OFFER_HIDDEN_REASONS.filter(isModerationHold)).toEqual(['moderation_hold']);
		expect(isModerationHold(null)).toBe(false);
	});
});
