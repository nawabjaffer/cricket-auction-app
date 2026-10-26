#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, open, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const ROOT_FILES = new Set(['package.json', 'package-lock.json', 'app.json', 'index.js', 'babel.config.js', 'metro.config.js']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'build', '.gradle', '.cxx', '.kotlin', '__tests__', 'coverage', 'keystore']);

function appPackage(value) {
  return {
    name: value.name, main: value.main, dependencies: value.dependencies,
    engines: value.engines, codegenConfig: value.codegenConfig,
  };
}

export async function mobileInputFingerprint(mobileRoot) {
  const files = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in release inputs: ${entry.name}`);
      const path = join(directory, entry.name);
      const name = relative(mobileRoot, path).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name) && (name === 'src' || name.startsWith('src/') || name === 'android' || name.startsWith('android/'))) await visit(path);
      } else if ((ROOT_FILES.has(name) || name.startsWith('src/') || name.startsWith('android/'))
        && !name.startsWith('android/app/src/androidTest/') && !name.startsWith('android/app/src/test/')
        && !/\.(test|spec)\.[^.]+$/.test(name) && !/(?:^|\/)(local\.properties|keystore\.properties|\.DS_Store)$/.test(name)
        && !/\.(jks|keystore|pem|p12|pfx)$/.test(name)) files.push(name);
    }
  }
  await visit(mobileRoot);
  const hash = createHash('sha256');
  for (const name of files.sort()) {
    let content = await readFile(join(mobileRoot, name));
    if (name === 'package.json') content = Buffer.from(JSON.stringify(appPackage(JSON.parse(content.toString()))));
    if (name === 'package-lock.json') {
      const lock = JSON.parse(content.toString());
      delete lock.version;
      if (lock.packages?.['']) {
        lock.packages[''] = { ...lock.packages[''] };
        delete lock.packages[''].version;
      }
      content = Buffer.from(JSON.stringify(lock));
    }
    hash.update(`${name.length}:${name}:${content.length}:`);
    hash.update(content);
  }
  return { fingerprint: hash.digest('hex'), files };
}

export function androidVersionCode(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use an Android version in major.minor.patch format.');
  const [major, minor, patch] = version.split('.').map(Number);
  const code = major * 1_000_000 + minor * 1000 + patch;
  if (minor >= 1000 || patch >= 1000 || !Number.isSafeInteger(code) || code < 1 || code > 2_100_000_000) throw new Error('Version exceeds the supported Android version-code range.');
  return code;
}

export function releaseBump(messages, major = false) {
  return major || /(^|\n)[a-z]+(?:\([^\n)]*\))?!:|(^|\n)BREAKING[ -]CHANGE:/m.test(messages) ? 'major' : 'patch';
}

export function nextMobileVersion(version, bump) {
  androidVersionCode(version);
  let [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') { major += 1; minor = 0; patch = 0; }
  else { patch += 1; if (patch >= 1000) { patch = 0; minor += 1; } if (minor >= 1000) { minor = 0; major += 1; } }
  const next = `${major}.${minor}.${patch}`;
  androidVersionCode(next);
  return next;
}

export function planMobileRelease({ fingerprint, manifest, localVersion, messages = '', major = false }) {
  androidVersionCode(localVersion);
  if (manifest?.sourceFingerprint === fingerprint) return { action: 'skip', version: manifest.versionName, reason: 'No mobile app inputs changed.' };
  if (manifest && !manifest.sourceFingerprint) return { action: 'baseline', version: manifest.versionName, reason: 'The existing release needs a verified input baseline before automatic versioning.' };
  const base = manifest && androidVersionCode(manifest.versionName) > androidVersionCode(localVersion) ? manifest.versionName : localVersion;
  const bump = releaseBump(messages, major);
  return { action: 'release', version: manifest ? nextMobileVersion(base, bump) : base, bump, reason: manifest ? 'Mobile app inputs changed.' : 'First release on this channel.' };
}

export async function fileSha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function fileExists(path) {
  try { return (await stat(path)).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function execute(command, args, cwd, env = process.env) {
  console.info(`> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, env, stdio: 'inherit' });
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

