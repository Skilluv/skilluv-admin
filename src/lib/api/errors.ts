import { SkilluError } from './client';
import { i18n } from '$lib/i18n';

export function errorMessage(err: unknown): string {
	if (err instanceof SkilluError && err.message) return err.message;
	if (err instanceof Error && err.message) return err.message;
	return i18n.t('admin.common.errorGeneric');
}
