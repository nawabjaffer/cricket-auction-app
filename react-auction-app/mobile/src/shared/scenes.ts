import { isSafeStudioId, isValidRtspUrl, normalizeStudioProfile, studioSportNamespace, type StudioGameType, type StudioWidget } from './studioProfile';

export const MAX_STUDIO_SCENES = 12;

export const SCENE_ANIMATION_PRESETS: ReadonlyArray<{ id: string; game: StudioGameType; type: string; label: string }> = [
  { id: 'cricket:four', game: 'cricket', type: 'boundary_four', label: 'Four' },
  { id: 'cricket:six', game: 'cricket', type: 'boundary_six', label: 'Six' },
  { id: 'cricket:wicket', game: 'cricket', type: 'wicket', label: 'Wicket' },
  { id: 'cricket:hattrick', game: 'cricket', type: 'hat_trick', label: 'Hat trick' },
  { id: 'football:goal', game: 'football', type: 'goal', label: 'Goal' },
  { id: 'football:yellow', game: 'football', type: 'yellow_card', label: 'Yellow card' },
  { id: 'football:red', game: 'football', type: 'red_card', label: 'Red card' },
  { id: 'kabaddi:raid', game: 'kabaddi', type: 'super_raid', label: 'Super raid' },
  { id: 'kabaddi:tackle', game: 'kabaddi', type: 'super_tackle', label: 'Super tackle' },
  { id: 'kabaddi:allout', game: 'kabaddi', type: 'all_out', label: 'All out' },
  { id: 'carrom:queen', game: 'carrom', type: 'queen_covered', label: 'Queen covered' },
  { id: 'carrom:board', game: 'carrom', type: 'board_won', label: 'Board won' },
  { id: 'carrom:game', game: 'carrom', type: 'game_won', label: 'Game won' },
  { id: 'carrom:match', game: 'carrom', type: 'match_won', label: 'Match won' },
];

export function sceneMatchPath(tenantId: string, game: StudioGameType, matchId: string, node: 'overlay' | 'live'): string {
  if (!isSafeStudioId(tenantId) || !isSafeStudioId(matchId)) throw new Error('Invalid tournament or match.');
  return `tenants/${tenantId}/${studioSportNamespace(game)}/matches/${matchId}/${node}`;
}

export type SceneCamera =
  | { kind: 'local'; facing: 'back' | 'front' }
  | { kind: 'peer'; url: string; name: string; remoteId?: string };

export interface StudioScene {
  id: string;
  name: string;
  camera: SceneCamera;
  profileOverlays: boolean;
  widgets: StudioWidget[];
  animations: string[];
}

export function newSceneId(): string {
  return `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createScene(name: string, camera: SceneCamera = { kind: 'local', facing: 'back' }): StudioScene {
  return { id: newSceneId(), name: name.trim().slice(0, 28) || 'Scene', camera, profileOverlays: true, widgets: [], animations: [] };
}

export function defaultScenes(facing: 'back' | 'front' = 'back'): StudioScene[] {
  return [
    { ...createScene('Main', { kind: 'local', facing }), id: 'main' },
    { ...createScene(facing === 'back' ? 'Selfie' : 'Rear', { kind: 'local', facing: facing === 'back' ? 'front' : 'back' }), id: 'second' },
  ];
}

export function normalizeScenes(raw: unknown, facing: 'back' | 'front' = 'back'): StudioScene[] {
  if (!Array.isArray(raw)) return defaultScenes(facing);
  const ids = new Set<string>();
  const scenes: StudioScene[] = [];
  for (const value of raw.slice(0, MAX_STUDIO_SCENES)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const camera = item.camera && typeof item.camera === 'object' ? item.camera as Record<string, unknown> : {};
    let source: SceneCamera = { kind: 'local', facing: camera.facing === 'front' ? 'front' : facing };
    if (camera.kind === 'peer' && typeof camera.url === 'string' && isValidRtspUrl(camera.url)) {
      source = {
        kind: 'peer', url: camera.url, name: typeof camera.name === 'string' ? camera.name.slice(0, 40) : 'LAN camera',
        ...(typeof camera.remoteId === 'string' ? { remoteId: camera.remoteId } : {}),
      };
    }
    let id = typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ? item.id : newSceneId();
    if (ids.has(id)) id = newSceneId();
    ids.add(id);
    scenes.push({
      id,
      name: typeof item.name === 'string' ? item.name.trim().slice(0, 28) || 'Scene' : 'Scene',
      camera: source,
      profileOverlays: item.profileOverlays !== false,
      widgets: normalizeStudioProfile({ updatedAt: 1, widgets: item.widgets }, 'cricket').widgets,
      animations: Array.isArray(item.animations)
        ? [...new Set(item.animations.filter((entry): entry is string => typeof entry === 'string' && /^[a-z]+:[a-z0-9_-]{1,40}$/.test(entry)))].slice(0, 8)
        : [],
    });
  }
  return scenes.length ? scenes : defaultScenes(facing);
}

export function adjacentSceneId(scenes: StudioScene[], activeId: string | null, direction: 1 | -1): string | null {
  if (!scenes.length) return null;
  const index = scenes.findIndex(scene => scene.id === activeId);
  if (index < 0) return scenes[0].id;
  return scenes[(index + direction + scenes.length) % scenes.length].id;
}