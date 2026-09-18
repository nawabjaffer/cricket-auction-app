import { describe, it, expect, beforeEach, vi } from 'vitest';
import { overlayMediaPreload, getPreloadedMediaUrl } from '../services/overlayMediaPreload';

describe('overlayMediaPreload service', () => {
  beforeEach(() => {
    overlayMediaPreload.clear();
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && window.HTMLMediaElement) {
      window.HTMLMediaElement.prototype.load = vi.fn();
    }
  });

  it('normalizes Google Drive URLs to high-speed lh3 CDN endpoints', () => {
    const driveUrl = 'https://drive.google.com/file/d/1AbC-xyz123_456/view?usp=sharing';
    const normalized = overlayMediaPreload.normalizeUrl(driveUrl);
    expect(normalized).toBe('https://lh3.googleusercontent.com/d/1AbC-xyz123_456=w1280');
  });

  it('leaves standard image/gif/video URLs unchanged during normalization', () => {
    const gifUrl = 'https://example.com/animations/super-raid.gif';
    expect(overlayMediaPreload.normalizeUrl(gifUrl)).toBe(gifUrl);
  });

  it('returns raw URL immediately when not yet preloaded', () => {
    const gifUrl = 'https://example.com/celebration.gif';
    expect(getPreloadedMediaUrl(gifUrl)).toBe(gifUrl);
    expect(overlayMediaPreload.isPreloaded(gifUrl)).toBe(false);
  });

  it('preloads media via fetch and returns blob URL from local RAM', async () => {
    const gifUrl = 'https://example.com/celebration.gif';
    const mockBlob = new Blob(['fake gif data'], { type: 'image/gif' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    });

    const result = await overlayMediaPreload.preload(gifUrl);
    expect(result).toMatch(/^blob:/);
    expect(getPreloadedMediaUrl(gifUrl)).toBe(result);
    expect(overlayMediaPreload.isPreloaded(gifUrl)).toBe(true);
  });

  it('handles batch preloads concurrently', async () => {
    const urls = [
      'https://example.com/super-raid.gif',
      'https://example.com/super-tackle.mp4',
      'https://example.com/all-out.webp',
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const type = url.endsWith('.mp4') ? 'video/mp4' : 'image/gif';
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['mock data'], { type })),
      });
    });

    await overlayMediaPreload.preloadBatch(urls);

    for (const url of urls) {
      expect(overlayMediaPreload.isPreloaded(url)).toBe(true);
      expect(getPreloadedMediaUrl(url)).toMatch(/^blob:/);
    }
  });

  it('gracefully handles fetch errors by falling back to DOM preload without crashing', async () => {
    const gifUrl = 'https://restricted-cors.example.com/anim.gif';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('CORS error'));

    const result = await overlayMediaPreload.preload(gifUrl);
    expect(result).toBe(gifUrl);
  });

  it('clears memory cache and revokes object URLs', async () => {
    const gifUrl = 'https://example.com/celebration.gif';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['fake gif'], { type: 'image/gif' })),
    });

    await overlayMediaPreload.preload(gifUrl);
    expect(overlayMediaPreload.isPreloaded(gifUrl)).toBe(true);

    overlayMediaPreload.clear();
    expect(overlayMediaPreload.isPreloaded(gifUrl)).toBe(false);
  });
});
