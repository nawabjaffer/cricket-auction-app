// In-app update check against the same release manifest the web Quick link publishes.
import { normalizeOrigin, parseReleaseManifest, releaseApkUrl, releaseManifestUrl, type StudioReleaseChannel, type StudioReleaseManifest } from '../shared/studioProfile';

export interface UpdateInfo {
  available: boolean;
  manifest: StudioReleaseManifest | null;
  apkUrl: string | null;
}

export interface UpdateCheckOptions {
  channel?: StudioReleaseChannel;
  sdk?: number;
  signerSha256?: string;
  timeoutMs?: number;
}

export async function checkForUpdate(origin: string, installedVersionCode: number, options: UpdateCheckOptions = {}): Promise<UpdateInfo> {
  const server = normalizeOrigin(origin);
  if (!server) throw new Error('Enter a valid HTTP or HTTPS update server.');
  const channel = options.channel ?? 'stable';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    let response: Response;
    try {
      response = await fetch(`${releaseManifestUrl(server, channel)}?check=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }, signal: controller.signal,
      });
    } catch {
      throw new Error(controller.signal.aborted
        ? 'The update check timed out. Check your connection and try again.'
        : 'Could not reach the update server. Check your internet connection and server address.');
    }
    if (response.status === 404) return { available: false, manifest: null, apkUrl: null };
    if (!response.ok) throw new Error(`The update server returned HTTP ${response.status}. Try again later.`);
    let json: unknown;
    try { json = await response.json(); }
    catch {
      throw new Error(controller.signal.aborted
        ? 'The update check timed out. Try again.'
        : 'No Android update feed is published at this server. It returned a web page instead of a release manifest.');
    }
    const manifest = parseReleaseManifest(json);
    if (!manifest) throw new Error('The server returned an invalid Android release manifest. Contact the tournament administrator.');
    if (manifest.channel !== channel || (channel === 'stable' && manifest.signing === 'development')) {
      throw new Error('The update server returned the wrong release channel. No update was offered.');
    }
    if (manifest.versionCode > installedVersionCode) {
      if (options.sdk !== undefined && manifest.minSdk > options.sdk) {
        throw new Error(`This update requires Android API ${manifest.minSdk}; this phone runs API ${options.sdk}.`);
      }
      if (options.signerSha256 && manifest.signerSha256?.toLowerCase() !== options.signerSha256.toLowerCase()) {
        throw new Error('This update does not match the installed signing certificate. It cannot update this app safely.');
      }
    }
    return { available: manifest.versionCode > installedVersionCode, manifest, apkUrl: releaseApkUrl(server, manifest) };
  } finally {
    clearTimeout(timeout);
  }
}
