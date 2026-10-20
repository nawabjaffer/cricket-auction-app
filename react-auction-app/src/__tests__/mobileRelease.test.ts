/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { androidVersionCode, mobileInputFingerprint, nextMobileVersion, pendingMobileRelease, planMobileRelease, releasableSource, releaseBump, syncReleaseSource } from '../../scripts/mobile-release.mjs';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'njs-mobile-release-'));
  directories.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'android/app/build'), { recursive: true });
  await writeFile(join(root, 'src/App.tsx'), 'export const app = 1;');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'studio', version: '1.3.0', dependencies: { react: '19.2.3' } }));
  return root;
}

describe('change-aware mobile release planning', () => {
  it('hashes runtime inputs but ignores docs, tests, build output, secrets and version-only edits', async () => {
    const root = await fixture();
    const original = await mobileInputFingerprint(root);
    await writeFile(join(root, 'README.md'), 'Documentation changed');
    await writeFile(join(root, 'src/App.test.ts'), 'test fixture');
    await writeFile(join(root, 'android/app/build/generated.txt'), 'Build timestamp');
    await writeFile(join(root, 'android/keystore.properties'), 'private local signing configuration');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'studio', version: '1.3.1', dependencies: { react: '19.2.3' } }));
    expect((await mobileInputFingerprint(root)).fingerprint).toBe(original.fingerprint);
    await writeFile(join(root, 'src/App.tsx'), 'export const app = 2;');
    expect((await mobileInputFingerprint(root)).fingerprint).not.toBe(original.fingerprint);
  });

  it('skips unchanged sources even when a major bump is requested', () => {
    expect(planMobileRelease({ fingerprint: 'same', localVersion: '1.3.0', major: true, manifest: { versionName: '1.3.0', sourceFingerprint: 'same' } })).toMatchObject({ action: 'skip', version: '1.3.0' });
  });
  it('bumps changed sources by one patch and breaking changes by one major', () => {
    const input = { fingerprint: 'new', localVersion: '1.3.0', manifest: { versionName: '1.3.0', sourceFingerprint: 'old' } };
    expect(planMobileRelease(input)).toMatchObject({ action: 'release', version: '1.3.1', bump: 'patch' });
    expect(planMobileRelease({ ...input, messages: 'feat(camera)!: replace connector protocol' })).toMatchObject({ version: '2.0.0', bump: 'major' });
    expect(releaseBump('feat: new scene\n\nBREAKING CHANGE: old clients cannot connect')).toBe('major');
  });
  it('requires a verified baseline for legacy catalogs instead of guessing a change', () => {
    expect(planMobileRelease({ fingerprint: 'current', localVersion: '1.3.0', manifest: { versionName: '1.3.0' } })).toMatchObject({ action: 'baseline', version: '1.3.0' });
  });
  it('maintains valid increasing Android version codes', () => {
    expect(androidVersionCode('1.3.0')).toBe(1003000);
    expect(nextMobileVersion('1.3.999', 'patch')).toBe('1.4.0');
    expect(() => androidVersionCode('1.1000.0')).toThrow();
    expect(() => androidVersionCode('1.3.0-beta')).toThrow();
  });

  it('resumes a pending build rather than allocating a second version', () => {
    const remote = { versionName: '1.3.0', versionCode: 1003000, sourceFingerprint: 'old', sha256: 'old-apk' };
    expect(pendingMobileRelease({ versionName: '1.3.1', versionCode: 1003001, sourceFingerprint: 'new', sha256: 'new-apk' }, remote, 'new')).toBe(true);
    expect(pendingMobileRelease({ ...remote }, remote, 'old')).toBe(false);
    expect(pendingMobileRelease({ ...remote, sourceFingerprint: 'baseline' }, { ...remote, sourceFingerprint: undefined }, 'baseline')).toBe(true);
  });

  it('excludes generated and private files from source commits', () => {
    for (const path of ['.firebase/cache', 'public/downloads/android/testing/latest.json', 'mobile/android/keystore.properties', 'mobile/release.jks', 'mobile/production.JKS', 'mobile/private.keystore.backup', '.env.local', 'mobile/node_modules/lib.js']) expect(releasableSource(path)).toBe(false);
    expect(releasableSource('mobile/src/screens/HomeScreen.tsx')).toBe(true);
    expect(releasableSource('public/assets/help/app-home.jpg')).toBe(true);
  });

  it('does not commit or push a clean worktree, even without a remote', async () => {
    const root = await fixture();
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release@example.invalid');
    git('add', '.');
    git('commit', '-m', 'test: initial source');
    const before = git('rev-parse', 'HEAD');
    await expect(syncReleaseSource(root, { push: true, verified: true })).resolves.toEqual({ changed: false });
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('commits and pushes changed source while leaving generated/private files untouched', async () => {
    const root = await fixture();
    const remote = await mkdtemp(join(tmpdir(), 'njs-release-remote-'));
    directories.push(remote);
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release Test');
    git('config', 'user.email', 'release@example.invalid');
    git('add', '.');
    git('commit', '-m', 'test: initial source');
    git('remote', 'add', 'origin', remote);
    git('push', '-u', 'origin', 'main');
    await writeFile(join(root, 'README.md'), 'New public guide');
    await mkdir(join(root, '.firebase'));
    await writeFile(join(root, '.firebase/cache'), 'generated');
    await writeFile(join(root, 'private.JKS'), 'private signing fixture');
    const result = await syncReleaseSource(root, { message: 'docs: add public guide', push: true, verified: true });
    expect(result.changed).toBe(true);
    expect(git('show', '--format=', '--name-only', 'HEAD')).toBe('README.md');
    expect(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }).trim()).toBe(result.commit);
    expect(git('status', '--short')).toContain('.firebase/');
    expect(git('status', '--short')).toContain('private.JKS');
  });
});