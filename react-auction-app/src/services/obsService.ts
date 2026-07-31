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

    this.config.host = host;
    this.config.port = port;
    this.config.password = password;
    // Reset reconnect counter for a fresh manual connect
    this.reconnectAttempts = 0;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        resolve(success);
      };

      // 10-second connection timeout
      const timeoutId = setTimeout(() => {
        console.warn('[OBS] Connection timed out');
        this.notifyConnectionState('error');
        this.ws?.close();
        settle(false);
      }, 10_000);

      try {
        this.notifyConnectionState('connecting');
        const wsUrl = `ws://${host}:${port}`;
        console.log('[OBS] Connecting to:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[OBS] WebSocket connected');
          // OBS WebSocket 5.x identification will be handled in onmessage
        };

        this.ws.onmessage = async (event) => {
          try {
            const message: OBSMessage = JSON.parse(event.data);
            // On successful identification, clear timeout and settle
            await this.handleMessage(message, (success) => {
              clearTimeout(timeoutId);
              settle(success);
            });
          } catch (error) {
            console.error('[OBS] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[OBS] WebSocket error:', error);
          clearTimeout(timeoutId);
          this.notifyConnectionState('error');
          settle(false);
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          this.stopHeartbeat();
          console.log('[OBS] WebSocket closed', event.code, event.reason);
          settle(false);
          this.notifyConnectionState('disconnected');
          this.ws = null;
          // Auto-reconnect whenever enabled (manual disconnect sets enabled=false to stop)
          if (this.config.enabled) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('[OBS] Connection failed:', error);
        this.notifyConnectionState('error');
        settle(false);
      }
    });
  }

  /**
   * Handle incoming OBS WebSocket messages
   */
  private async handleMessage(message: OBSMessage, connectResolve?: (success: boolean) => void): Promise<void> {
    const { op, d } = message;

    switch (op) {
      case 0: // Hello
        console.log('[OBS] Received Hello, sending Identify');
        await this.identify(d as { authentication?: { challenge: string; salt: string } });
        break;

      case 2: // Identified
        console.log('[OBS] Successfully identified');
        this.notifyConnectionState('connected');
        this.reconnectAttempts = 0;
        this.config.enabled = true;
        await this.loadScenes();
        this.startHeartbeat();
        connectResolve?.(true);
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
  private async identify(hello: { authentication?: { challenge: string; salt: string } }): Promise<void> {
    const identifyData: Record<string, unknown> = {
      rpcVersion: 1,
    };

    // Handle authentication if required
    if (hello.authentication && this.config.password) {
      const { challenge, salt } = hello.authentication;
      const authResponse = await this.generateAuthResponse(this.config.password, salt, challenge);
      identifyData.authentication = authResponse;
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
}

export const obsService = new OBSService();
