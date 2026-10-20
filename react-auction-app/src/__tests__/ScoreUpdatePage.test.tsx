import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchSetup } from '../types/scoring';
import type { FootballMatchSetup } from '../types/football';

const mocks = vi.hoisted(() => ({
  getAllMatches: vi.fn(),
  subscribeMatches: vi.fn(),
  startMatchQuick: vi.fn(),
  getOverlayConfig: vi.fn(),
  subscribeOverlayConfig: vi.fn(),
  subscribeActiveMatch: vi.fn(),
  subscribeOverlayControl: vi.fn(),
  scoringInitialize: vi.fn(),
  cricHeroesInitialize: vi.fn(),
  cricHeroesSubscribe: vi.fn(),
  ensureRealtime: vi.fn(),
  getDatabase: vi.fn(),
  scoringState: vi.fn(),
  navigate: vi.fn(),
  footballMatches: vi.fn(),
  footballMatch: vi.fn(),
  footballLive: vi.fn(),
  footballPlayers: vi.fn(),
}));

vi.mock('../hooks/useAdminAuth', () => ({ useAdminAuth: () => ({ isAuthenticated: true, session: { role: 'admin' }, extendSession: vi.fn() }) }));
vi.mock('../hooks/useTenantNavigate', () => ({ useTenantNavigate: () => mocks.navigate }));
vi.mock('../hooks/useScoringState', () => ({ useScoringState: (matchId?: string) => mocks.scoringState(matchId) }));
vi.mock('../hooks/useCricHeroesSyncAdapter', () => ({ useCricHeroesSyncAdapter: () => ({ latest: null }) }));
vi.mock('../services/realtimeSync', () => ({ realtimeSync: { ensureInitialized: mocks.ensureRealtime, getDatabase: mocks.getDatabase } }));
vi.mock('../services/scoring', () => ({ scoringService: {
  initialize: mocks.scoringInitialize,
  getOverlayConfig: mocks.getOverlayConfig,
  subscribeOverlayConfig: mocks.subscribeOverlayConfig,
  subscribeActiveMatch: mocks.subscribeActiveMatch,
  subscribeOverlayControl: mocks.subscribeOverlayControl,
  getAllMatches: mocks.getAllMatches,
  subscribeMatches: mocks.subscribeMatches,
  startMatchQuick: mocks.startMatchQuick,
} }));
vi.mock('../services/cricHeroesMappingService', () => ({ cricHeroesMappingService: { initialize: mocks.cricHeroesInitialize, subscribe: mocks.cricHeroesSubscribe, save: vi.fn() } }));
vi.mock('../services/scoring/statsEngine', () => ({ statsEngine: { initialize: vi.fn() } }));
vi.mock('../services/scoring/obsReplaySourceService', () => ({ obsReplaySourceService: { initialize: vi.fn(), getButtons: vi.fn().mockResolvedValue([]) } }));
vi.mock('../services/liveCommentService', () => ({ liveCommentService: { initialize: vi.fn(), subscribe: vi.fn(() => vi.fn()) } }));
vi.mock('../services/football', () => ({ footballService: {
  initialize: vi.fn(), subscribeMatches: mocks.footballMatches, subscribeMatch: mocks.footballMatch,
  subscribeLive: mocks.footballLive, subscribePlayers: mocks.footballPlayers,
} }));
vi.mock('../services/tenantService', () => ({ tenantService: { getTenant: vi.fn(async () => null) } }));

import ScoreUpdatePage from '../pages/ScoreUpdatePage';
import FootballUpdatePage from '../pages/FootballUpdatePage';

const makeMatch = (id: string, date: string): MatchSetup => ({
  id,
  status: 'scheduled',
  date,
  teamA: { id: `${id}-a`, name: `${id} A` },
  teamB: { id: `${id}-b`, name: `${id} B` },
  maxOvers: 20,
  venue: 'Ground',
  tournamentName: 'League',
  createdAt: 1,
  updatedAt: 1,
} as MatchSetup);

function MatchIdProbe() {
  const [params] = useSearchParams();
  return <output data-testid="selected-match-id">{params.get('matchId') || ''}</output>;
}

const loadingState = {
  match: null, liveScore: null, currentInnings: null, lineups: { teamA: null, teamB: null },
  loading: true, error: null, recording: false, undoStack: [], isInningsComplete: false,
  isMatchComplete: false, needsBowlerChange: false, recordBall: vi.fn(), undoLastBall: vi.fn(),
  initInnings: vi.fn(), seedLiveScore: vi.fn(), setPowerplayActive: vi.fn(), setOverlay: vi.fn(),
  changeBatsman: vi.fn(), changeBowler: vi.fn(), swapStrike: vi.fn(), completeMatch: vi.fn(),
  addPlayerToLineup: vi.fn(),
};

