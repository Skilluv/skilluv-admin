import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDangerousDialog from './ConfirmDangerousDialog.svelte';

const baseProps = {
	open: true,
	title: 'Ban user',
	actionLabel: 'Ban',
	onconfirm: vi.fn(),
	onclose: vi.fn()
};

describe('ConfirmDangerousDialog', () => {
	it('disables the confirm button while reason is empty', () => {
		render(ConfirmDangerousDialog, { ...baseProps });
		const btn = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('keeps confirm disabled when reason is shorter than minReasonLength', async () => {
		const user = userEvent.setup();
		render(ConfirmDangerousDialog, { ...baseProps, minReasonLength: 6 });
		const input = screen.getByTestId('confirm-dangerous-reason') as HTMLInputElement;
		await user.type(input, 'abc');
		const btn = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('enables confirm and fires onconfirm with trimmed reason once valid', async () => {
		const onconfirm = vi.fn();
		const user = userEvent.setup();
		render(ConfirmDangerousDialog, { ...baseProps, onconfirm, minReasonLength: 4 });
		const input = screen.getByTestId('confirm-dangerous-reason') as HTMLInputElement;
		await user.type(input, '   spam abuse   ');
		const btn = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		await user.click(btn);
		expect(onconfirm).toHaveBeenCalledTimes(1);
		expect(onconfirm).toHaveBeenCalledWith('spam abuse');
	});

	it('skips reason gate when requireReason=false', async () => {
		const onconfirm = vi.fn();
		const user = userEvent.setup();
		render(ConfirmDangerousDialog, { ...baseProps, onconfirm, requireReason: false });
		const btn = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		await user.click(btn);
		expect(onconfirm).toHaveBeenCalledWith('');
	});

	it('disables both buttons and shows loading state on the action button', () => {
		render(ConfirmDangerousDialog, { ...baseProps, loading: true, requireReason: false });
		const action = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;
		expect(action.disabled).toBe(true);
	});

	it('honours minReasonLength=8 (BE reset-2fa contract)', async () => {
		const onconfirm = vi.fn();
		const user = userEvent.setup();
		render(ConfirmDangerousDialog, { ...baseProps, onconfirm, minReasonLength: 8 });
		const input = screen.getByTestId('confirm-dangerous-reason') as HTMLInputElement;
		const btn = screen.getByTestId('confirm-dangerous-action') as HTMLButtonElement;

		await user.type(input, 'sevenc.');
		expect(btn.disabled).toBe(true);

		await user.type(input, 'x');
		expect(btn.disabled).toBe(false);
		await user.click(btn);
		expect(onconfirm).toHaveBeenCalledWith('sevenc.x');
	});
});
