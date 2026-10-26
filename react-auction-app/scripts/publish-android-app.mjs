#!/usr/bin/env node
// Publishes the signed release APK for the admin "Android Live Studio" Quick link.
//
//   npm run mobile:build      # produces mobile/android/app/build/outputs/apk/release/app-release.apk
//   npm run mobile:publish    # copies it to public/downloads/android and writes latest.json
//   npm run deploy            # ships hosting (dist/ includes public/downloads)
//
// Options:  --apk <path>        use a different APK
//           --notes "a|b|c"     release notes shown on the download page (separate lines with |)
//           --allow-debug       permit an APK signed with the Android debug key (never for production)
//           --channel testing   publish an explicitly labeled testing feed, separate from production
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const channel = option('channel') ?? 'stable';
if (channel !== 'stable' && channel !== 'testing') fail('Release channel must be stable or testing.');
const outDir = resolve(projectRoot, 'public/downloads/android', channel === 'testing' ? 'testing' : '.');
const APP_ID = 'com.njsstore.livestudio';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function findBuildTool(tool) {
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Library/Android/sdk'), join(homedir(), 'Android/Sdk')]
    .filter(Boolean);
  for (const sdk of sdkRoots) {
    const buildTools = join(sdk, 'build-tools');
    if (!existsSync(buildTools)) continue;
    const versions = (await readdir(buildTools)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = join(buildTools, version, tool);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function sha256(path) {
  const hash = createHash('sha256');
  await new Promise((resolveStream, reject) => {
    createReadStream(path).on('data', chunk => hash.update(chunk)).on('end', resolveStream).on('error', reject);
  });
  return hash.digest('hex');
}

const apkPath = resolve(option('apk') ?? join(projectRoot, 'mobile/android/app/build/outputs/apk/release/app-release.apk'));
if (!existsSync(apkPath)) fail(`APK not found at ${apkPath}\n  Build it first:  npm run mobile:build`);

const aapt2 = await findBuildTool('aapt2');
const apksigner = await findBuildTool('apksigner');
if (!aapt2 || !apksigner) fail('Android build-tools (aapt2, apksigner) not found. Install the Android SDK and set ANDROID_HOME.');

const badging = (await run(aapt2, ['dump', 'badging', apkPath], { maxBuffer: 16 * 1024 * 1024 })).stdout;
const packageLine = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/);
if (!packageLine) fail('Could not read the package name / version from the APK.');
const [, packageName, versionCode, versionName] = packageLine;
if (packageName !== APP_ID) fail(`Unexpected package "${packageName}" (expected ${APP_ID}).`);
if (/^application-debuggable\b/m.test(badging)) fail('The APK is debuggable. Build the release variant before publishing.');
if (process.argv.includes('--allow-debug') && channel !== 'testing') fail('The test-signing override requires --channel testing; production publication is not allowed.');
const minSdk = Number(badging.match(/sdkVersion:'(\d+)'/)?.[1] ?? 24);
const abis = (badging.match(/native-code: ([^\n]+)/)?.[1] ?? '').match(/'([^']+)'/g)?.map(abi => abi.replaceAll("'", '')) ?? [];

let certs;
try {
  certs = (await run(apksigner, ['verify', '--print-certs', apkPath])).stdout;
} catch (error) {
  fail(`apksigner could not verify the APK signature:\n${error.stderr || error.message}`);
}
const signerDn = certs.match(/certificate DN: (.+)/)?.[1] ?? '';
const signerSha256 = certs.match(/certificate SHA-256 digest: ([0-9a-f]+)/i)?.[1];
const signerSha1 = certs.match(/certificate SHA-1 digest: ([0-9a-f]+)/i)?.[1];
const developmentSigned = /CN=Android Debug/i.test(signerDn);
if (developmentSigned && (channel !== 'testing' || !process.argv.includes('--allow-debug'))) {
  fail('The APK is signed with the Android debug key. Configure production signing, or use --channel testing --allow-debug for an explicitly labeled test release.');
}

const size = (await stat(apkPath)).size;
const digest = await sha256(apkPath);
const apkName = `njs-live-studio-${versionCode}-${digest}.apk`;
let previous = null;
try { previous = JSON.parse(await readFile(join(outDir, 'latest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') fail('The existing release catalog is invalid. Repair it before publishing.'); }
const sameBuild = previous?.file === apkName && previous?.sha256 === digest;
const sourceFingerprint = option('source-fingerprint');
const releaseCommit = option('release-commit');
if (sourceFingerprint && !/^[a-f0-9]{64}$/.test(sourceFingerprint)) fail('Invalid release source fingerprint.');
if (releaseCommit && !/^[a-f0-9]{40}$/.test(releaseCommit)) fail('Invalid release commit.');

const manifest = {
  schema: 1,
  appId: packageName,
  versionName,
  versionCode: Number(versionCode),
  minSdk,
  file: apkName,
  size,
  sha256: digest,
  builtAt: sameBuild ? previous.builtAt : new Date().toISOString(),
  channel,
  signing: developmentSigned ? 'development' : 'release',
  ...(signerSha256 ? { signerSha256 } : {}),
  ...(signerSha1 ? { signerSha1 } : {}),
  ...(abis.length ? { abis } : {}),
  ...(option('notes') ? { notes: option('notes').split('|').map(note => note.trim()).filter(Boolean) } : sameBuild && previous.notes ? { notes: previous.notes } : {}),
  ...(sourceFingerprint ? { sourceFingerprint } : sameBuild && previous.sourceFingerprint ? { sourceFingerprint: previous.sourceFingerprint } : {}),
  ...(releaseCommit ? { releaseCommit } : sameBuild && previous.releaseCommit ? { releaseCommit: previous.releaseCommit } : {}),
};

const targetApk = join(outDir, apkName);
const existingApk = existsSync(targetApk) && (await stat(targetApk)).isFile() && await sha256(targetApk) === digest;
if (existingApk && isDeepStrictEqual(previous, manifest)) {
  console.info(`Already published ${versionName} (${channel}); APK and catalog unchanged. No files rewritten.`);
  process.exit(0);
}
await mkdir(outDir, { recursive: true });
const staging = await mkdtemp(join(outDir, '.publish-'));
try {
  const stagedApk = join(staging, apkName);
  if (!existingApk) {
    await copyFile(apkPath, stagedApk);
    if ((await stat(stagedApk)).size !== size || await sha256(stagedApk) !== digest) {
      throw new Error('APK changed while publishing. Rebuild and retry.');
    }
    await rename(stagedApk, targetApk);
  }
  const stagedManifest = join(staging, 'latest.json');
  await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(stagedManifest, join(outDir, 'latest.json'));
} finally {
  await rm(staging, { recursive: true, force: true });
}

const retained = new Set([apkName, previous?.file].filter(Boolean));
for (const name of await readdir(outDir)) {
  if (/^njs-live-studio-\d+-[a-f0-9]{64}\.apk$/.test(name) && !retained.has(name)) await rm(join(outDir, name));
}

console.info(`\n✔ Published NJS Live Studio ${versionName} (build ${versionCode}, ${channel} channel)`);
console.info(`  file      ${outDir}/${apkName}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.info(`  sha-256   ${digest}`);
if (signerSha1) console.info(`  signer    SHA-1 ${signerSha1}  ← register this in Google Cloud for YouTube sign-in`);
console.info('\nNext: npm run deploy   (or npm run dev to try the Quick link locally)\n');
