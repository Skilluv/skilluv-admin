/**
 * Recruitment — client contract.
 *
 * Four routes, and one absence that is worth a test of its own: there is no
 * admin way to answer for a talent.
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

function lastBody(): unknown {
	return JSON.parse(lastCall()[1].body as string);
}

describe('recruitmentApi', () => {
	it('GETs the internal campaign queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { campaigns: [] }, meta: {} }));
		const { recruitmentApi } = await import('./recruitment');
		await recruitmentApi.campaigns();
		expect(lastCall()[0]).toBe('/api/admin/recruitment/campaigns');
	});

	it('reads the unassigned flag from the server rather than deriving it', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					campaigns: [
						{
							id: 'c1',
							title: 'Senior SRE',
							kind: 'search',
							status: 'briefing',
							company_name: 'Acme',
							assigned_to: null,
							shortlisted: 0,
							unassigned: true
						}
					]
				},
				meta: {}
			})
		);
		const { recruitmentApi } = await import('./recruitment');
		const res = await recruitmentApi.campaigns();
		// It is also the sort key on the server side, so taking it from there
		// keeps the badge and the ordering telling the same story.
		expect(res.data.campaigns[0].unassigned).toBe(true);
	});

	it('POSTs an assignment', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { assigned: true }, meta: {} }));
		const { recruitmentApi } = await import('./recruitment');
		await recruitmentApi.assign('c1', 'u9');
		expect(lastCall()[0]).toBe('/api/admin/recruitment/campaigns/c1/assign');
		expect(lastBody()).toEqual({ recruiter_user_id: 'u9' });
	});

	it('POSTs a shortlisting with its argument', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { shortlisted: true }, meta: {} }));
		const { recruitmentApi } = await import('./recruitment');
		await recruitmentApi.shortlist('c1', {
			talent_user_id: 'u2',
			match_reason_md: 'ran the same migration at a comparable scale, see the writeup'
		});
		expect(lastCall()[0]).toBe('/api/admin/recruitment/campaigns/c1/shortlist');
		const body = lastBody() as Record<string, string>;
		expect(body.talent_user_id).toBe('u2');
		expect(body.match_reason_md).not.toBe('');
	});

	it('POSTs a departure with an instant and reads the refund', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { refund_amount: '3200.00' }, meta: {} }));
		const { recruitmentApi } = await import('./recruitment');
		const res = await recruitmentApi.recordDeparture('f1', {
			left_at: '2026-09-10T09:00:00.000Z',
			reason: 'resigned in week six'
		});
		expect(lastCall()[0]).toBe('/api/admin/recruitment/fees/f1/departure');
		// An instant, not a bare day: the refund is prorated against when they
		// actually left.
		expect((lastBody() as Record<string, string>).left_at).toBe('2026-09-10T09:00:00.000Z');
		expect(res.data.refund_amount).toBe('3200.00');
	});

	it('states the floor the shortlisting form applies', async () => {
		const { MATCH_REASON_MIN } = await import('./recruitment');
		// The backend only requires non-empty. This floor is the screen's:
		// "good fit" is not an argument, and the person being put forward
		// decides on the strength of what is written.
		expect(MATCH_REASON_MIN).toBe(30);
	});

	it('exposes no way to answer on a talent behalf', async () => {
		const mod = await import('./recruitment');
		// `POST /recruitment/campaigns/{id}/respond` is their session only, and
		// the backend has no admin equivalent. Shortlisting asks them; nothing
		// here answers for them.
		expect(Object.keys(mod.recruitmentApi).some((n) => /respond/i.test(n))).toBe(false);
	});
});
