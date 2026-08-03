// ============================================================================
// OBS SERVICE - V3 OBS WebSocket Integration
// Handles OBS Studio connection for live streaming control
// ============================================================================

import type { OBSConfig, OBSConnectionState } from '../types/streaming';
import { DEFAULT_OBS_CONFIG } from '../types/streaming';

// OBS WebSocket message types
interface OBSMessage {
  op: number;
  d: Record<string, unknown>;
}

interface OBSConnectionDiagnostics {
  attemptedUrls: string[];
  lastSuccessfulUrl: string;
  failures: string[];
  lastErrorDetail: string;
  mixedContentLikely: boolean;
}

type OBSEventCallback = (event: string, data: unknown) => void;
type ConnectionCallback = (state: OBSConnectionState) => void;

class OBSService {
  private config: OBSConfig = { ...DEFAULT_OBS_CONFIG };
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests: Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }> = new Map();
  private eventListeners: Set<OBSEventCallback> = new Set();
  private connectionListeners: Set<ConnectionCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  // Keepalive heartbeat — OBS closes idle WS connections after ~60 s
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastErrorDetail = '';
  private attemptedUrls: string[] = [];
  private attemptFailures: string[] = [];
  private lastSuccessfulUrl = '';

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionListeners.add(callback);
    callback(this.config.connectionState);
    return () => this.connectionListeners.delete(callback);
  }

  /**
   * Subscribe to OBS events
   */
  onEvent(callback: OBSEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private notifyConnectionState(state: OBSConnectionState) {
    this.config.connectionState = state;
    this.connectionListeners.forEach(cb => cb(state));
  }

  private emitEvent(event: string, data: unknown) {
    this.eventListeners.forEach(cb => cb(event, data));
  }

  private sendMessageOnSocket(socket: WebSocket, op: number, data: Record<string, unknown>): void {
    if (socket.readyState !== WebSocket.OPEN) {
      console.warn('[OBS] Cannot send message - socket not open');
      return;
    }

    const message: OBSMessage = { op, d: data };
    socket.send(JSON.stringify(message));
  }

  private normalizeTarget(hostInput: string, fallbackPort: number): {
    host: string;
    port: number;
    explicitScheme?: 'ws' | 'wss';
  } {
    const trimmed = hostInput.trim();
    if (!trimmed) return { host: '', port: fallbackPort };

    const hasScheme = /^(wss?|https?):\/\//i.test(trimmed);
    const parseTarget = hasScheme ? trimmed : `ws://${trimmed}`;

    try {
      const parsed = new URL(parseTarget);
      const host = parsed.hostname.trim();
      const port = parsed.port ? Number(parsed.port) : fallbackPort;
      const rawScheme = parsed.protocol.replace(':', '').toLowerCase();
      let explicitScheme: 'ws' | 'wss' | undefined;
      if (hasScheme) {
        if (rawScheme === 'ws' || rawScheme === 'wss') {
          explicitScheme = rawScheme;
        } else if (rawScheme === 'http' || rawScheme === 'https') {
          explicitScheme = rawScheme === 'https' ? 'wss' : 'ws';
        }
      }

      return {
        host,
        port: Number.isFinite(port) && port > 0 ? port : fallbackPort,
        explicitScheme,
      };
    } catch {
      return { host: trimmed, port: fallbackPort };
    }
  }

  private buildCandidateUrls(host: string, port: number, explicitScheme?: 'ws' | 'wss'): string[] {
    const normalizedHost = host.trim();
    if (!normalizedHost) return [];

    if (explicitScheme) {
      return [`${explicitScheme}://${normalizedHost}:${port}`];
    }

    const prefersSecure = globalThis.location?.protocol === 'https:';
    const schemeOrder = prefersSecure ? ['wss', 'ws'] : ['ws', 'wss'];
    return schemeOrder.map((scheme) => `${scheme}://${normalizedHost}:${port}`);
  }

  private isLikelyLanHost(host: string): boolean {
    const value = host.trim().toLowerCase();
    if (!value) return false;
    if (value === 'localhost' || value === '127.0.0.1' || value === '::1') return true;
    if (/^192\.168\./.test(value)) return true;
    if (/^10\./.test(value)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
    if (/^[\w-]+\.local$/.test(value)) return true;
    return false;
  }

  private async tryConnectUrl(wsUrl: string, password?: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = new WebSocket(wsUrl);
      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        resolve(success);
      };

      const timeoutId = setTimeout(() => {
        this.lastErrorDetail = `Connection timeout for ${wsUrl}`;
        this.notifyConnectionState('error');
        socket.close();
        settle(false);
      }, 10_000);

      try {
        this.notifyConnectionState('connecting');

        socket.onopen = () => {
          console.log('[OBS] WebSocket connected:', wsUrl);
        };

        socket.onmessage = async (event) => {
          try {
            const message: OBSMessage = JSON.parse(event.data);
            await this.handleMessage(message, (success) => {
              clearTimeout(timeoutId);
              if (success) {
                this.lastErrorDetail = '';
                this.config.password = password;
                this.ws = socket;
              }
              settle(success);
            }, socket);
          } catch (error) {
            this.lastErrorDetail = `Invalid OBS message from ${wsUrl}: ${String(error)}`;
            this.notifyConnectionState('error');
            clearTimeout(timeoutId);
            settle(false);
          }
        };

        socket.onerror = () => {
          clearTimeout(timeoutId);
          this.lastErrorDetail = `WebSocket error for ${wsUrl}`;
          this.notifyConnectionState('error');
          settle(false);
        };

        socket.onclose = (event) => {
          clearTimeout(timeoutId);
          console.log('[OBS] WebSocket closed', event.code, event.reason, wsUrl);
          this.lastErrorDetail = event.reason
            ? `OBS closed (${event.code}) for ${wsUrl}: ${event.reason}`
            : `OBS closed (${event.code}) for ${wsUrl}`;
          settle(false);
          if (this.ws === socket) {
            this.stopHeartbeat();
            this.notifyConnectionState('disconnected');
            this.ws = null;
            if (this.config.enabled) {
              this.attemptReconnect();
            }
          }
        };
      } catch (error) {
        clearTimeout(timeoutId);
        const detail = String(error);
        this.lastErrorDetail = `Failed creating WebSocket ${wsUrl}: ${detail}`;
        if (detail.toLowerCase().includes('securityerror') || detail.toLowerCase().includes('mixed content')) {
          this.lastErrorDetail += ' (Browser blocked insecure ws:// from a secure https page)';
        }
        this.notifyConnectionState('error');
        settle(false);
      }
    });
  }

  /**
   * Connect to OBS WebSocket
   */
  async connect(host: string = 'localhost', port: number = 4455, password?: string): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[OBS] Already connected');
      return true;
    }

    // Cancel any pending auto-reconnect before a manual connect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    const normalized = this.normalizeTarget(host, port);
    if (!normalized.host) {
      this.lastErrorDetail = 'Invalid OBS host';
      this.notifyConnectionState('error');
      return false;
    }

    this.config.host = normalized.host;
    this.config.port = normalized.port;
    this.config.password = password;
    this.attemptedUrls = [];
    this.attemptFailures = [];
    this.lastSuccessfulUrl = '';
    this.lastErrorDetail = '';
    // Reset reconnect counter for a fresh manual connect
    this.reconnectAttempts = 0;

    const urls = this.buildCandidateUrls(normalized.host, normalized.port, normalized.explicitScheme);
    if (urls.length === 0) {
      this.lastErrorDetail = 'Invalid OBS host';
      this.notifyConnectionState('error');
      return false;
    }

    for (const url of urls) {
      this.attemptedUrls.push(url);
      console.log('[OBS] Connecting to:', url);
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.tryConnectUrl(url, password);
      if (ok) {
        this.lastSuccessfulUrl = url;
        return true;
      }
      if (this.lastErrorDetail) {
        this.attemptFailures.push(this.lastErrorDetail);
      }
    }

    if (globalThis.location?.protocol === 'https:' && this.isLikelyLanHost(normalized.host) && urls.some((url) => url.startsWith('ws://'))) {
      this.lastErrorDetail = `${this.lastErrorDetail || 'Direct OBS socket failed'}. HTTPS page may block ws:// LAN connections on iPhone/Safari. Use OBS relay mode or host the dock over http:// on local network.`;
    }

    this.notifyConnectionState('error');
    return false;
  }

  /**
   * Handle incoming OBS WebSocket messages
   */
  private async handleMessage(message: OBSMessage, connectResolve?: (success: boolean) => void, socket?: WebSocket): Promise<void> {
    const { op, d } = message;

    switch (op) {
      case 0: // Hello
        console.log('[OBS] Received Hello, sending Identify');
        await this.identify(d as { authentication?: { challenge: string; salt: string } }, socket);
        break;

      case 2: // Identified
        console.log('[OBS] Successfully identified');
        if (socket) {
          this.ws = socket;
        }
        this.notifyConnectionState('connected');
        this.reconnectAttempts = 0;
        this.config.enabled = true;
        // Connection is valid as soon as OBS acknowledges Identify.
        connectResolve?.(true);
        this.startHeartbeat();
        void this.loadScenes();
        break;

      case 5: // Event
        this.handleEvent(d as { eventType: string; eventData: unknown });
        break;

      case 7: // RequestResponse
        this.handleRequestResponse(d as { requestId: string; requestStatus: { result: boolean }; responseData: unknown });
        break;

      default:
        console.log('[OBS] Unknown message op:', op);
    }
  }

  /**
   * Send identification to OBS
   */
  private async identify(hello: { authentication?: { challenge: string; salt: string } }, socket?: WebSocket): Promise<void> {
    const identifyData: Record<string, unknown> = {
      rpcVersion: 1,
    };

    // Handle authentication if required
    if (hello.authentication && this.config.password) {
      const { challenge, salt } = hello.authentication;
      const authResponse = await this.generateAuthResponse(this.config.password, salt, challenge);
      identifyData.authentication = authResponse;
    }

    if (socket) {
      this.sendMessageOnSocket(socket, 1, identifyData);
      return;
    }

    this.sendMessage(1, identifyData); // op 1 = Identify
  }

  /**
   * Generate authentication response (SHA256)
   */
  private async generateAuthResponse(password: string, salt: string, challenge: string): Promise<string> {
    const encoder = new TextEncoder();
    
    // Step 1: SHA256(password + salt) -> base64
    const secretHash = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
    const secretBase64 = btoa(String.fromCharCode(...new Uint8Array(secretHash)));
    
    // Step 2: SHA256(secretBase64 + challenge) -> base64
    const authHash = await crypto.subtle.digest('SHA-256', encoder.encode(secretBase64 + challenge));
    return btoa(String.fromCharCode(...new Uint8Array(authHash)));
  }

  /**
   * Send a message to OBS
   */
  private sendMessage(op: number, data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[OBS] Cannot send message - not connected');
      return;
    }

    const message: OBSMessage = { op, d: data };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send a request to OBS and wait for response
   */
  async request<T = unknown>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to OBS'));
        return;
      }

      const requestId = `req-${++this.messageId}`;
      this.pendingRequests.set(requestId, { 
        resolve: resolve as (data: unknown) => void, 
        reject 
      });

      this.sendMessage(6, { // op 6 = Request
        requestType,
        requestId,
        requestData,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout: ${requestType}`));
        }
      }, 10000);
    });
  }

  /**
   * Handle request response
   */
  private handleRequestResponse(response: { requestId: string; requestStatus: { result: boolean }; responseData: unknown }): void {
    const { requestId, requestStatus, responseData } = response;
    const pending = this.pendingRequests.get(requestId);
    
    if (pending) {
      this.pendingRequests.delete(requestId);
      if (requestStatus.result) {
        pending.resolve(responseData);
      } else {
        pending.reject(new Error('Request failed'));
      }
    }
  }

  /**
   * Handle OBS events
   */
  private handleEvent(event: { eventType: string; eventData: unknown }): void {
    const { eventType, eventData } = event;
    console.log('[OBS] Event:', eventType, eventData);
    
    this.emitEvent(eventType, eventData);

    // Handle specific events
    switch (eventType) {
      case 'CurrentProgramSceneChanged':
        this.config.currentScene = (eventData as { sceneName: string }).sceneName;
        break;
      case 'StreamStateChanged':
        this.emitEvent('streamStateChanged', eventData);
        break;
    }
  }

  /**
   * Load available scenes
   */
  private async loadScenes(): Promise<void> {
    try {
      const response = await this.request<{ scenes: { sceneName: string }[]; currentProgramSceneName: string }>('GetSceneList');
      this.config.scenes = response.scenes.map(s => s.sceneName);
      this.config.currentScene = response.currentProgramSceneName;
      console.log('[OBS] Loaded scenes:', this.config.scenes);
    } catch (error) {
      console.error('[OBS] Failed to load scenes:', error);
    }
  }

  /** Keep-alive: ping OBS every 20 s so the WS is never idle long enough to drop */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage(6, { requestType: 'GetStats', requestId: 'hb', requestData: {} });
      }
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /** Auto-reconnect with exponential backoff, no maximum attempt cap */
  private attemptReconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.6, this.reconnectAttempts - 1), 30_000);
    console.log(`[OBS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.config.host, this.config.port, this.config.password);
    }, delay);
  }

  /**
   * Disconnect from OBS
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this.config.enabled = false;
    this.reconnectAttempts = 0;
    this.notifyConnectionState('disconnected');
    console.log('[OBS] Disconnected');
  }

  // ── Hotkey API (OBS WebSocket 5.x) ──

  /** Returns all hotkey names registered in OBS (includes plugin hotkeys like Replay Source) */
  async getHotkeyList(): Promise<string[]> {
    try {
      const res = await this.request<{ hotkeys: string[] }>('GetHotkeyList');
      return res.hotkeys ?? [];
    } catch {
      return [];
    }
  }

  /** Triggers an OBS hotkey by its registered name (e.g. from Replay Source plugin) */
  async triggerHotkeyByName(hotkeyName: string): Promise<boolean> {
    try {
      await this.request('TriggerHotkeyByName', { hotkeyName });
      return true;
    } catch (err) {
      console.error('[OBS] triggerHotkeyByName failed:', err);
      return false;
    }
  }

  /** Triggers an OBS hotkey by simulating a key-sequence press */
  async triggerHotkeyByKeySequence(
    keyId: string,
    shift = false, ctrl = false, alt = false, command = false,
  ): Promise<boolean> {
    try {
      await this.request('TriggerHotkeyByKeySequence', {
        keyId,
        keyModifiers: { shift, control: ctrl, alt, command },
      });
      return true;
    } catch (err) {
      console.error('[OBS] triggerHotkeyByKeySequence failed:', err);
      return false;
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): OBSConnectionState {
    return this.config.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.config.connectionState === 'connected';
  }

  /**
   * Get available scenes
   */
  getScenes(): string[] {
    return this.config.scenes || [];
  }

  /**
   * Get current scene
   */
  getCurrentScene(): string | undefined {
    return this.config.currentScene;
  }

  /**
   * Set current scene
   */
  async setScene(sceneName: string): Promise<boolean> {
    try {
      await this.request('SetCurrentProgramScene', { sceneName });
      this.config.currentScene = sceneName;
      return true;
    } catch (error) {
      console.error('[OBS] Failed to set scene:', error);
      return false;
    }
  }

  /**
   * Start streaming
   */
  async startStreaming(): Promise<boolean> {
    try {
      await this.request('StartStream');
      return true;
    } catch (error) {
      console.error('[OBS] Failed to start streaming:', error);
      return false;
    }
  }

  /**
   * Stop streaming
   */
  async stopStreaming(): Promise<boolean> {
    try {
      await this.request('StopStream');
      return true;
    } catch (error) {
      console.error('[OBS] Failed to stop streaming:', error);
      return false;
    }
  }

  /**
   * Start recording
   */
  async startRecording(): Promise<boolean> {
    try {
      await this.request('StartRecord');
      return true;
    } catch (error) {
      console.error('[OBS] Failed to start recording:', error);
      return false;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<boolean> {
    try {
      await this.request('StopRecord');
      return true;
    } catch (error) {
      console.error('[OBS] Failed to stop recording:', error);
      return false;
    }
  }

  /**
   * Get streaming status
   */
  async getStreamingStatus(): Promise<{ outputActive: boolean; outputDuration: number } | null> {
    try {
      return await this.request('GetStreamStatus');
    } catch (error) {
      console.error('[OBS] Failed to get streaming status:', error);
      return null;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): OBSConfig {
    return { ...this.config };
  }

  getLastErrorDetail(): string {
    return this.lastErrorDetail;
  }

  getConnectionDiagnostics(): OBSConnectionDiagnostics {
    const mixedContentLikely = globalThis.location?.protocol === 'https:'
      && this.attemptedUrls.some((url) => url.startsWith('ws://'));

    return {
      attemptedUrls: [...this.attemptedUrls],
      lastSuccessfulUrl: this.lastSuccessfulUrl,
      failures: [...this.attemptFailures],
      lastErrorDetail: this.lastErrorDetail,
      mixedContentLikely,
    };
  }
}

export const obsService = new OBSService();
