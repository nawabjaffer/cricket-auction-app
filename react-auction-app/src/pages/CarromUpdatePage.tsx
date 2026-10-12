// ============================================================================
// CARROM SCORER — stroke-by-stroke umpire console.
// Every stroke goes through the shared ICF rules engine (types/carrom.ts), so
// queen cover, dues, fouls, board points, game targets and the best-of-3
// match result are resolved identically for the scorer and the OBS overlay.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IoArrowUndo, IoArrowRedo, IoPlay, IoSwapHorizontal, IoTrophy, IoArrowBack } from 'react-icons/io5';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { carromService } from '../services/carrom';
import {
  CARROMMEN_PER_SIDE, CARROM_PHASE_LABELS, DEFAULT_CARROM_OVERLAY_CONFIG, DEFAULT_CARROM_RULES, EMPTY_STROKE,
  applyCarromStroke, awardCarromBoard, carromStrokeSecondsRemaining, coinColorFor, currentCarromGame,
  failCarromBreakAttempt, otherSide, startCarromMatch, startNextCarromGame,
} from '../types/carrom';
import type {
  CarromLiveState, CarromMatchSetup, CarromOverlayConfig, CarromOverlayType, CarromRulesConfig,
  CarromSide, CarromStrokeInput, CarromStrokeOutcome, CarromMatchEvent,
} from '../types/carrom';
import './CarromUpdatePage.css';

const UNDO_LIMIT = 30;

function CoinRow({ remaining, colour }: Readonly<{ remaining: number; colour: 'white' | 'black' }>) {
  return (
    <div className="carrom-score__coins" aria-label={`${remaining} ${colour} carrommen left`}>
      {Array.from({ length: CARROMMEN_PER_SIDE }, (_, index) => (
        <span key={index} className={`carrom-score__coin carrom-score__coin--${colour} ${index < remaining ? '' : 'is-pocketed'}`} />
      ))}
    </div>
  );
}

