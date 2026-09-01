/**
 * Studios — a bookable team, formed in one sitting.
 *
 * Four admin writes and two public reads. The shape of the screen follows
 * from one fact about the reads: **`GET /studios` returns only `active`
 * studios.** A studio being formed is in no list an admin can reach, so
 * creating one, staffing it and activating it has to happen while the page
 * still holds the id that `POST /admin/studios` answered with.
 *
 * That is not a workaround for a missing screen — it matches how a studio is
 * actually put together, in one conversation. But it does mean that leaving
 * mid-formation strands the studio until SKI-354 lands a listing that
 * includes `forming`. The page says so rather than letting somebody find out.
 *
 * Disbanding works from the public list, because a studio you would disband
 * is by definition one that was activated.
 */
import type {
	ApiResponse,
	Studio,
	StudioInput,
	StudioMember,
	StudioMemberInput
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const studiosApi = {
	/** Bookable studios: `status = 'active'` only. */
	list() {
		return api.get<ApiResponse<{ studios: Studio[] }>>('/studios');
	},

	detail(id: string) {
		return api.get<ApiResponse<{ studio: Studio; members: StudioMember[] }>>(`/studios/${id}`);
	},

	/** Answers with the studio, id included — which is the only handle on it
	 *  until it is activated. */
	create(input: StudioInput) {
		return api.post<ApiResponse<{ studio: Studio }>>('/admin/studios', input);
	},

	/** Answers with the whole member list, so the running total of shares can
	 *  be shown without a second read. */
	addMember(studioId: string, member: StudioMemberInput) {
		return api.post<ApiResponse<{ members: StudioMember[] }>>(
			`/admin/studios/${studioId}/members`,
			member
		);
	},

	/** Refused with fewer than two members, with shares that do not total
	 *  100%, or with a lead who is not on the team. The form checks the first
	 *  two before sending — they are arithmetic, and arithmetic is a bad
	 *  thing to learn from a 400. */
	activate(studioId: string, leadUserId: string) {
		return api.post<ApiResponse<{ studio: Studio }>>(`/admin/studios/${studioId}/activate`, {
			lead_user_id: leadUserId
		});
	},

	/** Refused while engagements are still running. */
	disband(studioId: string, reason: string) {
		return api.post<ApiResponse<{ disbanded: boolean }>>(
			`/admin/studios/${studioId}/disband`,
			{ reason }
		);
	}
};

/** A studio cannot be activated with fewer than this. One person is not a
 *  team, and the backend says so. */
export const STUDIO_MIN_MEMBERS = 2;

/**
 * Whether the shares add up.
 *
 * Compared as strings summed in integer hundredths rather than as floats:
 * three members on 33.34 / 33.33 / 33.33 is exactly the case a float gets
 * wrong, and it is also the most likely split anybody types.
 */
export function sharesTotal(shares: string[]): number {
	return shares.reduce((total, s) => {
		const [whole, frac = ''] = s.trim().split('.');
		const hundredths = Number(`${whole || '0'}${(frac + '00').slice(0, 2)}`);
		return total + (Number.isFinite(hundredths) ? hundredths : 0);
	}, 0);
}

export function sharesComplete(shares: string[]): boolean {
	return sharesTotal(shares) === 10000;
}
