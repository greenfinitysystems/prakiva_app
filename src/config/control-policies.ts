import type { ControlPolicy } from './controller-capabilities';

/** Application-owned defaults and labels; hardware capabilities come from the controller. */
export const CONTROL_POLICY_STORAGE_KEY = 'prakiva.dashboard.channel-policies.v2';
export const DEFAULT_CONTROL_POLICIES: Record<string, ControlPolicy> = {
    'analog_channel_1:white': 'analog_curve',
    'analog_channel_1:red': 'analog_curve',
    'analog_channel_1:green': 'analog_curve',
    'analog_channel_1:blue': 'analog_curve',
    'analog_channel_2:pump_speed': 'analog_curve',
    'analog_channel_2:oscillation': 'manual_binary',
    'relay_channel_1:output': 'binary_curve',
};
export const POLICY_LABELS: Record<ControlPolicy, string> = {
    manual_binary: 'Manual ON/OFF',
    binary_curve: 'Periodic ON/OFF',
    analog_curve: 'Analogue curve',
    threshold_rules: 'Sensor thresholds',
    periodic_pulse: 'Unavailable (retired)',
    trigger: 'Scheduled trigger',
    slave: 'Slave (external command)',
};
