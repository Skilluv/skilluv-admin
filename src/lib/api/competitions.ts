/**
 * Series, seasons, contests and awards.
 *
 * ## Seasons are one surface again
 *
 * They were two. `tournament.rs` served `POST /admin/seasons` and
 * `{id}/status` writing `slug, name, description`; `seasons.rs` served
 * `GET/POST /seasons` and `{slug}/activate` writing `slug, name, theme`.
 * Both `INSERT INTO seasons`, so a season created through one path was
 * missing a column the other assumed — which is why this client typed the
 * two shapes apart rather than pretend they agreed.
 *
 * The backend has since **removed the `tournament.rs` writer**, leaving one
 * table with one writer and one shape. `SeasonListRow` is that shape, and
 * the reads and the writes are in this module together now.
 *
 * Two consequences worth stating, because they are not cosmetic:
 *
 *   * a season carries a **theme**, never a description;
 *   * activation is addressed **by slug** and is its own act. There is no
 *     general status write any more: `POST /seasons/{slug}/activate`
 *     promotes one season and demotes whatever was active, and closing is
 *     the separate `POST /admin/seasons/{id}/close`, which is by id because
 *     it returns a report about a season rather than naming a new one.
 */
import type {
	ApiResponse,
	AwardsEdition,
	CreateSeasonInput,
	CreateSeriesInput,
	JudgeSubmissionInput,
	SeasonListRow,
	SeriesRow,
	TournamentSubmission,
	TournamentSubmissions
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const competitionsApi = {
	// --- Seasons ---

	/** Every season, newest first. */
	seasons() {
		return api.get<ApiResponse<{ seasons: SeasonListRow[] }>>('/seasons');
	},

	/** Create a season. `theme` is required and is what the one surviving
	 *  writer records — there is no description column to write. */
	createSeason(input: CreateSeasonInput) {
		return api.post<ApiResponse<{ season: SeasonListRow }>>('/seasons', input);
	},

	/**
	 * Promote a season to active, which demotes whatever was active.
	 *
	 * By slug, not by id — the route names the season the way the rest of
	 * this surface does. It is the only status write there is: everything
	 * else a season becomes, it becomes by being closed.
	 */
	activateSeason(slug: string) {
		return api.post<ApiResponse<{ season: SeasonListRow }>>(
			`/seasons/${encodeURIComponent(slug)}/activate`
		);
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

	/** Entries in one contest. Blinded during the submission window unless
	 *  the caller is a juror, which is the backend's decision and not this
	 *  client's — it asks and renders what comes back. */
	tournamentSubmissions(slug: string) {
		return api.get<ApiResponse<TournamentSubmissions>>(
			`/tournaments/${encodeURIComponent(slug)}/submissions`
		);
	},

	/**
	 * Judge one entry.
	 *
	 * `jury_tournament` or `admin`. A score is required to accept a *judged*
	 * entry and refused on a *measured* one — the contest knows which it is,
	 * so the 400 says so rather than the form guessing.
	 */
	judgeSubmission(id: string, input: JudgeSubmissionInput) {
		return api.post<ApiResponse<{ submission: TournamentSubmission }>>(
			`/submissions/${id}/judge`,
			input
		);
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
