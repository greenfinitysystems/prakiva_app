import seedCatalog from '../assets/seed/profiles.v1.json';
import type { ControlProfile, ProfileChannelDescriptor } from '../models/control-profile';
import { ControlConfigurationStore } from './control-configuration-store';

const STORAGE_PREFIX = 'prakiva.controls.profiles.control.';
const LEGACY_CAPABILITY_PREFIX = 'prakiva.controls.profiles.';
const LEGACY_LIGHTING_PROFILE_KEY = 'prakiva.lighting.customProfiles';
const LEGACY_LIGHTING_CAPABILITY_ID = 'analog_channel_1';
const storageKey = (controlId: string) => `${STORAGE_PREFIX}${controlId}`;

const cloneProfile = (profile: ControlProfile): ControlProfile => ({
    ...profile,
    channels: profile.channels.map(channel => ({
        ...channel, configuration: structuredCloneSafe(channel.configuration),
    })),
});
const structuredCloneSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isProfile = (value: unknown): value is ControlProfile => {
    if (!value || typeof value !== 'object') return false;
    const profile = value as Partial<ControlProfile>;
    return typeof profile.name === 'string' && typeof profile.controlId === 'string' &&
        typeof profile.capabilityId === 'string' && Array.isArray(profile.channels) &&
        profile.channels.every(channel => !!channel && typeof channel.channelId === 'string' &&
            typeof channel.policy === 'string' && !!channel.configuration &&
            typeof channel.configuration === 'object' && !Array.isArray(channel.configuration));
};

type LegacyCurvePoint = { x: number; y: number };
type LegacyCurve = { id: string; label?: string; points: LegacyCurvePoint[]; [key: string]: unknown };
type LegacyCurveProfile = { name: string; curves: LegacyCurve[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const isLegacyCurve = (value: unknown): value is LegacyCurve =>
    isRecord(value) && typeof value.id === 'string' && Array.isArray(value.points) &&
    value.points.every(point => isRecord(point) && typeof point.x === 'number' && typeof point.y === 'number');

const isLegacyCurveProfile = (value: unknown): value is LegacyCurveProfile =>
    isRecord(value) && typeof value.name === 'string' && Array.isArray(value.curves);

const legacyCurveProfiles = (
    parsed: unknown, controlId: string, capabilityId: string, channels: ProfileChannelDescriptor[],
): ControlProfile[] => {
    if (!Array.isArray(parsed)) return [];
    const aliases: Record<string, string> = { W: 'white', R: 'red', G: 'green', B: 'blue' };
    return parsed.filter(isLegacyCurveProfile)
        .map(item => ({
            profileId: `migrated:${controlId}:${item.name}`, controlId, capabilityId, name: item.name, source: 'custom' as const,
            channels: item.curves.filter(isLegacyCurve)
                .filter(curve => channels.some(channel => channel.id === curve.id || aliases[curve.id] === channel.id))
                .map(curve => {
                    const id = aliases[curve.id] ?? curve.id;
                    const channel = channels.find(candidate => candidate.id === id);
                    return { channelId: id, policy: 'analog_curve', configuration: { curve: { ...curve, id, label: channel?.label ?? curve.label, points: curve.points.map(point => ({ x: point.x, y: point.y })) } } };
                }),
        }));
};

/** Optional, data-only starter catalog. Seed profiles use the ordinary user profile format.
 * Imported as baseline (not a pending configuration edit); the user must explicitly apply.
 * A saved empty collection is respected, so deleted seeds do not reappear.
 */
const seedProfiles = (controlId: string, capabilityId: string, channels: ProfileChannelDescriptor[]): ControlProfile[] => {
    const candidates = seedCatalog.schema_version === 1 ? seedCatalog.profiles : [];
    const profiles: ControlProfile[] = candidates
        .filter(item => item.capabilityId === capabilityId)
        .map(item => ({
            profileId: `seed:${item.id}`, controlId, capabilityId, name: item.name,
            source: 'custom' as const,
            channels: item.channels.filter(channel => channels.some(actual => actual.id === channel.channelId))
                .map(channel => ({ channelId: channel.channelId, policy: channel.policy,
                    configuration: structuredCloneSafe(channel.configuration) })),
        }))
        .filter(profile => profile.channels.length > 0 && isProfile(profile));
    if (profiles.length) ControlConfigurationStore.importProfilesAsBaseline(capabilityId, controlId, profiles);
    return profiles.map(cloneProfile);
};

export const ControlProfileStore = {
    getCustomProfiles(controlId: string, capabilityId: string, channels: ProfileChannelDescriptor[] = []): ControlProfile[] {
        const stored = ControlConfigurationStore.getProfiles(capabilityId, controlId);
        if (ControlConfigurationStore.hasProfileCollection(capabilityId, controlId)) return stored.filter(isProfile).map(cloneProfile);

        // Import legacy profile keys into the working configuration without writing storage.
        try {
            const current = localStorage.getItem(storageKey(controlId));
            if (current !== null) {
                const parsed: unknown = JSON.parse(current);
                const profiles = Array.isArray(parsed) ? parsed.filter(isProfile).map(cloneProfile) : [];
                if (profiles.length) ControlConfigurationStore.importProfilesAsBaseline(capabilityId, controlId, profiles);
                return profiles.length ? profiles : seedProfiles(controlId, capabilityId, channels);
            }
            const legacyRaw = localStorage.getItem(`${LEGACY_CAPABILITY_PREFIX}${capabilityId}`);
            let migrated: ControlProfile[] = [];
            if (legacyRaw !== null) {
                const parsed: unknown = JSON.parse(legacyRaw);
                migrated = Array.isArray(parsed) && parsed.every(isProfile)
                    ? parsed.map((profile: ControlProfile) => ({ ...profile, profileId: `migrated:${controlId}:${profile.name}`, controlId, capabilityId, source: 'custom' }))
                    : legacyCurveProfiles(parsed, controlId, capabilityId, channels);
            } else if (capabilityId === LEGACY_LIGHTING_CAPABILITY_ID) {
                const legacyLighting = localStorage.getItem(LEGACY_LIGHTING_PROFILE_KEY);
                if (legacyLighting) migrated = legacyCurveProfiles(JSON.parse(legacyLighting), controlId, capabilityId, channels);
            }
            if (migrated.length) ControlConfigurationStore.importProfilesAsBaseline(capabilityId, controlId, migrated);
            return migrated.length ? migrated.map(cloneProfile) : seedProfiles(controlId, capabilityId, channels);
        } catch { return seedProfiles(controlId, capabilityId, channels); }
    },

    saveCustomProfiles(controlId: string, capabilityId: string, profiles: ControlProfile[]): void {
        if (!controlId || !capabilityId) throw new Error('Control and capability IDs are required to save profiles.');
        if (!profiles.every(profile => isProfile(profile) && profile.controlId === controlId && profile.capabilityId === capabilityId)) {
            throw new Error('One or more profiles have an invalid structure or belong to another control.');
        }
        ControlConfigurationStore.saveProfiles(capabilityId, controlId, profiles.map(cloneProfile));
    },
};
