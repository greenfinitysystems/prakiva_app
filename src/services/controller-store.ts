import { ControllerBiometricVault } from './controller-biometric-vault';
import { Preferences } from '@capacitor/preferences';
import { isSavedController, type SavedController } from '../models/saved-controller';

const STORAGE_KEY = 'prakiva.saved_controllers.v1';

export class ControllerStore {
    static async loadAll(): Promise<SavedController[]> {
        const { value } = await Preferences.get({ key: STORAGE_KEY });
        if (value === null || value.length === 0) return [];

        let decoded: unknown;
        try {
            decoded = JSON.parse(value);
        } catch {
            throw new Error('Saved controller data is not valid JSON.');
        }
        if (!Array.isArray(decoded) || !decoded.every(isSavedController)) {
            throw new Error('Invalid saved controller data.');
        }
        return decoded;
    }

    static async save(controller: SavedController): Promise<SavedController[]> {
        if (!isSavedController(controller)) throw new Error('Invalid saved controller record.');
        const controllers = await this.loadAll();
        const index = controllers.findIndex((item) => item.deviceId === controller.deviceId);
        if (index >= 0) controllers[index] = controller;
        else controllers.push(controller);
        await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(controllers) });
        return controllers;
    }

    static async remove(deviceId: string): Promise<SavedController[]> {
        await ControllerBiometricVault.remove(deviceId);
        const controllers = (await this.loadAll()).filter((item) => item.deviceId !== deviceId);
        await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(controllers) });
        return controllers;
    }
}
