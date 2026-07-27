import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Input from './Input.svelte';

describe('Input', () => {
	it('associates the label to the input via for/id', () => {
		render(Input, { label: 'Email address', value: '' });
		const input = screen.getByLabelText('Email address');
		expect(input).toBeInTheDocument();
		expect(input.tagName).toBe('INPUT');
	});

	it('renders as a password field by default when type=password', () => {
		render(Input, { label: 'Password', type: 'password', value: '' });
		const input = screen.getByLabelText('Password') as HTMLInputElement;
		expect(input.type).toBe('password');
	});

	it('exposes a "show password" toggle only for type=password', () => {
		const { unmount } = render(Input, { label: 'Password', type: 'password', value: '' });
		expect(screen.getByRole('button', { name: /afficher le mot de passe/i })).toBeInTheDocument();
		unmount();

		render(Input, { label: 'Email', type: 'email', value: '' });
		expect(screen.queryByRole('button', { name: /afficher le mot de passe/i })).toBeNull();
	});

	it('toggles the input type between password and text when the eye button is clicked', async () => {
		const user = userEvent.setup();
		render(Input, { label: 'Password', type: 'password', value: 'secret' });

		const input = screen.getByLabelText('Password') as HTMLInputElement;
		expect(input.type).toBe('password');

		const toggle = screen.getByRole('button', { name: /afficher le mot de passe/i });
		await user.click(toggle);
		expect(input.type).toBe('text');
		// aria-label flips to the inverse action after the reveal.
		expect(screen.getByRole('button', { name: /masquer le mot de passe/i })).toBe(toggle);

		await user.click(toggle);
		expect(input.type).toBe('password');
	});

	it('renders an accessible error message linked via aria-describedby', () => {
		render(Input, { label: 'Email', value: '', error: 'Format invalide' });
		const input = screen.getByLabelText('Email');
		const err = screen.getByRole('alert');
		expect(err.textContent).toContain('Format invalide');
		expect(input.getAttribute('aria-describedby')).toBe(err.id);
		expect(input.getAttribute('aria-invalid')).toBe('true');
	});

	it('renders a hint only when there is no error (error takes precedence)', () => {
		const { unmount } = render(Input, { label: 'Email', value: '', hint: 'Never shared' });
		expect(screen.getByText('Never shared')).toBeInTheDocument();
		unmount();

		render(Input, { label: 'Email', value: '', hint: 'Never shared', error: 'Format invalide' });
		expect(screen.queryByText('Never shared')).toBeNull();
		expect(screen.getByRole('alert').textContent).toContain('Format invalide');
	});
});
