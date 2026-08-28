/**
 * Skilluv Design — client contract.
 *
 * The design workflow is reachable through public and reviewer-scoped
 * routes, not through an `/api/admin/design/*` family: none of that has
 * shipped. These tests pin the routes that do exist, so a later admin
 * family cannot be added by accidentally repointing one of them.
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

function lastUrl(): string {
	return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
}

describe('designApi — critique loop', () => {
	it('GETs the reviewer queue with its limit', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { slices: [] }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.reviewQueue({ limit: 50 });
		expect(lastUrl()).toBe('/api/design/reviews/queue?limit=50');
	});

	it('GETs the queue without a limit when none is given', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { slices: [] }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.reviewQueue();
		expect(lastUrl()).toBe('/api/design/reviews/queue');
	});

	it('GETs the critique trail for a slice', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					rounds: [
						{
							round: 1,
							decision: 'iterate',
							blocking_reason: 'brief_unmet',
							reason: 'x'.repeat(40),
							reviewed_artifact_url: 'https://figma.test/1',
							reviewed_artifact_notes_md: null,
							grid_scores: { average: 3.2 },
							decided_at: '2026-08-01T00:00:00Z'
						}
					]
				},
				meta: {}
			})
		);
		const { designApi } = await import('./design');
		const res = await designApi.reviewHistory('sl1');
		expect(lastUrl()).toBe('/api/design/slices/sl1/reviews');
		// `iterate` is the verdict that does not exist in code review, and the
		// reason the design loop is a separate module. It must survive typing.
		expect(res.data.rounds[0].decision).toBe('iterate');
	});
});

describe('designApi — profile', () => {
	it('GETs the design profile by username, not by id', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					username: 'ada',
					craft_score: {
						score: 42,
						tier_slug: 'artisan',
						tier_name: 'Artisan',
						tier_description: '',
						next_tier_at: 60,
						breakdown: [],
						capped: false
					},
					artefacts: [],
					contests: [],
					trades: [],
					attestations: []
				},
				meta: {}
			})
		);
		const { designApi } = await import('./design');
		const res = await designApi.profile('ada');
		expect(lastUrl()).toBe('/api/users/ada/design-profile');
		expect(res.data.craft_score.score).toBe(42);
	});

	it('encodes a username that needs it', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.profile('a b/c');
		expect(lastUrl()).toBe('/api/users/a%20b%2Fc/design-profile');
	});

	it('GETs the craft score ladder', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { cap: 100, tiers: [], weights: [] }, meta: {} })
		);
		const { designApi } = await import('./design');
		const res = await designApi.tiers();
		expect(lastUrl()).toBe('/api/design/tiers');
		expect(res.data.cap).toBe(100);
	});
});

describe('tournament contest rules', () => {
	it('lists what a brief contest must state', async () => {
		const { TOURNAMENT_REQUIRED_RULES, TOURNAMENT_KINDS } = await import('./admin');
		// A design contest is a `brief_contest`; there is no design contest
		// endpoint, so this list is what the admin form has to collect.
		expect(TOURNAMENT_KINDS).toContain('brief_contest');
		expect(TOURNAMENT_REQUIRED_RULES.brief_contest).toEqual(['brief', 'judging_criteria']);
	});

	it('leaves kinds scored from activity elsewhere without required rules', async () => {
		const { TOURNAMENT_REQUIRED_RULES } = await import('./admin');
		expect(TOURNAMENT_REQUIRED_RULES.individual).toBeUndefined();
		expect(TOURNAMENT_REQUIRED_RULES.guild_war).toBeUndefined();
	});

	it('POSTs a brief contest with its domain and rules', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { tournament: { id: 't1', kind: 'brief_contest' } }, meta: {} })
		);
		const { adminApi } = await import('./admin');
		await adminApi.createTournament({
			slug: 'rebrand-2027',
			name: 'Rebrand 2027',
			kind: 'brief_contest',
			starts_at: '2027-01-01T00:00:00Z',
			ends_at: '2027-02-01T00:00:00Z',
			skill_domain: 'design',
			rules: { brief: 'b'.repeat(200), judging_criteria: 'craft, fit, originality' }
		});
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/tournaments');
		const body = JSON.parse(init.body as string);
		expect(body.kind).toBe('brief_contest');
		expect(body.skill_domain).toBe('design');
		expect(body.rules.judging_criteria).toBe('craft, fit, originality');
	});
});

describe('capability catalogue', () => {
	it('covers every design reviewer family the backend CHECK accepts', async () => {
		const { DESIGN_SUBTYPES, DESIGN_BLOCKING_REASONS, SLICE_STATUSES } = await import(
			'$lib/types'
		);
		// Twelve deliverable shapes (migration 0231), ten blocking reasons
		// (0232), and `in_iteration` in the funnel (0232) — the three enums
		// the design workflow added and the admin app had drifted from.
		expect(DESIGN_SUBTYPES).toHaveLength(12);
		expect(DESIGN_BLOCKING_REASONS).toHaveLength(10);
		expect(SLICE_STATUSES).toContain('in_iteration');
	});
});

describe('designApi — the brief queue', () => {
	it('GETs briefs waiting to be read', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { briefs: [] }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.briefQueue({ limit: 50 });
		expect(lastUrl()).toBe('/api/admin/design/briefs?limit=50');
	});

	it('publishes a brief, turning it into a slice', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { brief: { id: 'b1', status: 'published' } }, meta: {} })
		);
		const { designApi } = await import('./design');
		const res = await designApi.publishBrief('b1');
		expect(lastUrl()).toBe('/api/admin/design/briefs/b1/publish');
		expect(res.data.brief.status).toBe('published');
	});

	it('refuses a brief with feedback the author reads', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { brief: { id: 'b1', status: 'rejected' } }, meta: {} })
		);
		const { designApi, BRIEF_FEEDBACK_MIN } = await import('./design');
		const feedback = 'f'.repeat(BRIEF_FEEDBACK_MIN);
		await designApi.rejectBrief('b1', feedback);
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/design/briefs/b1/reject');
		expect(JSON.parse(init.body as string)).toEqual({ feedback });
	});
});

describe('designApi — accusations of copying', () => {
	it('reads the queue from the cross-domain moderation route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { designApi } = await import('./design');
		await designApi.plagiarismQueue({ limit: 50 });
		// Not `/admin/design/plagiarism`: an entry copied into a security
		// contest is the same case, and there is one queue for both.
		expect(lastUrl()).toBe('/api/admin/plagiarism?limit=50');
	});

	it('POSTs a decision, either way, with its written reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { id: 'c1', status: 'upheld' }, meta: {} }));
		const { designApi, PLAGIARISM_DECISION_MIN } = await import('./design');
		const decision = 'd'.repeat(PLAGIARISM_DECISION_MIN);
		await designApi.decidePlagiarism('c1', true, decision);
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/plagiarism/c1/decide');
		expect(JSON.parse(init.body as string)).toEqual({
			upheld: true,
			decision_md: decision
		});
	});

	it('asks for as much writing to dismiss as to uphold', async () => {
		const { PLAGIARISM_DECISION_MIN } = await import('./design');
		// An accusation dropped without a word leaves the accusation
		// standing in everybody's memory, so the floor is the same.
		expect(PLAGIARISM_DECISION_MIN).toBe(80);
	});
});

describe('designApi — the weekly featuring', () => {
	it('reads this week from the public route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { featured: null }, meta: {} }));
		const { designApi } = await import('./design');
		const res = await designApi.featuredThisWeek('design');
		expect(lastUrl()).toBe('/api/featured/design');
		// Null rather than a 404: a week with nobody featured is a normal
		// week, not a broken page.
		expect(res.data.featured).toBeNull();
	});

	it('reads the recent weeks with a limit', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { featured: [] }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.featuredRecent('security', { limit: 12 });
		expect(lastUrl()).toBe('/api/featured/security/recent?limit=12');
	});

	it('POSTs a featuring to the domain-agnostic admin route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { featured: {} }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.feature({
			skill_domain: 'design',
			week_of: '2026-08-24',
			user_id: 'u1',
			reason_md: 'r'.repeat(40)
		});
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/featured');
		expect(JSON.parse(init.body as string).week_of).toBe('2026-08-24');
	});

	it('GETs the composed post for one week', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { card: {} }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.featuredCard('design', '2026-08-24');
		expect(lastUrl()).toBe('/api/admin/featured/design/2026-08-24/card');
	});

	it('snaps a date to the Monday of its own week', async () => {
		const { mondayOf } = await import('./design');
		// The endpoint refuses anything that is not a Monday, so the form
		// offers Mondays rather than letting somebody meet the rule as a 400.
		expect(mondayOf(new Date(2026, 7, 24))).toBe('2026-08-24'); // a Monday
		expect(mondayOf(new Date(2026, 7, 28))).toBe('2026-08-24'); // the Friday
		// Sunday belongs to the week that started six days earlier, not to
		// the one beginning tomorrow.
		expect(mondayOf(new Date(2026, 7, 30))).toBe('2026-08-24');
		expect(mondayOf(new Date(2026, 7, 31))).toBe('2026-08-31');
	});
});

describe('designApi — reading an artefact', () => {
	it('GETs the automated checks for a slice', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { checks: [] }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.autoChecks('sl1');
		expect(lastUrl()).toBe('/api/design/slices/sl1/auto-checks');
	});

	it('GETs one reviewed version by round', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { version: {} }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.versionAt('sl1', 2);
		expect(lastUrl()).toBe('/api/design/slices/sl1/versions/2');
	});

	it('compares two rounds', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { comparison: {} }, meta: {} }));
		const { designApi } = await import('./design');
		await designApi.compare('sl1', 1, 3);
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/design/slices/sl1/compare');
		expect(url.searchParams.get('from')).toBe('1');
		expect(url.searchParams.get('to')).toBe('3');
	});
});

describe('contest operations', () => {
	it('reads a jury from the public tournament route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { jury: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.listJury('rebrand-2027');
		// Public on purpose: a contest whose panel is secret cannot be
		// trusted, and naming it before the deadline is what lets entrants
		// check it.
		expect(lastUrl()).toBe('/api/tournaments/rebrand-2027/jury');
	});

	it('invites a juror through the admin route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { jury: {} }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.inviteJuror('t1', 'u1');
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/tournaments/t1/jury');
		expect(JSON.parse(init.body as string)).toEqual({ juror_user_id: 'u1' });
	});

	it('reports vote bursts without deciding anything', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { bursts: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.voteBursts('t1', { window_minutes: 5, threshold: 10 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/tournaments/t1/vote-bursts');
		expect(url.searchParams.get('window_minutes')).toBe('5');
		expect(url.searchParams.get('threshold')).toBe('10');
	});

	it('lists the contests still holding money', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { contests: [] }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.outstandingPrizes();
		expect(lastUrl()).toBe('/api/admin/tournaments/prizes/outstanding');
	});

	it('funds a prize with the amount as a string', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.fundPrize('t1', {
			funder_enterprise_id: 'e1',
			amount: '1500.00',
			currency: 'EUR',
			provider_reference: 'pi_123'
		});
		const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
			string,
			RequestInit
		];
		expect(url).toBe('/api/admin/tournaments/t1/prize/fund');
		// A decimal the ledger holds exactly. A float round-trip is how a
		// prize becomes 1499.9999.
		expect(JSON.parse(init.body as string).amount).toBe('1500.00');
	});

	it('refunds a prize with the reason somebody will ask about later', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { refunded: true }, meta: {} }));
		const { adminApi } = await import('./admin');
		await adminApi.refundPrize('t1', 'the contest drew no eligible entry');
		expect(lastUrl()).toBe('/api/admin/tournaments/t1/prize/refund');
	});
});
