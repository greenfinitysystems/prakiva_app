/**
 * PRAKIVA visual skins.
 * Only implemented skins belong in this registry. Future skins can provide
 * their own styles and renderers without changing controller functionality.
 */
export const SKINS = [
    { id: 'default', label: 'Default', description: 'PRAKIVA standard appearance' },
] as const;

export type SkinId = (typeof SKINS)[number]['id'];

export function isSkinId(value: unknown): value is SkinId {
    return SKINS.some(skin => skin.id === value);
}
