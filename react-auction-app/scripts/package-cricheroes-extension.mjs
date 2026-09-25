import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = resolve(projectRoot, 'cricheroes-sync-extension');
const outputPath = resolve(projectRoot, 'public/cricheroes-live-sync.zip');
const packageFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'README.md',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const zip = new JSZip();
const extensionFolder = zip.folder('cricheroes-live-sync');
for (const file of packageFiles) {
  extensionFolder.file(file, await readFile(resolve(extensionRoot, file)));
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 8 },
}));
console.info(`Packaged Chrome extension: ${outputPath}`);