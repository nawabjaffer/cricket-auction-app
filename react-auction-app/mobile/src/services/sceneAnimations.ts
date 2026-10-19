import { get, ref, runTransaction, set } from 'firebase/database';
import { SCENE_ANIMATION_PRESETS, sceneMatchPath } from '../shared/scenes';
import { studioMatchSetupPath } from '../shared/studioProfile';
import { useSettings } from '../store/settingsStore';
import { getDb } from './firebase';
import { effectiveMatchId, UserFacingError } from './streamController';
import { log } from './logger';

const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function triggerSceneAnimation(id: string, side: 'A' | 'B' = 'A'): Promise<void> {
  const pairing = useSettings.getState().pairing;
  const matchId = effectiveMatchId();
  const preset = SCENE_ANIMATION_PRESETS.find(item => item.id === id);
  if (!pairing || !matchId) throw new UserFacingError('Pair a tournament and select a match first.');
  if (!preset || preset.game !== pairing.game) throw new UserFacingError('This animation belongs to another sport.');
  const db = getDb();
  const node = ref(db, sceneMatchPath(pairing.tenantId, pairing.game, matchId, 'overlay'));
  const [setupSnapshot, liveSnapshot] = await Promise.all([
    get(ref(db, studioMatchSetupPath(pairing.tenantId, pairing.game, matchId))),
    get(ref(db, sceneMatchPath(pairing.tenantId, pairing.game, matchId, 'live'))),
  ]);
  const setup = setupSnapshot.val() ?? {};
  const live = liveSnapshot.val() ?? {};
  const team = (side === 'A' ? setup.teamA : setup.teamB) ?? {};
  const now = Date.now();
  await set(node, {
    activeOverlay: preset.type,
    lastUpdated: now,
    activeEvent: {
      id: `scene_${now}`, type: preset.type, side, teamId: team.id ?? side, teamName: team.name ?? `Side ${side}`,
      description: `${preset.label} - ${team.name ?? `Side ${side}`}`, at: now,
      game: live.currentGame ?? 0, board: live.board?.number ?? 0,
      period: live.period ?? 1, clockSeconds: live.clockSeconds ?? 0,
    },
  });
  const key = node.toString();
  const previous = clearTimers.get(key);
  if (previous) clearTimeout(previous);
  clearTimers.set(key, setTimeout(() => {
    clearTimers.delete(key);
    void runTransaction(node, current => current?.lastUpdated === now
      ? { activeOverlay: 'none', lastUpdated: Date.now() }
      : undefined).catch(error => log.warn('animation', error));
  }, 6000));
}