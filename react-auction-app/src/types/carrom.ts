// ============================================================================
// CARROM SCORING MODULE — TYPES + PURE RULES ENGINE
// Implements the International Carrom Federation (ICF / AICF) laws used for
// tournament play:
//   • Each board is won by the player/pair who pockets all of their own
//     carrommen first. The winner scores one point for every opponent
//     carromman still on the board, plus the Queen (3) when they covered it
//     and their game score is still ≤ 21. Max 12 points per board.
//   • A game is played to 25 points or 8 boards (leader after board 8 wins;
//     an extra board breaks a tie). A match is best of 3 games.
//   • Breaks alternate every board; the breaker plays white. Game 2 is broken
//     by the other side, game 3 by the original first breaker.
//   • Queen may only be pocketed after an own carromman and must be covered in
//     the same or the next stroke, otherwise it returns to the centre.
//   • Dues / penalties return one own carromman (pending if none pocketed).
// Every function here is pure so the scorer, the OBS overlay and the unit
// tests all share the exact same rules implementation.
// ============================================================================

export type CarromSide = 'A' | 'B';
export type CarromFormat = 'singles' | 'doubles';
export type CarromCoinColor = 'white' | 'black';
export type CarromQueenState = 'on_board' | 'pending_cover' | 'covered';

export const CARROMMEN_PER_SIDE = 9;

// ── Rules (configured from Platform Admin, mirrored to tenants/{id}/carrom/rules) ──

export interface CarromRulesConfig {
  format: CarromFormat;
  pointsToWinGame: number;     // 25
  boardsPerGame: number;       // 8
  gamesPerMatch: number;       // best of 3
  queenPoints: number;         // 3
  /** The queen only counts while the board winner's game score is ≤ this value. */
  queenCutoffScore: number;    // 21
  maxBoardPoints: number;      // 12
  strokeTimeSec: number;       // 15 seconds per stroke
  breakAttempts: number;       // 3 attempts to break
  extraBoardOnTie: boolean;    // play an extra board when tied after the last board
  notes?: string;
}

export const CARROM_FORMATS: { value: CarromFormat; label: string }[] = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
];

export const DEFAULT_CARROM_RULES: CarromRulesConfig = {
  format: 'singles',
  pointsToWinGame: 25,
  boardsPerGame: 8,
  gamesPerMatch: 3,
  queenPoints: 3,
  queenCutoffScore: 21,
  maxBoardPoints: 12,
  strokeTimeSec: 15,
  breakAttempts: 3,
  extraBoardOnTie: true,
};

export const CARROM_FORMAT_PRESETS: Record<CarromFormat, CarromRulesConfig> = {
  singles: { ...DEFAULT_CARROM_RULES, format: 'singles' },
  doubles: { ...DEFAULT_CARROM_RULES, format: 'doubles' },
};

export function normalizeCarromRules(raw?: Partial<CarromRulesConfig> | null): CarromRulesConfig {
  const merged = { ...DEFAULT_CARROM_RULES, ...(raw ?? {}) };
  const positive = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    ...merged,
    format: merged.format === 'doubles' ? 'doubles' : 'singles',
    pointsToWinGame: positive(merged.pointsToWinGame, DEFAULT_CARROM_RULES.pointsToWinGame),
    boardsPerGame: positive(merged.boardsPerGame, DEFAULT_CARROM_RULES.boardsPerGame),
    gamesPerMatch: positive(merged.gamesPerMatch, DEFAULT_CARROM_RULES.gamesPerMatch),
    queenPoints: positive(merged.queenPoints, DEFAULT_CARROM_RULES.queenPoints),
    queenCutoffScore: positive(merged.queenCutoffScore, DEFAULT_CARROM_RULES.queenCutoffScore),
    maxBoardPoints: positive(merged.maxBoardPoints, DEFAULT_CARROM_RULES.maxBoardPoints),
    strokeTimeSec: positive(merged.strokeTimeSec, DEFAULT_CARROM_RULES.strokeTimeSec),
    breakAttempts: positive(merged.breakAttempts, DEFAULT_CARROM_RULES.breakAttempts),
    extraBoardOnTie: merged.extraBoardOnTie !== false,
  };
}

// ── Entries (a singles player or a doubles pair) ──

