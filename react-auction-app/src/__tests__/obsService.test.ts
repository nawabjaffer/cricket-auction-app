import { afterEach, describe, expect, it, vi } from 'vitest';

import { obsService } from '../services/obsService';

describe('OBSService connection diagnostics', () => {
  afterEach(() => {
    obsService.disconnect();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires OBS and a configured YouTube destination before scheduling', async () => {
    vi.spyOn(obsService, 'isConnected').mockReturnValue(false);
    const request = vi.spyOn(obsService, 'request');
    await expect(obsService.assertYouTubeBroadcastReady()).rejects.toThrow('Connect this app to OBS');
    expect(request).not.toHaveBeenCalled();
    vi.mocked(obsService.isConnected).mockReturnValue(true);
    request.mockResolvedValue({ streamServiceSettings: { service: 'Twitch', key: 'private-key' } });
    await expect(obsService.assertYouTubeBroadcastReady()).rejects.toThrow('Select a YouTube');
    request.mockResolvedValue({ streamServiceSettings: { service: 'YouTube - RTMPS', key: 'private-key' } });
    await expect(obsService.assertYouTubeBroadcastReady()).resolves.toBeUndefined();
    request.mockResolvedValue({ streamServiceSettings: { service: 'YouTube - RTMPS' } });
    vi.spyOn(obsService, 'getStreamingStatus').mockResolvedValue({ outputActive: false, outputDuration: 0 });
    await expect(obsService.assertYouTubeBroadcastReady()).rejects.toThrow('stream key');
  });

  it('captures constructor security errors for every attempted endpoint', async () => {
    class BlockedWebSocket {
      static OPEN = 1;
      constructor(url: string) {
        throw new DOMException(`Blocked ${url}`, 'SecurityError');
      }
    }
    vi.stubGlobal('WebSocket', BlockedWebSocket);

    const connected = await obsService.connect('192.168.1.40', 4455, 'not-logged');
    const diagnostics = obsService.getConnectionDiagnostics();

    expect(connected).toBe(false);
    expect(diagnostics.attemptedUrls).toEqual(['ws://192.168.1.40:4455']);
    expect(diagnostics.lastErrorDetail).toContain('SecurityError');
    expect(diagnostics.logs.some(entry => entry.message.includes('Trying ws://192.168.1.40:4455'))).toBe(true);
    expect(diagnostics.logs.some(entry => entry.level === 'error' && entry.message.includes('Failed creating WebSocket'))).toBe(true);
    expect(JSON.stringify(diagnostics.logs)).not.toContain('not-logged');
  });

  it('resets connection logs when the endpoint is changed and retried', async () => {
    class BlockedWebSocket {
      static OPEN = 1;
      constructor(url: string) {
        throw new Error(`unreachable: ${url}`);
      }
    }
    vi.stubGlobal('WebSocket', BlockedWebSocket);
    await obsService.connect('192.168.1.40', 4455);
    await obsService.connect('192.168.1.41', 4456);

    const diagnostics = obsService.getConnectionDiagnostics();
    expect(diagnostics.attemptedUrls).toEqual(['ws://192.168.1.41:4456']);
    expect(diagnostics.logs.some(entry => entry.message.includes('192.168.1.40'))).toBe(false);
    expect(diagnostics.logs.some(entry => entry.message.includes('192.168.1.41'))).toBe(true);
  });

  it('reconnects to a new OBS host instead of reusing the old open socket', async () => {
    const sockets: Array<{ url: string; readyState: number; onclose: ((event: CloseEvent) => void) | null }> = [];
    class ConnectedWebSocket {
      static OPEN = 1;
      readyState = 1;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      url: string;
      constructor(url: string) {
        this.url = url;
        sockets.push(this);
        queueMicrotask(() => this.emit(0, { rpcVersion: 1 }));
      }
      send(raw: string) {
        const message = JSON.parse(raw) as { op: number; d: { requestType?: string; requestId?: string } };
        if (message.op === 1) queueMicrotask(() => this.emit(2, {}));
        if (message.op === 6) {
          const responseData = message.d.requestType === 'GetSceneList' ? { scenes: [], currentProgramSceneName: 'Scene' } : {};
          queueMicrotask(() => this.emit(7, { requestId: message.d.requestId, requestStatus: { result: true }, responseData }));
        }
      }
      close() {
        this.readyState = 3;
        this.onclose?.({ code: 1000, reason: '' } as CloseEvent);
      }
      private emit(op: number, data: unknown) {
        this.onmessage?.({ data: JSON.stringify({ op, d: data }) } as MessageEvent);
      }
    }
    vi.stubGlobal('WebSocket', ConnectedWebSocket);

    expect(await obsService.connect('192.168.1.40', 4455, 'first')).toBe(true);
    expect(await obsService.connect('192.168.1.41', 4455, 'second')).toBe(true);

    expect(sockets).toHaveLength(2);
    expect(sockets[0].readyState).toBe(3);
    expect(sockets[1].url).toBe('ws://192.168.1.41:4455');
    obsService.disconnect();
  });

  it('only attempts WSS when the host explicitly names a secure endpoint', async () => {
    class BlockedWebSocket {
      static OPEN = 1;
      constructor(url: string) {
        throw new Error(`unreachable: ${url}`);
      }
    }
    vi.stubGlobal('WebSocket', BlockedWebSocket);

    await obsService.connect('wss://obs.example.com', 443);

    expect(obsService.getConnectionDiagnostics().attemptedUrls).toEqual(['wss://obs.example.com:443']);
  });

  it('connects to OBS plain WS on loopback from an HTTPS page', async () => {
    vi.stubGlobal('location', { protocol: 'https:' });
    const attemptedUrls: string[] = [];
    class LocalOBSWebSocket {
      static OPEN = 1;
      readyState = 1;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string) {
        attemptedUrls.push(url);
        queueMicrotask(() => this.emit(0, { rpcVersion: 1 }));
      }

      send(raw: string) {
        const message = JSON.parse(raw) as { op: number; d: { requestType?: string; requestId?: string } };
        if (message.op === 1) queueMicrotask(() => this.emit(2, {}));
        if (message.op === 6) {
          const responseData = message.d.requestType === 'GetSceneList' ? { scenes: [], currentProgramSceneName: 'Scene' } : {};
          queueMicrotask(() => this.emit(7, { requestId: message.d.requestId, requestStatus: { result: true }, responseData }));
        }
      }

      close() {
        this.readyState = 3;
        this.onclose?.({ code: 1000, reason: '' } as CloseEvent);
      }

      private emit(op: number, data: unknown) {
        this.onmessage?.({ data: JSON.stringify({ op, d: data }) } as MessageEvent);
      }
    }
    vi.stubGlobal('WebSocket', LocalOBSWebSocket);

    expect(await obsService.connect('127.0.0.1', 4455)).toBe(true);
    expect(attemptedUrls).toEqual(['ws://127.0.0.1:4455']);
    expect(obsService.getConnectionDiagnostics().lastSuccessfulUrl).toBe('ws://127.0.0.1:4455');
  });

  it('tries WSS before plain WS for HTTPS LAN hosts', async () => {
    vi.stubGlobal('location', { protocol: 'https:' });
    class BlockedWebSocket {
      static OPEN = 1;
      constructor(url: string) {
        throw new Error(`unreachable: ${url}`);
      }
    }
    vi.stubGlobal('WebSocket', BlockedWebSocket);

    await obsService.connect('192.168.1.40', 4455);

    expect(obsService.getConnectionDiagnostics().attemptedUrls).toEqual([
      'wss://192.168.1.40:4455',
      'ws://192.168.1.40:4455',
    ]);
  });

  it('explains an unreachable plain OBS endpoint and records its abnormal close', async () => {
    class UnreachableWebSocket {
      static OPEN = 1;
      readyState = 0;
      onerror: (() => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      constructor() {
        queueMicrotask(() => {
          this.onerror?.();
          this.onclose?.({ code: 1006, reason: '' } as CloseEvent);
        });
      }
      close() { this.readyState = 3; }
    }
    vi.stubGlobal('WebSocket', UnreachableWebSocket);

    await obsService.connect('192.168.1.3', 4455);
    const diagnostics = obsService.getConnectionDiagnostics();

    expect(diagnostics.attemptedUrls).toEqual(['ws://192.168.1.3:4455']);
    expect(diagnostics.logs.some(entry => entry.message.includes('OBS computer LAN IP'))).toBe(true);
    expect(diagnostics.logs.some(entry => entry.message.includes('OBS closed (1006)'))).toBe(true);
  });
});
