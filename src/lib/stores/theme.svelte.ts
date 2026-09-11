const STORAGE_KEY = 'theme-mode';

class ThemeStore {
	mode = $state<'dark' | 'light'>('dark');

	constructor() {
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === 'light' || stored === 'dark') {
				this.mode = stored;
			}
			this.applyToDocument();
		}
	}

	toggle() {
		this.mode = this.mode === 'dark' ? 'light' : 'dark';
		this.applyToDocument();
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, this.mode);
		}
	}

	get isDark(): boolean {
		return this.mode === 'dark';
	}

	private applyToDocument() {
		if (typeof window === 'undefined') return;
		const html = document.documentElement;
		if (this.mode === 'dark') {
			html.classList.add('dark');
			html.classList.remove('light');
			html.style.colorScheme = 'dark';
		} else {
			html.classList.remove('dark');
			html.classList.add('light');
			html.style.colorScheme = 'light';
		}
	}
}

export const themeStore = new ThemeStore();
