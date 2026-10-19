import { isSafeStudioId, isStudioGameType, normalizeOrigin, type StudioPairing } from './studioProfile';

export type ScoringPage = 'matches' | 'score' | 'scoreboard' | 'admin' | 'guides' | 'designer' | 'dock';

export function normalizeScoringWorkspace(raw: unknown): StudioPairing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const origin = typeof item.origin === 'string' ? normalizeOrigin(item.origin) : null;
  if (!origin?.startsWith('https://') || !isSafeStudioId(item.tenantId) || !isSafeStudioId(item.slug) || !isStudioGameType(item.game)) return null;
  return { origin, tenantId: item.tenantId, slug: item.slug, game: item.game };
}

export function scoringPageUrl(workspace: StudioPairing, page: ScoringPage): string {
  const valid = normalizeScoringWorkspace(workspace);
  if (!valid) throw new Error('Select a valid tournament and HTTPS server first.');
  const base = `${valid.origin}/${valid.slug}`;
  const scorer = `${base}/${valid.game}/scorer`;
  switch (page) {
    case 'matches': return `${scorer}/admin`;
    case 'score': return `${scorer}/update`;
    case 'scoreboard': return valid.game === 'cricket' ? `${base}/cricket/scoreboard` : `${scorer}/obs-overlay`;
    case 'admin': return `${base}/admin`;
    case 'guides': return `${base}/help?section=${valid.game}`;
    case 'designer': return `${scorer}/designer`;
    case 'dock': return `${scorer}/obs-dock`;
  }
}

export function isScoringNavigationAllowed(url: string, workspace: StudioPairing): boolean {
  const valid = normalizeScoringWorkspace(workspace);
  if (!valid) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.origin !== valid.origin || parsed.username || parsed.password) return false;
    if (/%(?:2f|5c|25)/i.test(parsed.pathname)) return false;
    const path = decodeURIComponent(parsed.pathname);
    if (path.includes('\\') || path.split('/').some(segment => segment === '.' || segment === '..')) return false;
    return path === `/${valid.slug}` || path.startsWith(`/${valid.slug}/`);
  } catch {
    return false;
  }
}

export function scoringEntryUrl(workspace: StudioPairing): string {
  const target = new URL(scoringPageUrl(workspace, 'matches'));
  const login = new URL(`/${workspace.slug}/admin/login`, target.origin);
  login.searchParams.set('returnTo', target.pathname);
  return login.toString();
}