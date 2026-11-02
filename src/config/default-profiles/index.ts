import type { ControlProfile, ProfileChannelDescriptor } from '../../models/control-profile';
import { LIGHTING_DEFAULT_PROFILES } from './lighting-profiles';

/** Built-in presets are selected by capability, then instantiated for a control ID. */
export const getDefaultProfilesForControl = (
    controlId: string,
    capabilityId: string,
    channels: ProfileChannelDescriptor[],
): ControlProfile[] => {
    const source = capabilityId === 'analog_channel_1' ? LIGHTING_DEFAULT_PROFILES : [];
    return source.map(profile => ({
        profileId: `builtin:${capabilityId}:${profile.name}`,
        controlId,
        capabilityId,
        name: profile.name,
        source: 'builtin',
        channels: profile.curves
            .filter(curve => channels.some(channel => channel.id === curve.id))
            .map(curve => ({
                channelId: curve.id,
                policy: 'analog_curve',
                configuration: { curve: { ...curve, points: curve.points.map(point => ({ ...point })) } },
            })),
    }));
};
