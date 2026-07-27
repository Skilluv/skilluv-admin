import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import Modal from './Modal.svelte';

/**
 * Build a text-only snippet the way Svelte 5 expects for `children` / `actions`
 * props. `createRawSnippet` returns the value tuple template functions Svelte
 * hydrates internally — testing components that take snippets requires this.
 */
function textSnippet(text: string) {
	return createRawSnippet(() => ({
		render: () => `<span data-testid="snippet-body">${text}</span>`
	}));
}

describe('Modal', () => {
	it('renders nothing when open=false', () => {
		render(Modal, {
			open: false,
			onclose: vi.fn(),
			children: textSnippet('hidden content')
		});
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByTestId('snippet-body')).toBeNull();
	});

	it('renders a dialog with the title, aria-modal, and body content when open', () => {
		render(Modal, {
			open: true,
			title: 'Ban user',
			onclose: vi.fn(),
			children: textSnippet('confirm block')
		});
		const dlg = screen.getByRole('dialog');
		expect(dlg.getAttribute('aria-modal')).toBe('true');
		expect(dlg.getAttribute('aria-label')).toBe('Ban user');
		expect(screen.getByRole('heading', { name: 'Ban user' })).toBeInTheDocument();
		expect(screen.getByTestId('snippet-body').textContent).toBe('confirm block');
	});

	it('triggers onclose when the close (X) button is clicked', async () => {
		const onclose = vi.fn();
		const user = userEvent.setup();
		render(Modal, {
			open: true,
			title: 'Ban user',
			onclose,
			children: textSnippet('body')
		});
		await user.click(screen.getByRole('button', { name: /fermer/i }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('triggers onclose when Escape is pressed', async () => {
		const onclose = vi.fn();
		const user = userEvent.setup();
		render(Modal, {
			open: true,
			title: 'Ban user',
			onclose,
			children: textSnippet('body')
		});
		screen.getByRole('dialog').focus();
		await user.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('triggers onclose when the backdrop (dialog itself) is clicked, but not when clicking inner content', async () => {
		const onclose = vi.fn();
		const user = userEvent.setup();
		render(Modal, {
			open: true,
			title: 'Ban user',
			onclose,
			children: textSnippet('body')
		});
		// Click on the body (inner) — should NOT close.
		await user.click(screen.getByTestId('snippet-body'));
		expect(onclose).not.toHaveBeenCalled();
		// Click on the backdrop (the dialog element itself).
		await user.click(screen.getByRole('dialog'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('does not render a header (title bar + close button) when title is omitted', () => {
		render(Modal, {
			open: true,
			onclose: vi.fn(),
			children: textSnippet('body')
		});
		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.queryByRole('button', { name: /fermer/i })).toBeNull();
	});

	it('renders the actions snippet in a dedicated footer when provided', () => {
		render(Modal, {
			open: true,
			title: 't',
			onclose: vi.fn(),
			children: textSnippet('body'),
			actions: createRawSnippet(() => ({
				render: () => '<button data-testid="footer-btn">Confirm</button>'
			}))
		});
		expect(screen.getByTestId('footer-btn').textContent).toBe('Confirm');
	});
});
