import { Preferences } from '@capacitor/preferences';

export type AppTheme = 'system' | 'light' | 'dark';
const THEME_KEY = 'prakiva.app_theme.v1';

export async function loadAppTheme(): Promise<AppTheme> {
    const result = await Preferences.get({ key: THEME_KEY });
    if (result.value === 'light' || result.value === 'dark' || result.value === 'system') {
        return result.value;
    }
    return 'system';
}

export function applyAppTheme(theme: AppTheme): void {
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const useDark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.classList.toggle('ion-palette-dark', useDark);
}

export async function saveAppTheme(theme: AppTheme): Promise<void> {
    await Preferences.set({ key: THEME_KEY, value: theme });
    applyAppTheme(theme);
}
