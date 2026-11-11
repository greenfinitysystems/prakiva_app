/**
 * Local draft values for controller-owned virtual sensor parameters.
 *
 * This store is deliberately separate from ControlConfigurationStore: virtual
 * sensor parameters are interpreted and validated by firmware, while control
 * presentation preferences belong exclusively to the app.
 */
export type VirtualSensorParameterValues = Record<string, number>;
export type VirtualSensorConfiguration = Record<string, { parameters: VirtualSensorParameterValues }>;

const keyFor = (deviceId: string) => `prakiva.virtual-sensor-configuration.v1.${deviceId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function read(deviceId: string): VirtualSensorConfiguration {
    try {
        const raw = localStorage.getItem(keyFor(deviceId));
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) return {};
        const result: VirtualSensorConfiguration = {};
        for (const [componentId, entry] of Object.entries(parsed)) {
            if (!isRecord(entry) || !isRecord(entry.parameters)) continue;
            const parameters: VirtualSensorParameterValues = {};
            for (const [name, value] of Object.entries(entry.parameters)) {
                if (typeof value === 'number' && Number.isFinite(value)) parameters[name] = value;
            }
            result[componentId] = { parameters };
        }
        return result;
    } catch {
        return {};
    }
}

export class VirtualSensorConfigurationStore {
    static getAll(deviceId: string): VirtualSensorConfiguration {
        return JSON.parse(JSON.stringify(read(deviceId))) as VirtualSensorConfiguration;
    }

    static getParameters(deviceId: string, componentId: string): VirtualSensorParameterValues | null {
        const entry = read(deviceId)[componentId];
        return entry ? { ...entry.parameters } : null;
    }

    static setParameters(
        deviceId: string,
        componentId: string,
        parameters: VirtualSensorParameterValues,
    ): void {
        const current = read(deviceId);
        current[componentId] = { parameters: { ...parameters } };
        localStorage.setItem(keyFor(deviceId), JSON.stringify(current));
    }

    /** Replace the local draft only when the user explicitly restores controller settings. */
    static replaceFromController(deviceId: string, raw: unknown): void {
        const next: VirtualSensorConfiguration = {};
        if (isRecord(raw)) {
            for (const [componentId, entry] of Object.entries(raw)) {
                if (!isRecord(entry) || !isRecord(entry.parameters)) continue;
                const parameters: VirtualSensorParameterValues = {};
                for (const [name, value] of Object.entries(entry.parameters)) {
                    if (typeof value === 'number' && Number.isFinite(value)) parameters[name] = value;
                }
                next[componentId] = { parameters };
            }
        }
        localStorage.setItem(keyFor(deviceId), JSON.stringify(next));
    }
}
