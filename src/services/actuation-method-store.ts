/** Controller-scoped draft transport selections. Firmware capability discovery is authoritative. */
const key = (deviceId: string) => `prakiva.actuation-methods.v1.${deviceId}`;
const channelKey = (capabilityId: string, channelId: string) => `${capabilityId}:${channelId}`;
function read(deviceId: string): Record<string, string> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key(deviceId)) ?? '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter(([, method]) => typeof method === 'string')) as Record<string, string>;
    } catch { return {}; }
}
export class ActuationMethodStore {
    static getAll(deviceId: string) { return read(deviceId); }
    static get(deviceId: string, capabilityId: string, channelId: string) { return read(deviceId)[channelKey(capabilityId, channelId)] ?? null; }
    static set(deviceId: string, capabilityId: string, channelId: string, method: string) {
        const values = read(deviceId); values[channelKey(capabilityId, channelId)] = method;
        localStorage.setItem(key(deviceId), JSON.stringify(values));
    }
    static replaceFromController(deviceId: string, raw: unknown) {
        const values: Record<string, string> = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw))
            for (const [capabilityId, channels] of Object.entries(raw)) {
                if (!channels || typeof channels !== 'object' || Array.isArray(channels)) continue;
                for (const [channelId, setting] of Object.entries(channels)) {
                    if (!setting || typeof setting !== 'object' || Array.isArray(setting)) continue;
                    const method = (setting as Record<string, unknown>).selected_actuation_method;
                    if (typeof method === 'string') values[channelKey(capabilityId, channelId)] = method;
                }
            }
        localStorage.setItem(key(deviceId), JSON.stringify(values));
    }
}
