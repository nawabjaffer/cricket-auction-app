// ============================================================================
// CARROM OBS DOCK — /:tenantSlug/carrom/scorer/obs-dock[?matchId=x&pin=1]
// Broadcast control panel for OBS (custom browser dock or browser source):
// live score strip, game-by-game summary and one-tap celebration triggers
// (queen / board / game / match / foul) that the carrom overlay renders.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBroadcastOverlaySurface } from '../hooks/useBroadcastOverlaySurface';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { carromService } from '../services/carrom';
import { ResolvedImage } from '../components/ResolvedImage';
import { CARROM_DOCK_TRIGGERS, buildDockEvent, resolveDockSide, type CarromDockTrigger } from '../utils/carromDock';
import {
  CARROM_PHASE_LABELS, DEFAULT_CARROM_OVERLAY_CONFIG, currentCarromGame,
} from '../types/carrom';
import type { CarromLiveState, CarromMatchSetup, CarromOverlayConfig, CarromOverlayControl, CarromSide } from '../types/carrom';
import './CarromOBSDockPage.css';

type SideChoice = CarromSide | 'auto';

export default function CarromOBSDockPage() {
  useBroadcastOverlaySurface();
  const [ready, setReady] = useState(false);
  const [urlMatchId, setUrlMatchId] = useState<string | null>(null);
  const [urlPinned, setUrlPinned] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CarromMatchSetup[]>([]);
  const [config, setConfig] = useState<CarromOverlayConfig>(DEFAULT_CARROM_OVERLAY_CONFIG);
  const [match, setMatch] = useState<CarromMatchSetup | null>(null);
  const [live, setLive] = useState<CarromLiveState | null>(null);
  const [control, setControl] = useState<CarromOverlayControl | null>(null);
  const [sideChoice, setSideChoice] = useState<SideChoice>('auto');
  const [error, setError] = useState('');
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      carromService.subscribeOverlayConfig(setConfig),
      carromService.subscribeActiveMatch(setActiveMatchId),
      carromService.subscribeMatches(setMatches),
    ];
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [ready]);

  const matchId = useMemo(() => {
    const liveId = matches.find(candidate => candidate.status === 'live')?.id ?? null;
    if (urlMatchId && (urlPinned || !config.singleOverlayMode)) return urlMatchId;
    return activeMatchId || liveId || urlMatchId;
  }, [activeMatchId, config.singleOverlayMode, matches, urlMatchId, urlPinned]);

  useEffect(() => {
    setMatch(null);
    setLive(null);
    setControl(null);
    if (!ready || !matchId) return;
    const unsubs = [
      carromService.subscribeMatch(matchId, setMatch),
      carromService.subscribeLive(matchId, setLive),
      carromService.subscribeOverlay(matchId, setControl),
    ];
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [ready, matchId]);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const trigger = useCallback(async (type: CarromDockTrigger) => {
    if (!matchId) return;
    setError('');
    const side = sideChoice === 'auto' ? resolveDockSide(type, live) : sideChoice;
    try {
      await carromService.triggerOverlay(matchId, {
        activeOverlay: type,
        activeEvent: buildDockEvent(type, live, side),
        lastUpdated: Date.now(),
      });
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => { void carromService.clearOverlay(matchId).catch(() => undefined); }, config.celebrationDurationMs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trigger the overlay');
    }
  }, [config.celebrationDurationMs, live, matchId, sideChoice]);

  const clear = useCallback(async () => {
    if (!matchId) return;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    try { await carromService.clearOverlay(matchId); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear the overlay');
    }
  }, [matchId]);

  const resetClock = useCallback(async () => {
    if (!live?.board || live.phase !== 'in_progress') return;
    setError('');
    try {
      await carromService.saveLive({ ...live, board: { ...live.board, strokeStartedAt: Date.now() } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset the stroke clock');
    }
  }, [live]);

  const theme = {
    '--cbd-frame': config.primaryColor,
    '--cbd-felt': config.secondaryColor,
    '--cbd-trim': config.accentColor,
    '--cbd-text': config.textColor,
  } as React.CSSProperties;

  const game = currentCarromGame(live);
  const activeOverlay = control?.activeOverlay && control.activeOverlay !== 'none' ? control.activeOverlay : null;

  return (
    <div className="cbd" style={theme}>
      <div className="cbd__panel">
        <header className="cbd__header">
          {config.tournamentLogo && <ResolvedImage className="cbd__logo" src={config.tournamentLogo} size={192} alt="" />}
          <div className="cbd__title-wrap">
            <h1 className="cbd__title">Carrom Board</h1>
            {config.tournamentName && <div className="cbd__subtitle">{config.tournamentName}</div>}
          </div>
          {activeOverlay && <span className="cbd__on-air">On air</span>}
        </header>

        {!matchId && <div className="cbd__empty">No match selected. Start a fixture in Carrom Scorer or pass ?matchId=…</div>}

        {match && live && (
          <>
            <div className="cbd__live-bar">
              <div className="cbd__teams">
                <span>{match.teamA.shortName || match.teamA.name}</span>
                <strong>{game?.score.A ?? 0}</strong>
                <i>:</i>
                <strong>{game?.score.B ?? 0}</strong>
                <span>{match.teamB.shortName || match.teamB.name}</span>
              </div>
              <span className={`cbd__badge cbd__badge--${live.phase}`}>
                {live.phase === 'in_progress' ? 'LIVE' : CARROM_PHASE_LABELS[live.phase]}
                {config.singleOverlayMode && ' · SINGLE OVERLAY'}
              </span>
            </div>

            <ul className="cbd__games" aria-label="Games">
              {live.games.length === 0 && <li className="cbd__games-empty">Match not started</li>}
              {live.games.map(item => (
                <li key={item.number} className={item.number === live.currentGame && !item.winner ? 'is-current' : ''}>
                  <span>Game {item.number}</span>
                  <strong>{item.score.A} – {item.score.B}</strong>
                  <em>{item.winner ? (item.winner === 'A' ? match.teamA : match.teamB).shortName : 'In play'}</em>
                </li>
              ))}
            </ul>

            {game && game.boards.length > 0 && (
              <div className="cbd__boards">
                {game.boards.slice(-8).map(result => (
                  <span key={result.board} className={`cbd__chip cbd__chip--${result.winner}`}>
                    B{result.board} · {(result.winner === 'A' ? match.teamA : match.teamB).shortName} +{result.points}{result.queenCredited ? ' ♛' : ''}
                  </span>
                ))}
              </div>
            )}

            <section className="cbd__tools" aria-label="Broadcast controls">
              <div className="cbd__side" role="group" aria-label="Celebration side">
                {(['auto', 'A', 'B'] as const).map(choice => (
                  <button
                    key={choice}
                    type="button"
                    className={sideChoice === choice ? 'is-active' : ''}
                    aria-pressed={sideChoice === choice}
                    onClick={() => setSideChoice(choice)}
                  >
                    {choice === 'auto' ? 'Auto' : (choice === 'A' ? match.teamA : match.teamB).shortName}
                  </button>
                ))}
              </div>
              <div className="cbd__controls">
                {CARROM_DOCK_TRIGGERS.map(item => (
                  <button key={item.type} type="button" className={`cbd__ctrl cbd__ctrl--${item.type}`} onClick={() => void trigger(item.type)} title={`Show ${item.label} on the overlay`}>
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </button>
                ))}
                <button type="button" className="cbd__ctrl cbd__ctrl--clear" onClick={() => void clear()} title="Hide the current celebration">✕ Clear</button>
                <button type="button" className="cbd__ctrl cbd__ctrl--clock" onClick={() => void resetClock()} disabled={live.phase !== 'in_progress'} title="Restart the stroke clock">⏱ Reset clock</button>
              </div>
              {!config.enableCelebrations && <p className="cbd__note">Celebrations are turned off in Carrom Admin › Broadcast.</p>}
              {error && <p className="cbd__error" role="alert">{error}</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
