import type { Theme, ThemeBase, ThemeMode } from '$lib/types';

const THEME_KEY = 'skilluv-theme';
const MODE_KEY = 'skilluv-mode';
const VALID_BASES: ThemeBase[] = ['forge', 'neon', 'arena', 'terminal', 'sakura'];

class ThemeState {
	base = $state<ThemeBase>('forge');
	mode = $state<ThemeMode>('dark');
	current = $derived<Theme>(this.mode === 'dark' ? this.base : `${this.base}-light`);

	/** Initialise le theme depuis localStorage */
	init() {
		if (typeof window === 'undefined') return;

		const storedBase = localStorage.getItem(THEME_KEY);
		if (storedBase && VALID_BASES.includes(storedBase as ThemeBase)) {
			this.base = storedBase as ThemeBase;
		}

		const storedMode = localStorage.getItem(MODE_KEY);
		if (storedMode === 'light' || storedMode === 'dark') {
			this.mode = storedMode;
		}

		this.apply();
	}

	set(themeBase: ThemeBase) {
		this.base = themeBase;
		if (typeof window !== 'undefined') {
			localStorage.setItem(THEME_KEY, themeBase);
			this.apply();
		}
	}

	toggleMode() {
		this.mode = this.mode === 'dark' ? 'light' : 'dark';
		if (typeof window !== 'undefined') {
			localStorage.setItem(MODE_KEY, this.mode);
			this.apply();
		}
	}

	setMode(mode: ThemeMode) {
		this.mode = mode;
		if (typeof window !== 'undefined') {
			localStorage.setItem(MODE_KEY, mode);
			this.apply();
		}
	}

	private apply() {
		document.documentElement.setAttribute('data-theme', this.current);
	}
}

export const theme = new ThemeState();
