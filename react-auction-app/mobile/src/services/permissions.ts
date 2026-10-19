import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export interface PermissionResult { granted: boolean; denied: string[]; blocked: boolean }

function mediaPermissions(): Permission[] {
  return [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
}

async function request(permissions: Permission[]): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return { granted: true, denied: [], blocked: false };
  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter(permission => results[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  const blocked = denied.some(permission => results[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  return { granted: denied.length === 0, denied, blocked };
}

/** Camera + microphone, plus the notification permission Android 13+ needs for the foreground service. */
export async function requestMediaPermissions(): Promise<PermissionResult> {
  const permissions = mediaPermissions();
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  const result = await request(permissions);
  // A denied notification permission must not block streaming — the service still runs.
  const denied = result.denied.filter(permission => permission !== PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return { granted: denied.length === 0, denied, blocked: result.blocked && denied.length > 0 };
}

export async function hasMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const checks = await Promise.all(mediaPermissions().map(permission => PermissionsAndroid.check(permission)));
  return checks.every(Boolean);
}

/** Android 12+ runtime Bluetooth permissions; older versions need location only for BLE scanning. */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const version = Number(Platform.Version);
  const permissions: Permission[] = version >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  return (await request(permissions)).granted;
}
