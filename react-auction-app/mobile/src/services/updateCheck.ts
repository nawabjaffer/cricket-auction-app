// In-app update check against the same release manifest the web Quick link publishes.
import { parseReleaseManifest, releaseApkUrl, releaseManifestUrl, type StudioReleaseManifest } from '../shared/studioProfile';

export interface UpdateInfo {
  available: boolean;
  manifest: StudioReleaseManifest | null;
  apkUrl: string | null;
}

export async function checkForUpdate(origin: string, installedVersionCode: number): Promise<UpdateInfo> {
  const response = await fetch(releaseManifestUrl(origin), { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) return { available: false, manifest: null, apkUrl: null };
  let json: unknown;
  try { json = await response.json(); } catch { return { available: false, manifest: null, apkUrl: null }; }
  const manifest = parseReleaseManifest(json);
  if (!manifest) return { available: false, manifest: null, apkUrl: null };
  return { available: manifest.versionCode > installedVersionCode, manifest, apkUrl: releaseApkUrl(origin, manifest) };
}
