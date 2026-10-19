import { computeMatchMinute, FOOTBALL_HALF_LABELS } from '../types/football';
import type { FootballLiveState, FootballMatchSetup, FootballOverlayConfig } from '../types/football';
import { computeKabaddiClock, KABADDI_HALF_LABELS, raidSecondsRemaining } from '../types/kabaddi';
import type { KabaddiLiveState, KabaddiMatchSetup, KabaddiOverlayConfig, KabaddiRulesConfig } from '../types/kabaddi';
import {
  CARROM_PHASE_LABELS, carromStrokeSecondsRemaining, coinColorFor, currentCarromGame,
} from '../types/carrom';
import type { CarromLiveState, CarromMatchSetup, CarromOverlayConfig, CarromOverlayControl, CarromRulesConfig } from '../types/carrom';

export type TeamBroadcastState =
  | { sport: 'football'; match: FootballMatchSetup | null; live: FootballLiveState | null; config: FootballOverlayConfig }
  | { sport: 'kabaddi'; match: KabaddiMatchSetup | null; live: KabaddiLiveState | null; config: KabaddiOverlayConfig; rules: KabaddiRulesConfig }
  | { sport: 'carrom'; match: CarromMatchSetup | null; live: CarromLiveState | null; config: CarromOverlayConfig; rules: CarromRulesConfig; overlay?: CarromOverlayControl | null };

export interface TeamScoreboardSide {
  name: string;
  shortName?: string;
  logoUrl?: string;
}

export interface TeamScoreboard {
  home: TeamScoreboardSide;
  away: TeamScoreboardSide;
  homeScore: number;
  awayScore: number;
  clock: string;
  phase: string;
  details: string;
  /** Shown on the detail line when there is nothing more specific to say. */
  caption: string;
  isLive: boolean;
  showClock: boolean;
  showLiveBadge: boolean;
  colors: { primary: string; secondary: string; accent: string; text: string };
}

function carromScoreboard(state: Extract<TeamBroadcastState, { sport: 'carrom' }>): TeamScoreboard | null {
  const { match, live, config, rules } = state;
  if (!match || !live) return null;
  const game = currentCarromGame(live);
  const board = live.board;
  const secs = carromStrokeSecondsRemaining(live, rules);
  let stage: string = CARROM_PHASE_LABELS.not_started;
  if (live.phase === 'completed') stage = CARROM_PHASE_LABELS.completed;
  else if (live.phase === 'game_break') stage = `End of game ${live.currentGame}`;
  else if (live.currentGame) stage = `Game ${live.currentGame} · ${board && board.number > rules.boardsPerGame ? 'Extra board' : `Board ${board?.number ?? 1}`}`;

  const details: string[] = [`Games ${live.gamesWon.A}–${live.gamesWon.B}`];
  if (board && live.phase === 'in_progress') {
    if (board.queen === 'covered') details.push(`Queen ${(board.queenBy === 'B' ? match.teamB : match.teamA).shortName}`);
    else details.push(board.queen === 'pending_cover' ? 'Queen · cover pending' : 'Queen on board');
    if (config.showCoinTracker) {
      const label = (side: 'A' | 'B') => `${coinColorFor(board, side) === 'white' ? 'W' : 'B'} ${board.remaining[side]}`;
      details.push(`Coins ${label('A')} · ${label('B')}`);
    }
  }
  const side = (team: CarromMatchSetup['teamA']): TeamScoreboardSide => ({
    name: team.name, shortName: team.shortName, logoUrl: team.logoUrl || team.photoUrl,
  });
  return {
    home: side(match.teamA),
    away: side(match.teamB),
    homeScore: game?.score.A ?? 0,
    awayScore: game?.score.B ?? 0,
    clock: secs === null ? '' : `${secs}s`,
    phase: stage,
    details: details.join(' | '),
    caption: config.tournamentName || match.stage || '',
    isLive: live.phase === 'in_progress',
    showClock: secs !== null,
    showLiveBadge: config.showLiveBadge,
    colors: { primary: config.primaryColor, secondary: config.secondaryColor, accent: config.accentColor, text: config.textColor },
  };
}

export function teamScoreboard(state: TeamBroadcastState): TeamScoreboard | null {
  if (state.sport === 'carrom') return carromScoreboard(state);
  if (!state.match || !state.live) return null;
  const clock = state.sport === 'football' ? computeMatchMinute(state.live) : computeKabaddiClock(state.live);
  const phase = state.sport === 'football' ? FOOTBALL_HALF_LABELS[state.live.half] : KABADDI_HALF_LABELS[state.live.half];
  const details: string[] = [];
  if (state.sport === 'kabaddi') {
    if (state.config.showMatDiagram) details.push(`On mat ${state.live.teamA.playersOnCourt} - ${state.live.teamB.playersOnCourt}`);
    if (state.live.raidClockStartedAt) {
      if (state.live.raiderName) details.push(state.live.raiderName);
      if (state.config.showRaidClock) details.push(`Raid ${raidSecondsRemaining(state.live, state.rules)}s`);
      if (state.live.isDoOrDie) details.push('DO OR DIE');
    }
  } else {
    if (state.live.addedTimeMin) details.push(`+${state.live.addedTimeMin} min`);
    if (state.live.half === 'penalties') details.push(`Penalties ${state.live.homePenalties ?? 0} - ${state.live.awayPenalties ?? 0}`);
  }
  const { config } = state;
  return {
    home: state.match.teamA,
    away: state.match.teamB,
    homeScore: state.sport === 'football' ? state.live.homeScore : state.live.teamA.score,
    awayScore: state.sport === 'football' ? state.live.awayScore : state.live.teamB.score,
    clock: `${String(clock.minute).padStart(2, '0')}:${String(clock.second).padStart(2, '0')}`,
    phase,
    details: details.join(' | '),
    caption: config.tournamentName || state.match.competition || '',
    isLive: state.match.status === 'live' && state.live.half !== 'not_started' && state.live.half !== 'full_time',
    showClock: config.showTimer,
    showLiveBadge: config.showLiveBadge,
    colors: { primary: config.primaryColor, secondary: config.secondaryColor, accent: config.accentColor, text: config.textColor },
  };
}