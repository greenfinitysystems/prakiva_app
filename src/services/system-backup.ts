import { RemoteActuatorConfigurationStore } from './remote-actuator-configuration-store';
/** PRAKIVA V1 portable system backup. No drafts, credentials, or session tokens. */
import type { SavedController } from '../models/saved-controller';
import { getControllerCapabilities, getControllerConfiguration, setControllerConfiguration } from './controller-api';
import { ControllerSynchronizationStore } from './controller-synchronization-store';
import { ControlConfigurationStore, isControlConfigurationDocument } from './control-configuration-store';
import { VirtualSensorConfigurationStore } from './virtual-sensor-configuration-store';
import { markConfigurationSynchronized } from './configuration-apply';

const MAGIC = new TextEncoder().encode('PRAKIVA1');
const MAX_FILE = 2 * 1024 * 1024;
const MAX_JSON = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (a: Uint8Array) => Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
async function sha(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}
async function transform(data: Uint8Array, mode: 'gzip' | 'gunzip'): Promise<Uint8Array> {
    const stream = mode === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const result = new Response(stream.readable).arrayBuffer();
    await writer.write(data as BufferSource);
    await writer.close();
    return new Uint8Array(await result);
}
export interface BackupDocument {
    format: 'prakiva-system-backup';
    format_version: 1;
    created_at: string;
    product: string;
    firmware_version: string;
    hardware_family: string;
    hardware_revision?: string;
    schema_version: number;
    source_device_id: string; // informational, never used to bind a replacement controller
    configuration_timestamp: number;
    configuration: Record<string, unknown>;
}
export async function encodeBackup(document: BackupDocument): Promise<Blob> {
    const compressed = await transform(encoder.encode(JSON.stringify(document)), 'gzip');
    const digest = await sha(compressed);
    const bytes = new Uint8Array(MAGIC.length + digest.length + compressed.length);
    bytes.set(MAGIC);
    bytes.set(digest, MAGIC.length);
    bytes.set(compressed, MAGIC.length + digest.length);
    return new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' });
}
export async function decodeBackup(file: Blob): Promise<BackupDocument> {
    if (file.size > MAX_FILE || file.size < MAGIC.length + 32 + 1) throw new Error('Backup size is invalid.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!MAGIC.every((b, i) => bytes[i] === b)) throw new Error('This is not a PRAKIVA V1 backup.');
    const compressed = bytes.slice(MAGIC.length + 32);
    const expected = bytes.slice(MAGIC.length, MAGIC.length + 32);
    if (hex(await sha(compressed)) !== hex(expected)) throw new Error('Backup integrity check failed.');
    const raw = await transform(compressed, 'gunzip');
    if (raw.byteLength > MAX_JSON) throw new Error('Backup content is too large.');
    const value: unknown = JSON.parse(decoder.decode(raw));
    if (!record(value) || value.format !== 'prakiva-system-backup' || value.format_version !== 1 ||
        typeof value.product !== 'string' || typeof value.firmware_version !== 'string' ||
        typeof value.hardware_family !== 'string' || typeof value.schema_version !== 'number' ||
        typeof value.source_device_id !== 'string' || typeof value.configuration_timestamp !== 'number' ||
        !Number.isSafeInteger(value.configuration_timestamp) || value.configuration_timestamp <= 0 ||
        typeof value.created_at !== 'string' || !record(value.configuration) ||
        (value.hardware_revision !== undefined && typeof value.hardware_revision !== 'string')) {
        throw new Error('Backup document is invalid or unsupported.');
    }
    return value as unknown as BackupDocument;
}
function revision(controller: Record<string, unknown>): string | undefined {
    return typeof controller.hardware_revision === 'string' ? controller.hardware_revision : undefined;
}
export async function captureSystemBackup(controller: SavedController, token: string): Promise<BackupDocument> {
    const [capabilities, current] = await Promise.all([
        getControllerCapabilities(controller.address, controller.httpPort, token),
        getControllerConfiguration(controller.address, controller.httpPort, token),
    ]);
    if (capabilities.device_id !== controller.deviceId) throw new Error('Connected controller identity changed.');
    if (!current.configuration_exists || !current.configuration || !current.configuration_timestamp) {
        throw new Error('Controller has no successfully applied configuration to back up.');
    }
    const schema = current.configuration.schema_version;
    if (!Number.isSafeInteger(schema) || typeof schema !== 'number') throw new Error('Controller configuration schema is missing.');
    return {
        format: 'prakiva-system-backup', format_version: 1, created_at: new Date().toISOString(),
        product: capabilities.controller.product, firmware_version: capabilities.controller.firmware_version,
        hardware_family: capabilities.controller.hardware_family,
        ...(revision(capabilities.controller) ? { hardware_revision: revision(capabilities.controller) } : {}),
        schema_version: schema, source_device_id: capabilities.device_id,
        configuration_timestamp: current.configuration_timestamp,
        configuration: current.configuration,
    };
}
export type RestoreOutcome = 'restored';
export async function restoreSystemBackup(controller: SavedController, token: string, backup: BackupDocument): Promise<RestoreOutcome> {
    const [capabilities, before] = await Promise.all([
        getControllerCapabilities(controller.address, controller.httpPort, token),
        getControllerConfiguration(controller.address, controller.httpPort, token),
    ]);
    if (capabilities.device_id !== controller.deviceId) throw new Error('Connected controller identity changed.');
    if (backup.product !== capabilities.controller.product ||
        backup.firmware_version !== capabilities.controller.firmware_version ||
        backup.hardware_family !== capabilities.controller.hardware_family ||
        (backup.hardware_revision !== undefined && backup.hardware_revision !== revision(capabilities.controller))) {
        throw new Error('Backup product, firmware, or hardware is incompatible with this controller.');
    }
    const activeSchema = before.configuration?.schema_version;
    if (activeSchema !== backup.schema_version || backup.configuration.schema_version !== backup.schema_version) {
        throw new Error('Backup configuration schema does not match this controller.');
    }
    if (!before.configuration_exists || !before.configuration) {
        throw new Error('Cannot take a recovery snapshot: controller has no applied configuration.');
    }
    if (!isControlConfigurationDocument(backup.configuration.app_configuration)) {
        throw new Error('Backup contains no valid app configuration.');
    }
    // Read-back compares configuration payloads, not controller-generated save timestamps.
    const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => record(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
    let attempted = false;
    try {
        attempted = true;
        await setControllerConfiguration(controller.address, controller.httpPort, token, backup.configuration);
        const after = await getControllerConfiguration(controller.address, controller.httpPort, token);
        if (!after.configuration_exists || !equal(after.configuration, backup.configuration)) {
            throw new Error('Controller read-back did not match the restored configuration.');
        }
        // Controller write and read-back succeeded. Local synchronization happens below,
        // outside the controller rollback handler.
    } catch (failure) {
        if (!attempted) throw failure;
        try {
            await setControllerConfiguration(controller.address, controller.httpPort, token, before.configuration);
            const recovered = await getControllerConfiguration(controller.address, controller.httpPort, token);
            if (!recovered.configuration_exists || !equal(recovered.configuration, before.configuration)) throw new Error('Recovery read-back mismatch.');
            throw new RestoredPreviousConfigurationError(failure instanceof Error ? failure.message : String(failure));
        } catch (rollbackFailure) {
            if (rollbackFailure instanceof RestoredPreviousConfigurationError) throw rollbackFailure;
            throw new Error(`Restore failed and rollback could not be verified. Controller state uncertain. ${String(rollbackFailure)}`);
        }
    }
    // A local storage/UI failure must not trigger a controller rollback after a verified write.
    // Report the partial outcome explicitly so the operator can reconnect and resynchronize.
    try {
        ControlConfigurationStore.replaceWithControllerDocument(backup.configuration.app_configuration);
        VirtualSensorConfigurationStore.replaceFromController(controller.deviceId, backup.configuration.virtual_sensors);
        RemoteActuatorConfigurationStore.replaceFromController(controller.deviceId, backup.configuration.remote_actuators);
        const snapshot = await ControllerSynchronizationStore.load(controller.deviceId);
        if (snapshot) {
            const current = await getControllerConfiguration(controller.address, controller.httpPort, token);
            await ControllerSynchronizationStore.save({ ...snapshot, capabilities, configuration: current });
            markConfigurationSynchronized(controller.deviceId, new Date(current.configuration_timestamp! * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
        }
    } catch (error) {
        throw new Error(`Controller restore was verified, but local app synchronization failed. Reconnect to the controller before making changes. ${String(error)}`);
    }
    return 'restored';
}
export class RestoredPreviousConfigurationError extends Error {
    constructor(reason: string) { super(`Restore unsuccessful. Previous configuration restored. Reason: ${reason}`); }
}
