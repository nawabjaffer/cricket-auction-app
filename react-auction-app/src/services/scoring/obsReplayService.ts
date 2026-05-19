// ============================================================================
// OBS Replay Service — WebSocket client for OBS Studio replay buffer control
// Connects to OBS WebSocket 5.x to trigger instant replays on boundaries/wickets
// ============================================================================

import { ref, onValue, set, type Database } from 'firebase/database';
import type { OBSWebSocketConfig, ReplayTrigger } from '../../types/scoring';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface OBSMessage {
  op: number;
  d: Record<string, unknown>;
}

export class OBSReplayService {
  private db: Database | null = null;
  private basePath = '';
  private ws: WebSocket | null = null;
  private config: OBSWebSocketConfig | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusListeners: Array<(status: ConnectionStatus) => void> = [];
  private replayUnsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  initialize(db: Database, basePath: string): void {
    this.db = db;
    this.basePath = basePath;
  }

  // ── Connection Management ──

  async connect(config: OBSWebSocketConfig): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.config = config;
    this.setStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      try {
        const url = `ws://${config.host}:${config.port}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.setStatus('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: OBSMessage = JSON.parse(event.data);
            this.handleMessage(msg);
          } catch {
            // Ignore malformed messages
          }
        };

        this.ws.onerror = () => {
          this.setStatus('error');
          reject(new Error('OBS WebSocket connection error'));
        };

        this.ws.onclose = () => {
          this.setStatus('disconnected');
          // Auto-reconnect after 5 seconds
          if (this.config) {
            this.reconnectTimer = setTimeout(() => {
              if (this.config) {
                this.connect(this.config).catch(() => {});
              }
            }, 5000);
          }
        };
      } catch (err) {
        this.setStatus('error');
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.replayUnsubscribe) {
      this.replayUnsubscribe();
      this.replayUnsubscribe = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this.config = null;
    this.setStatus('disconnected');
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach(l => l(status));
  }

  private handleMessage(msg: OBSMessage): void {
    // OBS WebSocket 5.x protocol
    // op 0 = Hello, op 2 = Identified
    if (msg.op === 0 && this.config?.password) {
      // Need to authenticate — send Identify
      this.sendMessage({
        op: 1,
        d: {
          rpcVersion: 1,
          authentication: this.config.password,
        },
      });
    } else if (msg.op === 0 && !this.config?.password) {
      // No auth needed — send Identify
      this.sendMessage({
        op: 1,
        d: { rpcVersion: 1 },
      });
    }
    // op 2 = Identified → connection is fully ready
  }

  private sendMessage(msg: OBSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ── Replay Buffer Control ──

  /**
   * Send an OBS request via WebSocket 5.x protocol.
   */
  private sendRequest(requestType: string, requestData?: Record<string, unknown>): void {
    this.requestId++;
    this.sendMessage({
      op: 6, // Request
      d: {
        requestType,
        requestId: String(this.requestId),
        ...(requestData ? { requestData } : {}),
      },
    });
  }

  /**
   * Start the OBS replay buffer.
   */
  startReplayBuffer(): void {
    this.sendRequest('StartReplayBuffer');
  }

  /**
   * Stop the OBS replay buffer.
   */
  stopReplayBuffer(): void {
    this.sendRequest('StopReplayBuffer');
  }

  /**
   * Save the current replay buffer (triggers instant replay save).
   */
  saveReplayBuffer(): void {
    this.sendRequest('SaveReplayBuffer');
  }

  /**
   * Switch to a specific OBS scene.
   */
  switchScene(sceneName: string): void {
    this.sendRequest('SetCurrentProgramScene', { sceneName });
  }

  /**
   * Toggle source visibility in a scene.
   */
  toggleSource(sceneName: string, sourceName: string, visible: boolean): void {
    // First get the scene item ID, then set visibility
    // For simplicity, we use the direct approach
    this.sendRequest('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: sourceName,
      sceneItemEnabled: visible,
    });
  }

  // ── Firebase Replay Trigger Listener ──

  /**
   * Watch for replay triggers in Firebase and auto-trigger OBS replay.
   */
  watchReplayTriggers(matchId: string): void {
    if (!this.db) return;
    if (this.replayUnsubscribe) {
      this.replayUnsubscribe();
    }

    const triggerRef = ref(this.db, `${this.basePath}/matches/${matchId}/replayTrigger`);
    const unsub = onValue(triggerRef, (snap) => {
      if (!snap.exists()) return;
      const trigger = snap.val() as ReplayTrigger;
      if (trigger.consumed) return;

      // Mark as consumed immediately
      set(ref(this.db!, `${this.basePath}/matches/${matchId}/replayTrigger/consumed`), true);

      // If auto-replay is enabled, trigger after delay
      if (this.config?.autoReplay && this.status === 'connected') {
        const delay = (trigger.delaySeconds || this.config.replayDelaySeconds || 3) * 1000;
        setTimeout(() => {
          this.saveReplayBuffer();
        }, delay);
      }
    });

    this.replayUnsubscribe = unsub;
  }

  /**
   * Manually trigger a replay (called from OBS control dock).
   */
  triggerManualReplay(): void {
    if (this.status === 'connected') {
      this.saveReplayBuffer();
    }
  }

  /**
   * Write a replay trigger to Firebase (called from scorer when auto-replay is off).
   */
  async writeReplayTrigger(matchId: string, type: 'four' | 'six' | 'wicket'): Promise<void> {
    if (!this.db) return;
    const trigger: ReplayTrigger = {
      id: `replay_${Date.now()}`,
      matchId,
      type,
      timestamp: Date.now(),
      delaySeconds: this.config?.replayDelaySeconds || 3,
      consumed: false,
    };
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/replayTrigger`), trigger);
  }
}

// Singleton export
export const obsReplayService = new OBSReplayService();
