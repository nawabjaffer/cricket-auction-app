import { get, ref, runTransaction, set, type Database } from 'firebase/database';
import type { OBSReplayConfig } from '../types/scoring';
import { obsReplaySourceService } from './scoring/obsReplaySourceService';
import { obsService } from './obsService';
import { tenantPath } from './tenantPath';
import { obsStreamingPresetService } from './obsStreamingPresetService';

export interface OBSConnectionBridgePresence {
  ownerId: string;
  ownerType?: 'admin' | 'dock';
  connected: boolean;
  lastSeen: number;
  host: string;
  port: number;
  youtubeReady?: boolean;
  youtubeError?: string;
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
    this.configureReplayRecovery();
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

  async assertBroadcastReady(db: Database): Promise<void> {
    if (obsService.isConnected()) return obsService.assertYouTubeBroadcastReady();
    const snapshot = await get(ref(db, tenantPath('scoring/obsConnectionBridge')));
    const presence = snapshot.exists() ? snapshot.val() as OBSConnectionBridgePresence : null;
    if (!this.isAlive(presence)) throw new Error('Connect the app or OBS Dock to OBS before scheduling a broadcast.');
    if (!presence.youtubeReady) throw new Error(presence.youtubeError || 'Connect your YouTube account or configure its stream key in OBS first.');
  }

  async startYouTubeBroadcast(db: Database, matchId: string): Promise<void> {
    await this.assertBroadcastReady(db);
    if (obsService.isConnected()) {
      const status = await obsService.request<{ outputActive: boolean }>('GetStreamStatus');
      if (!status.outputActive) await obsService.request('StartStream');
      return;
    }
    obsReplaySourceService.initialize(db, tenantPath('scoring'));
    const commandId = await obsReplaySourceService.sendRelayCommand(matchId, '__youtube_broadcast_start__');
    const result = await obsReplaySourceService.waitForRelayResult(matchId, commandId);
    if (!result.success) throw new Error(result.error || 'The OBS owner could not start YouTube streaming.');
  }

  private activate(): void {
    if (!this.db || !this.path) return;
    this.configureReplayRecovery();
    if (this.ownerType === 'admin') obsReplaySourceService.watchRelayCommands(null, this.replayConfig);
    void this.publishPresence();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => { void this.publishPresence(); }, HEARTBEAT_MS);
  }

  private configureReplayRecovery(): void {
    if (this.ownerType !== 'admin' || !obsService.isConnected()) return;
    obsStreamingPresetService.configureLatestReplaySource(
      this.replayConfig.instantReplaySourceNames || this.replayConfig.instantReplaySourceName,
      undefined, this.replayConfig,
    );
  }

  private async publishPresence(): Promise<void> {
    if (!this.db || !this.path || !obsService.isConnected()) return;
    const database = this.db;
    const path = this.path;
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
      try {
        await obsService.assertYouTubeBroadcastReady();
        presence.youtubeReady = true;
      } catch (error) {
        presence.youtubeReady = false;
        presence.youtubeError = error instanceof Error ? error.message : String(error);
      }
      if (!obsService.isConnected() || this.db !== database || this.path !== path) return;
      presence.lastSeen = Date.now();
      await set(ref(database, path), presence);
    } catch (error) {
      console.warn('[OBS Bridge] Could not publish connected presence:', error);
    }
  }

  private deactivate(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.ownerType === 'admin') obsStreamingPresetService.dispose();
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
