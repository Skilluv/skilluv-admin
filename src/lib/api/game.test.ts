/**
 * Game domain reviewer surface — client contract.
 *
 * Ten routes, one of which reads. What is pinned here is the shape of the
 * nine decisions: they all carry an id or a body the operator typed, and a
 * wrong path or a renamed field would fail exactly as quietly as SKI-348.
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

describe('gameApi — the mod queue', () => {
	it('GETs the pending mods', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { mods: [] }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.pendingMods();
		expect(lastUrl()).toBe('/api/admin/game/mods/pending');
	});

	it('POSTs a confirmation with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { mod: { id: 'm1' } }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.confirmMod('m1', 'plays as described on 1.20');
		expect(lastUrl()).toBe('/api/admin/game/mods/m1/confirm');
		expect(lastBody()).toEqual({ reason: 'plays as described on 1.20' });
	});

	it('POSTs a refusal to a different route, not a flag on the same one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { mod: { id: 'm1' } }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.refuseMod('m1', 'the hosting link is dead');
		// Two routes rather than one with a boolean: a refusal and a
		// confirmation are different decisions and the audit reads better for
		// it. Worth pinning, because a client could plausibly merge them.
		expect(lastUrl()).toBe('/api/admin/game/mods/m1/refuse');
		expect(lastBody()).toEqual({ reason: 'the hosting link is dead' });
	});

	it('POSTs a corrected download count as a number', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { mod: { id: 'm1' } }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.setModDownloads('m1', 4200);
		expect(lastUrl()).toBe('/api/admin/game/mods/m1/downloads');
		// A count, not money: an integer is right here and a string would be
		// rejected by the `i32` on the other side.
		expect(lastBody()).toEqual({ downloads: 4200 });
	});

	it('states the reason floor the form applies', async () => {
		const { MOD_REASON_MIN } = await import('./game');
		// The backend does not enforce one. This floor is the screen's own:
		// a refusal recorded against somebody's work with an empty reason is
		// a decision they can neither appeal nor learn from.
		expect(MOD_REASON_MIN).toBe(12);
	});
});

describe('gameApi — slices and jams', () => {
	it('POSTs a slice validation with no body', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { validated: true, deliverable_id: 'd1' }, meta: {} })
		);
		const { gameApi } = await import('./game');
		await gameApi.validateSlice('s1');
		expect(lastUrl()).toBe('/api/admin/game/slices/s1/validate');
		expect(lastCall()[1].method).toBe('POST');
	});

	it('POSTs a jam with instants for every deadline', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { jam: { id: 'j1' } }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.createJam({
			kind: 'game_jam_48h',
			slug: 'winter-48',
			name: 'Winter 48',
			theme: 'one room',
			starts_at: '2026-09-01T10:00:00.000Z',
			ends_at: '2026-09-03T10:00:00.000Z',
			submission_deadline: '2026-09-03T10:00:00.000Z',
			voting_deadline: '2026-09-06T10:00:00.000Z'
		});
		expect(lastUrl()).toBe('/api/admin/game/jams');
		const body = lastBody() as Record<string, string>;
		// Instants, not wall clocks: a jam deadline is a moment the whole
		// field shares, unlike the DATE columns on the sales side.
		expect(body.submission_deadline).toBe('2026-09-03T10:00:00.000Z');
		expect(body.kind).toBe('game_jam_48h');
	});

	it('POSTs a finalise and reads back what it did', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { report: { submissions_scored: 12, attestations_issued: 3 } },
				meta: {}
			})
		);
		const { gameApi } = await import('./game');
		const res = await gameApi.finalizeJam('j1');
		expect(lastUrl()).toBe('/api/admin/game/jams/j1/finalize');
		expect(res.data.report.submissions_scored).toBe(12);
		expect(res.data.report.attestations_issued).toBe(3);
	});

	it('lists the three jam formats the backend accepts', async () => {
		const { GAME_JAM_KINDS } = await import('./game');
		expect(GAME_JAM_KINDS).toEqual(['game_jam_48h', 'game_jam_72h', 'game_jam_week']);
	});
});

describe('gameApi — attestations and featurings', () => {
	it('POSTs a shipped title', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { attestation: {} }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.issueShippedTitle({
			user_id: 'u1',
			deliverable_id: 'd1',
			store_url: 'https://store.example/game',
			title: 'Deep Field'
		});
		expect(lastUrl()).toBe('/api/admin/game/attestations/shipped-title');
		expect(lastBody()).toEqual({
			user_id: 'u1',
			deliverable_id: 'd1',
			store_url: 'https://store.example/game',
			title: 'Deep Field'
		});
	});

	it('POSTs an open-source contribution to its own route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { attestation: {} }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.issueOpenSource({
			user_id: 'u1',
			deliverable_id: 'd1',
			pr_url: 'https://github.com/x/y/pull/9',
			what_changed: 'fixed the tilemap importer'
		});
		expect(lastUrl()).toBe('/api/admin/game/attestations/open-source');
	});

	it('POSTs a featuring with the week as two dates and a bio', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { featured: {} }, meta: {} }));
		const { gameApi } = await import('./game');
		await gameApi.featureCreator({
			user_id: 'u1',
			week_starts_at: '2026-09-07',
			week_ends_at: '2026-09-13',
			bio_md: 'shipped two jams and mentored four newcomers'
		});
		expect(lastUrl()).toBe('/api/admin/game/featured');
		const body = lastBody() as Record<string, string>;
		// Bare days, because a featuring covers a week rather than starting at
		// an instant. And the bio is sent because the backend refuses an empty
		// one: an editorial choice has to say why.
		expect(body.week_starts_at).toBe('2026-09-07');
		expect(body.bio_md).not.toBe('');
	});
});
