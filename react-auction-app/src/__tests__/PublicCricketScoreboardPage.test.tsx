import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Innings, LiveScore, MatchScore, MatchSetup } from '../types/scoring';

const mocks = vi.hoisted(() => ({
  matches: [] as MatchSetup[],
  records: {} as Record<string, unknown>,
  initialize: vi.fn(),
  getAllMatches: vi.fn(),
  subscribeMatches: vi.fn(),
  saveScorecardCorrection: vi.fn(),
  onValue: vi.fn(),
  finalOnlyCompletedInnings: false,
}));

vi.mock('../services/realtimeSync', () => ({ realtimeSync: { ensureInitialized: vi.fn().mockResolvedValue(undefined), getDatabase: () => ({}) } }));
vi.mock('../services/tenantPath', () => ({ tenantPath: (path: string) => `tenants/ppl-2026/${path}` }));
vi.mock('../services/scoring', () => ({ scoringService: {
  initialize: mocks.initialize,
  getAllMatches: mocks.getAllMatches,
  subscribeMatches: mocks.subscribeMatches,
  saveScorecardCorrection: mocks.saveScorecardCorrection,
} }));
vi.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  onValue: mocks.onValue,
}));

import PublicCricketScoreboardPage from '../pages/PublicCricketScoreboardPage';

