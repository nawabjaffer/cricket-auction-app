import { ref, runTransaction, set, type Database } from 'firebase/database';
import type { OBSReplayConfig } from '../types/scoring';
import { obsReplaySourceService } from './scoring/obsReplaySourceService';
import { obsService } from './obsService';

export interface OBSConnectionBridgePresence {
  ownerId: string;
  ownerType?: 'admin' | 'dock';
  connected: boolean;
  lastSeen: number;
  host: string;
  port: number;
}

const HEARTBEAT_MS = 5_000;
const BRIDGE_TTL_MS = 18_000;

class OBSConnectionBridgeService {
  private db: Database | null = null;
  private path = '';
  private ownerId = `obs_owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  private ownerType: 'admin' | 'dock' = 'admin';
  private replayConfig: OBSReplayConfig = { buttons: [] };
  private connectionUnsubscribe: (() => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  start(db: Database, scoringBasePath: string, replayConfig: OBSReplayConfig, ownerType: 'admin' | 'dock' = 'admin'): void {
    this.db = db;
    this.path = `${scoringBasePath}/obsConnectionBridge`;
    this.replayConfig = replayConfig;
    this.ownerType = ownerType;
    obsReplaySourceService.initialize(db, scoringBasePath);
    if (this.connectionUnsubscribe) {
      if (obsService.isConnected() && this.ownerType === 'admin') obsReplaySourceService.watchRelayCommands(null, this.replayConfig);
      return;
    }
    this.connectionUnsubscribe = obsService.onConnectionChange(state => {
      if (state === 'connected') this.activate();
      else this.deactivate();
    });
  }

  updateReplayConfig(config: OBSReplayConfig): void {
    this.replayConfig = config;
    if (obsService.isConnected() && this.ownerType === 'admin') obsReplaySourceService.watchRelayCommands(null, this.replayConfig);
  }

  isAlive(presence: OBSConnectionBridgePresence | null | undefined, now = Date.now()): presence is OBSConnectionBridgePresence {
    return Boolean(presence?.connected && now - presence.lastSeen < BRIDGE_TTL_MS);
  }

  isExpired(presence: OBSConnectionBridgePresence, now = Date.now()): boolean {
    return !this.isAlive(presence, now);
  }

  isOwner(presence: OBSConnectionBridgePresence | null | undefined): boolean {
    return Boolean(presence && presence.ownerId === this.ownerId);
  }

  private activate(): void {
    if (!this.db || !this.path) return;
    if (this.ownerType === 'admin') obsReplaySourceService.watchRelayCommands(null, this.replayConfig);
    void this.publishPresence();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => { void this.publishPresence(); }, HEARTBEAT_MS);
  }

  private async publishPresence(): Promise<void> {
    if (!this.db || !this.path || !obsService.isConnected()) return;
    const config = obsService.getConfig();
    const presence: OBSConnectionBridgePresence = {
      ownerId: this.ownerId,
      ownerType: this.ownerType,
      connected: true,
      lastSeen: Date.now(),
      host: config.host,
      port: config.port,
    };
    try {
      await set(ref(this.db, this.path), presence);
    } catch (error) {
      console.warn('[OBS Bridge] Could not publish connected presence:', error);
    }
  }

  private deactivate(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    obsReplaySourceService.stopRelayWatch();
    if (!this.db || !this.path) return;
    const presenceRef = ref(this.db, this.path);
    void runTransaction(presenceRef, current => current?.ownerId === this.ownerId ? null : undefined)
      .catch(error => console.warn('[OBS Bridge] Could not clear disconnected presence:', error));
  }

  stop(): void {
    this.connectionUnsubscribe?.();
    this.connectionUnsubscribe = null;
    this.deactivate();
    this.db = null;
    this.path = '';
  }
}

export const obsConnectionBridgeService = new OBSConnectionBridgeService();