export function releasableSource(path) {
  return !/(^|\/)(node_modules|build|dist|\.firebase|\.gradle|\.cxx|\.kotlin|\.mobile-release)(\/|$)/.test(path)
    && !/(^|\/)(\.env(?:\.[^/]*)?|keystore\.properties|local\.properties|\.mobile-release\.lock)$/i.test(path)
    && !/\.(apk|aab|jks|keystore|pem|p12|pfx)(?:\.|$)|\.log$/i.test(path)
    && !/(^|\/)public\/downloads\//.test(path);
}

function mobileEnvironment() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
  return { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
}

function qualityChecks(root) {
  execute('npm', ['test', '--', '--maxWorkers=2'], root);
  execute('npm', ['run', 'mobile:typecheck'], root);
  execute('npm', ['run', 'lint', '--prefix', 'mobile'], root);
  execute('npm', ['test', '--prefix', 'mobile', '--', '--ci', '--runInBand'], root);
}

export function pendingMobileRelease(local, remote, fingerprint) {
  return !!local && local.sourceFingerprint === fingerprint && local.sourceFingerprint !== remote?.sourceFingerprint
    && (local.versionCode > (remote?.versionCode ?? 0)
      || (local.versionCode === remote?.versionCode && !remote?.sourceFingerprint && local.sha256 === remote.sha256));
}

