import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TagInput from './TagInput.svelte';

/** The component renders its own <input> without a <label>; every test grabs
 *  it by role since there is exactly one textbox in the tree. */
function textbox(): HTMLInputElement {
	return screen.getByRole('textbox') as HTMLInputElement;
}

describe('TagInput', () => {
	it('renders the initial tags as removable chips', () => {
		render(TagInput, { value: ['skilluv-challenge', 'good first issue'] });
		expect(screen.getByRole('button', { name: /retirer skilluv-challenge/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /retirer good first issue/i })).toBeInTheDocument();
	});

	it('commits a draft on Enter and reports it', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, { value: [], onchange });

		await user.type(textbox(), 'bug{Enter}');

		expect(onchange).toHaveBeenCalledWith(['bug']);
		expect(screen.getByRole('button', { name: /retirer bug/i })).toBeInTheDocument();
		// The draft is cleared so the next tag starts from empty.
		expect(textbox().value).toBe('');
	});

	it('commits on comma too', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, { value: [], onchange });

		await user.type(textbox(), 'ops,');

		expect(onchange).toHaveBeenCalledWith(['ops']);
	});

	it('ignores a duplicate without raising an error', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, { value: ['bug'], onchange });

		await user.type(textbox(), 'bug{Enter}');

		expect(onchange).not.toHaveBeenCalled();
		expect(textbox().value).toBe('');
		expect(screen.getAllByRole('button', { name: /retirer bug/i })).toHaveLength(1);
	});

	it('rejects a draft the validator refuses and keeps it editable', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, {
			value: [],
			onchange,
			validate: (tag: string) => (tag.length < 3 ? 'Trop court.' : null)
		});

		await user.type(textbox(), 'ab{Enter}');

		expect(onchange).not.toHaveBeenCalled();
		expect(screen.getByText('Trop court.')).toBeInTheDocument();
		expect(textbox().value).toBe('ab');
	});

	it('removes the last tag on Backspace when the draft is empty', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, { value: ['a', 'b'], onchange });

		await user.click(textbox());
		await user.keyboard('{Backspace}');

		expect(onchange).toHaveBeenCalledWith(['a']);
	});

	it('removes a tag when its chip button is clicked', async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(TagInput, { value: ['a', 'b'], onchange });

		await user.click(screen.getByRole('button', { name: /retirer a/i }));

		expect(onchange).toHaveBeenCalledWith(['b']);
	});
});
