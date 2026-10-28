/** Persisted identity and last-known connection details for a Prakiva controller. */
export interface SavedController {
    /** Permanent 32-character lowercase hexadecimal ID reported by firmware. */
    deviceId: string;
    /** Phone-local display name. */
    name: string;
    /** Last-known IPv4 address; not the controller's identity. */
    address: string;
    /** HTTP API port advertised by UDP discovery. */
    httpPort: number;
    protocolVersion: string;
    product: string;
    firmwareVersion: string;
    hardwareFamily: string;
}

export function isSavedController(value: unknown): value is SavedController {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.deviceId === 'string' && /^[0-9a-f]{32}$/.test(item.deviceId) &&
        typeof item.name === 'string' && item.name.trim().length > 0 &&
        typeof item.address === 'string' &&
        typeof item.httpPort === 'number' && Number.isInteger(item.httpPort) && item.httpPort >= 1 && item.httpPort <= 65535 &&
        typeof item.protocolVersion === 'string' &&
        typeof item.product === 'string' &&
        typeof item.firmwareVersion === 'string' &&
        typeof item.hardwareFamily === 'string'
    );
}
