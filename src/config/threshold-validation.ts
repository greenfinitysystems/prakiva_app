
import type { ControllerCapability } from './controller-capabilities';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import type { VirtualSensorConfiguration } from '../services/virtual-sensor-configuration-store';
import type { ControlConfigurationDocument } from '../services/control-configuration-store';

/** Configuration eligibility, independent of live measurement validity. */
export function configuredThresholdSensors(document: ControlConfigurationDocument, capabilities: ControllerCapability[], declarations: VirtualSensorDeclaration[], virtualSensors: VirtualSensorConfiguration): ControllerCapability[] {
    return capabilities.filter(c => c.kind === 'sensor').flatMap(c => {
        const declaration = declarations.find(d => d.capability_id === c.id);
        if (declaration?.supported_protocols?.length) {
            const entry = virtualSensors[declaration.component_id];
            const protocol = entry?.selected_protocol;
            if (!protocol || !declaration.supported_protocols.includes(protocol)) return [];
            if (protocol !== 'local' && (!(protocol === 'http-get' || protocol === 'http-post') || !/^https?:\/\//i.test(String(entry?.parameters.endpoint_uri ?? '').trim()))) return [];
        }
        const channels = c.channels.filter(ch => {
            const widget = document.controls[c.id]?.sensorWidgets?.[ch.id];
            return widget !== undefined && widget !== 'none';
        });
        return channels.length ? [{ ...c, channels }] : [];
    });
}

/** Validate every active threshold policy before it can be sent to firmware. */
export function validateThresholdConfigurations(
    document: ControlConfigurationDocument, eligibleSensors?: ControllerCapability[]
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

            if (eligibleSensors && !eligibleSensors.some(c => c.channels.some(ch => `${c.id}.${ch.id}` === sensor))) {
                return `${controlId}.${channelId}: select a configured sensor (${sensor} is unavailable).`;
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

