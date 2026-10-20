import { useNav } from '../src/store/navStore';
import { isScoringNavigationAllowed, normalizeScoringWorkspace, scoringEntryUrl, scoringPageUrl } from '../src/shared/scoringWorkspace';
import { MAX_WORKSPACE_EXPORT_BYTES, parseScoringBrowserMessage, scoringBrowserScript } from '../src/services/scoringBrowser';

beforeEach(() => useNav.setState(useNav.getInitialState()));

describe('app workspaces', () => {
  it('opens the mode chooser instead of requesting camera access on launch', () => {
    expect(useNav.getState().workspace).toBe('home');
  });

  it('opens the streaming studio explicitly and clears immersive mode', () => {
    useNav.getState().setStudioClean(true);
    useNav.getState().setWorkspace('streaming');
    expect(useNav.getState()).toMatchObject({ workspace: 'streaming', tab: 'studio', studioClean: false });
  });

  it('keeps scoring separate from the streaming tabs', () => {
    useNav.getState().setWorkspace('scoring');
    expect(useNav.getState().workspace).toBe('scoring');
    useNav.getState().setWorkspace('home');
    expect(useNav.getState().workspace).toBe('home');
  });

  it('keeps host selection and connector camera navigation separate', () => {
    useNav.getState().setWorkspace('streaming-role');
    expect(useNav.getState().workspace).toBe('streaming-role');
    useNav.getState().setWorkspace('connector');
    expect(useNav.getState().workspace).toBe('connector');
    useNav.getState().setWorkspace('streaming');
    expect(useNav.getState()).toMatchObject({ workspace: 'streaming', tab: 'studio' });
  });

  it('keeps streaming deep links and setup shortcuts working', () => {
    useNav.getState().setTab('cameras');
    expect(useNav.getState()).toMatchObject({ workspace: 'streaming', tab: 'cameras' });
    useNav.getState().setWorkspace('home');
    useNav.getState().openSetup('bluetooth');
    expect(useNav.getState()).toMatchObject({ workspace: 'streaming', tab: 'setup', setupSection: 'bluetooth' });
  });
});

describe('scoring browser integration', () => {
  it('accepts bounded export and clipboard messages only with the private workspace token', () => {
    expect(parseScoringBrowserMessage(JSON.stringify({ token: 'secret', type: 'clipboard', text: 'scorecard URL' }), 'secret')).toEqual({ type: 'clipboard', text: 'scorecard URL' });
    expect(parseScoringBrowserMessage(JSON.stringify({ token: 'other', type: 'print' }), 'secret')).toBeNull();
    expect(parseScoringBrowserMessage(JSON.stringify({ token: 'secret', type: 'download', name: 'score.csv', dataUrl: 'data:text/csv;base64,YSwx' }), 'secret')).toMatchObject({ type: 'download', name: 'score.csv' });
    expect(parseScoringBrowserMessage(JSON.stringify({ token: 'secret', type: 'download', name: 'score.csv', dataUrl: 'file:///private/file' }), 'secret')).toBeNull();
    expect(parseScoringBrowserMessage('invalid JSON', 'secret')).toBeNull();
    expect(parseScoringBrowserMessage('x'.repeat(MAX_WORKSPACE_EXPORT_BYTES * 2), 'secret')).toBeNull();
  });

  it('installs the export adapter only on the selected tournament origin/path', () => {
    const script = scoringBrowserScript({ origin: 'https://app.example.com', tenantId: 'tenant_1', slug: 'league', game: 'cricket' }, 'private-token');
    expect(script).toContain('window.location.origin!=="https://app.example.com"');
    expect(script).toContain('window.location.pathname.startsWith("/league/")');
    expect(script).toContain('URL.revokeObjectURL');
    expect(script).toContain('window.print');
  });
});

describe('embedded scoring routes', () => {
  const workspace = { origin: 'https://e-auction-store.web.app', tenantId: 'tenant_1', slug: 'league-2026', game: 'cricket' as const };

  it('opens the full scheduling/admin and scoring pages with the tenant prefix', () => {
    expect(scoringPageUrl(workspace, 'matches')).toBe('https://e-auction-store.web.app/league-2026/cricket/scorer/admin');
    expect(scoringPageUrl(workspace, 'score')).toBe('https://e-auction-store.web.app/league-2026/cricket/scorer/update');
    expect(scoringPageUrl(workspace, 'admin')).toBe('https://e-auction-store.web.app/league-2026/admin');
  });

  it('enters through normal website login with a safe same-tenant return URL', () => {
    const login = new URL(scoringEntryUrl(workspace));
    expect(login.pathname).toBe('/league-2026/admin/login');
    expect(login.searchParams.get('returnTo')).toBe('/league-2026/cricket/scorer/admin');
    expect(isScoringNavigationAllowed(login.toString(), workspace)).toBe(true);
  });

  it('keeps every implemented sport on its existing scorer and scoreboard routes', () => {
    for (const game of ['cricket', 'football', 'kabaddi', 'carrom'] as const) {
      expect(scoringPageUrl({ ...workspace, game }, 'score')).toContain(`/${game}/scorer/update`);
      expect(isScoringNavigationAllowed(scoringPageUrl({ ...workspace, game }, 'scoreboard'), { ...workspace, game })).toBe(true);
    }
    expect(scoringPageUrl({ ...workspace, game: 'carrom' }, 'scoreboard')).toContain('/carrom/scorer/obs-overlay');
  });

  it('preserves same-tenant login and feature navigation while blocking other tenants and origins', () => {
    expect(isScoringNavigationAllowed(`${workspace.origin}/league-2026/admin/login`, workspace)).toBe(true);
    expect(isScoringNavigationAllowed(`${workspace.origin}/another-tenant/carrom/scorer/admin`, workspace)).toBe(false);
    expect(isScoringNavigationAllowed('https://evil.example/league-2026/admin', workspace)).toBe(false);
    expect(isScoringNavigationAllowed('javascript:alert(1)', workspace)).toBe(false);
    expect(isScoringNavigationAllowed(`${workspace.origin}/league-2026/%2f..%2fadmin`, workspace)).toBe(false);
    expect(isScoringNavigationAllowed('https://user:password@e-auction-store.web.app/league-2026/admin', workspace)).toBe(false);
  });

  it('rejects malformed saved workspaces rather than reusing unsafe URLs', () => {
    expect(normalizeScoringWorkspace(null)).toBeNull();
    expect(normalizeScoringWorkspace({ ...workspace, origin: 'http://example.com' })).toBeNull();
    expect(normalizeScoringWorkspace({ ...workspace, slug: '../other' })).toBeNull();
    expect(normalizeScoringWorkspace({ ...workspace, game: 'unknown' })).toBeNull();
    expect(normalizeScoringWorkspace(workspace)).toEqual(workspace);
  });
});