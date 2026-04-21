// ============================================================================
// OBS INTEGRATION PLUGIN
// Bridges broadcast mode state to OBS scene switching with resilient connection
// ============================================================================

import type { BroadcastMode } from './realtimeSync';
import { obsService } from './obsService';

export interface OBSPluginConnectConfig {
  host: string;
  port: number;
  password?: string;
}

export interface OBSSceneMap {
  auction: string;
  break: string;
  ad: string;
  standings: string;
}

const DEFAULT_SCENE_MAP: OBSSceneMap = {
  auction: 'Auction',
  break: 'Break',
  ad: 'Sponsor',
  standings: 'Standings',
};

class OBSIntegrationPlugin {
  private sceneMap: OBSSceneMap = { ...DEFAULT_SCENE_MAP };
  private autoModeSync = true;

  async connect(config: OBSPluginConnectConfig): Promise<boolean> {
    return obsService.connect(config.host, config.port, config.password);
  }

  disconnect(): void {
    obsService.disconnect();
  }

  isConnected(): boolean {
    return obsService.isConnected();
  }

  getScenes(): string[] {
    return obsService.getScenes();
  }

  getCurrentScene(): string | undefined {
    return obsService.getCurrentScene();
  }

  async refreshScenes(): Promise<string[]> {
    // GetSceneList will refresh internal scene list in obsService
    await obsService.request('GetSceneList');
    return obsService.getScenes();
  }

  setAutoModeSync(enabled: boolean): void {
    this.autoModeSync = enabled;
  }

  getAutoModeSync(): boolean {
    return this.autoModeSync;
  }

  updateSceneMap(next: Partial<OBSSceneMap>): OBSSceneMap {
    this.sceneMap = { ...this.sceneMap, ...next };
    return this.sceneMap;
  }

  getSceneMap(): OBSSceneMap {
    return { ...this.sceneMap };
  }

  async setScene(sceneName: string): Promise<boolean> {
    if (!sceneName?.trim()) return false;
    return obsService.setScene(sceneName.trim());
  }

  async syncModeToScene(mode: BroadcastMode): Promise<boolean> {
    if (!this.autoModeSync || !this.isConnected()) return false;
    const targetScene = this.sceneMap[mode];
    if (!targetScene) return false;
    return this.setScene(targetScene);
  }

  async startStreaming(): Promise<boolean> {
    return obsService.startStreaming();
  }

  async stopStreaming(): Promise<boolean> {
    return obsService.stopStreaming();
  }

  onConnectionChange(callback: (state: 'disconnected' | 'connecting' | 'connected' | 'error') => void): () => void {
    return obsService.onConnectionChange(callback);
  }
}

export const obsIntegrationPlugin = new OBSIntegrationPlugin();
