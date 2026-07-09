import type { UserPrivate } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			user: UserPrivate | null;
		}
		interface PageData {
			user: UserPrivate | null;
		}
	}
}

export {};