function Stepper({ label, value, max, onChange }: Readonly<{ label: string; value: number; max: number; onChange: (value: number) => void }>) {
  return (
    <div className="carrom-score__stepper">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Decrease ${label}`}>−</button>
        <strong>{value}</strong>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

export default function CarromUpdatePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [urlMatchId, setUrlMatchId] = useState<string | null>(null);
  const [urlPinned, setUrlPinned] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CarromMatchSetup[]>([]);
  const [rules, setRules] = useState<CarromRulesConfig>(DEFAULT_CARROM_RULES);
  const [config, setConfig] = useState<CarromOverlayConfig>(DEFAULT_CARROM_OVERLAY_CONFIG);
  const [match, setMatch] = useState<CarromMatchSetup | null>(null);
  const [live, setLive] = useState<CarromLiveState | null>(null);
  const [stroke, setStroke] = useState<CarromStrokeInput>(EMPTY_STROKE);
  const [awardForm, setAwardForm] = useState<{ winner: CarromSide; loserRemaining: number; queen: boolean }>({ winner: 'A', loserRemaining: 0, queen: false });
  const [showCorrections, setShowCorrections] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [, setTick] = useState(0);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const undoStack = useRef<CarromLiveState[]>([]);
  const redoStack = useRef<CarromLiveState[]>([]);
  const clearOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncHistory = useCallback(() => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }), []);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2400);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUrlMatchId(params.get('matchId'));
    setUrlPinned(params.get('pin') === '1');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('no db');
        carromService.initialize(db, tenantPath('carrom'));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(() => void init(), 800);
      }
    };
    void init();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const unsubs = [
      carromService.subscribeMatches(setMatches),
      carromService.subscribeActiveMatch(setActiveMatchId),
      carromService.subscribeRules(setRules),
      carromService.subscribeOverlayConfig(setConfig),
    ];
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [ready]);

  const matchId = useMemo(() => {
    const liveMatch = matches.find(candidate => candidate.status === 'live')?.id ?? null;
    if (urlMatchId && (urlPinned || !config.singleOverlayMode)) return urlMatchId;
    return activeMatchId || liveMatch || urlMatchId;
  }, [activeMatchId, config.singleOverlayMode, matches, urlMatchId, urlPinned]);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    syncHistory();
    setStroke(EMPTY_STROKE);
    if (!ready || !matchId) {
      setMatch(null);
      setLive(null);
      return;
    }
    const unsubs = [
      carromService.subscribeMatch(matchId, setMatch),
      carromService.subscribeLive(matchId, setLive),
    ];
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [ready, matchId, syncHistory]);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { if (clearOverlayTimer.current) clearTimeout(clearOverlayTimer.current); }, []);

  const names = useMemo<Record<CarromSide, string>>(() => ({
    A: match?.teamA.name ?? 'Side A',
    B: match?.teamB.name ?? 'Side B',
  }), [match]);

  const celebrate = useCallback(async (type: CarromOverlayType | null, event: CarromMatchEvent | undefined, id: string) => {
    if (!type || !config.enableCelebrations) return;
    await carromService.triggerOverlay(id, { activeOverlay: type, activeEvent: event, lastUpdated: Date.now() });
    if (clearOverlayTimer.current) clearTimeout(clearOverlayTimer.current);
    clearOverlayTimer.current = setTimeout(() => { void carromService.clearOverlay(id).catch(() => undefined); }, config.celebrationDurationMs);
  }, [config.celebrationDurationMs, config.enableCelebrations]);

  const persist = useCallback(async (next: CarromLiveState, remember = true) => {
    if (remember && live) {
      undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), live];
      redoStack.current = [];
      syncHistory();
    }
    setLive(next);
    await carromService.saveLive(next);
  }, [live, syncHistory]);

  const syncMatchResult = useCallback(async (next: CarromLiveState) => {
    if (!match) return;
    if (next.phase === 'completed' && next.matchWinner) {
      const summary = `${names[next.matchWinner]} won ${Math.max(next.gamesWon.A, next.gamesWon.B)}–${Math.min(next.gamesWon.A, next.gamesWon.B)} (${next.games.map(game => `${game.score.A}-${game.score.B}`).join(', ')})`;
      await carromService.updateMatch(match.id, { status: 'completed', winner: next.matchWinner, resultSummary: summary });
    } else if (match.status !== 'live') {
      await carromService.updateMatch(match.id, { status: 'live', winner: undefined, resultSummary: undefined });
    }
  }, [match, names]);

  const applyOutcome = useCallback(async (outcome: CarromStrokeOutcome, message?: string) => {
    if (!match) return;
    setBusy(true);
    try {
      await persist(outcome.live);
      if (outcome.boardResult || outcome.live.phase === 'completed') await syncMatchResult(outcome.live);
      const keyEvent = [...outcome.events].reverse().find(event => ['match_won', 'game_won', 'board_won', 'queen_covered', 'foul'].includes(event.type));
      await celebrate(outcome.celebration, keyEvent, match.id);
      setStroke(EMPTY_STROKE);
      if (message) flash(message);
      else if (outcome.boardResult) flash(`Board ${outcome.boardResult.board}: ${names[outcome.boardResult.winner]} +${outcome.boardResult.points}`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }, [celebrate, flash, match, names, persist, syncMatchResult]);

  const startMatch = async (firstBreaker: CarromSide) => {
    if (!match) return;
    setBusy(true);
    try {
      const next = startCarromMatch(match.id, firstBreaker);
      await persist(next, false);
      await carromService.updateMatch(match.id, { status: 'live', firstBreaker });
      await carromService.setActiveMatch(match.id);
      flash(`${names[firstBreaker]} breaks first with white`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not start match');
    } finally {
      setBusy(false);
    }
  };

  const recordStroke = (input: CarromStrokeInput) => {
    if (!live || busy) return;
    void applyOutcome(applyCarromStroke(live, input, rules));
  };

  const undo = async () => {
    const previous = undoStack.current.pop();
    if (!previous || !live) return;
    redoStack.current.push(live);
    syncHistory();
    setLive(previous);
    await carromService.saveLive(previous);
    await syncMatchResult(previous);
    flash('Undone');
  };

  const redo = async () => {
    const next = redoStack.current.pop();
    if (!next || !live) return;
    undoStack.current.push(live);
    syncHistory();
    setLive(next);
    await carromService.saveLive(next);
    await syncMatchResult(next);
    flash('Redone');
  };

  const switchTurn = () => {
    if (!live?.board) return;
    void persist({ ...live, board: { ...live.board, turn: otherSide(live.board.turn), strokeStartedAt: Date.now() } });
  };

  const scheduled = useMemo(() => matches
    .filter(candidate => candidate.status === 'scheduled' || candidate.status === 'live')
    .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || (a.scheduledAt ?? a.createdAt) - (b.scheduledAt ?? b.createdAt)), [matches]);

  if (!ready) return <div className="carrom-score carrom-score--center">Connecting…</div>;

  if (!matchId || !match) {
    return (
      <div className="carrom-score">
        <header className="carrom-score__topbar">
          <button className="carrom-score__ghost" onClick={() => navigate('/carrom/scorer/admin')}><IoArrowBack /> Admin</button>
          <h1>Carrom Scorer</h1>
        </header>
        <section className="carrom-score__panel">
          <h2>Select a fixture to score</h2>
          {scheduled.length === 0 && <p className="carrom-score__muted">No scheduled fixtures. Create one in Carrom Admin.</p>}
          <ul className="carrom-score__fixtures">
            {scheduled.map(candidate => (
              <li key={candidate.id}>
                <div>
                  <strong>{candidate.teamA.name} vs {candidate.teamB.name}</strong>
                  <small>{[candidate.stage, candidate.boardNumber ? `Board ${candidate.boardNumber}` : '', candidate.scheduledAt ? new Date(candidate.scheduledAt).toLocaleString() : ''].filter(Boolean).join(' · ')}</small>
                </div>
                <button className="carrom-score__primary" onClick={() => navigate(`/carrom/scorer/update?matchId=${encodeURIComponent(candidate.id)}&pin=1`)}>
                  <IoPlay /> {candidate.status === 'live' ? 'Resume' : 'Open'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const game = currentCarromGame(live);
  const board = live?.board ?? null;
  const striker = board?.turn ?? 'A';
  const strikerColour = board ? coinColorFor(board, striker) : 'white';
  const opponent = otherSide(striker);
  const secs = carromStrokeSecondsRemaining(live, rules);

  return (
    <div className="carrom-score">
      {toast && <div className="carrom-score__toast" role="status">{toast}</div>}
      <header className="carrom-score__topbar">
        <button className="carrom-score__ghost" onClick={() => navigate('/carrom/scorer/admin')}><IoArrowBack /> Admin</button>
        <h1>{match.teamA.name} <span>vs</span> {match.teamB.name}</h1>
        <div className="carrom-score__topbar-actions">
          <button className="carrom-score__ghost" onClick={() => void undo()} disabled={!history.undo || busy} title="Undo"><IoArrowUndo /></button>
          <button className="carrom-score__ghost" onClick={() => void redo()} disabled={!history.redo || busy} title="Redo"><IoArrowRedo /></button>
        </div>
      </header>

      <section className="carrom-score__scoreboard">
        {(['A', 'B'] as const).map(side => (
          <div key={side} className={`carrom-score__side ${board?.turn === side ? 'is-striking' : ''}`}>
            <span className="carrom-score__side-name">{names[side]}</span>
            <span className="carrom-score__side-points">{game?.score[side] ?? 0}</span>
            <span className="carrom-score__side-games">Games {live?.gamesWon[side] ?? 0}</span>
          </div>
        ))}
        <div className="carrom-score__meta">
          <span>{live ? CARROM_PHASE_LABELS[live.phase] : 'Not started'}</span>
          {live?.currentGame ? <span>Game {live.currentGame}/{rules.gamesPerMatch}</span> : null}
          {board && <span>{board.number > rules.boardsPerGame ? 'Extra board' : `Board ${board.number}/${rules.boardsPerGame}`}</span>}
          <span>To {rules.pointsToWinGame}</span>
        </div>
      </section>

      {(!live || live.phase === 'not_started') && (
        <section className="carrom-score__panel">
          <h2>Toss — who breaks first?</h2>
          <p className="carrom-score__muted">The breaker plays white. Breaks alternate every board; game 2 is broken by the other side.</p>
          <div className="carrom-score__toss">
            {(['A', 'B'] as const).map(side => (
              <button key={side} className="carrom-score__primary" disabled={busy} onClick={() => void startMatch(side)}>{names[side]} breaks</button>
            ))}
          </div>
        </section>
      )}

      {live?.phase === 'game_break' && (
        <section className="carrom-score__panel carrom-score__panel--center">
          <IoTrophy size={36} className="carrom-score__trophy" />
          <h2>Game {live.currentGame} to {names[game?.winner ?? 'A']} ({game?.score.A}–{game?.score.B})</h2>
          <p className="carrom-score__muted">Players change sides. {live.currentGame + 1 === 3 ? 'Interval before the deciding game.' : ''}</p>
          <button className="carrom-score__primary" disabled={busy} onClick={() => void persist(startNextCarromGame(live))}>
            <IoPlay /> Start game {live.currentGame + 1}
          </button>
        </section>
      )}

      {live?.phase === 'completed' && (
        <section className="carrom-score__panel carrom-score__panel--center">
          <IoTrophy size={42} className="carrom-score__trophy" />
          <h2>{names[live.matchWinner ?? 'A']} win the match {Math.max(live.gamesWon.A, live.gamesWon.B)}–{Math.min(live.gamesWon.A, live.gamesWon.B)}</h2>
          <p className="carrom-score__muted">{live.games.map(g => `Game ${g.number}: ${g.score.A}–${g.score.B}`).join(' · ')}</p>
          <button className="carrom-score__ghost" onClick={() => navigate('/carrom/scorer/update')}>Score another fixture</button>
        </section>
      )}

      {live?.phase === 'in_progress' && board && (
        <>
          <section className="carrom-score__board">
            {(['A', 'B'] as const).map(side => {
              const colour = coinColorFor(board, side);
              return (
                <div key={side} className="carrom-score__board-side">
                  <div className="carrom-score__board-head">
                    <strong>{names[side]}</strong>
                    <span className={`carrom-score__chip carrom-score__chip--${colour}`}>{colour}{board.breaker === side ? ' · break' : ''}</span>
                  </div>
                  <CoinRow remaining={board.remaining[side]} colour={colour} />
                  <small>{board.remaining[side]} left{board.pendingDues[side] ? ` · ${board.pendingDues[side]} due pending` : ''}</small>
                </div>
              );
            })}
            <div className={`carrom-score__queen carrom-score__queen--${board.queen}`}>
              <span className="carrom-score__queen-dot" />
              {board.queen === 'on_board' && 'Queen on board'}
              {board.queen === 'pending_cover' && `Queen pocketed by ${names[board.queenBy ?? 'A']} — must cover`}
              {board.queen === 'covered' && `Queen covered by ${names[board.queenBy ?? 'A']}`}
            </div>
          </section>

          <section className="carrom-score__panel">
            <div className="carrom-score__turn">
              <div>
                <span className="carrom-score__label">On strike</span>
                <h2>{names[striker]} <span className={`carrom-score__chip carrom-score__chip--${strikerColour}`}>{strikerColour}</span></h2>
                {!board.broken && <small className="carrom-score__muted">Break · attempt {board.breakAttemptsUsed + 1}/{rules.breakAttempts}</small>}
              </div>
              <div className={`carrom-score__clock ${secs !== null && secs <= 5 ? 'is-urgent' : ''}`}>{secs ?? rules.strokeTimeSec}s</div>
            </div>

            <div className="carrom-score__quick">
              <button className="carrom-score__primary" disabled={busy || board.remaining[striker] === 0} onClick={() => recordStroke({ ...EMPTY_STROKE, ownPocketed: 1 })}>+1 own carromman</button>
              <button className="carrom-score__secondary" disabled={busy} onClick={() => recordStroke(EMPTY_STROKE)}>No pocket · pass turn</button>
              <button className="carrom-score__secondary" disabled={busy || board.queen !== 'on_board'} onClick={() => recordStroke({ ...EMPTY_STROKE, queenPocketed: true })}>Queen pocketed</button>
              <button className="carrom-score__warn" disabled={busy} onClick={() => recordStroke({ ...EMPTY_STROKE, strikerPocketed: true })}>Due (striker pocketed)</button>
              <button className="carrom-score__danger" disabled={busy} onClick={() => recordStroke({ ...EMPTY_STROKE, foul: true })}>Foul</button>
              <button className="carrom-score__warn" disabled={busy} onClick={() => recordStroke({ ...EMPTY_STROKE, technicalFoul: true })}>Technical foul</button>
              {!board.broken && (
                <button className="carrom-score__secondary" disabled={busy} onClick={() => void persist(failCarromBreakAttempt(live, rules))}>Break attempt missed</button>
              )}
            </div>

            <div className="carrom-score__composer">
              <h3>Detailed stroke</h3>
              <div className="carrom-score__composer-grid">
                <Stepper label={`Own (${strikerColour})`} value={stroke.ownPocketed} max={board.remaining[striker]} onChange={value => setStroke(s => ({ ...s, ownPocketed: value }))} />
                <Stepper label={`Opponent (${coinColorFor(board, opponent)})`} value={stroke.opponentPocketed} max={board.remaining[opponent]} onChange={value => setStroke(s => ({ ...s, opponentPocketed: value }))} />
                <label className="carrom-score__toggle"><input type="checkbox" checked={stroke.queenPocketed} disabled={board.queen !== 'on_board'} onChange={e => setStroke(s => ({ ...s, queenPocketed: e.target.checked }))} /> Queen</label>
                <label className="carrom-score__toggle"><input type="checkbox" checked={stroke.strikerPocketed} onChange={e => setStroke(s => ({ ...s, strikerPocketed: e.target.checked }))} /> Striker pocketed</label>
                <label className="carrom-score__toggle"><input type="checkbox" checked={stroke.foul} onChange={e => setStroke(s => ({ ...s, foul: e.target.checked }))} /> Foul stroke</label>
              </div>
              <div className="carrom-score__composer-actions">
                <button className="carrom-score__ghost" onClick={() => setStroke(EMPTY_STROKE)}>Reset</button>
                <button className="carrom-score__primary" disabled={busy} onClick={() => recordStroke(stroke)}>Record stroke</button>
              </div>
            </div>

            <button className="carrom-score__link" onClick={() => setShowCorrections(value => !value)}>
              {showCorrections ? 'Hide' : 'Show'} umpire corrections
            </button>
            {showCorrections && (
              <div className="carrom-score__corrections">
                <button className="carrom-score__secondary" onClick={switchTurn}><IoSwapHorizontal /> Switch strike to {names[opponent]}</button>
                <div className="carrom-score__award">
                  <label>Award board to
                    <select value={awardForm.winner} onChange={e => setAwardForm(f => ({ ...f, winner: e.target.value as CarromSide }))}>
                      <option value="A">{names.A}</option>
                      <option value="B">{names.B}</option>
                    </select>
                  </label>
                  <label>Opponent carrommen left
                    <input type="number" min={0} max={CARROMMEN_PER_SIDE} value={awardForm.loserRemaining} onChange={e => setAwardForm(f => ({ ...f, loserRemaining: Math.max(0, Math.min(CARROMMEN_PER_SIDE, Number(e.target.value) || 0)) }))} />
                  </label>
                  <label className="carrom-score__toggle"><input type="checkbox" checked={awardForm.queen} onChange={e => setAwardForm(f => ({ ...f, queen: e.target.checked }))} /> Winner covered queen</label>
                  <button className="carrom-score__primary" disabled={busy} onClick={() => {
                    if (!window.confirm(`Award board ${board.number} to ${names[awardForm.winner]}?`)) return;
                    void applyOutcome(awardCarromBoard(live, awardForm.winner, awardForm.loserRemaining, awardForm.queen, rules));
                  }}>Award board</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {live && live.games.length > 0 && (
        <section className="carrom-score__panel">
          <h3>Boards</h3>
          <div className="carrom-score__history">
            {live.games.map(g => (
              <div key={g.number} className="carrom-score__history-game">
                <strong>Game {g.number}{g.winner ? ` · ${names[g.winner]}` : ''}</strong>
                <div>
                  {g.boards.length === 0 && <span className="carrom-score__muted">No boards yet</span>}
                  {g.boards.map(b => (
                    <span key={b.board} className={`carrom-score__history-chip carrom-score__history-chip--${b.winner}`} title={b.reason}>
                      B{b.board} {match[b.winner === 'A' ? 'teamA' : 'teamB'].shortName} +{b.points}{b.queenCredited ? ' 👑' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ol className="carrom-score__events">
            {[...live.events].reverse().slice(0, 12).map(event => (
              <li key={event.id}><span>G{event.game}·B{event.board}</span> {event.description.replace(/side ([AB])/g, (_, side: CarromSide) => names[side])}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
