import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CARROM_RULES, EMPTY_STROKE, applyCarromStroke, awardCarromBoard, boardBreaker,
  computeCarromBoardPoints, failCarromBreakAttempt, gameFirstBreaker, normalizeCarromLive,
  normalizeCarromRules, startCarromMatch, startNextCarromGame,
  type CarromLiveState, type CarromStrokeInput,
} from '../types/carrom';
import { createDefaultCarromScoreboardLayout, createStarterLayout, getWidgetCatalog } from '../types/scorecardDesigner';
import { resolveWidgetKind } from '../utils/scorecardDataBinding';

const NOW = 1_700_000_000_000;
const stroke = (input: Partial<CarromStrokeInput>): CarromStrokeInput => ({ ...EMPTY_STROKE, ...input });

function withBoard(live: CarromLiveState, patch: Partial<NonNullable<CarromLiveState['board']>>): CarromLiveState {
  return { ...live, board: { ...live.board!, broken: true, ...patch } };
}

describe('carrom rules — board points', () => {
  it('scores opponent carrommen left plus queen while the winner is on 21 or less', () => {
    expect(computeCarromBoardPoints({ loserRemaining: 5, winnerScoreBefore: 10, queenToWinner: true })).toEqual({ points: 8, queenCredited: true });
    expect(computeCarromBoardPoints({ loserRemaining: 5, winnerScoreBefore: 21, queenToWinner: true })).toEqual({ points: 8, queenCredited: true });
  });

  it('drops the queen once the winner has 22 or more and caps at 12', () => {
    expect(computeCarromBoardPoints({ loserRemaining: 5, winnerScoreBefore: 22, queenToWinner: true })).toEqual({ points: 5, queenCredited: false });
    expect(computeCarromBoardPoints({ loserRemaining: 9, winnerScoreBefore: 0, queenToWinner: true }).points).toBe(12);
    expect(computeCarromBoardPoints({ loserRemaining: 0, winnerScoreBefore: 23, queenToWinner: true }).points).toBe(1);
  });
});

describe('carrom rules — breaks and colours', () => {
  it('alternates breaks per board and flips the first break in game 2', () => {
    expect(boardBreaker('A', 1)).toBe('A');
    expect(boardBreaker('A', 2)).toBe('B');
    expect(gameFirstBreaker('A', 1)).toBe('A');
    expect(gameFirstBreaker('A', 2)).toBe('B');
    expect(gameFirstBreaker('A', 3)).toBe('A');
  });

  it('passes the break after the configured missed attempts', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = failCarromBreakAttempt(live, DEFAULT_CARROM_RULES, NOW);
    live = failCarromBreakAttempt(live, DEFAULT_CARROM_RULES, NOW);
    expect(live.board?.turn).toBe('A');
    live = failCarromBreakAttempt(live, DEFAULT_CARROM_RULES, NOW);
    expect(live.board?.turn).toBe('B');
    expect(live.board?.broken).toBe(true);
  });
});

