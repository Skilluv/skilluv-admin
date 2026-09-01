/**
 * Studios — client contract.
 *
 * The share arithmetic is the interesting part: it decides whether the
 * activate button is offered at all, and getting it wrong would either block
 * a valid team or send a call the backend refuses.
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

describe('studiosApi', () => {
	it('reads the public list, which is active studios only', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { studios: [] }, meta: {} }));
		const { studiosApi } = await import('./studios');
		await studiosApi.list();
		// `/studios`, not `/admin/studios` — the latter is a POST and there is
		// no admin listing. A studio being formed is in neither, which is why
		// the page holds the id from the create call.
		expect(lastUrl()).toBe('/api/studios');
	});

	it('POSTs a studio and gets its id back', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { studio: { id: 's1', status: 'forming' } }, meta: {} })
		);
		const { studiosApi } = await import('./studios');
		const res = await studiosApi.create({
			slug: 'atelier-nord',
			name: 'Atelier Nord',
			specialization: 'design systems for public services',
			day_rate: '900.00'
		});
		expect(lastUrl()).toBe('/api/admin/studios');
		// The only handle on the studio until it is activated.
		expect(res.data.studio.id).toBe('s1');
		expect(res.data.studio.status).toBe('forming');
	});

	it('POSTs a member and reads back the whole list', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					members: [
						{
							user_id: 'u1',
							username: 'ada',
							role_on_engagement: 'lead',
							share_percent: '50.00',
							accepted_at: null,
							declined_at: null
						}
					]
				},
				meta: {}
			})
		);
		const { studiosApi } = await import('./studios');
		const res = await studiosApi.addMember('s1', {
			user_id: 'u1',
			role: 'lead',
			share_percent: '50.00'
		});
		expect(lastUrl()).toBe('/api/admin/studios/s1/members');
		// Answering with the list means the running share total is exact
		// without a second read.
		expect(res.data.members).toHaveLength(1);
	});

	it('POSTs an activation naming the lead', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { studio: { id: 's1' } }, meta: {} }));
		const { studiosApi } = await import('./studios');
		await studiosApi.activate('s1', 'u1');
		expect(lastUrl()).toBe('/api/admin/studios/s1/activate');
		expect(JSON.parse(lastCall()[1].body as string)).toEqual({ lead_user_id: 'u1' });
	});

	it('POSTs a disband with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { disbanded: true }, meta: {} }));
		const { studiosApi } = await import('./studios');
		await studiosApi.disband('s1', 'the team split after the last engagement');
		expect(lastUrl()).toBe('/api/admin/studios/s1/disband');
	});
});

describe('share arithmetic', () => {
	it('accepts a split that adds to exactly 100', async () => {
		const { sharesComplete } = await import('./studios');
		expect(sharesComplete(['50.00', '50.00'])).toBe(true);
		expect(sharesComplete(['40', '35', '25'])).toBe(true);
	});

	it('accepts thirds, which is where a float would fail', async () => {
		const { sharesComplete, sharesTotal } = await import('./studios');
		// 33.34 + 33.33 + 33.33 is exactly 100, and is also the most likely
		// three-way split anybody types. Summed in integer hundredths so it
		// stays exactly 100 rather than 99.99999999999999.
		expect(sharesTotal(['33.34', '33.33', '33.33'])).toBe(10000);
		expect(sharesComplete(['33.34', '33.33', '33.33'])).toBe(true);
	});

	it('rejects a split that does not add up', async () => {
		const { sharesComplete } = await import('./studios');
		expect(sharesComplete(['50', '40'])).toBe(false);
		expect(sharesComplete(['60', '60'])).toBe(false);
		expect(sharesComplete([])).toBe(false);
	});

	it('states the two-member floor', async () => {
		const { STUDIO_MIN_MEMBERS } = await import('./studios');
		// One person is not a team, and the backend refuses on it.
		expect(STUDIO_MIN_MEMBERS).toBe(2);
	});
});
