import type { ControlConfigurationDocument } from '../services/control-configuration-store';

export interface TriggerRangeValidation {
    valid: boolean;
    message?: string;
}

/** Shared validation for trigger range conditions. */
export function validateTriggerRangeConfiguration(value: unknown): TriggerRangeValidation {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: true };
    const config = value as Record<string, unknown>;
    if (config.source !== 'sensor') return { valid: true };
    const sensor = config.sensor;
    if (!sensor || typeof sensor !== 'object' || Array.isArray(sensor)) return { valid: true };
    const sensorConfig = sensor as Record<string, unknown>;
    if (sensorConfig.condition !== 'enters_range' && sensorConfig.condition !== 'exits_range') return { valid: true };

    const lower = sensorConfig.lower;
    const upper = sensorConfig.upper;
    if (typeof lower !== 'number' || !Number.isFinite(lower) ||
        typeof upper !== 'number' || !Number.isFinite(upper)) {
        return { valid: false, message: 'Enter valid numeric values for both range bounds.' };
    }
    if (lower >= upper) {
        return { valid: false, message: 'Lower threshold must be less than upper threshold.' };
    }
    return { valid: true };
}

/** Validate every trigger policy stored in the app configuration document. */
export function validateTriggerConfigurations(document: ControlConfigurationDocument): string | null {
    for (const [capabilityId, control] of Object.entries(document.controls ?? {})) {
        for (const [channelId, configuration] of Object.entries(control.inlineConfigurations ?? {})) {
            const result = validateTriggerRangeConfiguration(configuration);
            if (!result.valid) {
                return `${capabilityId} / ${channelId}: ${result.message ?? 'Invalid trigger configuration.'}`;
            }
        }
    }
    return null;
}
