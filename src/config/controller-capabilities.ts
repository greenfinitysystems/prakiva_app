/** Capability contract published by the controller firmware. */
export type CapabilityKind = 'actuator' | 'sensor';
export type CapabilityValueType = 'binary' | 'analog' | 'trigger';
export type ControlPolicy = 'manual_binary' | 'binary_curve' | 'analog_curve' | 'threshold_rules' | 'periodic_pulse' | 'trigger';

/** User-selected presentation for a sensor channel in the dashboard. */
export type SensorWidgetType = 'none' | 'text' | 'gauge' | 'linear';

export interface CapabilityChannel {
    id: string;
    label: string;
    valueType: CapabilityValueType;
    unit?: string;
    min?: number;
    max?: number;
    supportedPolicies: ControlPolicy[];
    supportedActuationMethods?: string[];
}

export interface ControllerCapability {
    id: string;
    name: string;
    kind: CapabilityKind;
    channels: CapabilityChannel[];
    icon: string;
}

export const channelPolicyKey = (capabilityId: string, channelId: string) => `${capabilityId}:${channelId}`;

export function isControllerCapability(value: unknown): value is ControllerCapability {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' ||
        (item.kind !== 'actuator' && item.kind !== 'sensor') || typeof item.icon !== 'string' ||
        !Array.isArray(item.channels)) return false;
    return item.channels.every((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
        const channel = raw as Record<string, unknown>;
        return typeof channel.id === 'string' && typeof channel.label === 'string' &&
            (channel.valueType === 'binary' || channel.valueType === 'analog' || channel.valueType === 'trigger') &&
            Array.isArray(channel.supportedPolicies) && channel.supportedPolicies.every(policy =>
                ['manual_binary', 'binary_curve', 'analog_curve', 'threshold_rules', 'periodic_pulse', 'trigger'].includes(String(policy))) &&
            (channel.supportedActuationMethods === undefined || (Array.isArray(channel.supportedActuationMethods) && channel.supportedActuationMethods.every(method => typeof method === 'string' && method.length > 0))) &&
            (item.kind !== 'actuator' || (Array.isArray(channel.supportedActuationMethods) && channel.supportedActuationMethods.length > 0)) &&
            (channel.unit === undefined || typeof channel.unit === 'string') &&
            (channel.min === undefined || typeof channel.min === 'number') &&
            (channel.max === undefined || typeof channel.max === 'number');
    });
}