export interface CarromTeam {
  id: string;
  name: string;
  shortName: string;
  /** One name for singles, two for doubles. */
  members: string[];
  club?: string;
  logoUrl?: string;
  photoUrl?: string;
  primaryColor?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CarromTeamRef {
  id: string;
  name: string;
  shortName: string;
  members?: string[];
  logoUrl?: string;
  photoUrl?: string;
  primaryColor?: string;
}

export type CarromMatchStatus = 'scheduled' | 'live' | 'completed' | 'abandoned';

export const CARROM_STAGES = ['League', 'Pre-Quarterfinal', 'Quarterfinal', 'Semifinal', 'Final'] as const;

export interface CarromMatchSetup {
  id: string;
  teamA: CarromTeamRef;
  teamB: CarromTeamRef;
  venue?: string;
  boardNumber?: string;
  stage?: string;
  date: string;
  scheduledAt?: number;
  status: CarromMatchStatus;
  /** Toss winner who takes the first break of game 1. */
  firstBreaker?: CarromSide;
  winner?: CarromSide;
  resultSummary?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Live state ──

export interface CarromBoardState {
  number: number;
  breaker: CarromSide;
  turn: CarromSide;
  /** Own carrommen still on the board for each side. */
  remaining: Record<CarromSide, number>;
  /** Dues/penalties owed but not yet returnable (no own carromman pocketed). */
  pendingDues: Record<CarromSide, number>;
  queen: CarromQueenState;
  queenBy?: CarromSide;
  strokes: number;
  breakAttemptsUsed: number;
  broken: boolean;
  strokeStartedAt: number;
}

export interface CarromBoardResult {
  game: number;
  board: number;
  winner: CarromSide;
  points: number;
  queenCredited: boolean;
  breaker: CarromSide;
  reason: string;
  at: number;
}

export interface CarromGameState {
  number: number;
  firstBreaker: CarromSide;
  score: Record<CarromSide, number>;
  boards: CarromBoardResult[];
  winner?: CarromSide;
}

export type CarromEventType =
  | 'match_start' | 'stroke' | 'queen_covered' | 'queen_returned' | 'due' | 'foul'
  | 'board_won' | 'game_won' | 'match_won' | 'break_passed' | 'manual';

export interface CarromMatchEvent {
  id: string;
  type: CarromEventType;
  side?: CarromSide;
  game: number;
  board: number;
  points?: number;
  description: string;
  at: number;
}

export type CarromMatchPhase = 'not_started' | 'in_progress' | 'game_break' | 'completed';

export interface CarromLiveState {
  matchId: string;
  phase: CarromMatchPhase;
  firstBreaker: CarromSide;
  currentGame: number;
  games: CarromGameState[];
  gamesWon: Record<CarromSide, number>;
  board: CarromBoardState | null;
  matchWinner?: CarromSide;
  events: CarromMatchEvent[];
  lastUpdated: number;
}

// ── Overlay ──

export type CarromOverlayType = 'none' | 'queen_covered' | 'board_won' | 'game_won' | 'match_won' | 'foul';

export interface CarromOverlayControl {
  activeOverlay: CarromOverlayType;
  activeEvent?: CarromMatchEvent;
  lastUpdated: number;
}

export interface CarromOverlayConfig {
  tournamentName?: string;
  tournamentLogo?: string;
  broadcastPartnerLogo?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  showLiveBadge: boolean;
  showCoinTracker: boolean;
  showBoardHistory: boolean;
  scoreboardPosition: 'bottom-center' | 'top-center' | 'bottom-left';
  enableCelebrations: boolean;
  celebrationDurationMs: number;
  singleOverlayMode?: boolean;
}

export const DEFAULT_CARROM_OVERLAY_CONFIG: CarromOverlayConfig = {
  primaryColor: '#1c120b',
  secondaryColor: '#7c2d12',
  accentColor: '#f5c26b',
  textColor: '#fff7ed',
  showLiveBadge: true,
  showCoinTracker: true,
  showBoardHistory: true,
  scoreboardPosition: 'bottom-center',
  enableCelebrations: true,
  celebrationDurationMs: 4500,
};

// ── Stroke input ──

export interface CarromStrokeInput {
  /** Striker's own carrommen pocketed in this stroke. */
  ownPocketed: number;
  /** Opponent's carrommen pocketed in this stroke. */
  opponentPocketed: number;
  queenPocketed: boolean;
  /** Striker went into a pocket (due). */
  strikerPocketed: boolean;
  /** Improper stroke / foul — penalty and loss of turn. */
  foul: boolean;
  /** Technical foul before the first stroke — penalty, turn continues. */
  technicalFoul?: boolean;
}

export const EMPTY_STROKE: CarromStrokeInput = {
  ownPocketed: 0, opponentPocketed: 0, queenPocketed: false, strikerPocketed: false, foul: false, technicalFoul: false,
};

export interface CarromStrokeOutcome {
  live: CarromLiveState;
  events: CarromMatchEvent[];
  celebration: CarromOverlayType | null;
  boardResult: CarromBoardResult | null;
}

// ── Helpers ──

export const otherSide = (side: CarromSide): CarromSide => (side === 'A' ? 'B' : 'A');

export function coinColorFor(board: Pick<CarromBoardState, 'breaker'>, side: CarromSide): CarromCoinColor {
  return board.breaker === side ? 'white' : 'black';
}

export function gamesNeededToWin(rules: CarromRulesConfig): number {
  return Math.floor(Math.max(1, rules.gamesPerMatch) / 2) + 1;
}

/** Game 1 → first breaker, game 2 → other side, game 3 → first breaker again. */
export function gameFirstBreaker(firstBreaker: CarromSide, gameNumber: number): CarromSide {
  return gameNumber % 2 === 1 ? firstBreaker : otherSide(firstBreaker);
}

/** Breaks alternate every board within a game. */
export function boardBreaker(gameFirst: CarromSide, boardNumber: number): CarromSide {
  return boardNumber % 2 === 1 ? gameFirst : otherSide(gameFirst);
}

export function createCarromBoard(number: number, breaker: CarromSide, now = Date.now()): CarromBoardState {
  return {
    number,
    breaker,
    turn: breaker,
    remaining: { A: CARROMMEN_PER_SIDE, B: CARROMMEN_PER_SIDE },
    pendingDues: { A: 0, B: 0 },
    queen: 'on_board',
    strokes: 0,
    breakAttemptsUsed: 0,
    broken: false,
    strokeStartedAt: now,
  };
}

export function createCarromGame(number: number, firstBreaker: CarromSide): CarromGameState {
  return { number, firstBreaker, score: { A: 0, B: 0 }, boards: [] };
}

export function createEmptyCarromLiveState(matchId: string, firstBreaker: CarromSide = 'A'): CarromLiveState {
  return {
    matchId,
    phase: 'not_started',
    firstBreaker,
    currentGame: 0,
    games: [],
    gamesWon: { A: 0, B: 0 },
    board: null,
    events: [],
    lastUpdated: Date.now(),
  };
}

/** RTDB drops empty arrays/objects and may return arrays as objects — restore the full shape. */
export function normalizeCarromLive(raw: Partial<CarromLiveState> | null | undefined, matchId: string): CarromLiveState {
  const base = createEmptyCarromLiveState(matchId, raw?.firstBreaker === 'B' ? 'B' : 'A');
  if (!raw) return base;
  const sides = (value: Partial<Record<CarromSide, number>> | undefined, fallback: number): Record<CarromSide, number> => ({
    A: Number.isFinite(Number(value?.A)) ? Number(value?.A) : fallback,
    B: Number.isFinite(Number(value?.B)) ? Number(value?.B) : fallback,
  });
  const list = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value.filter(Boolean) as T[];
    if (value && typeof value === 'object') return Object.values(value as Record<string, T>).filter(Boolean);
    return [];
  };
  const games = list<CarromGameState>(raw.games).map(game => ({
    ...game,
    score: sides(game.score, 0),
    boards: list<CarromBoardResult>(game.boards),
  }));
  const board = raw.board ? {
    ...createCarromBoard(raw.board.number ?? 1, raw.board.breaker ?? 'A', raw.board.strokeStartedAt),
    ...raw.board,
    remaining: sides(raw.board.remaining, CARROMMEN_PER_SIDE),
    pendingDues: sides(raw.board.pendingDues, 0),
  } : null;
  return {
    ...base,
    ...raw,
    matchId,
    games,
    gamesWon: sides(raw.gamesWon, 0),
    board,
    events: list<CarromMatchEvent>(raw.events),
  };
}

export function currentCarromGame(live: CarromLiveState | null | undefined): CarromGameState | null {
  if (!live || !live.currentGame) return null;
  return live.games.find(game => game.number === live.currentGame) ?? null;
}

/**
 * Points for a board: opponent carrommen remaining + queen (if credited),
 * capped at the per-board maximum and never below 1.
 */
export function computeCarromBoardPoints(input: {
  loserRemaining: number;
  winnerScoreBefore: number;
  queenToWinner: boolean;
  rules?: CarromRulesConfig;
}): { points: number; queenCredited: boolean } {
  const rules = input.rules ?? DEFAULT_CARROM_RULES;
  const queenCredited = input.queenToWinner && input.winnerScoreBefore <= rules.queenCutoffScore;
  const raw = Math.max(0, input.loserRemaining) + (queenCredited ? rules.queenPoints : 0);
  return { points: Math.max(1, Math.min(rules.maxBoardPoints, raw)), queenCredited };
}

let eventCounter = 0;
function makeEvent(live: CarromLiveState, type: CarromEventType, description: string, side?: CarromSide, points?: number, now = Date.now()): CarromMatchEvent {
  eventCounter = (eventCounter + 1) % 1_000_000;
  return {
    id: `ce_${now}_${eventCounter}`,
    type,
    side,
    game: live.currentGame,
    board: live.board?.number ?? 0,
    points,
    description,
    at: now,
  };
}

function withEvents(live: CarromLiveState, events: CarromMatchEvent[]): CarromLiveState {
  return { ...live, events: [...live.events, ...events].slice(-80) };
}

/** Starts a fresh match: game 1, board 1, first breaker plays white. */
export function startCarromMatch(matchId: string, firstBreaker: CarromSide, now = Date.now()): CarromLiveState {
  const live = createEmptyCarromLiveState(matchId, firstBreaker);
  const game = createCarromGame(1, firstBreaker);
  const started: CarromLiveState = {
    ...live,
    phase: 'in_progress',
    currentGame: 1,
    games: [game],
    board: createCarromBoard(1, firstBreaker, now),
    lastUpdated: now,
  };
  return withEvents(started, [makeEvent(started, 'match_start', `Match started — side ${firstBreaker} breaks (white)`, firstBreaker, undefined, now)]);
}

/** Returns penalty carrommen to the board (or records them as pending dues). */
function returnPenaltyCoins(board: CarromBoardState, side: CarromSide, count: number): CarromBoardState {
  if (count <= 0) return board;
  const pocketed = CARROMMEN_PER_SIDE - board.remaining[side];
  const returnable = Math.min(count, Math.max(0, pocketed));
  return {
    ...board,
    remaining: { ...board.remaining, [side]: board.remaining[side] + returnable },
    pendingDues: { ...board.pendingDues, [side]: board.pendingDues[side] + (count - returnable) },
  };
}

/** Pending dues are settled as soon as the player has pocketed carrommen available to return. */
function settlePendingDues(board: CarromBoardState, side: CarromSide): CarromBoardState {
  const owed = board.pendingDues[side];
  if (owed <= 0) return board;
  const pocketed = CARROMMEN_PER_SIDE - board.remaining[side];
  const settle = Math.min(owed, pocketed);
  if (settle <= 0) return board;
  return {
    ...board,
    remaining: { ...board.remaining, [side]: board.remaining[side] + settle },
    pendingDues: { ...board.pendingDues, [side]: owed - settle },
  };
}

/**
 * Applies one stroke by the side whose turn it is and resolves queen cover,
 * dues, fouls, turn continuation and board/game/match completion.
 */
export function applyCarromStroke(
  live: CarromLiveState,
  input: CarromStrokeInput,
  rules: CarromRulesConfig = DEFAULT_CARROM_RULES,
  now = Date.now(),
): CarromStrokeOutcome {
  if (live.phase !== 'in_progress' || !live.board) {
    return { live, events: [], celebration: null, boardResult: null };
  }
  const striker = live.board.turn;
  const opponent = otherSide(striker);
  const events: CarromMatchEvent[] = [];
  let celebration: CarromOverlayType | null = null;
  let board: CarromBoardState = { ...live.board, remaining: { ...live.board.remaining }, pendingDues: { ...live.board.pendingDues } };

  const own = Math.max(0, Math.min(Math.floor(input.ownPocketed) || 0, board.remaining[striker]));
  const opp = Math.max(0, Math.min(Math.floor(input.opponentPocketed) || 0, board.remaining[opponent]));
  const improper = !!input.foul;
  const technical = !!input.technicalFoul && !improper;
  const queenWasPendingForStriker = board.queen === 'pending_cover' && board.queenBy === striker;
  const ownPocketedBefore = CARROMMEN_PER_SIDE - board.remaining[striker];

  // Opponent carrommen pocketed always stay down.
  board.remaining[opponent] -= opp;

  // Own carrommen count unless the stroke is improper or the striker went down
  // (in both cases the pocketed carrommen come back with the penalty).
  const ownCounts = !improper && !input.strikerPocketed;
  if (ownCounts) board.remaining[striker] -= own;

  // ── Queen ──
  let queenEvent: CarromMatchEvent | null = null;
  if (input.queenPocketed && board.queen === 'on_board') {
    const eligible = ownPocketedBefore > 0 || (ownCounts && own > 0);
    if (!eligible || improper || input.strikerPocketed) {
      queenEvent = makeEvent({ ...live, board }, 'queen_returned', 'Queen returned to centre', striker, undefined, now);
    } else if (own > 0) {
      board = { ...board, queen: 'covered', queenBy: striker };
      queenEvent = makeEvent({ ...live, board }, 'queen_covered', `Queen pocketed & covered by side ${striker}`, striker, undefined, now);
      celebration = 'queen_covered';
    } else {
      board = { ...board, queen: 'pending_cover', queenBy: striker };
    }
  } else if (queenWasPendingForStriker) {
    if (ownCounts && own > 0) {
      board = { ...board, queen: 'covered', queenBy: striker };
      queenEvent = makeEvent({ ...live, board }, 'queen_covered', `Queen covered by side ${striker}`, striker, undefined, now);
      celebration = 'queen_covered';
    } else {
      board = { ...board, queen: 'on_board', queenBy: undefined };
      queenEvent = makeEvent({ ...live, board }, 'queen_returned', 'Queen not covered — returned to centre', striker, undefined, now);
    }
  }
  if (queenEvent) events.push(queenEvent);

  // ── Penalties ──
  let penalty = 0;
  if (input.strikerPocketed) penalty += 1;
  if (improper || technical) penalty += 1;
  // Own carrommen pocketed in a striker/foul stroke are taken out and replaced.
  const returnedOwn = ownCounts ? 0 : own;
  if (ownCounts && own > 0) board = settlePendingDues(board, striker);
  if (penalty > 0) {
    board = returnPenaltyCoins(board, striker, penalty);
    const label = improper ? (input.strikerPocketed ? 'Due + foul' : 'Foul') : technical ? 'Technical foul' : 'Due';
    events.push(makeEvent({ ...live, board }, improper || technical ? 'foul' : 'due', `${label} — side ${striker} returns ${penalty} carromman${penalty > 1 ? 'men' : ''}${returnedOwn ? ` (+${returnedOwn} pocketed returned)` : ''}`, striker, undefined, now));
    if (improper) celebration = celebration ?? 'foul';
  }

  // ── Turn continuation ──
  const pocketedSomethingValid = ownCounts && (own > 0 || (input.queenPocketed && board.queen === 'pending_cover'));
  const continuesTurn = technical
    || (!improper && input.strikerPocketed && own > 0)
    || (!improper && !input.strikerPocketed && pocketedSomethingValid);

  board.strokes += 1;
  board.strokeStartedAt = now;
  board.broken = true;

  if (events.length === 0) {
    const parts = [
      own ? `${own} own` : '',
      opp ? `${opp} opponent` : '',
      input.queenPocketed ? 'queen' : '',
    ].filter(Boolean);
    events.push(makeEvent({ ...live, board }, 'stroke', parts.length ? `Side ${striker} pocketed ${parts.join(', ')}` : `Side ${striker} — no pocket`, striker, undefined, now));
  }

  // ── Board completion ──
  const strikerCleared = board.remaining[striker] === 0;
  const opponentCleared = board.remaining[opponent] === 0;
  const game = currentCarromGame(live);
  if ((strikerCleared || opponentCleared) && game) {
    let winner: CarromSide;
    let loserRemaining: number;
    let queenToWinner: boolean;
    let reason: string;
    if (opponentCleared) {
      // Pocketing the opponent's last carromman loses the board.
      winner = opponent;
      loserRemaining = board.remaining[striker];
      queenToWinner = !(board.queen === 'covered' && board.queenBy === striker);
      reason = `Side ${striker} pocketed the opponent's last carromman`;
    } else if (board.queen !== 'covered') {
      // Last own carromman pocketed while the queen is still in play loses the board.
      winner = opponent;
      loserRemaining = 0;
      queenToWinner = true;
      reason = `Side ${striker} pocketed the last carromman before the queen was covered`;
    } else {
      winner = striker;
      loserRemaining = board.remaining[opponent];
      queenToWinner = board.queenBy === striker;
      reason = `Side ${striker} cleared all carrommen`;
    }
    const { points, queenCredited } = computeCarromBoardPoints({
      loserRemaining,
      winnerScoreBefore: game.score[winner],
      queenToWinner,
      rules,
    });
    return finishBoard({ ...live, board }, winner, points, queenCredited, reason, rules, events, now);
  }

  if (!continuesTurn) board.turn = opponent;

  const next = withEvents({ ...live, board, lastUpdated: now }, events);
  return { live: next, events, celebration, boardResult: null };
}

/**
 * Records a failed break attempt (striker did not disturb the carrommen).
 * After the configured number of attempts the break passes to the opponent.
 */
export function failCarromBreakAttempt(live: CarromLiveState, rules: CarromRulesConfig = DEFAULT_CARROM_RULES, now = Date.now()): CarromLiveState {
  if (live.phase !== 'in_progress' || !live.board || live.board.broken) return live;
  const striker = live.board.turn;
  const attempts = live.board.breakAttemptsUsed + 1;
  if (attempts < rules.breakAttempts) {
    const board = { ...live.board, breakAttemptsUsed: attempts, strokeStartedAt: now };
    return withEvents({ ...live, board, lastUpdated: now }, [
      makeEvent({ ...live, board }, 'manual', `Break attempt ${attempts}/${rules.breakAttempts} missed by side ${striker}`, striker, undefined, now),
    ]);
  }
  const opponent = otherSide(striker);
  const board = { ...live.board, breakAttemptsUsed: attempts, turn: opponent, broken: true, strokeStartedAt: now };
  return withEvents({ ...live, board, lastUpdated: now }, [
    makeEvent({ ...live, board }, 'break_passed', `Break not made in ${rules.breakAttempts} attempts — side ${opponent} takes the break`, opponent, undefined, now),
  ]);
}

/** Records a board result and advances the board / game / match. */
export function finishBoard(
  live: CarromLiveState,
  winner: CarromSide,
  points: number,
  queenCredited: boolean,
  reason: string,
  rules: CarromRulesConfig = DEFAULT_CARROM_RULES,
  priorEvents: CarromMatchEvent[] = [],
  now = Date.now(),
): CarromStrokeOutcome {
  const game = currentCarromGame(live);
  if (!game || !live.board) return { live, events: priorEvents, celebration: null, boardResult: null };
  const result: CarromBoardResult = {
    game: game.number,
    board: live.board.number,
    winner,
    points,
    queenCredited,
    breaker: live.board.breaker,
    reason,
    at: now,
  };
  const updatedGame: CarromGameState = {
    ...game,
    score: { ...game.score, [winner]: game.score[winner] + points },
    boards: [...game.boards, result],
  };
  const events = [...priorEvents, makeEvent(live, 'board_won', `Board ${result.board}: side ${winner} +${points}${queenCredited ? ' (incl. queen)' : ''}`, winner, points, now)];
  let celebration: CarromOverlayType = 'board_won';

  const leader: CarromSide | null = updatedGame.score.A === updatedGame.score.B ? null : (updatedGame.score.A > updatedGame.score.B ? 'A' : 'B');
  const reachedTarget = updatedGame.score[winner] >= rules.pointsToWinGame;
  const boardsDone = updatedGame.boards.length >= rules.boardsPerGame;
  let gameWinner: CarromSide | undefined;
  if (reachedTarget) gameWinner = winner;
  else if (boardsDone && leader) gameWinner = leader;
  else if (boardsDone && !leader && !rules.extraBoardOnTie) gameWinner = winner;

  let games = live.games.map(g => (g.number === game.number ? updatedGame : g));
  let gamesWon = live.gamesWon;
  let phase: CarromMatchPhase = live.phase;
  let matchWinner = live.matchWinner;
  let board: CarromBoardState | null;

  if (gameWinner) {
    games = games.map(g => (g.number === game.number ? { ...g, winner: gameWinner } : g));
    gamesWon = { ...gamesWon, [gameWinner]: gamesWon[gameWinner] + 1 };
    events.push(makeEvent(live, 'game_won', `Game ${game.number} to side ${gameWinner} (${updatedGame.score.A}–${updatedGame.score.B})`, gameWinner, undefined, now));
    celebration = 'game_won';
    if (gamesWon[gameWinner] >= gamesNeededToWin(rules) || game.number >= rules.gamesPerMatch) {
      matchWinner = gamesWon.A === gamesWon.B ? gameWinner : (gamesWon.A > gamesWon.B ? 'A' : 'B');
      phase = 'completed';
      board = null;
      events.push(makeEvent(live, 'match_won', `Match won by side ${matchWinner} (${gamesWon.A}–${gamesWon.B})`, matchWinner, undefined, now));
      celebration = 'match_won';
    } else {
      phase = 'game_break';
      board = null;
    }
  } else {
    const nextNumber = live.board.number + 1;
    board = createCarromBoard(nextNumber, boardBreaker(game.firstBreaker, nextNumber), now);
  }

  const next = withEvents({
    ...live,
    games,
    gamesWon,
    phase,
    matchWinner,
    board,
    lastUpdated: now,
  }, events);
  return { live: next, events, celebration, boardResult: result };
}

/** Starts the next game after a game break (game 2 flips the first break). */
export function startNextCarromGame(live: CarromLiveState, now = Date.now()): CarromLiveState {
  if (live.phase !== 'game_break') return live;
  const number = live.currentGame + 1;
  const firstBreaker = gameFirstBreaker(live.firstBreaker, number);
  return {
    ...live,
    phase: 'in_progress',
    currentGame: number,
    games: [...live.games, createCarromGame(number, firstBreaker)],
    board: createCarromBoard(1, firstBreaker, now),
    lastUpdated: now,
  };
}

/** Manual correction: award a board directly (umpire decision / late scoring). */
export function awardCarromBoard(
  live: CarromLiveState,
  winner: CarromSide,
  loserRemaining: number,
  queenToWinner: boolean,
  rules: CarromRulesConfig = DEFAULT_CARROM_RULES,
  now = Date.now(),
): CarromStrokeOutcome {
  const game = currentCarromGame(live);
  if (live.phase !== 'in_progress' || !live.board || !game) return { live, events: [], celebration: null, boardResult: null };
  const { points, queenCredited } = computeCarromBoardPoints({
    loserRemaining: Math.max(0, Math.min(CARROMMEN_PER_SIDE, loserRemaining)),
    winnerScoreBefore: game.score[winner],
    queenToWinner,
    rules,
  });
  return finishBoard(live, winner, points, queenCredited, 'Board awarded by umpire', rules, [], now);
}

/** Side that should currently break / strike, for quick display. */
export function carromTurnLabel(live: CarromLiveState | null, names: Record<CarromSide, string>): string {
  if (!live?.board) return '';
  const side = live.board.turn;
  const colour = coinColorFor(live.board, side);
  return `${names[side]} (${colour})`;
}

export function carromStrokeSecondsRemaining(live: CarromLiveState | null, rules: CarromRulesConfig = DEFAULT_CARROM_RULES, now = Date.now()): number | null {
  if (!live?.board || live.phase !== 'in_progress') return null;
  const elapsed = Math.floor((now - live.board.strokeStartedAt) / 1000);
  return Math.max(0, rules.strokeTimeSec - elapsed);
}

export const CARROM_PHASE_LABELS: Record<CarromMatchPhase, string> = {
  not_started: 'Not started',
  in_progress: 'Live',
  game_break: 'Game break',
  completed: 'Full time',
};
