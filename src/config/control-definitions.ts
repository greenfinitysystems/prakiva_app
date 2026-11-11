/** Channel-oriented Prakiva control contract. Hardware capabilities and user policies remain separate. */
import type { CapabilityValueType, ControlPolicy } from './controller-capabilities';
export type TriggerType = 'time_schedule' | 'sensor_threshold' | 'manual';
export type EditorType = ControlPolicy;
export type OutputType = CapabilityValueType;
export type ControlType = 'actuation';

/** A reusable policy definition. It contains no physical output type; compatibility is checked against a channel. */
export interface ControlDefinition {
    definitionId: string;
    displayName: string;
    description: string;
    triggerType: TriggerType;
    editorType: EditorType;
    capabilities: string[];
    constraints?: Record<string, unknown>;
}
export interface ControlInstance {
    instanceId: string;
    label: string;
    capabilityId: string;
    enabled: boolean;
}
export interface ChannelInstance {
    channelId: string;
    policy: ControlPolicy;
    configuration: Record<string, unknown>;
}
/** Version 2 groups independent channel policies under one logical control instance. */
export interface ControlConfiguration<TData = unknown> {
    schemaVersion: 2;
    instance: ControlInstance;
    channels: ChannelInstance[];
    configuration?: TData;
}
export interface CurveControlData {
    curves: Array<{ id: string; label: string; color: string; points: Array<{ x: number; y: number }> }>;
}

export const MANUAL_BINARY_DEFINITION: ControlDefinition = {
    definitionId: 'manual_binary', displayName: 'Manual ON/OFF control', description: 'Request an ON or OFF state for a binary output.',
    triggerType: 'manual', editorType: 'manual_binary', capabilities: ['manual_command'], constraints: { values: [0, 1] },
};
export const CO2_SCHEDULE_DEFINITION: ControlDefinition = {
    definitionId: 'daily_binary_curve', displayName: 'Time-driven binary control', description: 'Switch a binary output according to a daily schedule.',
    triggerType: 'time_schedule', editorType: 'binary_curve', capabilities: ['daily_schedule'], constraints: { values: [0, 1], dailyCycle: true, midnightContinuity: true },
};
export const LIGHTING_SCHEDULE_DEFINITION: ControlDefinition = {
    definitionId: 'daily_analog_curve', displayName: 'Time-driven analogue control', description: 'Vary an analogue channel according to a daily curve.',
    triggerType: 'time_schedule', editorType: 'analog_curve', capabilities: ['daily_schedule'], constraints: { dailyCycle: true, midnightContinuity: true },
};
export const THRESHOLD_RULES_DEFINITION: ControlDefinition = {
    definitionId: 'sensor_threshold', displayName: 'Sensor Threshold Control', description: 'Control a binary output using one sensor and low/high thresholds.',
    triggerType: 'sensor_threshold', editorType: 'threshold_rules', capabilities: ['sensor_threshold', 'hysteresis'], constraints: { ruleCount: 2, sensorCount: 1, actions: ['on', 'off'] },
};