describe('ScoreUpdatePage without an active match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureRealtime.mockResolvedValue(true);
    mocks.getDatabase.mockReturnValue({});
    mocks.getOverlayConfig.mockResolvedValue({ singleOverlayMode: false });
    mocks.subscribeOverlayConfig.mockReturnValue(vi.fn());
    mocks.subscribeActiveMatch.mockImplementation((callback: (matchId: string | null) => void) => { callback(null); return vi.fn(); });
    mocks.subscribeOverlayControl.mockReturnValue(vi.fn());
    mocks.cricHeroesSubscribe.mockImplementation((callback: (value: unknown) => void) => { callback(null); return vi.fn(); });
    mocks.startMatchQuick.mockResolvedValue(undefined);
    mocks.scoringState.mockReturnValue(loadingState);
    mocks.navigate.mockReset();
    const fixtures = [makeMatch('later', '2026-10-08T12:00:00.000Z'), makeMatch('earlier', '2026-10-06T12:00:00.000Z')];
    mocks.getAllMatches.mockResolvedValue(fixtures);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback(fixtures); return vi.fn(); });
  });

  it('shows scheduled fixtures earliest-first and starts the selected match in the scorer', async () => {
    render(<MemoryRouter initialEntries={['/league-2026/cricket/scorer/update']}>
      <ScoreUpdatePage />
      <MatchIdProbe />
    </MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Choose a match' })).toBeTruthy();
    const startButtons = await screen.findAllByRole('button', { name: 'Start match' });
    expect(startButtons).toHaveLength(2);
    fireEvent.click(startButtons[0]);

    await waitFor(() => expect(mocks.startMatchQuick).toHaveBeenCalledWith('earlier'));
    await waitFor(() => expect(screen.getByTestId('selected-match-id').textContent).toBe('earlier'));
    expect(await screen.findByText('Loading match...')).toBeTruthy();
  });

  it('explains when no match is scheduled or started', async () => {
    mocks.getAllMatches.mockResolvedValue([]);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback([]); return vi.fn(); });

    render(<MemoryRouter initialEntries={['/league-2026/cricket/scorer/update']}>
      <ScoreUpdatePage />
    </MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'No match is scheduled or started' })).toBeTruthy();
  });

  it('shows the match just started in admin and resumes it without restarting', async () => {
    const live = { ...makeMatch('live_match', '2026-10-19T12:00:00Z'), status: 'live' as const };
    mocks.getAllMatches.mockResolvedValue([live]);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback([live]); return vi.fn(); });
    mocks.subscribeActiveMatch.mockImplementation((callback: (matchId: string | null) => void) => { callback(live.id); return vi.fn(); });
    render(<MemoryRouter initialEntries={['/league-2026/cricket/scorer/update']}><ScoreUpdatePage /><MatchIdProbe /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Live matches' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume scoring' }));
    await waitFor(() => expect(screen.getByTestId('selected-match-id').textContent).toBe(live.id));
    expect(mocks.startMatchQuick).not.toHaveBeenCalled();
    expect(mocks.scoringState).toHaveBeenCalledWith(live.id);
  });

  it('keeps an already-live match separate from upcoming scheduled fixtures', async () => {
    const matches = [makeMatch('upcoming', '2026-10-20T12:00:00Z'), { ...makeMatch('playing', '2026-10-19T12:00:00Z'), status: 'live' as const }];
    mocks.getAllMatches.mockResolvedValue(matches);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback(matches); return vi.fn(); });
    render(<MemoryRouter initialEntries={['/league-2026/cricket/scorer/update']}><ScoreUpdatePage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Resume scoring' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start match' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'No match is scheduled or started' })).toBeNull();
  });

  it('moves a fixture into live matches when another screen starts it', async () => {
    const fixture = makeMatch('started_on_mobile', '2026-10-19T12:00:00Z');
    let listener: ((matches: MatchSetup[]) => void) | undefined;
    mocks.getAllMatches.mockResolvedValue([fixture]);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { listener = callback; return vi.fn(); });
    render(<MemoryRouter initialEntries={['/league-2026/cricket/scorer/update']}><ScoreUpdatePage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Start match' })).toBeTruthy();
    await waitFor(() => expect(listener).toBeDefined());
    act(() => listener?.([{ ...fixture, status: 'live' }]));
    expect(await screen.findByRole('button', { name: 'Resume scoring' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start match' })).toBeNull();
  });
});

describe('Football mobile Score without a match URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureRealtime.mockResolvedValue(true);
    mocks.getDatabase.mockReturnValue({});
    mocks.footballMatch.mockReturnValue(vi.fn());
    mocks.footballLive.mockReturnValue(vi.fn());
    mocks.footballPlayers.mockReturnValue(vi.fn());
  });
  it('lists a live football match and resumes it from the generic Score tab', async () => {
    const live = { ...makeMatch('football_live', '2026-10-19T12:00:00Z'), status: 'live', halfDurationMin: 45 } as unknown as FootballMatchSetup;
    mocks.footballMatches.mockImplementation((callback: (matches: FootballMatchSetup[]) => void) => { callback([live]); return vi.fn(); });
    render(<MemoryRouter initialEntries={['/league-2026/football/scorer/update']}><FootballUpdatePage /><MatchIdProbe /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume scoring' }));
    await waitFor(() => expect(screen.getByTestId('selected-match-id').textContent).toBe(live.id));
    expect(mocks.footballMatch).toHaveBeenCalledWith(live.id, expect.any(Function));
  });
  it('keeps completed football matches out of the active picker', async () => {
    const completed = { ...makeMatch('finished', '2026-10-18T12:00:00Z'), status: 'completed', halfDurationMin: 45 } as unknown as FootballMatchSetup;
    mocks.footballMatches.mockImplementation((callback: (matches: FootballMatchSetup[]) => void) => { callback([completed]); return vi.fn(); });
    render(<MemoryRouter initialEntries={['/league-2026/football/scorer/update']}><FootballUpdatePage /></MemoryRouter>);
    expect(await screen.findByText('No match is scheduled or started.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume scoring' })).toBeNull();
  });
});
