import { Preferences } from '@capacitor/preferences';
import type { ControllerCapabilitiesDocument, ControllerConfigurationReadResult } from './controller-api';
import { isControllerCapability } from '../config/controller-capabilities';

export interface ControllerSynchronizationSnapshot {
    deviceId: string;
    capabilities: ControllerCapabilitiesDocument;
    configuration: ControllerConfigurationReadResult;
}

const keyFor = (deviceId: string) => `prakiva.controller-sync.v1.${deviceId}`;

/** Stores the last complete authenticated snapshot. A failed fetch never replaces it. */
export class ControllerSynchronizationStore {
    static async save(snapshot: ControllerSynchronizationSnapshot): Promise<void> {
        if (snapshot.capabilities.device_id !== snapshot.deviceId ||
            !Array.isArray(snapshot.capabilities.capabilities) || !snapshot.capabilities.capabilities.every(isControllerCapability)) {
            throw new Error('Cannot save a synchronization snapshot for a different controller identity.');
        }
        await Preferences.set({ key: keyFor(snapshot.deviceId), value: JSON.stringify(snapshot) });
    }

    static async load(deviceId: string): Promise<ControllerSynchronizationSnapshot | null> {
        const { value } = await Preferences.get({ key: keyFor(deviceId) });
        if (!value) return null;
        try {
            const parsed: unknown = JSON.parse(value);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
            const snapshot = parsed as ControllerSynchronizationSnapshot;
            if (snapshot.deviceId !== deviceId || snapshot.capabilities?.device_id !== deviceId ||
                !Array.isArray(snapshot.capabilities?.capabilities) || !snapshot.capabilities.capabilities.every(isControllerCapability) ||
                typeof snapshot.configuration?.configuration_exists !== 'boolean') return null;
            return snapshot;
        } catch {
            return null;
        }
    }

    static async clear(deviceId: string): Promise<void> {
        await Preferences.remove({ key: keyFor(deviceId) });
    }
}
