import type { SavedController } from '../models/saved-controller';
import { getControllerCapabilities, getControllerConfiguration } from './controller-api';
import { ControllerSynchronizationStore, type ControllerSynchronizationSnapshot } from './controller-synchronization-store';

/**
 * Authenticated synchronization boundary. Each firmware API remains atomic and independent;
 * this app service merely orchestrates the two reads and commits their snapshot together.
 */
export async function synchronizeControllerAfterLogin(
    controller: SavedController,
    sessionToken: string,
): Promise<ControllerSynchronizationSnapshot> {
    if (!sessionToken) throw new Error('An authenticated controller session is required to synchronize.');

    const capabilities = await getControllerCapabilities(controller.address, controller.httpPort, sessionToken);
    if (capabilities.device_id !== controller.deviceId) {
        throw new Error('Controller identity mismatch. The authenticated device is not the controller selected in the app.');
    }

    const configuration = await getControllerConfiguration(controller.address, controller.httpPort, sessionToken);

    // Commit only after both independent requests have succeeded. The last complete snapshot
    // remains available if either request fails during a later login.
    const snapshot: ControllerSynchronizationSnapshot = {
        deviceId: controller.deviceId,
        capabilities,
        configuration,
    };
    await ControllerSynchronizationStore.save(snapshot);
    return snapshot;
}
