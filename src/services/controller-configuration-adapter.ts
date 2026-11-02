import type { SavedController } from '../models/saved-controller';
import type { ControlConfigurationDocument } from './control-configuration-store';
import { getControllerConfiguration, setControllerConfiguration } from './controller-api';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Persist the app's editor document inside the controller-owned configuration envelope.
 * Existing firmware sections are preserved. This is persistence integration only: the
 * current firmware does not yet advertise or execute individual actuator channels.
 */
export async function applyAppConfigurationToController(
    controller: SavedController,
    sessionToken: string,
    appDocument: ControlConfigurationDocument,
): Promise<{ configurationTimestamp: number; configuration: Record<string, unknown> }> {
    if (!sessionToken) throw new Error('An authenticated controller session is required.');

    // Read immediately before writing so unrelated firmware-owned sections are retained.
    const current = await getControllerConfiguration(controller.address, controller.httpPort, sessionToken);
    const existing = current.configuration ?? {};

    const configuration: Record<string, unknown> = {
        ...existing,
        schema_version: typeof existing.schema_version === 'number' ? existing.schema_version : 1,
        sensors: isRecord(existing.sensors) ? existing.sensors : {},
        actuators: isRecord(existing.actuators) ? existing.actuators : {},
        schedules: isRecord(existing.schedules) ? existing.schedules : {},
        app_configuration: appDocument,
    };

    const saved = await setControllerConfiguration(
        controller.address, controller.httpPort, sessionToken, configuration,
    );
    return { configurationTimestamp: saved.configuration_timestamp, configuration };
}
