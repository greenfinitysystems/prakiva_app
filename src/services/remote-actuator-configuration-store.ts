import type { RemoteSensorRequest } from './virtual-sensor-configuration-store';

export interface RemoteActuatorDraft {
    selected_actuation_method: string;
    parameters: { endpoint_uri: string };
    command_field: string;
    request: RemoteSensorRequest;
}

const keyFor = (deviceId: string) => `prakiva.remote-actuator-configuration.v1.${deviceId}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function parseEntry(raw: unknown): RemoteActuatorDraft | null {
    if (!isRecord(raw)) return null;
    const parameters = isRecord(raw.parameters) ? raw.parameters : {};
    const request = isRecord(raw.request) ? raw.request : {};
    return {
        selected_actuation_method: typeof raw.selected_actuation_method === 'string' ? raw.selected_actuation_method : (typeof raw.selected_protocol === 'string' ? raw.selected_protocol : 'http-post'),
        parameters: { endpoint_uri: typeof parameters.endpoint_uri === 'string' ? parameters.endpoint_uri : '' },
        command_field: typeof raw.command_field === 'string' ? raw.command_field : 'command',
        request: {
            include_controller_time: request.include_controller_time !== false,
            sensor_mappings: Array.isArray(request.sensor_mappings)
                ? request.sensor_mappings.filter(isRecord).filter(m => typeof m.component_id === 'string' && typeof m.field === 'string')
                    .map(m => ({ component_id: String(m.component_id), field: String(m.field), include: m.include === true })) : [],
            additional_json: isRecord(request.additional_json) ? request.additional_json : {},
        },
    };
}
function read(deviceId: string): Record<string, RemoteActuatorDraft> {
    try {
        const raw = localStorage.getItem(keyFor(deviceId));
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (!isRecord(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
            const entry = parseEntry(value);
            return entry ? [[id, entry]] : [];
        }));
    } catch { return {}; }
}
export class RemoteActuatorConfigurationStore {
    static getAll(deviceId: string) { return read(deviceId); }
    static getEntry(deviceId: string, componentId: string) { return read(deviceId)[componentId] ?? null; }
    static setEntry(deviceId: string, componentId: string, entry: RemoteActuatorDraft) {
        const all = read(deviceId);
        all[componentId] = entry;
        localStorage.setItem(keyFor(deviceId), JSON.stringify(all));
    }
    static replaceFromController(deviceId: string, raw: unknown) {
        const next: Record<string, RemoteActuatorDraft> = {};
        if (isRecord(raw)) for (const [id, value] of Object.entries(raw)) {
            const entry = parseEntry(value);
            if (entry) next[id] = entry;
        }
        localStorage.setItem(keyFor(deviceId), JSON.stringify(next));
    }
}
