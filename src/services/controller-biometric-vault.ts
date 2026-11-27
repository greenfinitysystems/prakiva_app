import { Capacitor, registerPlugin } from '@capacitor/core';

interface Credentials { userId: string; password: string }
interface BiometricVault {
  isAvailable(): Promise<{ available: boolean; status: number }>;
  hasCredentials(options: { deviceId: string }): Promise<{ saved: boolean }>;
  saveCredentials(options: Credentials & { deviceId: string }): Promise<{ saved: boolean }>;
  getCredentials(options: { deviceId: string }): Promise<Credentials>;
  removeCredentials(options: { deviceId: string }): Promise<void>;
}
const vault = registerPlugin<BiometricVault>('PrakivaBiometricVault');
export const ControllerBiometricVault = {
  async available() {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('PrakivaBiometricVault')) return false;
    return (await vault.isAvailable()).available;
  },
  async has(deviceId: string) { return (await vault.hasCredentials({ deviceId })).saved; },
  async save(deviceId: string, credentials: Credentials) { await vault.saveCredentials({ deviceId, ...credentials }); },
  async get(deviceId: string) { return vault.getCredentials({ deviceId }); },
  async remove(deviceId: string) {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('PrakivaBiometricVault')) return;
    await vault.removeCredentials({ deviceId });
  },
};
