/**
 * The game domain's reviewer and admin surface — `admin_game.rs`, ten routes.
 *
 * One of them is a read (`mods/pending`); the other nine are decisions. That
 * ratio is the shape of the screen: a queue, and a set of forms that each
 * need an id the operator already has from somewhere else.
 *
 * ## Two gates, not one
 *
 * `require_any_capability` is called with different lists per route:
 *
 *   * reviewing work — validate a slice, judge a mod, issue an attestation,
 *     open a jam — accepts any `game_reviewer:{family}`, `game_reviewer:all`
 *     or `admin`;
 *   * finalising a jam and featuring a creator are `admin` only.
 *
 * The screens do not hide the second set from a reviewer. A hidden button
 * teaches nobody which capability they lack; a 403 with its message does.
 * That is the same choice made on `/security`, for the same reason.
 */
import type {
	ApiResponse,
	CreateJamInput,
	FeatureCreatorInput,
	GameJam,
	GameMod,
	JamFinalizeReport,
	OpenSourceAttestationInput,
	ShippedTitleInput
} from '$lib/types';
import { createApiClient } from './client';

const api = createApiClient();

export const gameApi = {
	// --- Slices ---

	/** Sign off a game slice once its playtests are met. The playtest count is
	 *  the hard gate and lives in the service; this is the reviewer's
	 *  signature on top of it. */
	validateSlice(sliceId: string) {
		return api.post<ApiResponse<{ validated: boolean; deliverable_id: string }>>(
			`/admin/game/slices/${sliceId}/validate`
		);
	},

	// --- Mods ---

	/** Registered and unjudged, oldest first, capped at 100 server-side. */
	pendingMods() {
		return api.get<ApiResponse<{ mods: GameMod[] }>>('/admin/game/mods/pending');
	},

	confirmMod(id: string, reason: string) {
		return api.post<ApiResponse<{ mod: GameMod }>>(`/admin/game/mods/${id}/confirm`, { reason });
	},

	refuseMod(id: string, reason: string) {
		return api.post<ApiResponse<{ mod: GameMod }>>(`/admin/game/mods/${id}/refuse`, { reason });
	},

	/** Correct the download count. It is a figure from a site Skilluv does
	 *  not control and the author declared it, which is why a reviewer can
	 *  overwrite it rather than it being read-only. */
	setModDownloads(id: string, downloads: number) {
		return api.post<ApiResponse<{ mod: GameMod }>>(`/admin/game/mods/${id}/downloads`, {
			downloads
		});
	},

	// --- Jams ---

	createJam(input: CreateJamInput) {
		return api.post<ApiResponse<{ jam: GameJam }>>('/admin/game/jams', input);
	},

	/** Score every submission, rank the field, issue the attestations.
	 *  Admin only, and safe to re-run: the scoring and the attestations both
	 *  converge, and the tournament's refusal of a second conclusion is
	 *  caught and treated as done. */
	finalizeJam(id: string) {
		return api.post<ApiResponse<{ report: JamFinalizeReport }>>(
			`/admin/game/jams/${id}/finalize`
		);
	},

	// --- Reviewer-confirmed attestations ---

	/** Both of these recompute the holder's proofs immediately: the
	 *  attestation feeds the score and the rank, so leaving it to the next
	 *  sweep would show the person an unchanged profile after being told
	 *  they earned something. */
	issueShippedTitle(input: ShippedTitleInput) {
		return api.post<ApiResponse<{ attestation: unknown }>>(
			'/admin/game/attestations/shipped-title',
			input
		);
	},

	issueOpenSource(input: OpenSourceAttestationInput) {
		return api.post<ApiResponse<{ attestation: unknown }>>(
			'/admin/game/attestations/open-source',
			input
		);
	},

	// --- Featured ---

	/** Admin only. The bio is not optional — the backend rejects an empty
	 *  one, because a featuring is an editorial choice and has to say why. */
	featureCreator(input: FeatureCreatorInput) {
		return api.post<ApiResponse<{ featured: unknown }>>('/admin/game/featured', input);
	}
};

/** `services::game_jams::JAM_KINDS`. */
export const GAME_JAM_KINDS = ['game_jam_48h', 'game_jam_72h', 'game_jam_week'] as const;

/** The minimum a reviewer must write when judging a mod.
 *
 *  The backend does not enforce a floor here, so this one is the screen's
 *  own: "no" recorded against somebody's work with an empty reason is a
 *  decision nobody can appeal or learn from. Stated as a constant so the
 *  form and any future test agree on it.
 */
export const MOD_REASON_MIN = 12;
