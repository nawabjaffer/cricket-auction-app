import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchSetup } from '../types/scoring';

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

import ScoreUpdatePage from '../pages/ScoreUpdatePage';

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

    expect(await screen.findByRole('heading', { name: 'No match is currently started' })).toBeTruthy();
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
});
