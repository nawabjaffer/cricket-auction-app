// Device presence: lets the web admin (Mobile Studio page › Connected phones) see this phone.
import { onDisconnect, ref, remove, set } from 'firebase/database';
import { getDb } from './firebase';
import { STUDIO_HEARTBEAT_MS, studioDevicesPath, type StudioDevicePresence, type StudioGameType } from '../shared/studioProfile';

export function startPresence(
  scope: { tenantId: string; game: StudioGameType; deviceId: string },
  snapshot: () => Omit<StudioDevicePresence, 'id' | 'lastSeen'>,
): () => void {
  const node = ref(getDb(), `${studioDevicesPath(scope.tenantId, scope.game)}/${scope.deviceId}`);
  let stopped = false;
  const beat = () => {
    if (stopped) return;
    const record: Record<string, unknown> = { ...snapshot(), id: scope.deviceId, lastSeen: Date.now() };
    // RTDB rejects undefined.
    for (const key of Object.keys(record)) if (record[key] === undefined) delete record[key];
    set(node, record).catch(() => undefined);
  };
  onDisconnect(node).remove().catch(() => undefined);
  beat();
  const timer = setInterval(beat, STUDIO_HEARTBEAT_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    onDisconnect(node).cancel().catch(() => undefined);
    remove(node).catch(() => undefined);
  };
}