const completedMatch = {
  id: 'completed-1', status: 'completed', date: '2026-10-01T12:00:00.000Z', venue: 'Ground', maxOvers: 20,
  teamA: { id: 'team-a', name: 'Team A' }, teamB: { id: 'team-b', name: 'Team B' }, createdAt: 1, updatedAt: 1,
} as MatchSetup;
const upcomingMatch = {
  id: 'upcoming-1', status: 'scheduled', date: '2026-10-03T12:00:00.000Z', venue: 'Ground', maxOvers: 20,
  teamA: { id: 'team-a', name: 'Team A' }, teamB: { id: 'team-c', name: 'Team C' }, createdAt: 1, updatedAt: 1,
} as MatchSetup;
const liveMatch = {
  id: 'live-1', status: 'live', date: '2026-10-02T12:00:00.000Z', venue: 'Ground', maxOvers: 20,
  teamA: { id: 'team-a', name: 'Team A' }, teamB: { id: 'team-b', name: 'Team B' }, createdAt: 1, updatedAt: 1,
} as MatchSetup;
const completedInnings: Innings[] = [
  {
    number: 1, battingTeamId: 'team-a', bowlingTeamId: 'team-b', totalRuns: 12, totalWickets: 1, totalOvers: 2, maxOvers: 20,
    extras: { total: 2, wides: 2, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    batsmen: [{ playerId: 'batter-1', playerName: 'Batter One', runs: 10, balls: 12, fours: 1, sixes: 0, strikeRate: 83.33, dismissal: 'bowled', isOut: true, order: 1 }],
    bowlers: [{ playerId: 'bowler-1', playerName: 'Bowler One', overs: 2, maidens: 0, runs: 12, wickets: 1, economy: 6, wides: 2, noBalls: 0, dots: 3 }],
    fallOfWickets: [], overs: [], isCompleted: true,
  },
  {
    number: 2, battingTeamId: 'team-b', bowlingTeamId: 'team-a', totalRuns: 8, totalWickets: 0, totalOvers: 1, maxOvers: 20,
    extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    batsmen: [{ playerId: 'batter-2', playerName: 'Batter Two', runs: 8, balls: 6, fours: 1, sixes: 0, strikeRate: 133.33, dismissal: 'not out', isOut: false, order: 1 }],
    bowlers: [{ playerId: 'bowler-2', playerName: 'Bowler Two', overs: 1, maidens: 0, runs: 8, wickets: 0, economy: 8, wides: 0, noBalls: 0, dots: 1 }],
    fallOfWickets: [], overs: [], isCompleted: true,
  },
];
const finalScore: MatchScore = {
  matchId: completedMatch.id, status: 'completed', teams: [], innings: completedInnings,
  result: { winner: 'team-a', margin: '4 runs' }, toss: null, venue: 'Ground', date: completedMatch.date,
};
const liveScore = {
  matchId: liveMatch.id, currentInnings: 2, runs: 8, wickets: 0, overs: 1, runRate: 8,
  target: 13, requiredRate: 5, battingTeamId: 'team-b', bowlingTeamId: 'team-a',
  currentBatsmen: [
    { playerId: 'batter-2', playerName: 'Batter Two', runs: 8, balls: 6, fours: 1, sixes: 0, strikeRate: 133.33, isOnStrike: true },
    { playerId: 'batter-3', playerName: 'Batter Three', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike: false },
  ],
  currentBowler: { playerId: 'bowler-1', playerName: 'Bowler One', overs: 1, maidens: 0, runs: 8, wickets: 0, economy: 8, dots: 1 },
  lastBall: '1', recentOvers: [], lastUpdated: 1,
} as unknown as LiveScore;

function snapshot(value: unknown) {
  return { exists: () => value !== null && value !== undefined, val: () => value };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/ppl-2026/cricket/scoreboard']}><PublicCricketScoreboardPage /></MemoryRouter>);
}

describe('public cricket scoreboard editing workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.finalOnlyCompletedInnings = false;
    mocks.matches = [completedMatch, upcomingMatch, liveMatch];
    mocks.records = {
      [completedMatch.id]: { setup: completedMatch, final: finalScore },
      [upcomingMatch.id]: { setup: upcomingMatch },
      [liveMatch.id]: { setup: liveMatch },
    };
    mocks.getAllMatches.mockResolvedValue(mocks.matches);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback(mocks.matches); return () => {}; });
    mocks.saveScorecardCorrection.mockResolvedValue(undefined);
    mocks.onValue.mockImplementation((reference: { path: string }, callback: (snapshot: unknown) => void) => {
      const path = reference.path;
      let value: unknown = null;
      if (path === 'tenants/ppl-2026/auction/adminSettings') value = { superAdminUsername: 'organizer', superAdminPassword: 'review-pass' };
      else if (path === 'tenants/ppl-2026/scoring/matches') value = mocks.records;
      else if (path === 'tenants/ppl-2026/auction/teams') value = { 'team-a': { id: 'team-a', name: 'Team A' } };
      else if (path === 'tenants/ppl-2026/scoring/overlayConfig') value = null;
      else if (path.endsWith('/setup')) value = path.includes(completedMatch.id) ? completedMatch : path.includes(liveMatch.id) ? liveMatch : upcomingMatch;
      else if (path.endsWith('/live')) value = path.includes(liveMatch.id) ? liveScore : null;
      else if (path.endsWith('/innings')) value = path.includes(completedMatch.id) && mocks.finalOnlyCompletedInnings
        ? {}
        : path.includes(completedMatch.id) || path.includes(liveMatch.id) ? { 1: completedInnings[0], 2: completedInnings[1] } : {};
      else if (path.endsWith('/balls')) value = {};
      else if (path.endsWith('/final')) value = path.includes(completedMatch.id) ? finalScore : null;
      else if (path.endsWith('/stats')) value = null;
      callback(snapshot(value));
      return () => {};
    });
  });
  afterEach(cleanup);

  it('separates upcoming and completed matches and places Points Table in the top bar', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Match')).toHaveValue(liveMatch.id));
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    await waitFor(() => expect(screen.getByLabelText('Match')).toHaveValue(upcomingMatch.id));
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(screen.getByLabelText('Match')).toHaveValue(completedMatch.id));
    expect(screen.getByRole('heading', { name: 'Batting & Bowling' })).toBeInTheDocument();
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
      await waitFor(() => expect(screen.getByLabelText('Match')).toHaveValue(completedMatch.id));
    }
    await new Promise(resolve => setTimeout(resolve, 75));
    expect(screen.getByLabelText('Match')).toHaveValue(completedMatch.id);
    expect(screen.getByRole('button', { name: 'Scorecards' })).toHaveClass('is-active');
    fireEvent.click(screen.getByRole('button', { name: /Points Table/ }));
    expect(await screen.findByRole('heading', { name: 'Points Table' })).toBeInTheDocument();
  });

  it('requires configured Super Admin credentials before editing a completed scorecard', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Completed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit scorecard' }));
    const dialog = screen.getByRole('dialog', { name: 'Super Admin sign in' });
    fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: 'organizer' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Username or password is incorrect.');
    expect(screen.queryByRole('dialog', { name: /Edit scorecard/ })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'review-pass' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit scorecard' }));
    const editor = screen.getByRole('dialog', { name: /Edit scorecard/ });
    fireEvent.change(within(editor).getByLabelText('Innings 1 batter 1 name'), { target: { value: 'Corrected Batter' } });
    fireEvent.change(within(editor).getAllByLabelText('Runs')[0], { target: { value: '13' } });
    fireEvent.click(within(editor).getByRole('button', { name: /Save scorecard/ }));

    await waitFor(() => expect(mocks.saveScorecardCorrection).toHaveBeenCalled());
    const [matchId, correctedInnings, live, correctedFinal] = mocks.saveScorecardCorrection.mock.calls[0];
    expect(matchId).toBe(completedMatch.id);
    expect(correctedInnings[0].batsmen[0]).toMatchObject({ playerName: 'Corrected Batter', runs: 13 });
    expect(correctedInnings[0].totalRuns).toBe(15);
    expect(live).toBeUndefined();
    expect(correctedFinal.result).toEqual({ winner: 'team-a', margin: '7 runs' });
    expect(await screen.findByText('Scorecard saved successfully.')).toBeInTheDocument();
  });

  it('reconciles the live target when the first innings is corrected', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Live' }));
    await waitFor(() => expect(screen.getByLabelText('Match')).toHaveValue(liveMatch.id));
    fireEvent.click(screen.getByRole('button', { name: 'Super Admin Edit' }));
    const auth = screen.getByRole('dialog', { name: 'Super Admin sign in' });
    fireEvent.change(within(auth).getByLabelText('Username'), { target: { value: 'organizer' } });
    fireEvent.change(within(auth).getByLabelText('Password'), { target: { value: 'review-pass' } });
    fireEvent.click(within(auth).getByRole('button', { name: 'Sign in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Scorecards' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit scorecard' }));
    const editor = screen.getByRole('dialog', { name: /Edit scorecard/ });
    fireEvent.change(within(editor).getByLabelText('Innings 1 batter 1 name'), { target: { value: 'Updated Batter' } });
    fireEvent.change(within(editor).getAllByLabelText('Runs')[0], { target: { value: '13' } });
    fireEvent.click(within(editor).getByRole('button', { name: /Save scorecard/ }));

    await waitFor(() => expect(mocks.saveScorecardCorrection).toHaveBeenCalled());
    const [matchId, _innings, correctedLive, correctedFinal] = mocks.saveScorecardCorrection.mock.calls[0];
    expect(matchId).toBe(liveMatch.id);
    expect(correctedLive.target).toBe(16);
    expect(correctedLive.runs).toBe(8);
    expect(correctedFinal).toBeUndefined();
  });

  it('opens Points Table from the top bar with no upcoming match selected', async () => {
    mocks.getAllMatches.mockResolvedValue([]);
    mocks.subscribeMatches.mockImplementation((callback: (matches: MatchSetup[]) => void) => { callback([]); return () => {}; });
    mocks.records = {};
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Upcoming' }));
    expect(await screen.findByText('No match found. Ask the tournament admin to schedule a fixture.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(await screen.findByText('No match found. Ask the tournament admin to schedule a fixture.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Points Table/ }));
    expect(await screen.findByRole('heading', { name: 'Points Table' })).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
  });

  it('shows completed innings stored only in the final snapshot', async () => {
    mocks.finalOnlyCompletedInnings = true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Completed' }));
    expect(await screen.findByRole('heading', { name: 'Batting & Bowling' })).toBeInTheDocument();
    expect(screen.getByText('Batter One')).toBeInTheDocument();
  });
});
