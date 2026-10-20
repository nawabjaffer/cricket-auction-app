export interface PublishedMobileRelease {
  versionName: string;
  sourceFingerprint?: string;
  releaseCommit?: string;
  versionCode?: number;
  sha256?: string;
}

export function mobileInputFingerprint(mobileRoot: string): Promise<{ fingerprint: string; files: string[] }>;
export function androidVersionCode(version: string): number;
export function releaseBump(messages: string, major?: boolean): 'patch' | 'major';
export function nextMobileVersion(version: string, bump: 'patch' | 'major'): string;
export function planMobileRelease(input: {
  fingerprint: string;
  manifest?: PublishedMobileRelease | null;
  localVersion: string;
  messages?: string;
  major?: boolean;
}): { action: 'skip' | 'baseline' | 'release'; version: string; reason: string; bump?: 'patch' | 'major' };
export function fileSha256(path: string): Promise<string>;
export function fileExists(path: string): Promise<boolean>;
export function releasableSource(path: string): boolean;
export function pendingMobileRelease(local: PublishedMobileRelease | null, remote: PublishedMobileRelease | null, fingerprint: string): boolean;
export function syncReleaseSource(root: string, options?: { message?: string; push?: boolean; verified?: boolean }): Promise<{ changed: boolean; commit?: string; branch?: string }>;