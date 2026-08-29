/**
 * Programmes and competitions — client contract.
 *
 * Two properties matter more than the paths here: an audit cannot be
 * submitted empty or unevidenced, and the two draft-only actions are not in
 * this module at all.
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

describe('programsApi — the public lists the actions hang off', () => {
	it('reads labs, betas, campaigns, ambassadors, certifications, proposals and events', async () => {
		const { programsApi } = await import('./programs');
		const expected = [
			['labs', '/api/labs'],
			['openBetaPrograms', '/api/beta-programs/open'],
			['openLaunchCampaigns', '/api/launch-campaigns/open'],
			['openAmbassadorPrograms', '/api/ambassador-programs/open'],
			['certifications', '/api/certifications'],
			['proposals', '/api/proposals'],
			['events', '/api/events']
		] as const;
		for (const [method, path] of expected) {
			fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
			await (programsApi as unknown as Record<string, () => Promise<unknown>>)[method]();
			expect(lastUrl()).toBe(path);
		}
	});
});

describe('programsApi — the writes', () => {
	it('settles a lab month as a bare day', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { contributions_paid: 7, each: '42.85', month: '2026-08-01' }, meta: {} })
		);
		const { programsApi } = await import('./programs');
		const res = await programsApi.settleLab('l1', '2026-08-14');
		expect(lastUrl()).toBe('/api/admin/labs/l1/settle');
		// Any day in the month; the backend takes the first of it. A timestamp
		// would be the wrong shape for a period.
		expect(lastBody()).toEqual({ month: '2026-08-14' });
		expect(res.data.contributions_paid).toBe(7);
	});

	it('closes a beta programme and a launch campaign, each booking its fee', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { program_fee_booked: '900.00' }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.closeBetaProgram('b1');
		expect(lastUrl()).toBe('/api/admin/beta-programs/b1/close');

		fetchMock.mockResolvedValueOnce(
			okJson({ data: { campaign_fee_booked: '1500.00' }, meta: {} })
		);
		await programsApi.closeLaunchCampaign('c1');
		expect(lastUrl()).toBe('/api/admin/launch-campaigns/c1/close');
	});

	it('invites and pays an ambassador through two different routes', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { invited: true }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.inviteAmbassador('p1', 'u1');
		expect(lastUrl()).toBe('/api/admin/ambassador-programs/p1/invite');
		expect(lastBody()).toEqual({ user_id: 'u1' });

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await programsApi.payAmbassador('p1', 'u1', '2026-08-01');
		expect(lastUrl()).toBe('/api/admin/ambassador-programs/p1/pay');
		expect(lastBody()).toEqual({ user_id: 'u1', month: '2026-08-01' });
	});

	it('appoints, sets a status and adds a stream on an event', async () => {
		const { programsApi } = await import('./programs');
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await programsApi.appointToEvent('e1', 'u1', 'jury');
		expect(lastUrl()).toBe('/api/admin/events/e1/appoint');
		expect(lastBody()).toEqual({ user_id: 'u1', role: 'jury' });

		fetchMock.mockResolvedValueOnce(okJson({ data: { status: 'live' }, meta: {} }));
		await programsApi.setEventStatus('e1', 'live');
		expect(lastUrl()).toBe('/api/admin/events/e1/status');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await programsApi.addLivestream('e1', 'twitch', 'https://twitch.tv/skilluv');
		expect(lastUrl()).toBe('/api/admin/events/e1/livestreams');
		expect(lastBody()).toEqual({ platform: 'twitch', url: 'https://twitch.tv/skilluv' });
	});

	it('records a proposal signature with the company and the value', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.recordProposalSignature('p1', 'e1', '24000.00');
		expect(lastUrl()).toBe('/api/admin/proposals/p1/signed');
		expect(lastBody()).toEqual({ enterprise_id: 'e1', contract_value: '24000.00' });
	});
});

describe('programsApi — certification audits', () => {
	it('POSTs findings, with the weight omitted when none was given', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.auditCertification('c1', [
			{ criterion: 'incident response', score: '4', evidence: 'ran the drill, see notes' }
		]);
		expect(lastUrl()).toBe('/api/admin/certifications/c1/audit');
		const body = lastBody() as { findings: Record<string, unknown>[] };
		expect(body.findings[0]).not.toHaveProperty('weight');
		expect(body).not.toHaveProperty('notes');
	});

	it('refuses an audit that is empty or unevidenced', async () => {
		const { auditIsComplete } = await import('./programs');
		// The score is the weighted mean of the findings, and a mean of nothing
		// is not zero.
		expect(auditIsComplete([])).toBe(false);
		// A score with no evidence is an opinion with a number on it.
		expect(auditIsComplete([{ criterion: 'x', score: '4', evidence: '' }])).toBe(false);
		expect(auditIsComplete([{ criterion: '', score: '4', evidence: 'y' }])).toBe(false);
		expect(auditIsComplete([{ criterion: 'x', score: '4', evidence: 'y' }])).toBe(true);
	});

	it('revokes with a reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revoked: true }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.revokeCertification('c1', 'the audited control was removed');
		expect(lastUrl()).toBe('/api/admin/certifications/c1/revoke');
	});
});

describe('the vocabulary, and the two actions this module refuses to wire', () => {
	it('lists the five event roles and five statuses', async () => {
		const { EVENT_ROLES, EVENT_STATUSES } = await import('./programs');
		expect(EVENT_ROLES).toEqual(['participant', 'jury', 'organizer', 'speaker', 'sponsor_rep']);
		expect(EVENT_STATUSES).toEqual(['draft', 'published', 'live', 'finished', 'cancelled']);
	});

	it('exposes no way to activate a draft programme or open a draft campaign', async () => {
		const mod = await import('./programs');
		const names = Object.keys(mod.programsApi);
		// Both act on a draft, and a draft is in no list an admin can reach.
		// Wiring them would mean a form asking for a UUID out of psql, which is
		// the problem SKI-337 named rather than a way around it.
		expect(names.some((n) => /activate/i.test(n))).toBe(false);
		expect(names.some((n) => /openCampaign|openProgram/i.test(n))).toBe(false);
	});
});
