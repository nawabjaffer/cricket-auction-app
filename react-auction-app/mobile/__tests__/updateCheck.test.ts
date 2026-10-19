import { checkForUpdate } from '../src/services/updateCheck';

const manifest = {
  schema: 1, appId: 'com.njsstore.livestudio', versionName: '1.1.1', versionCode: 1001001,
  minSdk: 24, file: 'njs-live-studio-1001001-test.apk', size: 32_000_000,
  sha256: 'a'.repeat(64), builtAt: '2026-10-19T00:00:00Z',
};
const originalFetch = globalThis.fetch;

beforeEach(() => { globalThis.fetch = jest.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });

describe('Android update checks', () => {
  it('offers the newer published version and its immutable APK URL', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => manifest } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).resolves.toMatchObject({
      available: true, manifest: { versionCode: 1001001 },
      apkUrl: 'https://app.example.com/downloads/android/njs-live-studio-1001001-test.apk',
    });
  });

  it('does not call an older or equal release an available update', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => manifest } as Response);
    expect((await checkForUpdate('https://app.example.com', 1001001)).available).toBe(false);
    expect((await checkForUpdate('https://app.example.com', 1001002)).available).toBe(false);
  });

  it('does not hide a server failure as an unpublished release', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).rejects.toThrow('503');
  });

  it('distinguishes a missing feed from a malformed published manifest', async () => {
    jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).resolves.toMatchObject({ available: false, manifest: null });
    jest.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...manifest, appId: 'com.other.app' }) } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).rejects.toThrow('manifest');
  });

  it('provides a useful error when Firebase returns the SPA HTML fallback', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).rejects.toThrow('published');
  });

  it('checks the testing feed explicitly and builds the testing APK URL', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...manifest, channel: 'testing', signing: 'development' }) } as Response);
    const result = await checkForUpdate('https://app.example.com', 1001000, { channel: 'testing' });
    expect(jest.mocked(fetch).mock.calls[0][0]).toMatch(/^https:\/\/app.example.com\/downloads\/android\/testing\/latest.json\?check=\d+$/);
    expect(result.apkUrl).toBe('https://app.example.com/downloads/android/testing/njs-live-studio-1001001-test.apk');
  });

  it('does not offer a development build to a production channel client', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...manifest, channel: 'testing', signing: 'development' }) } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000)).rejects.toThrow('wrong release channel');
  });

  it('rejects updates for an incompatible Android version or signing certificate', async () => {
    jest.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...manifest, minSdk: 30, signerSha256: 'b'.repeat(64) }) } as Response);
    await expect(checkForUpdate('https://app.example.com', 1001000, { sdk: 29 })).rejects.toThrow('requires Android');
    await expect(checkForUpdate('https://app.example.com', 1001000, { signerSha256: 'c'.repeat(64) })).rejects.toThrow('signing certificate');
    await expect(checkForUpdate('https://app.example.com', 1001000, { sdk: 34, signerSha256: 'B'.repeat(64) })).resolves.toMatchObject({ available: true });
  });

  it('reports an offline phone instead of a missing release', async () => {
    jest.mocked(fetch).mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkForUpdate('https://app.example.com', 1001000)).rejects.toThrow('internet connection');
  });

  it('aborts an unresponsive update request', async () => {
    jest.useFakeTimers();
    jest.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    const pending = checkForUpdate('https://app.example.com', 1001000, { timeoutMs: 200 });
    const advance = jest.advanceTimersByTimeAsync(200);
    await expect(pending).rejects.toThrow('timed out');
    await advance;
  });
});