import { Preferences } from '@capacitor/preferences';
import { isSkinId, type SkinId } from '../theme/skin-registry';

const SKIN_KEY = 'prakiva.skin.v1';

export async function loadAppTheme(): Promise<SkinId> {
    const { value } = await Preferences.get({ key: SKIN_KEY });
    return isSkinId(value) ? value : 'default';
}

export function applyAppTheme(skin: SkinId): void {
    document.documentElement.dataset.prakivaSkin = skin;
    // The Default skin retains its existing system-responsive light/dark palette.
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.classList.toggle('ion-palette-dark', systemDark);
}

export async function saveAppTheme(skin: SkinId): Promise<void> {
    await Preferences.set({ key: SKIN_KEY, value: skin });
    applyAppTheme(skin);
}