describe('carrom rules — strokes', () => {
  it('keeps the turn after pocketing an own carromman and passes it on a miss', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = applyCarromStroke(live, stroke({ ownPocketed: 2 }), DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.remaining.A).toBe(7);
    expect(live.board?.turn).toBe('A');
    live = applyCarromStroke(live, EMPTY_STROKE, DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.turn).toBe('B');
  });

  it('returns the queen when it is not covered on the next stroke', () => {
    let live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 8, B: 9 } });
    live = applyCarromStroke(live, stroke({ queenPocketed: true }), DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.queen).toBe('pending_cover');
    expect(live.board?.turn).toBe('A');
    live = applyCarromStroke(live, EMPTY_STROKE, DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.queen).toBe('on_board');
    expect(live.board?.turn).toBe('B');
  });

  it('covers the queen and celebrates', () => {
    let live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 8, B: 9 } });
    live = applyCarromStroke(live, stroke({ queenPocketed: true }), DEFAULT_CARROM_RULES, NOW).live;
    const outcome = applyCarromStroke(live, stroke({ ownPocketed: 1 }), DEFAULT_CARROM_RULES, NOW);
    expect(outcome.live.board?.queen).toBe('covered');
    expect(outcome.live.board?.queenBy).toBe('A');
    expect(outcome.celebration).toBe('queen_covered');
  });

  it('does not allow the queen before the first own carromman', () => {
    const live = startCarromMatch('m1', 'A', NOW);
    const next = applyCarromStroke(live, stroke({ queenPocketed: true }), DEFAULT_CARROM_RULES, NOW).live;
    expect(next.board?.queen).toBe('on_board');
  });

  it('holds a due as pending until an own carromman is pocketed', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = applyCarromStroke(live, stroke({ strikerPocketed: true }), DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.pendingDues.A).toBe(1);
    expect(live.board?.turn).toBe('B');
    live = withBoard(live, { turn: 'A' });
    live = applyCarromStroke(live, stroke({ ownPocketed: 1 }), DEFAULT_CARROM_RULES, NOW).live;
    expect(live.board?.pendingDues.A).toBe(0);
    expect(live.board?.remaining.A).toBe(9);
  });

  it('returns a penalty carromman and passes the turn on a foul', () => {
    let live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 5, B: 9 } });
    const outcome = applyCarromStroke(live, stroke({ foul: true, ownPocketed: 1 }), DEFAULT_CARROM_RULES, NOW);
    live = outcome.live;
    expect(live.board?.remaining.A).toBe(6);
    expect(live.board?.turn).toBe('B');
    expect(outcome.celebration).toBe('foul');
  });

  it('awards the board to the clearer with opponent carrommen and the queen', () => {
    const live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 1, B: 4 }, queen: 'covered', queenBy: 'A' });
    const outcome = applyCarromStroke(live, stroke({ ownPocketed: 1 }), DEFAULT_CARROM_RULES, NOW);
    expect(outcome.boardResult).toMatchObject({ winner: 'A', points: 7, queenCredited: true });
    expect(outcome.live.games[0].score).toEqual({ A: 7, B: 0 });
    expect(outcome.live.board?.number).toBe(2);
    expect(outcome.live.board?.breaker).toBe('B');
  });

  it('loses the board when the last own carromman goes before the queen is covered', () => {
    const live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 1, B: 6 }, queen: 'on_board' });
    const outcome = applyCarromStroke(live, stroke({ ownPocketed: 1 }), DEFAULT_CARROM_RULES, NOW);
    expect(outcome.boardResult).toMatchObject({ winner: 'B', points: 3 });
  });

  it('loses the board when pocketing the opponent last carromman', () => {
    const live = withBoard(startCarromMatch('m1', 'A', NOW), { remaining: { A: 4, B: 1 }, queen: 'covered', queenBy: 'B' });
    const outcome = applyCarromStroke(live, stroke({ opponentPocketed: 1 }), DEFAULT_CARROM_RULES, NOW);
    expect(outcome.boardResult).toMatchObject({ winner: 'B', points: 7 });
  });
});

describe('carrom rules — game and match flow', () => {
  it('wins a game at 25, then a best-of-3 match', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = awardCarromBoard(live, 'A', 9, true, DEFAULT_CARROM_RULES, NOW).live; // 12
    live = awardCarromBoard(live, 'A', 9, true, DEFAULT_CARROM_RULES, NOW).live; // 24
    const gameOutcome = awardCarromBoard(live, 'A', 2, false, DEFAULT_CARROM_RULES, NOW);
    live = gameOutcome.live;
    expect(gameOutcome.celebration).toBe('game_won');
    expect(live.phase).toBe('game_break');
    expect(live.gamesWon).toEqual({ A: 1, B: 0 });

    live = startNextCarromGame(live, NOW);
    expect(live.currentGame).toBe(2);
    expect(live.board?.breaker).toBe('B');
    live = awardCarromBoard(live, 'A', 9, true, DEFAULT_CARROM_RULES, NOW).live;
    live = awardCarromBoard(live, 'A', 9, true, DEFAULT_CARROM_RULES, NOW).live;
    const matchOutcome = awardCarromBoard(live, 'A', 5, false, DEFAULT_CARROM_RULES, NOW);
    expect(matchOutcome.celebration).toBe('match_won');
    expect(matchOutcome.live.phase).toBe('completed');
    expect(matchOutcome.live.matchWinner).toBe('A');
  });

  it('decides on the leader after the last board and plays an extra board on a tie', () => {
    const rules = { ...DEFAULT_CARROM_RULES, boardsPerGame: 2 };
    let live = startCarromMatch('m1', 'A', NOW);
    live = awardCarromBoard(live, 'A', 3, false, rules, NOW).live;
    live = awardCarromBoard(live, 'B', 3, false, rules, NOW).live;
    expect(live.phase).toBe('in_progress');
    expect(live.board?.number).toBe(3);
    live = awardCarromBoard(live, 'B', 1, false, rules, NOW).live;
    expect(live.phase).toBe('game_break');
    expect(live.games[0].winner).toBe('B');
  });
});

