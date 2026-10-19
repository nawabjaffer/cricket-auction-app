// Pre-flight checklist shown before going live. Pure so it can be unit-tested.
import type { BatterySnapshot, NetworkSnapshot } from '../native';
import type { EffectiveVideo } from './effectiveConfig';
import { requiredUplinkKbps } from './effectiveConfig';

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface PreflightCheck { id: string; label: string; status: CheckStatus; detail: string }

export interface PreflightInput {
  hasPermissions: boolean;
  destinations: Array<{ label: string; ready: boolean; note: string }>;
  network: NetworkSnapshot | null;
  battery: BatterySnapshot | null;
  /** android.os.PowerManager THERMAL_STATUS_* (0 none … 6 shutdown). */
  thermal: number;
  freeStorageMb: number | null;
  record: boolean;
  effective: EffectiveVideo | null;
  audioKbps: number;
}

export function runPreflight(input: PreflightInput): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  checks.push(input.hasPermissions
    ? { id: 'permissions', label: 'Camera & microphone', status: 'ok', detail: 'Access granted' }
    : { id: 'permissions', label: 'Camera & microphone', status: 'fail', detail: 'Allow camera and microphone access' });

  if (input.destinations.length === 0) {
    checks.push({ id: 'destinations', label: 'Destinations', status: 'fail', detail: 'Enable at least one destination in Setup' });
  } else {
    for (const destination of input.destinations) {
      checks.push({
        id: `dest:${destination.label}`, label: destination.label, status: destination.ready ? 'ok' : 'fail', detail: destination.note,
      });
    }
  }

  const { network } = input;
  if (!network || !network.connected) {
    checks.push({ id: 'network', label: 'Network', status: 'fail', detail: 'No internet connection' });
  } else if (!network.validated) {
    checks.push({ id: 'network', label: 'Network', status: 'warn', detail: 'Connected, but internet access is not confirmed' });
  } else if (network.type === 'cellular' || network.metered) {
    checks.push({ id: 'network', label: 'Network', status: 'warn', detail: 'Mobile data — streaming uses several GB per hour' });
  } else {
    checks.push({ id: 'network', label: 'Network', status: 'ok', detail: network.type === 'wifi' ? 'Wi-Fi' : network.type });
  }

  if (input.effective) {
    const needed = requiredUplinkKbps(input.effective, input.audioKbps, Math.max(1, input.destinations.length));
    checks.push({
      id: 'quality',
      label: `${input.effective.preset.label}`,
      status: input.effective.downgradeReason ? 'warn' : 'ok',
      detail: input.effective.downgradeReason ?? `Needs about ${(needed / 1000).toFixed(1)} Mbps upload`,
    });
  }

  if (input.battery) {
    const { level, charging } = input.battery;
    if (charging || level >= 30) checks.push({ id: 'battery', label: 'Battery', status: 'ok', detail: `${Math.round(level)}%${charging ? ' · charging' : ''}` });
    else if (level >= 15) checks.push({ id: 'battery', label: 'Battery', status: 'warn', detail: `${Math.round(level)}% — plug in for a long stream` });
    else checks.push({ id: 'battery', label: 'Battery', status: 'fail', detail: `${Math.round(level)}% — charge before going live` });
  }

  if (input.thermal >= 3) {
    checks.push({ id: 'thermal', label: 'Temperature', status: input.thermal >= 4 ? 'fail' : 'warn', detail: 'The phone is hot — let it cool or lower the quality' });
  }

  if (input.record && input.freeStorageMb != null) {
    checks.push(input.freeStorageMb >= 1500
      ? { id: 'storage', label: 'Storage', status: 'ok', detail: `${Math.round(input.freeStorageMb / 1024)} GB free for the local recording` }
      : { id: 'storage', label: 'Storage', status: input.freeStorageMb >= 400 ? 'warn' : 'fail', detail: `${Math.round(input.freeStorageMb)} MB free — the local recording may stop early` });
  }
  return checks;
}

export const preflightBlocked = (checks: PreflightCheck[]): boolean => checks.some(check => check.status === 'fail');
