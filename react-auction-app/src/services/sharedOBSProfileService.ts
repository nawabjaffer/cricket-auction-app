import { get, onValue, ref, set, type Database } from 'firebase/database';
import { platformPath } from './tenantPath';
import { realtimeSync } from './realtimeSync';
import type { OBSReplayConfig, OBSWebSocketConfig, SharedOBSProfile } from '../types/scoring';

class SharedOBSProfileService {
  private db: Database | null = null;

  initialize(db: Database): void { this.db = db; }

  private ensureDb(): Database {
    if (!this.db) throw new Error('Shared OBS profile service not initialized');
    return this.db;
  }

  async list(): Promise<SharedOBSProfile[]> {
    const snapshot = await get(ref(this.ensureDb(), platformPath('obsProfiles')));
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val() as Record<string, SharedOBSProfile>)
      .filter(profile => !!profile?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(profileId: string): Promise<SharedOBSProfile | null> {
    const snapshot = await get(ref(this.ensureDb(), `${platformPath('obsProfiles')}/${profileId}`));
    return snapshot.exists() ? snapshot.val() as SharedOBSProfile : null;
  }

  subscribe(callback: (profiles: SharedOBSProfile[]) => void): () => void {
    return onValue(ref(this.ensureDb(), platformPath('obsProfiles')), snapshot => {
      const value = snapshot.exists() ? snapshot.val() as Record<string, SharedOBSProfile> : {};
      callback(Object.values(value).filter(profile => !!profile?.id).sort((a, b) => b.updatedAt - a.updatedAt));
    });
  }

  async save(input: { id?: string; name: string; ownerTenantId: string; obsWebSocketConfig: OBSWebSocketConfig; obsReplayConfig: OBSReplayConfig }): Promise<SharedOBSProfile> {
    const profile: SharedOBSProfile = {
      ...input,
      id: input.id || `obs_profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: Date.now(),
    };
    await set(ref(this.ensureDb(), `${platformPath('obsProfiles')}/${profile.id}`), profile);
    return profile;
  }
}

export const sharedOBSProfileService = new SharedOBSProfileService();

export async function initializeSharedOBSProfileService(): Promise<void> {
  await realtimeSync.ensureInitialized();
  const db = realtimeSync.getDatabase();
  if (db) sharedOBSProfileService.initialize(db);
}