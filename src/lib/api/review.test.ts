/**
 * The reviewer queues served outside `/admin` — client contract.
 *
 * Every path here is one the previous audit could not see, so pinning the
 * paths is half the point. The other half is the three shapes that would
 * fail silently: an abstention that is not a rejection, a rejection that
 * must carry a reason, and a mute that must not exceed a moderator's cap.
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

describe('reviewApi — apprentice verifications', () => {
	it('GETs the queue outside the admin prefix', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { pending: [] }, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.apprenticeQueue({ limit: 50 });
		const url = new URL(lastUrl(), 'http://x');
		// Not `/admin/...`. It is a staff surface gated by `apprentice_verifier`,
		// and the prefix says nothing about that.
		expect(url.pathname).toBe('/api/beginner/verifications/queue');
		expect(url.searchParams.get('limit')).toBe('50');
	});

	it('POSTs a verdict without notes when none were written', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.recordVerdict('v1', 'approved');
		expect(lastUrl()).toBe('/api/beginner/verifications/v1/verdict');
		expect(lastBody()).toEqual({ verdict: 'approved' });
	});

	it('carries abstain as its own verdict', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi, APPRENTICE_VERDICTS } = await import('./review');
		await reviewApi.recordVerdict('v1', 'abstain', 'outside my trade');
		// Abstain is not a soft rejection. A compagnon who could not judge a
		// submission says so, and collapsing it into `rejected` would record a
		// refusal nobody made.
		expect(lastBody()).toEqual({ verdict: 'abstain', notes: 'outside my trade' });
		expect(APPRENTICE_VERDICTS).toEqual(['approved', 'rejected', 'abstain']);
	});
});

describe('reviewApi — quality', () => {
	it('GETs the defect review queue', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: { reports: [] }, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.bugReviewQueue();
		expect(lastUrl()).toBe('/api/quality/bugs/review-queue');
	});

	it('accepts without a reason and rejects with one', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.reviewBug('b1', { decision: 'accept' });
		expect(lastUrl()).toBe('/api/quality/bugs/b1/review');
		expect(lastBody()).toEqual({ decision: 'accept' });

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await reviewApi.reviewBug('b1', {
			decision: 'reject',
			reason: 'not reproducible on the stated build'
		});
		expect(lastBody()).toEqual({
			decision: 'reject',
			reason: 'not reproducible on the stated build'
		});
	});

	it('omits the severity adjustment when the reviewer agreed', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.reviewBug('b1', { decision: 'accept', severity_adjusted_to: 'high' });
		expect((lastBody() as Record<string, string>).severity_adjusted_to).toBe('high');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await reviewApi.reviewBug('b2', { decision: 'accept' });
		// Absent means "I agree with the reporter", which is a statement. An
		// echoed severity would be indistinguishable from a re-assertion.
		expect(lastBody()).not.toHaveProperty('severity_adjusted_to');
	});

	it('names rejection as the decision that needs a reason', async () => {
		const { bugDecisionNeedsReason } = await import('./review');
		expect(bugDecisionNeedsReason('reject')).toBe(true);
		expect(bugDecisionNeedsReason('accept')).toBe(false);
	});
});

describe('reviewApi — the vouching queue', () => {
	it('GETs the list that the break action never had', async () => {
		fetchMock.mockResolvedValueOnce(
			okJson({
				data: { vouchings: [], status: 'live', total: 0, limit: 50, offset: 0 },
				meta: {}
			})
		);
		const { reviewApi } = await import('./review');
		await reviewApi.vouchingQueue({ status: 'live', limit: 50 });
		const url = new URL(lastUrl(), 'http://x');
		// `breakVouching` has been wired since the post-MVP batch with nothing
		// listing what could be broken — the shape SKI-337 described.
		expect(url.pathname).toBe('/api/moderation/vouchings');
		expect(url.searchParams.get('status')).toBe('live');
	});

	it('lists the three derived statuses', async () => {
		const { VOUCHING_STATUSES } = await import('./review');
		expect(VOUCHING_STATUSES).toEqual(['live', 'broken', 'expired']);
	});
});

describe('reviewApi — forum moderation', () => {
	it('POSTs a post action with its reason', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.moderatePost('p1', { action: 'hide', reason: 'doxxing' });
		expect(lastUrl()).toBe('/api/forum/posts/p1/moderate');
		expect(lastBody()).toEqual({ action: 'hide', reason: 'doxxing' });
	});

	it('lists the four post actions, including the two that undo', async () => {
		const { FORUM_POST_ACTIONS } = await import('./review');
		// `unhide` and `unlock` matter: a moderation surface with no way back
		// makes every decision permanent by accident.
		expect(FORUM_POST_ACTIONS).toEqual(['hide', 'lock', 'unlock', 'unhide']);
	});

	it('POSTs a mute with a duration', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi, MUTE_MAX_HOURS } = await import('./review');
		await reviewApi.muteUser('u1', { reason: 'repeated harassment', duration_hours: 48 });
		expect(lastUrl()).toBe('/api/forum/users/u1/mute');
		expect((lastBody() as Record<string, number>).duration_hours).toBe(48);
		// Beyond the cap the right instrument is a ban, which is a different
		// decision with a different audit trail.
		expect(MUTE_MAX_HOURS).toBe(168);
	});
});

describe('reviewApi — the per-domain slice confirmations', () => {
	it('reads and writes translation reviews on one slice', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: [], meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.translationReviews('s1');
		expect(lastUrl()).toBe('/api/communication/slices/s1/translation-reviews');

		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		await reviewApi.reviewTranslation('s1', { language: 'wo', notes_md: 'reads naturally' });
		expect(lastUrl()).toBe('/api/communication/slices/s1/translation-reviews');
		expect(lastBody()).toEqual({ language: 'wo', notes_md: 'reads naturally' });
	});

	it('POSTs the education and leadership confirmations with no body', async () => {
		fetchMock.mockResolvedValueOnce(okJson({ data: {}, meta: {} }));
		const { reviewApi } = await import('./review');
		await reviewApi.declareLearnerDataCleared('s1');
		expect(lastUrl()).toBe('/api/education/slices/s1/learner-data-cleared');
		expect(lastCall()[1].body).toBeUndefined();

		fetchMock.mockResolvedValueOnce(okJson({ data: { confirmed: true }, meta: {} }));
		await reviewApi.confirmRedaction('s1');
		expect(lastUrl()).toBe('/api/leadership/slices/s1/redaction/confirm');
	});
});