describe('carrom normalisation', () => {
  it('restores arrays and side maps dropped by RTDB', () => {
    const live = normalizeCarromLive({ phase: 'in_progress', currentGame: 1, games: { 0: { number: 1, firstBreaker: 'A', score: { A: 3 } } } as never }, 'm1');
    expect(live.games[0].score).toEqual({ A: 3, B: 0 });
    expect(live.games[0].boards).toEqual([]);
    expect(live.events).toEqual([]);
  });

  it('sanitises rules', () => {
    expect(normalizeCarromRules({ pointsToWinGame: -1, format: 'doubles' })).toMatchObject({ pointsToWinGame: 25, format: 'doubles' });
  });
});

describe('carrom scorecard designer', () => {
  it('exposes carrom widgets and ships a default walnut & gold scoreboard', () => {
    const kinds = getWidgetCatalog('carrom', 'scoreboard').map(entry => entry.kind);
    expect(kinds).toEqual(expect.arrayContaining(['carrom_board_score', 'carrom_team_a_coins', 'carrom_queen_status']));
    const layout = createDefaultCarromScoreboardLayout();
    expect(layout.sport).toBe('carrom');
    expect(layout.widgets.length).toBeGreaterThan(10);
    expect(new Set(layout.widgets.map(widget => widget.id)).size).toBe(layout.widgets.length);
    expect(layout.widgets.every(widget => kinds.includes(widget.kind))).toBe(true);
    expect(createStarterLayout('carrom', 'scoreboard').widgets.length).toBe(layout.widgets.length);
    expect(createStarterLayout('cricket', 'scoreboard').widgets).toHaveLength(0);
  });

  it('binds live carrom data to widgets', () => {
    let live = startCarromMatch('m1', 'A', NOW);
    live = awardCarromBoard(live, 'B', 4, true, DEFAULT_CARROM_RULES, NOW).live;
    const match = {
      id: 'm1', teamA: { id: 'a', name: 'Alpha', shortName: 'ALP' }, teamB: { id: 'b', name: 'Bravo', shortName: 'BRV' },
      date: '', status: 'live' as const, createdAt: NOW, updatedAt: NOW,
    };
    const ctx = { sport: 'carrom' as const, match, live, rules: DEFAULT_CARROM_RULES };
    expect(resolveWidgetKind('carrom_board_score', ctx).text).toBe('0 - 7');
    expect(resolveWidgetKind('team_b_score', ctx).text).toBe('7');
    expect(resolveWidgetKind('carrom_board_label', ctx).text).toBe('Board 2/8');
    expect(resolveWidgetKind('carrom_last_board', ctx).text).toContain('BRV +7');
    expect(resolveWidgetKind('carrom_team_a_coins', ctx).text).toContain('9 black');
    expect(resolveWidgetKind('carrom_queen_flag', ctx).hidden).toBe(true);
    expect(resolveWidgetKind('carrom_queen_flag', { ...ctx, overlay: { activeOverlay: 'queen_covered', lastUpdated: NOW } }).text).toContain('QUEEN');
  });
});
