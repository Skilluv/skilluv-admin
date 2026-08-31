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

	it('keeps the two draft-only actions out of this module', async () => {
		const mod = await import('./programs');
		const names = Object.keys(mod.programsApi);
		// Both act on a draft, which is in no public list. They live in
		// `servicing.ts` now that SKI-354 serves the product register, keyed on
		// the `source_id` it returns — not here, where everything hangs off a
		// public list.
		expect(names.some((n) => /activate/i.test(n))).toBe(false);
		expect(names.some((n) => /openCampaign|openProgram/i.test(n))).toBe(false);
	});
});

describe('programsApi — sponsored content', () => {
	it('lists commissioned pieces, drafts included', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { content: [] }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.sponsoredContent();
		// The one product line the backend listed nowhere before SKI-354.
		// Publishing worked only in the session that created the piece.
		expect(lastUrl()).toBe('/api/admin/sponsored-content');
	});

	it('filters by status when asked', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { content: [] }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.sponsoredContent({ status: 'draft' });
		expect(lastUrl()).toBe('/api/admin/sponsored-content?status=draft');
	});

	it('commissions a piece without a disclosure and lets the backend write one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { content_id: 'sc1' }, meta: {} }));
		const { programsApi } = await import('./programs');
		await programsApi.commissionSponsoredContent({
			sponsor_enterprise_id: 'e1',
			content_type: 'blog_post',
			title: 'How we ship',
			fee: '1200.00'
		});
		expect(lastUrl()).toBe('/api/admin/sponsored-content');
		// No `disclosure_text` key. Omitted, the backend writes wording that
		// names the sponsor; an empty string would be a disclosure that says
		// nothing, and under ten characters it is discarded anyway.
		expect(lastBody()).toEqual({
			sponsor_enterprise_id: 'e1',
			content_type: 'blog_post',
			title: 'How we ship',
			fee: '1200.00'
		});
	});

	it('publishes at a URL, which is what books the fee', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { revenue_booked: '1200.00' }, meta: {} }));
		const { programsApi } = await import('./programs');
		const res = await programsApi.publishSponsoredContent('sc1', 'https://example.test/piece');
		expect(lastUrl()).toBe('/api/admin/sponsored-content/sc1/publish');
		// The URL is required, not decorative: the money moves here, and the
		// backend refuses anything that is not https or a second publish.
		expect(lastBody()).toEqual({ url: 'https://example.test/piece' });
		expect(res.data.revenue_booked).toBe('1200.00');
	});

	it('lists the five kinds the backend runs', async () => {
		const { SPONSORED_CONTENT_TYPES } = await import('$lib/types');
		expect(SPONSORED_CONTENT_TYPES).toEqual([
			'blog_post',
			'video',
			'newsletter',
			'podcast',
			'recap'
		]);
	});
});

describe('programsApi — the list behind the judge button', () => {
	it('lists one lab contributions, filtered by status', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { contributions: [], page: 1, per_page: 50, total: 0 }, meta: {} })
		);
		const { programsApi } = await import('./programs');
		await programsApi.labContributions('l1', { status: 'pending' });
		expect(lastUrl()).toBe('/api/admin/labs/l1/contributions?status=pending');
	});

	it('asks for all of them when no status was given', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { contributions: [], page: 1, per_page: 50, total: 0 }, meta: {} })
		);
		const { programsApi } = await import('./programs');
		await programsApi.labContributions('l1');
		expect(lastUrl()).toBe('/api/admin/labs/l1/contributions');
	});

	it('accepts without a reason and refuses with one', async () => {
		const { programsApi } = await import('./programs');

		fetchMock.mockResolvedValueOnce(okJson({ data: { accepted: true }, meta: {} }));
		await programsApi.judgeContribution('c1', { accept: true });
		expect(lastUrl()).toBe('/api/admin/lab-contributions/c1/judge');
		// No `reason` key at all on an acceptance. An empty string would be a
		// reason, and there is nothing to explain.
		expect(lastBody()).toEqual({ accept: true });

		fetchMock.mockResolvedValueOnce(okJson({ data: { accepted: false }, meta: {} }));
		await programsApi.judgeContribution('c2', {
			accept: false,
			reason: 'the brief asked for a working prototype'
		});
		expect(lastBody()).toEqual({
			accept: false,
			reason: 'the brief asked for a working prototype'
		});
	});

	it('spells pending as a filter value, not as a boolean', async () => {
		const { CONTRIBUTION_STATUSES } = await import('$lib/types');
		// `accepted` is nullable on the row, so "unjudged" is a third state
		// rather than a value — which is why the filter takes three words.
		expect(CONTRIBUTION_STATUSES).toEqual(['pending', 'accepted', 'rejected']);
	});
});
