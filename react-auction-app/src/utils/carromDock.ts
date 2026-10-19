// Pure helpers for the carrom OBS dock: which side a manually triggered celebration
// refers to, and the event payload the overlay renders for it.

import { currentCarromGame } from '../types/carrom';
import type { CarromLiveState, CarromMatchEvent, CarromOverlayType, CarromSide } from '../types/carrom';

export type CarromDockTrigger = Exclude<CarromOverlayType, 'none'>;

export const CARROM_DOCK_TRIGGERS: ReadonlyArray<{ type: CarromDockTrigger; label: string; icon: string }> = [
  { type: 'queen_covered', label: 'Queen covered', icon: '♛' },
  { type: 'board_won', label: 'Board won', icon: '🎯' },
  { type: 'game_won', label: 'Game won', icon: '🏅' },
  { type: 'match_won', label: 'Match won', icon: '🏆' },
  { type: 'foul', label: 'Foul', icon: '⚠️' },
];

function lastEvent(live: CarromLiveState | null, type: CarromDockTrigger): CarromMatchEvent | undefined {
  if (!live) return undefined;
  for (let index = live.events.length - 1; index >= 0; index -= 1) {
    if (live.events[index].type === type) return live.events[index];
  }
  return undefined;
}

function stateFallbackSide(trigger: CarromDockTrigger, live: CarromLiveState | null): CarromSide {
  if (!live) return 'A';
  switch (trigger) {
    case 'queen_covered':
      return live.board?.queenBy ?? 'A';
    case 'board_won': {
      const game = currentCarromGame(live) ?? live.games[live.games.length - 1];
      return game?.boards[game.boards.length - 1]?.winner ?? 'A';
    }
    case 'game_won': {
      const finished = [...live.games].reverse().find(game => game.winner);
      return finished?.winner ?? 'A';
    }
    case 'match_won':
      return live.matchWinner ?? (live.gamesWon.B > live.gamesWon.A ? 'B' : 'A');
    case 'foul':
      return live.board?.turn ?? 'A';
  }
}

/** Side of the most recent matching engine event, else a best guess from the live state. */
export function resolveDockSide(trigger: CarromDockTrigger, live: CarromLiveState | null): CarromSide {
  return lastEvent(live, trigger)?.side ?? stateFallbackSide(trigger, live);
}

function describe(trigger: CarromDockTrigger, live: CarromLiveState | null, side: CarromSide): string {
  const game = currentCarromGame(live);
  switch (trigger) {
    case 'queen_covered': return `Queen covered by side ${side}`;
    case 'board_won': return `Board won by side ${side}`;
    case 'game_won': {
      const finished = live ? [...live.games].reverse().find(candidate => candidate.winner) ?? game : null;
      return finished
        ? `Game ${finished.number} to side ${side} (${finished.score.A}–${finished.score.B})`
        : `Game won by side ${side}`;
    }
    case 'match_won': return `Match won by side ${side}${live ? ` (${live.gamesWon.A}–${live.gamesWon.B})` : ''}`;
    case 'foul': return `Foul — side ${side}`;
  }
}

/**
 * Reuses the real engine event (exact points / score text) when it belongs to the chosen
 * side; otherwise builds a synthetic event so an operator can still call the celebration.
 */
export function buildDockEvent(
  trigger: CarromDockTrigger, live: CarromLiveState | null, side: CarromSide, now = Date.now(),
): CarromMatchEvent {
  const recent = lastEvent(live, trigger);
  if (recent && recent.side === side) return { ...recent };
  return {
    id: `dock_${now}`,
    type: trigger,
    side,
    game: live?.currentGame ?? 0,
    board: live?.board?.number ?? 0,
    description: describe(trigger, live, side),
    at: now,
  };
}
