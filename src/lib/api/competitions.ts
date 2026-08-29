/**
 * Series, seasons, contests and awards.
 *
 * Seven routes that complete surfaces this app already had half of.
 *
 * ## The seasons duplication, and why this module reads one and writes the
 * other
 *
 * The backend serves **two independent season surfaces over one table**:
 *
 *   * `tournament.rs` — `POST /admin/seasons`, `{id}/status`, `{id}/close`,
 *     writing `slug, name, description, starts_at, ends_at`;
 *   * `seasons.rs` — `GET/POST /seasons`, `GET /seasons/current`,
 *     `POST /seasons/{slug}/activate`, writing `slug, name, theme,
 *     starts_at, ends_at`.
 *
 * Both `INSERT INTO seasons`. The column sets differ — one records a theme,
 * the other a description — so a season created through one path is missing
 * a field the other assumes.
 *
 * This app writes through `/admin/seasons`, which is what the tournaments
 * page has always used. What it lacked was a **list**: `/admin/seasons` has
 * no GET at all, so the page could create and close seasons without ever
 * showing them. `GET /seasons` is the only listing that exists, so that is
 * what is called here — a read against the same table, not a second writer.
 *
 * The duplication itself is a backend question and is filed on SKI-354.
 */
import type {
	ApiResponse,
	AwardsEdition,
	CreateSeriesInput,
	SeasonListRow,
	SeriesRow
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const competitionsApi = {
	// --- Seasons ---

	/** Every season, newest first. The only listing the backend serves — see
	 *  the module note. */
	seasons() {
		return api.get<ApiResponse<{ seasons: SeasonListRow[] }>>('/seasons');
	},

	// --- Series ---

	series(params?: { kind?: string; limit?: number }) {
		return api.get<ApiResponse<{ series: SeriesRow[] }>>(
			'/series',
			params as Record<string, string | number>
		);
	},

	/** Answers 409 when the slug is taken, 400 when it ends before it
	 *  starts. */
	createSeries(input: CreateSeriesInput) {
		return api.post<ApiResponse<{ series: SeriesRow }>>('/admin/series', input);
	},

	/**
	 * Put a contest in a series.
	 *
	 * `category` is what the contest is *for* inside the series — a family
	 * for an awards edition, an editorial axis for a programme. It is absent
	 * for a sprint, whose contest is the whole of its series, and the backend
	 * refuses a second contest in the same category.
	 */
	attachTournament(seriesSlug: string, tournamentId: string, category?: string) {
		return api.post<ApiResponse<Record<string, unknown>>>(
			`/admin/series/${encodeURIComponent(seriesSlug)}/tournaments`,
			category ? { tournament_id: tournamentId, category } : { tournament_id: tournamentId }
		);
	},

	// --- Contests ---

	/** Books the contest's revenue. */
	concludeContest(id: string) {
		return api.post<ApiResponse<{ revenue_booked: string }>>(`/admin/contests/${id}/conclude`);
	},

	// --- Awards ---

	/** One edition's categories and their standings. The nominee ids the
	 *  shortlist call needs come from here. */
	awardsEdition(year: number) {
		return api.get<ApiResponse<AwardsEdition>>(`/awards/${year}`);
	},

	/**
	 * Fix the shortlist for a ballot.
	 *
	 * Curators, not administrators — the backend accepts `community_curator`
	 * or `admin`, and the reason is in its own comment: choosing which work
	 * belongs on a ballot is an editorial judgement, not an operational one.
	 *
	 * The whole list is sent, not a delta: a shortlist is a set, and patching
	 * it one id at a time is how two curators end up with different ballots.
	 */
	shortlistNominees(nomineeIds: string[]) {
		return api.post<ApiResponse<{ shortlisted: number }>>('/awards/nominees/shortlist', {
			nominee_ids: nomineeIds
		});
	}
};

/** `services::series::KINDS`. */
export const SERIES_KINDS = ['awards_edition', 'sprint', 'programme'] as const;
