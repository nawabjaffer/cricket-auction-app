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
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(projectRoot, 'public/downloads/android');
const APK_NAME = 'njs-live-studio.apk';
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
if (/CN=Android Debug/i.test(signerDn) && !process.argv.includes('--allow-debug')) {
  fail('The APK is signed with the Android debug key. Configure the release keystore (mobile/android/keystore.properties) and rebuild, or pass --allow-debug for a throw-away test build.');
}

const size = (await stat(apkPath)).size;
const digest = await sha256(apkPath);

await mkdir(outDir, { recursive: true });
await copyFile(apkPath, join(outDir, APK_NAME));

const manifest = {
  schema: 1,
  appId: packageName,
  versionName,
  versionCode: Number(versionCode),
  minSdk,
  file: APK_NAME,
  size,
  sha256: digest,
  builtAt: new Date().toISOString(),
  ...(signerSha256 ? { signerSha256 } : {}),
  ...(signerSha1 ? { signerSha1 } : {}),
  ...(abis.length ? { abis } : {}),
  ...(option('notes') ? { notes: option('notes').split('|').map(note => note.trim()).filter(Boolean) } : {}),
};
await writeFile(join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.info(`\n✔ Published NJS Live Studio ${versionName} (build ${versionCode})`);
console.info(`  file      public/downloads/android/${APK_NAME}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.info(`  sha-256   ${digest}`);
if (signerSha1) console.info(`  signer    SHA-1 ${signerSha1}  ← register this in Google Cloud for YouTube sign-in`);
console.info('\nNext: npm run deploy   (or npm run dev to try the Quick link locally)\n');
