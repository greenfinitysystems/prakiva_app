import { Preferences } from '@capacitor/preferences';
import { isSkinId, type SkinId } from '../theme/skin-registry';

const SKIN_KEY = 'prakiva.skin.v1';

// Notify React consumers when the active presentation skin changes.
// Controller state and sensor acquisition are deliberately independent of this.
const SKIN_CHANGED_EVENT = 'prakiva:skin-changed';

export function getActiveSkin(): SkinId {
    const value = document.documentElement.dataset.prakivaSkin;
    return isSkinId(value) ? value : 'default';
}

export function subscribeToSkinChanges(listener: () => void): () => void {
    window.addEventListener(SKIN_CHANGED_EVENT, listener);
    return () => window.removeEventListener(SKIN_CHANGED_EVENT, listener);
}


export async function loadAppTheme(): Promise<SkinId> {
    const { value } = await Preferences.get({ key: SKIN_KEY });
    return isSkinId(value) ? value : 'default';
}

export function applyAppTheme(skin: SkinId): void {
    document.documentElement.dataset.prakivaSkin = skin;
    window.dispatchEvent(new Event(SKIN_CHANGED_EVENT));
    // The Default skin retains its existing system-responsive light/dark palette.
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.classList.toggle('ion-palette-dark', skin === 'default' && systemDark);
}

export async function saveAppTheme(skin: SkinId): Promise<void> {
    await Preferences.set({ key: SKIN_KEY, value: skin });
    applyAppTheme(skin);
}
