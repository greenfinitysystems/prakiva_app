/** A named, control-instance-scoped snapshot of channel configuration. */
export interface ControlProfileCurvePoint { x: number; y: number; }
export interface ControlProfileCurve {
    id: string;
    label: string;
    color: string;
    points: ControlProfileCurvePoint[];
}
export interface ControlProfileChannelState {
    channelId: string;
    /** Policy active when the profile was captured. */
    policy: string;
    /** Policy-specific, serializable configuration. */
    configuration: Record<string, unknown>;
}
export interface ControlProfile {
    profileId: string;
    controlId: string;
    capabilityId: string;
    name: string;
    channels: ControlProfileChannelState[];
    source?: 'builtin' | 'custom';
}
/** Source format used only to define built-in graph presets. */
export interface BuiltinCurveProfile {
    name: string;
    curves: ControlProfileCurve[];
}
export interface ProfileChannelDescriptor { id: string; label: string; valueType?: 'analog' | 'binary'; }
