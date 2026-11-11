import { Capacitor } from '@capacitor/core';
import { UdpSocket } from 'capacitor-udp-socket';

export const DISCOVERY_PORT = 4210;
export const DISCOVERY_REQUEST = 'PRAKIVA_DISCOVER_V1';
export const DISCOVERY_RESPONSE_TYPE = 'prakiva_discovery_response';

export interface DiscoveredController {
    deviceId: string;
    protocolVersion: string;
    httpPort: number;
    address: string;
}

function toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value: string): string {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function parseDiscoveryResponse(raw: string, address: string): DiscoveredController | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
        const packet = value as Record<string, unknown>;
        if (packet.type !== DISCOVERY_RESPONSE_TYPE) return null;
        if (typeof packet.device_id !== 'string' || !/^[0-9a-f]{32}$/.test(packet.device_id)) return null;
        if (typeof packet.protocol_version !== 'string') return null;
        if (typeof packet.http_port !== 'number' || !Number.isInteger(packet.http_port) || packet.http_port < 1 || packet.http_port > 65535) return null;
        return { deviceId: packet.device_id, protocolVersion: packet.protocol_version, httpPort: packet.http_port, address };
    } catch {
        return null;
    }
}

/**
 * Native UDP discovery matching the Flutter implementation: ephemeral local
 * port, global broadcast plus the Prakiva Wi-Fi subnet broadcast, 4-second scan.
 * Raw UDP is unavailable in a browser; run this workflow in the native app.
 */
export async function discoverControllers(
    onController: (controller: DiscoveredController) => void,
    durationMs = 4000,
): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        throw new Error('UDP discovery requires the installed Android app; it cannot run in a browser.');
    }

    const created = await UdpSocket.create({ properties: { name: 'prakiva-discovery', bufferSize: 4096 } });
    const socketId = created.socketId;
    let listener: { remove: () => Promise<void> } | undefined;
    try {
        await UdpSocket.bind({ socketId, port: 0 });
        listener = await UdpSocket.addListener('receive', (event) => {
            if (event.socketId !== socketId || !event.buffer || !event.remoteAddress) return;
            try {
                const text = fromBase64(event.buffer);
                const found = parseDiscoveryResponse(text, event.remoteAddress);
                if (found) onController(found);
            } catch {
                // Ignore malformed discovery packets from other devices.
            }
        });
        await UdpSocket.setBroadcast({ socketId, enabled: true });
        const request = toBase64(DISCOVERY_REQUEST);
        await UdpSocket.send({ socketId, address: '255.255.255.255', port: DISCOVERY_PORT, buffer: request });
        await UdpSocket.send({ socketId, address: '192.168.10.255', port: DISCOVERY_PORT, buffer: request });
        await new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
    } finally {
        await listener?.remove().catch(() => undefined);
        await UdpSocket.close({ socketId }).catch(() => undefined);
    }
}
