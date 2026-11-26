import { Preferences } from '@capacitor/preferences';

export interface ControllerSession {
    deviceId: string;
    sessionToken: string;
    ownerUserId: string;
}

const keyFor = (deviceId: string) => `prakiva.session.v1.${deviceId}`;

let mutationQueue: Promise<unknown> = Promise.resolve();
function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
}

export class ControllerSessionStore {
    static async load(deviceId: string): Promise<ControllerSession | null> {
        const { value } = await Preferences.get({ key: keyFor(deviceId) });
        if (!value) return null;
        try {
            const parsed: unknown = JSON.parse(value);
            if (typeof parsed !== 'object' || parsed === null) return null;
            const item = parsed as Record<string, unknown>;
            if (item.deviceId !== deviceId || typeof item.sessionToken !== 'string' ||
                item.sessionToken.length !== 64 || typeof item.ownerUserId !== 'string') return null;
            return { deviceId, sessionToken: item.sessionToken, ownerUserId: item.ownerUserId };
        } catch {
            return null;
        }
    }

    static async save(session: ControllerSession): Promise<void> {
        await mutate(() => Preferences.set({ key: keyFor(session.deviceId), value: JSON.stringify(session) }));
    }

    static async clearIfMatching(deviceId: string, sessionToken: string): Promise<boolean> {
        return mutate(async () => {
            const session = await this.load(deviceId);
            if (session?.sessionToken !== sessionToken) return false;
            await Preferences.remove({ key: keyFor(deviceId) });
            return true;
        });
    }

    static async clear(deviceId: string): Promise<void> {
        await mutate(() => Preferences.remove({ key: keyFor(deviceId) }));
    }
}
