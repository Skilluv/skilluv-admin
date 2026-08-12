import { redirect } from '@sveltejs/kit';

/** `/validators` has no landing screen of its own — the candidacy inbox is
 *  the thing an admin actually opens. */
export function load() {
	redirect(307, '/validators/applications');
}
