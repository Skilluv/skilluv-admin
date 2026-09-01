/**
 * Skilluv Cyber — client contract.
 *
 * These tests pin the twenty `/admin/security/*` routes and the two public
 * reads the admin screens depend on. The point is the URLs and the bodies:
 * a finding transition that posts to the wrong path, or that sends
 * `fix_url` on a move to `published`, is refused by a backend that declares
 * `deny_unknown_fields` — and the failure is a 400 nobody can read.
 *
 * The transition table is tested against the backend's own state machine
 * rather than against itself: `nextStatuses` exists only to decide which
 * buttons to draw, and its value is that it says the same thing as
 * `services::security_findings::allowed_transition`.
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

function lastBody(): Record<string, unknown> {
	const init = lastCall()[1];
	return JSON.parse(init.body as string);
}

describe('securityApi — the queue', () => {
	it('GETs the queue with no query when nothing is filtered', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { findings: [] }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.queue();
		expect(lastUrl()).toBe('/api/admin/security/findings');
	});

	it('passes every filter the backend declares', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { findings: [] }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.queue({
			status: 'triaged',
			severity: 'high',
			target_kind: 'platform',
			suspected_duplicates: true,
			limit: 25
		});
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/security/findings');
		expect(url.searchParams.get('status')).toBe('triaged');
		expect(url.searchParams.get('severity')).toBe('high');
		expect(url.searchParams.get('target_kind')).toBe('platform');
		expect(url.searchParams.get('suspected_duplicates')).toBe('true');
		expect(url.searchParams.get('limit')).toBe('25');
	});

	it('GETs one finding in full', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { finding: { id: 'f1' }, events: [], rounds: [], similar: [] },
				meta: {}
			})
		);
		const { securityApi } = await import('./security');
		const res = await securityApi.detail('f1');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1');
		expect(res.data.finding.id).toBe('f1');
	});
});

describe('securityApi — deciding', () => {
	it('POSTs a transition to the transition route, not to the finding', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { status: 'triaged' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.transition('f1', { to: 'triaged', triage_notes_md: 'looks real' });
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/transition');
		expect(lastBody()).toEqual({ to: 'triaged', triage_notes_md: 'looks real' });
	});

	it('carries the fix URL on the move to fixed', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { status: 'fixed' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.transition('f1', {
			to: 'fixed',
			fix_url: 'https://github.com/Skilluv/skilluv-backend/pull/1'
		});
		expect(lastBody().fix_url).toBe('https://github.com/Skilluv/skilluv-backend/pull/1');
	});

	it('POSTs a severity override with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { severity_tier: 'high' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.overrideSeverity('f1', {
			cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
			reason: 'authenticated is not required'
		});
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/severity');
		expect(lastBody().reason).toBe('authenticated is not required');
	});

	it('opens a round with a seeded kind slug', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { round_no: 1 }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.openRound('f1', 'sec_repro_insufficient', 'which endpoint?');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/rounds');
		expect(lastBody()).toEqual({
			kind: 'sec_repro_insufficient',
			notes_md: 'which endpoint?'
		});
	});

	it('resolves the open round on its own sub-route', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { resolved: true }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.resolveRound('f1', 'satisfied');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/rounds/resolve');
		expect(lastBody().resolution).toBe('satisfied');
	});

	it('separates requesting an extension from granting one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { requested: true }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.requestExtension('f1', 'the fix needs a migration');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/extension');

		fetchMock.mockResolvedValueOnce(okJson({ data: { granted_days: 30 }, meta: {} }));
		await securityApi.grantExtension('f1', 30);
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/extension/grant');
		expect(lastBody()).toEqual({ days: 30 });
	});

	it('POSTs a withhold with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { withheld: true }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.withhold('f1', 'the third party will not patch');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/withhold');
		expect(lastBody().reason).toBe('the third party will not patch');
	});

	it('records that the owner was told, with no body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { notified: true }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.markVendorNotified('f1');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/vendor-notified');
		expect(lastCall()[1].body).toBeUndefined();
	});
});

describe('securityApi — duplicates and the clock', () => {
	it('GETs the dedup queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { pairs: [], note: 'x' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.dedupQueue();
		expect(lastUrl()).toBe('/api/admin/security/dedup-queue');
	});

	it('rescans one finding rather than the whole table', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { candidates: 2 }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.rescan('f1');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/rescan');
	});

	it('POSTs the embargo sweep', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { expired: 0, reminded: 1, note: 'x' }, meta: {} })
		);
		const { securityApi } = await import('./security');
		await securityApi.sweepEmbargoes();
		expect(lastUrl()).toBe('/api/admin/security/embargo-sweep');
	});
});

describe('securityApi — the catalogue and the programmes', () => {
	it('POSTs a CTF challenge to the security catalogue route', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { id: 'c1', status: 'draft', note: 'x' }, meta: {} })
		);
		const { securityApi } = await import('./security');
		const res = await securityApi.createChallenge({
			title: 'A flag',
			description: 'd',
			instructions: 'i',
			kind: 'ctf_flag',
			difficulty: 3,
			difficulty_tier: 'medium',
			reward_fragments: 100,
			flag: 'SKILLUV{x}',
			flag_format: 'SKILLUV{...}',
			target_url: 'https://ctf.example'
		});
		expect(lastUrl()).toBe('/api/admin/security/challenges');
		// Created as a draft on purpose: publish it once somebody other than
		// its author has solved it from the instructions alone.
		expect(res.data.status).toBe('draft');
	});

	it('GETs and POSTs curated programmes on the same path', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { programmes: [] }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.listBountyProgrammes();
		expect(lastUrl()).toBe('/api/admin/security/external-bounties');

		fetchMock.mockResolvedValueOnce(okJson({ data: { id: 'p1' }, meta: {} }));
		await securityApi.curateBountyProgramme({
			platform: 'hackerone',
			program_slug: 'acme',
			program_url: 'https://hackerone.com/acme',
			organisation_name: 'Acme'
		});
		expect(lastUrl()).toBe('/api/admin/security/external-bounties');
		expect(lastCall()[1].method).toBe('POST');
	});

	it('verifies a claim at the reviewer severity, not the claimed one', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { verification_code: 'ABC' }, meta: {} })
		);
		const { securityApi } = await import('./security');
		await securityApi.verifyBountyClaim('cl1', 'medium');
		expect(lastUrl()).toBe('/api/admin/security/bounty-claims/cl1/verify');
		expect(lastBody()).toEqual({ severity: 'medium' });
	});

	it('builds a lab from a confirmed finding', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { challenge_id: 'c2', status: 'draft', note: 'x' }, meta: {} })
		);
		const { securityApi } = await import('./security');
		await securityApi.labFromFinding('f1', {
			artifact_key: 'security-proofs/x.pcap',
			artifact_bytes: 1024,
			estimated_minutes: 45,
			redaction_confirmed: true
		});
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/blue-lab');
		expect(lastBody().redaction_confirmed).toBe(true);
	});
});

describe('securityApi — proofs', () => {
	it('exchanges one key for a signed URL, as a query parameter', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({ data: { url: 'https://s3/x', expires_in_seconds: 300 }, meta: {} })
		);
		const { securityApi } = await import('./security');
		await securityApi.proofUrl('security-proofs/a b.png');
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/security/proofs');
		expect(url.searchParams.get('key')).toBe('security-proofs/a b.png');
	});
});

describe('the transition table this app draws buttons from', () => {
	it('says the same thing as the backend state machine', async () => {
		const { nextStatuses } = await import('./security');
		// Mirrors `services::security_findings::allowed_transition`, minus
		// `withdrawn` — that is the reporter's move and no admin surface
		// offers it.
		expect(nextStatuses('submitted')).toEqual(['triaged', 'not_applicable', 'duplicate']);
		expect(nextStatuses('triaged')).toEqual(['confirmed', 'duplicate', 'not_applicable']);
		expect(nextStatuses('confirmed')).toEqual(['fixed', 'duplicate', 'published']);
		expect(nextStatuses('fixed')).toEqual(['published']);
	});

	it('offers nothing from a terminal status', async () => {
		const { nextStatuses } = await import('./security');
		expect(nextStatuses('published')).toEqual([]);
		expect(nextStatuses('duplicate')).toEqual([]);
		expect(nextStatuses('not_applicable')).toEqual([]);
		expect(nextStatuses('withdrawn')).toEqual([]);
	});

	it('never offers publication from a status the backend refuses it from', async () => {
		const { nextStatuses } = await import('./security');
		// Publication is only reachable from `confirmed` and `fixed`. A
		// button drawn anywhere else would be an irreversible action the
		// server refuses, which is the worst kind to offer.
		for (const s of ['submitted', 'triaged', 'duplicate', 'not_applicable'] as const) {
			expect(nextStatuses(s)).not.toContain('published');
		}
	});

	it('orders severity worst-first, the order a queue is worked in', async () => {
		const { severityWeight } = await import('./security');
		const tiers = ['informational', 'low', 'medium', 'high', 'critical'] as const;
		const weights = tiers.map(severityWeight);
		expect(weights).toEqual([...weights].sort((a, b) => a - b));
		expect(severityWeight('critical')).toBeGreaterThan(severityWeight('high'));
	});
});

describe('the vocabularies the forms build on', () => {
	it('carries every status the CHECK on security_findings accepts', async () => {
		const { SECURITY_FINDING_STATUSES } = await import('$lib/types');
		expect(SECURITY_FINDING_STATUSES).toHaveLength(8);
		expect(SECURITY_FINDING_STATUSES).toContain('withdrawn');
		expect(SECURITY_FINDING_STATUSES).toContain('published');
	});

	it('carries the five severity tiers and the six round kinds', async () => {
		const { SECURITY_SEVERITY_TIERS, SECURITY_ROUND_KINDS, SECURITY_TARGET_KINDS } =
			await import('$lib/types');
		expect(SECURITY_SEVERITY_TIERS).toHaveLength(5);
		// Seeded by migration 0547. A slug this list invents is refused by
		// the foreign key, so the form offers only these.
		expect(SECURITY_ROUND_KINDS).toHaveLength(6);
		expect(SECURITY_ROUND_KINDS).toContain('sec_severity_disputed');
		expect(SECURITY_TARGET_KINDS).toEqual(['platform', 'mission', 'project']);
	});
});

describe('securityApi — the surfaces SKI-338 added', () => {
	it('GETs the queue overview', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					by_status: { submitted: 4 },
					by_severity: { high: 3 },
					oldest_untriaged_hours: 336,
					breaching_triage_sla: 1,
					triage_sla_days: 7,
					open_rounds: 0,
					embargoes_expiring_7d: 0,
					embargoes_overdue: 0,
					suspected_duplicates: 0
				},
				meta: {}
			})
		);
		const { securityApi } = await import('./security');
		const res = await securityApi.overview();
		expect(lastUrl()).toBe('/api/admin/security/overview');
		// The threshold travels with the count so the screen can name what it
		// compares against instead of hard-coding it.
		expect(res.data.triage_sla_days).toBe(7);
	});

	it('reads an empty queue as null hours, not zero', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					by_status: {},
					by_severity: {},
					oldest_untriaged_hours: null,
					breaching_triage_sla: 0,
					triage_sla_days: 7,
					open_rounds: 0,
					embargoes_expiring_7d: 0,
					embargoes_overdue: 0,
					suspected_duplicates: 0
				},
				meta: {}
			})
		);
		const { securityApi } = await import('./security');
		const res = await securityApi.overview();
		// Zero hours would read as "something just arrived", which is the
		// opposite of nothing waiting.
		expect(res.data.oldest_untriaged_hours).toBeNull();
	});

	it('POSTs an internal note to the finding it belongs to', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { id: 'c1' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.addComment('f1', 'could not reproduce on staging');
		expect(lastUrl()).toBe('/api/admin/security/findings/f1/comments');
		expect(lastBody()).toEqual({ body_md: 'could not reproduce on staging' });
	});

	it('GETs the research tokens with their filters', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { tokens: [], note: 'x' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.researchTokens({ active_only: true, q: 'ada', limit: 20 });
		const url = new URL(lastUrl(), 'http://x');
		expect(url.pathname).toBe('/api/admin/security/research-tokens');
		expect(url.searchParams.get('active_only')).toBe('true');
		expect(url.searchParams.get('q')).toBe('ada');
		expect(url.searchParams.get('limit')).toBe('20');
	});

	it('GETs the tokens unfiltered when nothing is asked for', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { tokens: [], note: 'x' }, meta: {} }));
		const { securityApi } = await import('./security');
		await securityApi.researchTokens();
		expect(lastUrl()).toBe('/api/admin/security/research-tokens');
	});

	it('carries the internal notes on the finding detail', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: {
					finding: { id: 'f1' },
					events: [],
					rounds: [],
					similar: [],
					comments: [
						{
							id: 'c1',
							body_md: 'reproduced, opening a round',
							at: '2026-08-29T10:00:00Z',
							author: 'ada',
							author_display_name: 'Ada'
						}
					]
				},
				meta: {}
			})
		);
		const { securityApi } = await import('./security');
		const res = await securityApi.detail('f1');
		// One reader, and it is this one — which is what makes "the reporter
		// never sees it" a property rather than a promise.
		expect(res.data.comments).toHaveLength(1);
		expect(res.data.comments[0].author).toBe('ada');
	});
});
