import type { SavedController } from '../models/saved-controller';
import type { ControlConfigurationDocument } from './control-configuration-store';
import { getControllerCapabilities, getControllerConfiguration, setControllerConfiguration } from './controller-api';
import { ActuationMethodStore } from './actuation-method-store';
import { RemoteActuatorConfigurationStore } from './remote-actuator-configuration-store';
import { VirtualSensorConfigurationStore } from './virtual-sensor-configuration-store';
import { validateTriggerConfigurations } from '../config/trigger-validation';
import { validateThresholdConfigurations } from '../config/threshold-validation';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Persist the app's editor document inside the controller-owned configuration envelope.
 * Existing firmware sections are preserved. This is persistence integration only: the
 * firmware resolves actuator channels and dispatches commands through their drivers.
 */
export async function applyAppConfigurationToController(
    controller: SavedController,
    sessionToken: string,
    appDocument: ControlConfigurationDocument,
): Promise<{ configurationTimestamp: number; configuration: Record<string, unknown> }> {
    if (!sessionToken) throw new Error('An authenticated controller session is required.');
    const triggerValidationError = validateTriggerConfigurations(appDocument);
    if (triggerValidationError) throw new Error(`Invalid trigger configuration: ${triggerValidationError}`);
    const thresholdError = validateThresholdConfigurations(appDocument);
    if (thresholdError) throw new Error(`Invalid threshold configuration: ${thresholdError}`);

    // Read immediately before writing so unrelated firmware-owned sections are retained.
    const current = await getControllerConfiguration(controller.address, controller.httpPort, sessionToken);
    const existing = current.configuration ?? {};
    const discovery = await getControllerCapabilities(controller.address, controller.httpPort, sessionToken);
    const validVirtualIds = new Set((discovery.virtual_sensors ?? []).map(sensor => sensor.component_id));

    const configuration: Record<string, unknown> = {
        ...existing,
        schema_version: typeof existing.schema_version === 'number' ? existing.schema_version : 1,
        sensors: isRecord(existing.sensors) ? existing.sensors : {},
        actuators: isRecord(existing.actuators) ? existing.actuators : {},
        schedules: isRecord(existing.schedules) ? existing.schedules : {},
        app_configuration: appDocument,
    };

    // Virtual sensor parameters are controller-owned settings. Merge the
    // locally saved drafts into the existing firmware document without
    // overwriting unrelated virtual sensors or firmware-owned sections.
    const localVirtualSensors = VirtualSensorConfigurationStore.getAll(controller.deviceId);
    const existingVirtualSensors = isRecord(existing.virtual_sensors) ? existing.virtual_sensors : {};
    const mergedVirtualSensors: Record<string, unknown> = Object.fromEntries(Object.entries(existingVirtualSensors).filter(([id]) => validVirtualIds.has(id)));
    for (const [componentId, localEntry] of Object.entries(localVirtualSensors)) {
        if (!validVirtualIds.has(componentId)) continue;
        const previousEntry = isRecord(mergedVirtualSensors[componentId])
            ? mergedVirtualSensors[componentId] as Record<string, unknown>
            : {};
        mergedVirtualSensors[componentId] = {
            ...previousEntry,
            parameters: { ...(isRecord(previousEntry.parameters) ? previousEntry.parameters : {}), ...localEntry.parameters },
            ...(localEntry.selected_protocol !== undefined ? { selected_protocol: localEntry.selected_protocol } : {}),
            ...(localEntry.request !== undefined ? { request: localEntry.request } : {}),
        };
    }
    if (Object.keys(mergedVirtualSensors).length > 0 ||
        isRecord(existing.virtual_sensors)) {
        configuration.virtual_sensors = mergedVirtualSensors;
    }

    // Transport choice belongs to the capability/channel; HTTP parameters belong to its driver.
    // Strip obsolete actuator-only selected_protocol even when it exists in controller state.
    const mergedRemoteActuators: Record<string, unknown> = {};
    if (isRecord(existing.remote_actuators)) {
        for (const [driverId, raw] of Object.entries(existing.remote_actuators)) {
            if (!isRecord(raw)) { mergedRemoteActuators[driverId] = raw; continue; }
            const { selected_protocol: _obsolete, selected_actuation_method: _misplaced, ...driverSettings } = raw;
            void _obsolete;
            void _misplaced;
            mergedRemoteActuators[driverId] = driverSettings;
        }
    }
    const actuatorChannels: Record<string, unknown> = isRecord(existing.actuator_channels)
        ? { ...existing.actuator_channels } : {};
    const declaredActuators = discovery.capabilities.filter(capability => capability.kind === 'actuator');
    const selections = ActuationMethodStore.getAll(controller.deviceId);
    for (const capability of declaredActuators) {
        for (const channel of capability.channels) {
            const supported = channel.supportedActuationMethods ?? [];
            const channelKey = `${capability.id}:${channel.id}`;

            const previousValue = actuatorChannels[capability.id];
            const previous: Record<string, unknown> = isRecord(previousValue) ? previousValue : {};
            const previousChannelValue = previous[channel.id];
            const previousChannel: Record<string, unknown> = isRecord(previousChannelValue)
                ? previousChannelValue
                : {};

            const existingMethod = previousChannel.selected_actuation_method;
            const selected = selections[channelKey] ?? (
                typeof existingMethod === 'string' && supported.includes(existingMethod)
                    ? existingMethod
                    : supported[0]
            );

            if (!selected || !supported.includes(selected)) {
                throw new Error(`Unsupported actuation method for ${channelKey}: ${selected ?? 'none'}`);
            }

            actuatorChannels[capability.id] = {
                ...previous,
                [channel.id]: {
                    ...previousChannel,
                    selected_actuation_method: selected,
                },
            };
        }
    }
    configuration.actuator_channels = actuatorChannels;
    const remoteActuators = RemoteActuatorConfigurationStore.getAll(controller.deviceId);
    for (const [driverId, draft] of Object.entries(remoteActuators)) {
        const { selected_actuation_method: _legacy, ...driverSettings } = draft;
        void _legacy;
        // Driver settings are kept separate from the channel's selected method.
        mergedRemoteActuators[driverId] = {
            ...(isRecord(mergedRemoteActuators[driverId]) ? mergedRemoteActuators[driverId] : {}),
            ...driverSettings,
        };
    }
    if (Object.keys(mergedRemoteActuators).length || isRecord(existing.remote_actuators)) {
        configuration.remote_actuators = mergedRemoteActuators;
    }

    const saved = await setControllerConfiguration(
        controller.address, controller.httpPort, sessionToken, configuration,
    );
    return { configurationTimestamp: saved.configuration_timestamp, configuration };
}