function gitPaths(root, args) {
  return execFileSync('git', ['-C', root, ...args, '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

export async function syncReleaseSource(root, { message, push = false, verified = false } = {}) {
  const repository = git(root, ['rev-parse', '--show-toplevel']);
  const prefix = relative(repository, await realpath(root)).replaceAll('\\', '/');
  const output = execFileSync('git', ['-C', repository, 'ls-files', '-m', '-d', '--others', '--exclude-standard', '-z', '--', prefix || '.'], { encoding: 'utf8' });
  const changed = [...new Set(output.split('\0').filter(Boolean))].filter(releasableSource);
  const staged = gitPaths(repository, ['diff', '--cached', '--name-only']);
  if (staged.some(path => !releasableSource(path) || (prefix && !path.startsWith(`${prefix}/`)))) throw new Error('The index contains unrelated/private/generated files. Review it before syncing source.');
  if (!changed.length && !staged.length) {
    console.info('No source changes. No commit or push performed.');
    return { changed: false };
  }
  const branch = git(repository, ['branch', '--show-current']);
  if (!branch) throw new Error('Detached HEAD: select the intended branch before committing.');
  if (push) {
    execute('git', ['fetch', 'origin'], repository);
    const remote = git(repository, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
    if (remote) {
      const behind = Number(git(repository, ['rev-list', '--count', `HEAD..origin/${branch}`]));
      if (behind) throw new Error('The remote branch has newer commits. Reconcile them before release; no force push is used.');
    }
  }
  if (!verified) {
    qualityChecks(root);
    execute('npm', ['run', 'build'], root);
    if (changed.some(path => /(^|\/)mobile\/android\//.test(path))) execute(join(root, 'mobile/android/gradlew'), ['-p', join(root, 'mobile/android'), ':app:lintRelease', '-Porg.gradle.java.installations.auto-download=false', '--console=plain'], root, mobileEnvironment());
  }
  if (changed.length) execute('git', ['add', '--', ...changed], repository);
  execute('git', ['diff', '--cached', '--check'], repository);
  const files = gitPaths(repository, ['diff', '--cached', '--name-only']);
  for (const path of files) {
    if (!releasableSource(path)) throw new Error(`Unsafe staged path: ${path}`);
    if (git(repository, ['diff', '--cached', '--name-only', '--diff-filter=D', '--', path])) continue;
    const bytes = execFileSync('git', ['-C', repository, 'show', `:${path}`], { maxBuffer: 16 * 1024 * 1024 });
    if (!bytes.includes(0) && /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}|GOCSPX-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}/.test(bytes.toString())) throw new Error(`Potential credentials in ${path}. Review before committing.`);
  }
  execute('git', ['commit', '-m', message || 'chore(release): sync verified application changes'], repository);
  const commit = git(repository, ['rev-parse', 'HEAD']);
  if (push) execute('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], repository);
  console.info(`Source commit ${commit} on ${branch}${push ? ' pushed to origin' : ''}.`);
  return { changed: true, commit, branch };
}

async function readCatalog(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function validCatalog(value, channel) {
  try {
    return value?.appId === 'com.njsstore.livestudio' && value.channel === channel
      && /^[a-f0-9]{64}$/.test(value.sha256 ?? '') && /^[\w.-]+\.apk$/.test(value.file ?? '')
      && androidVersionCode(value.versionName) === value.versionCode
      && (!value.sourceFingerprint || /^[a-f0-9]{64}$/.test(value.sourceFingerprint))
      && (!value.releaseCommit || /^[a-f0-9]{40}$/.test(value.releaseCommit));
  } catch { return false; }
}

async function publishedCatalog(origin, channel) {
  const response = await fetch(`${origin}/downloads/android/${channel === 'testing' ? 'testing/' : ''}latest.json?releaseCheck=${Date.now()}`, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Update catalog HTTP ${response.status}. Refusing to guess release state.`);
  const text = await response.text();
  if (text.trim().startsWith('<')) return null;
  const value = JSON.parse(text);
  if (!validCatalog(value, channel)) throw new Error('Invalid published release catalog.');
  return value;
}

async function setVersion(root, version) {
  for (const name of ['package.json', 'package-lock.json']) {
    const path = join(root, 'mobile', name);
    const value = JSON.parse(await readFile(path, 'utf8'));
    value.version = version;
    if (name === 'package-lock.json' && value.packages?.['']) value.packages[''].version = version;
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }
}

async function restorePublishedApk(root, origin, channel, manifest) {
  if (!manifest) return;
  const directory = join(root, 'public/downloads/android', channel === 'testing' ? 'testing' : '.');
  const path = join(directory, manifest.file);
  if (await fileExists(path) && await fileSha256(path) === manifest.sha256) return;
  const response = await fetch(`${origin}/downloads/android/${channel === 'testing' ? 'testing/' : ''}${manifest.file}`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Cannot retain the previous APK (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== manifest.size || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Previous APK checksum mismatch.');
  await mkdir(directory, { recursive: true });
  await writeFile(path, bytes);
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; };
  if (args.includes('--sync')) {
    if (await fileExists(join(root, '.mobile-release.lock'))) throw new Error('A mobile release is running. Wait for it to finish before syncing source.');
    await syncReleaseSource(root, { message: option('message'), push: args.includes('--push') });
    return;
  }
  const channel = option('channel') || 'testing';
  if (!['testing', 'stable'].includes(channel)) throw new Error('Channel must be testing or stable.');
  const origin = new URL(option('origin') || 'https://e-auction-store.web.app');
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Use a trusted HTTPS release origin.');
  const pkg = JSON.parse(await readFile(join(root, 'mobile/package.json'), 'utf8'));
  const inputs = await mobileInputFingerprint(join(root, 'mobile'));
  const remote = await publishedCatalog(origin.origin, channel);
  const localPath = join(root, 'public/downloads/android', channel === 'testing' ? 'testing' : '.', 'latest.json');
  const local = await readCatalog(localPath);
  if (local && !validCatalog(local, channel)) throw new Error('Invalid local release catalog.');
  const commit = git(root, ['rev-parse', 'HEAD']);
  let messages = '';
  if (remote?.releaseCommit) messages = git(root, ['log', `${remote.releaseCommit}..HEAD`, '--format=%s%n%b']);
  const pending = pendingMobileRelease(local, remote, inputs.fingerprint)
    && await fileExists(join(dirname(localPath), local.file)) && await fileSha256(join(dirname(localPath), local.file)) === local.sha256;
  const plan = pending
    ? { action: 'resume', version: local.versionName, reason: 'Previously built release is waiting for deployment.' }
    : planMobileRelease({ fingerprint: inputs.fingerprint, manifest: remote, localVersion: pkg.version, messages, major: args.includes('--major') });
  console.info(JSON.stringify({ channel, ...plan, fingerprint: inputs.fingerprint, inputs: inputs.files.length }, null, 2));
  if (plan.action === 'skip' || args.includes('--dry-run')) return;
  if (plan.action === 'baseline' && !args.includes('--baseline')) throw new Error('Run npm run mobile:baseline once to verify the existing APK and initialize change detection without a version bump.');
  const lock = join(root, '.mobile-release.lock');
  let handle;
  try { handle = await open(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another release is running (.mobile-release.lock). Do not run releases concurrently.'); throw error; }
  let localPublished = false;
  let versionChanged = false;
  try {
    if (pending && args.includes('--deploy')) {
      console.info('Resuming a previously built release; no rebuild or version bump.');
    } else {
      qualityChecks(root);
      if (plan.action === 'release' && plan.version !== pkg.version) { await setVersion(root, plan.version); versionChanged = true; }
      const gradle = ['-p', join(root, 'mobile/android'), ':app:assembleRelease', '--build-cache', '-Porg.gradle.java.installations.auto-download=false', '--console=plain'];
      if (channel === 'testing') gradle.push('-PallowDebugSigning=true');
      execute(join(root, 'mobile/android/gradlew'), gradle, root, mobileEnvironment());
      const rebuilt = await mobileInputFingerprint(join(root, 'mobile'));
      if (rebuilt.fingerprint !== inputs.fingerprint) throw new Error('App inputs changed during the build. Retry after edits are complete.');
      const apk = join(root, 'mobile/android/app/build/outputs/apk/release/app-release.apk');
      if (plan.action === 'baseline' && (pkg.version !== remote.versionName || await fileSha256(apk) !== remote.sha256)) throw new Error('The current inputs do not reproduce the published APK. Baseline was not adopted; review app changes before release.');
      await restorePublishedApk(root, origin.origin, channel, remote);
      const publish = ['scripts/publish-android-app.mjs', '--channel', channel, '--source-fingerprint', inputs.fingerprint, '--release-commit', commit];
      if (channel === 'testing') publish.push('--allow-debug');
      if (option('notes')) publish.push('--notes', option('notes'));
      execute(process.execPath, publish, root);
      localPublished = true;
    }
    if (args.includes('--deploy')) {
      await restorePublishedApk(root, origin.origin, channel, remote);
      execute('npm', ['run', 'build'], root);
      const firebase = join(root, 'node_modules/.bin/firebase');
      execute(firebase, ['deploy', '--only', 'hosting', '--project', option('project') || 'e-auction-store', '--non-interactive', '--message', `Android ${channel} ${plan.version}; change-aware release`], root);
      const live = await publishedCatalog(origin.origin, channel);
      if (live?.sourceFingerprint !== inputs.fingerprint || live.versionName !== plan.version) throw new Error('Deployed catalog fingerprint/version verification failed.');
      console.info('Hosting catalog verified. Firebase reused unchanged content hashes.');
    }
    if (args.includes('--commit') || args.includes('--push')) await syncReleaseSource(root, { message: option('message') || `chore(mobile): release ${plan.version}`, push: args.includes('--push'), verified: false });
  } catch (error) {
    if (versionChanged && !localPublished && (await mobileInputFingerprint(join(root, 'mobile'))).fingerprint === inputs.fingerprint) await setVersion(root, pkg.version);
    throw error;
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}

if (process.argv[1] && import.meta.url.startsWith('file:') && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Release stopped: ${error.message}`); process.exitCode = 1; });
}