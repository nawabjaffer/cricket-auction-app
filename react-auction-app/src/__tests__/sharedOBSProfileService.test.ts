import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  ref: vi.fn((database: unknown, path: string) => ({ database, path })),
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  onValue: vi.fn(),
}));

vi.mock('firebase/database', () => firebase);
vi.mock('../services/tenantPath', () => ({ platformPath: (path: string) => `platform/${path}` }));
vi.mock('../services/realtimeSync', () => ({ realtimeSync: { ensureInitialized: vi.fn(), getDatabase: vi.fn() } }));

import { sharedOBSProfileService } from '../services/sharedOBSProfileService';
import type { Database } from 'firebase/database';

describe('SharedOBSProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.set.mockResolvedValue(undefined);
    sharedOBSProfileService.initialize({} as Database);
  });

  it('removes undefined optional fields before writing profiles to RTDB', async () => {
    const profile = await sharedOBSProfileService.save({
      id: 'shared-obs',
      name: 'Broadcast OBS',
      ownerTenantId: 'ppl_2026',
      obsWebSocketConfig: {
        host: '192.168.1.3',
        port: 4455,
        autoReplay: false,
        replayDelaySeconds: 0,
        replayDurationSeconds: 20,
      },
      obsReplayConfig: {
        instantReplaySourceName: undefined,
        buttons: [{
          id: 'switch',
          label: 'Switch',
          icon: 'S',
          color: '#000000',
          action: 'scene_switch',
          sceneName: undefined,
          order: 0,
          enabled: true,
        }],
      },
    });

    const writtenProfile = firebase.set.mock.calls[0][1] as Record<string, unknown>;
    const replayConfig = writtenProfile.obsReplayConfig as Record<string, unknown>;
    const [button] = replayConfig.buttons as Array<Record<string, unknown>>;
    expect(replayConfig).not.toHaveProperty('instantReplaySourceName');
    expect(button).not.toHaveProperty('sceneName');
    expect(profile.obsReplayConfig.instantReplaySourceName).toBeUndefined();
  });
});
