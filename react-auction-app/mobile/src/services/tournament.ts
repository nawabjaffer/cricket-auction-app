// Tournament data the phone needs: tenant registry, the synced studio profile and the match list.
import { get, limitToLast, onValue, query, ref } from 'firebase/database';
import { getDb } from './firebase';
import {
  defaultStudioProfile, isStudioGameType, normalizeStudioProfile, sortMatchSummaries, studioActiveMatchPath,
  studioMatchIndexPath, studioMatchSetupPath, studioProfilePath, summarizeMatchSetup,
  type StudioGameType, type StudioMatchSummary, type StudioProfile,
} from '../shared/studioProfile';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sports: StudioGameType[];
}

/** Looks a tournament up by slug or id in the platform registry. */
export async function resolveTenant(slugOrId: string): Promise<TenantInfo | null> {
  const snapshot = await get(ref(getDb(), 'platform/tenants'));
  if (!snapshot.exists()) return null;
  const all = Object.values(snapshot.val() as Record<string, Record<string, unknown>>);
  const found = all.find(tenant => tenant && (tenant.slug === slugOrId || tenant.id === slugOrId));
  if (!found || typeof found.id !== 'string') return null;
  const sports = Array.isArray(found.sports) ? found.sports.filter(isStudioGameType) : [];
  return {
    id: found.id,
    slug: typeof found.slug === 'string' ? found.slug : found.id,
    name: typeof found.name === 'string' ? found.name : found.id,
    isActive: found.isActive !== false,
    sports: sports.length ? sports : ['cricket'],
  };
}

export function subscribeProfile(
  tenantId: string, game: StudioGameType, onProfile: (profile: StudioProfile) => void, onError?: (error: Error) => void,
): () => void {
  return onValue(
    ref(getDb(), studioProfilePath(tenantId, game)),
    snapshot => onProfile(snapshot.exists() ? normalizeStudioProfile(snapshot.val(), game) : defaultStudioProfile(game)),
    error => onError?.(error),
  );
}

export function subscribeActiveMatch(tenantId: string, game: StudioGameType, onActive: (matchId: string | null) => void): () => void {
  return onValue(ref(getDb(), studioActiveMatchPath(tenantId, game)), snapshot => {
    onActive(snapshot.exists() && typeof snapshot.val() === 'string' ? (snapshot.val() as string) : null);
  });
}

export async function listMatches(tenantId: string, game: StudioGameType, limit = 40): Promise<StudioMatchSummary[]> {
  const db = getDb();
  const pageSize = Math.min(120, Math.max(1, Math.round(limit)));
  const [index, active] = await Promise.all([
    get(query(ref(db, studioMatchIndexPath(tenantId, game)), limitToLast(pageSize))),
    get(ref(db, studioActiveMatchPath(tenantId, game))),
  ]);
  const ids = index.exists() ? Object.keys(index.val() as Record<string, unknown>) : [];
  const activeId = active.val();
  if (typeof activeId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(activeId) && !ids.includes(activeId)) ids.push(activeId);
  const summaries = await Promise.all(ids.map(async id => {
    const snapshot = await get(ref(db, studioMatchSetupPath(tenantId, game, id)));
    return snapshot.exists() ? summarizeMatchSetup(id, snapshot.val()) : null;
  }));
  const sorted = sortMatchSummaries(summaries.filter((item): item is StudioMatchSummary => item !== null));
  const onAir = sorted.find(item => item.id === activeId);
  return [...(onAir ? [onAir] : []), ...sorted.filter(item => item.id !== activeId)].slice(0, pageSize);
}

export async function getMatch(tenantId: string, game: StudioGameType, matchId: string): Promise<StudioMatchSummary | null> {
  const snapshot = await get(ref(getDb(), studioMatchSetupPath(tenantId, game, matchId)));
  return snapshot.exists() ? summarizeMatchSetup(matchId, snapshot.val()) : null;
}
