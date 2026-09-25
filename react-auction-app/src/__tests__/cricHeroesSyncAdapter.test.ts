import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { interpretCricHeroesTextEvent, parseCricHeroesCommentary, useCricHeroesSyncAdapter } from '../hooks/useCricHeroesSyncAdapter';

describe('CricHeroes commentary interpreter', () => {
  it.each([
    ['SIX!', '6'],
    ['FOUR to deep cover', '4'],
    ['WIDE down leg side', 'WD'],
    ['NO BALL, above waist', 'NB'],
    ['Batter OUT caught at mid-on', 'W'],
    ['2 runs', '2'],
    ['1 run completed', '1'],
    ['3 runs', '3'],
    ['5 runs', '5'],
  ])('interprets %s', (text, outcome) => {
    expect(interpretCricHeroesTextEvent(text)).toBe(outcome);
  });

  it('ignores commentary without a recognized ball result', () => {
    expect(interpretCricHeroesTextEvent('Drinks break')).toBeNull();
  });

  it('orders newest-first CricHeroes commentary from the first over to the current delivery', () => {
    const history = parseCricHeroesCommentary(
      '1.2Dinesh Bajaj to Aravind Sam, OUT Caught behind, Caught Behind by Rajesh. Persu are 15/1. '
      + '1.1Dinesh Bajaj to Muthu Pm, 1 run, Defence to Wide long-on. Persu move to 15/0. '
      + '0.2Anif Gadget to Muthu Pm, no run. Persu stay on 1/0. '
      + '0.1Anif Gadget to Aravind Sam, 1 run. Persu move to 1/0.',
    );

    expect(history.map(delivery => `${delivery.over}.${delivery.ball}`)).toEqual(['0.1', '0.2', '1.1', '1.2']);
    expect(history.map(delivery => delivery.outcome)).toEqual(['1', '0', '1', 'W']);
    expect(history[0].batter).toBe('Aravind Sam');
    expect(history.at(-1)?.bowler).toBe('Dinesh Bajaj');
  });

  it('keeps a stable delivery key when CricHeroes refreshes its cumulative score text', () => {
    const first = parseCricHeroesCommentary('2.3Anif Gadget to Muthu Pm, 1 run, Persu move to 20/1.');
    const refreshed = parseCricHeroesCommentary('2.3Anif Gadget to Muthu Pm, 1 run, Persu move to 21/1.');

    expect(first[0].key).toBe(refreshed[0].key);
  });

  it('keeps selected innings queues separate and never replays scorecard commentary as a live ball', () => {
    const onBall = vi.fn();
    const { result } = renderHook(() => useCricHeroesSyncAdapter(onBall));
    const sourceMatchId = `innings-queue-${Date.now()}`;
    const sendInnings = (inningsNumber: number, battingTeam: string, commentary: string) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'CRICHEROES_SYNC_ADAPTER',
          data: {
            sourceMatchId,
            inningsNumber,
            scorecardSelection: true,
            battingTeam,
            bowlingTeam: battingTeam === 'Team A' ? 'Team B' : 'Team A',
            runs: 12,
            wickets: 1,
            overs: 2,
            latestTextEvent: '1 run',
            fullCommentary: commentary,
            scorecards: [{
              inningsNumber,
              battingTeam,
              runs: 12,
              wickets: 1,
              overs: 2,
              extras: 1,
              extrasBreakdown: { wides: 1, noBalls: 0, byes: 0, legByes: 0 },
              yetToBat: 'Tailender',
              fallOfWickets: '12-1 (Batter, 2 ov)',
              statsComplete: true,
              batsmen: [],
              bowlers: [],
            }],
          },
        },
      }));
    };

    act(() => sendInnings(1, 'Team A', '0.1Bowler A to Batter A, 1 run.'));
    expect(result.current.commentaryHistory.map(delivery => delivery.over)).toEqual([0]);
    act(() => sendInnings(2, 'Team B', '0.1Bowler B to Batter B, 1 run.'));
    expect(result.current.commentaryHistory.map(delivery => delivery.bowler)).toEqual(['Bowler B']);
    expect(result.current.latest?.scorecards?.[0].battingTeam).toBe('Team B');
    expect(onBall).not.toHaveBeenCalled();
    expect(localStorage.getItem('cricheroes-commentary-queue:pkl_2026')).not.toBeNull();
    expect(localStorage.getItem('cricheroes-scorecards:pkl_2026')).not.toBeNull();
  });

  it('persists captured CricHeroes team rosters for admin mapping', () => {
    const { result } = renderHook(() => useCricHeroesSyncAdapter());

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'CRICHEROES_TEAM_ROSTER',
          data: {
            capturedAt: 1234,
            teams: [{
              teamId: 'team-roster-test',
              teamName: 'STRIKERS X1',
              profileUrl: '/team-profile/team-roster-test/strikers-x1/members',
              logoUrl: 'logo.png',
              players: [{
                playerId: 'player-roster-test',
                name: 'Nishad Udyawara',
                profileUrl: '/player-profile/player-roster-test/nishad/matches',
                imageUrl: 'player.png',
                badges: ['captain', 'playing-squad'],
              }],
            }],
          },
        },
      }));
    });

    expect(result.current.teamRosters[0]).toMatchObject({
      sourceTeamId: 'team-roster-test',
      teamName: 'STRIKERS X1',
      players: [{ sourcePlayerId: 'player-roster-test', name: 'Nishad Udyawara', badges: ['captain', 'playing-squad'] }],
    });
    expect(localStorage.getItem('cricheroes-team-rosters:pkl_2026')).not.toBeNull();
  });

  it('reports the extension bridge as ready and allows clearing logs', () => {
    const { result } = renderHook(() => useCricHeroesSyncAdapter(), { wrapper: StrictMode });

    expect(result.current.bridgeReady).toBe(false);
    expect(result.current.logs.filter(entry => entry.message.startsWith('App listener ready'))).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: 'CRICHEROES_SYNC_BRIDGE_READY', data: { version: '2.0' } },
      }));
    });

    expect(result.current.bridgeReady).toBe(true);
    expect(result.current.logs.some(entry => entry.message === 'Extension bridge connected v2.0.')).toBe(true);

    act(() => result.current.clearLogs());
    expect(result.current.logs).toHaveLength(0);
  });
});