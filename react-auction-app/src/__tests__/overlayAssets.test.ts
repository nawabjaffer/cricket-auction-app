/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildOverlayAssetManifest } from '../../scripts/overlayAssets';

describe('Camera offline overlay package', () => {
  it('includes exact hashes, lengths and MIME types in a stable manifest', () => {
    const input = { 'index.html': '<html></html>', 'assets/main.js': 'console.log(1)', 'assets/animation.webm': new Uint8Array([0, 1, 2]) };
    const result = buildOverlayAssetManifest(input);
    expect(result).toMatchObject({ version: 1, id: 'njs-camera-web', entry: '/index.html', spa: true });
    expect(result.files.find(file => file.path === '/assets/animation.webm')).toEqual({ path: '/assets/animation.webm', bytes: 3, mime: 'video/webm', sha256: createHash('sha256').update(new Uint8Array([0, 1, 2])).digest('hex') });
    expect(buildOverlayAssetManifest(Object.fromEntries(Object.entries(input).reverse()))).toEqual(result);
  });
  it('invalidates the revision when an animation or script changes', () => {
    expect(buildOverlayAssetManifest({ 'index.html': 'v1' }).revision).not.toBe(buildOverlayAssetManifest({ 'index.html': 'v2' }).revision);
  });
  it('rejects traversal, unknown types, and missing HTML', () => {
    expect(() => buildOverlayAssetManifest({ 'assets/../bad.js': 'x', 'index.html': 'x' })).toThrow('Unsafe');
    expect(() => buildOverlayAssetManifest({ 'assets/bad.exe': 'x', 'index.html': 'x' })).toThrow('Unsupported');
    expect(() => buildOverlayAssetManifest({ 'assets/main.js': 'x' })).toThrow('index.html');
  });
});