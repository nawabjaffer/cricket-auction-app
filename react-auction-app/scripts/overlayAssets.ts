import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const sha256 = (content: Uint8Array | string) => createHash('sha256').update(content).digest('hex');
const MIME: Record<string, string> = {
  html: 'text/html', js: 'application/javascript', mjs: 'application/javascript', wasm: 'application/wasm', css: 'text/css', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
};

export function buildOverlayAssetManifest(input: Record<string, Uint8Array | string>) {
  const files = Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([name, content]) => {
    if (!/^(index\.html|assets\/[a-zA-Z0-9_./-]+)$/.test(name) || name.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe overlay asset path: ${name}`);
    const mime = MIME[name.split('.').pop() ?? ''];
    if (!mime) throw new Error(`Unsupported overlay asset type: ${name}`);
    return { path: `/${name}`, sha256: sha256(content), bytes: Buffer.byteLength(content), mime };
  });
  if (!files.some(file => file.path === '/index.html')) throw new Error('The overlay package must include index.html');
  return { version: 1, id: 'njs-camera-web', revision: sha256(JSON.stringify(files)), entry: '/index.html', spa: true, files };
}

export function overlayAssetsPlugin(): Plugin {
  return {
    name: 'camera-overlay-assets', enforce: 'post', apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files: Record<string, Uint8Array | string> = {};
        for (const [name, output] of Object.entries(bundle)) {
          if (name !== 'index.html' && (!name.startsWith('assets/') || name.endsWith('.map'))) continue;
          const mime = MIME[name.split('.').pop() ?? ''];
          if (mime) files[name] = output.type === 'chunk' ? output.code : output.source;
        }
        this.emitFile({ type: 'asset', fileName: 'camera-overlay-manifest.json', source: JSON.stringify(buildOverlayAssetManifest(files)) });
      },
    },
  };
}