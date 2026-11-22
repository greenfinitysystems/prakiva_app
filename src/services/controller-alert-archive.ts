import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from './controller-session-store';
import { controllerRequest } from './controller-api';

export type AlertRecord = { id: number; timestamp: number; code: string; source: string; message: string };
export const alertArchiveKey = (deviceId: string) => `prakiva.alert-archive.${deviceId}`;
const validAlert = (v: unknown): v is AlertRecord => !!v && typeof v === 'object' && Number.isSafeInteger((v as AlertRecord).id) && typeof (v as AlertRecord).code === 'string' && typeof (v as AlertRecord).message === 'string' && typeof (v as AlertRecord).source === 'string' && typeof (v as AlertRecord).timestamp === 'number';
export function readAlertArchive(deviceId: string): AlertRecord[] {
 const raw = localStorage.getItem(alertArchiveKey(deviceId));
 if (raw === null) return [];
 const parsed: unknown = JSON.parse(raw);
 if (!Array.isArray(parsed) || !parsed.every(validAlert)) throw new Error('Stored alert history is invalid. No alerts acknowledged.');
 return parsed;
}
export function writeAlertArchive(deviceId: string, records: AlertRecord[]): void {
 localStorage.setItem(alertArchiveKey(deviceId), JSON.stringify(records));
}
// Save before acknowledging. A single-flight guard prevents overlapping dashboard and diagnostics polls.
const inflight = new Map<string, Promise<number>>();
export function collectControllerAlerts(controller: SavedController): Promise<number> {
 const existing = inflight.get(controller.deviceId);
 if (existing) return existing;
 const task = (async () => {
  const session = await ControllerSessionStore.load(controller.deviceId);
  if (!session?.sessionToken) throw new Error('Sign in before retrieving alerts.');
  const fields = {session_token:session.sessionToken};
  const result = await controllerRequest(controller.address,controller.httpPort,'get_alerts',fields);
  const received: unknown = result.data.alerts;
  if (!Array.isArray(received) || !received.every(validAlert)) throw new Error('Controller returned invalid alerts; none acknowledged.');
  const merged = new Map(readAlertArchive(controller.deviceId).map(a => [a.id,a] as const));
  for (const alert of received) merged.set(alert.id,alert);
  writeAlertArchive(controller.deviceId,[...merged.values()].sort((a,b)=>a.id-b.id));
  if (received.length) await controllerRequest(controller.address,controller.httpPort,'acknowledge_alerts',{...fields,through_id:Math.max(...received.map(a=>a.id))});
  return received.length;
 })();
 inflight.set(controller.deviceId,task);
 void task.finally(()=>{if(inflight.get(controller.deviceId)===task) inflight.delete(controller.deviceId);}).catch(()=>{});
 return task;
}
