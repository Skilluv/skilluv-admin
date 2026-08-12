import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Select from './Select.svelte';

const ITEMS = [
	{ value: 'code', label: 'Code' },
	{ value: 'design', label: 'Design' },
	{ value: 'game', label: 'Game' }
];

describe('Select', () => {
	it('renders the current value label in the trigger button', () => {
		render(Select, { items: ITEMS, value: 'design' });
		expect(screen.getByRole('button', { name: /design/i })).toBeInTheDocument();
	});

	it('falls back to the placeholder when value has no matching item', () => {
		render(Select, { items: ITEMS, value: 'zzz' as any, placeholder: 'Choisir…' });
		expect(screen.getByRole('button', { name: /choisir/i })).toBeInTheDocument();
	});

	it('opens a listbox on click and marks the current item as aria-selected', async () => {
		const user = userEvent.setup();
		render(Select, { items: ITEMS, value: 'game' });
		expect(screen.queryByRole('listbox')).toBeNull();

		await user.click(screen.getByRole('button', { name: /game/i }));
		const listbox = screen.getByRole('listbox');
		expect(listbox).toBeInTheDocument();

		const options = screen.getAllByRole('option');
		expect(options).toHaveLength(3);
		expect(options.find((o) => o.getAttribute('aria-selected') === 'true')?.textContent).toContain('Game');
	});

	it('fires onchange with the new value when an option is clicked', async () => {
		const onchange = vi.fn();
		const user = userEvent.setup();
		render(Select, { items: ITEMS, value: 'code', onchange });
		await user.click(screen.getByRole('button', { name: /code/i }));
		await user.click(screen.getByRole('option', { name: 'Design' }));
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(onchange).toHaveBeenCalledWith('design');
	});

	it('filters items when searchable=true and typing a query', async () => {
		const user = userEvent.setup();
		render(Select, {
			items: ITEMS,
			value: 'code',
			searchable: true,
			searchPlaceholder: 'Search'
		});
		await user.click(screen.getByRole('button', { name: /code/i }));
		const search = screen.getByPlaceholderText('Search');
		await user.type(search, 'des');
		const options = screen.getAllByRole('option');
		expect(options).toHaveLength(1);
		expect(options[0].textContent).toContain('Design');
	});

	it('does not open when disabled', async () => {
		const user = userEvent.setup();
		render(Select, { items: ITEMS, value: 'code', disabled: true });
		await user.click(screen.getByRole('button', { name: /code/i }));
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('closes the listbox when Escape is pressed', async () => {
		const user = userEvent.setup();
		render(Select, { items: ITEMS, value: 'code' });
		await user.click(screen.getByRole('button', { name: /code/i }));
		expect(screen.getByRole('listbox')).toBeInTheDocument();
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('listbox')).toBeNull();
	});
});
