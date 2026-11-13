
import type { ControlConfigurationDocument } from '../services/control-configuration-store';

/** Validate every active threshold policy before it can be sent to firmware. */
export function validateThresholdConfigurations(
    document: ControlConfigurationDocument
): string | null {
    for (const [controlId, control] of Object.entries(document.controls ?? {})) {
        for (const [channelId, policy] of Object.entries(control.channelPolicies ?? {})) {
            if (policy !== 'threshold_rules') continue;

            const config = control.inlineConfigurations?.[channelId];

            const sensor =
                typeof config?.sensorId === 'string'
                    ? config.sensorId.trim()
                    : '';

            if (!/^[^.]+\.[^.]+$/.test(sensor)) {
                return `${controlId}.${channelId}: select a sensor.`;
            }

            const low = config?.lowThreshold;
            const high = config?.highThreshold;

            if (
                typeof low !== 'number' ||
                !Number.isFinite(low) ||
                typeof high !== 'number' ||
                !Number.isFinite(high) ||
                low >= high
            ) {
                return `${controlId}.${channelId}: low threshold must be below high threshold.`;
            }

            if (
                !['on', 'off'].includes(String(config?.lowAction ?? '')) ||
                !['on', 'off'].includes(String(config?.highAction ?? ''))
            ) {
                return `${controlId}.${channelId}: choose both threshold actions.`;
            }
        }
    }

    return null;
}

