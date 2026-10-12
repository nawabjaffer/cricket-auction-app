// ============================================================================
// CARROM OBS OVERLAY — /:tenantSlug/carrom/scorer/obs-overlay[?matchId=x&pin=1]
// Transparent 1920×1080 browser source. Uses the active Scorecard Designer
// layout when one exists; otherwise renders the built-in "Walnut & Gold"
// carrom scoreboard: wood frame, red felt score plate, live carrommen tracker,
// queen indicator, board-by-board strip and queen / board / game celebrations.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBroadcastOverlaySurface } from '../hooks/useBroadcastOverlaySurface';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { carromService } from '../services/carrom';
import { scorecardLayoutService } from '../services/scorecardLayoutService';
import { ResolvedImage } from '../components/ResolvedImage';
import { ScorecardLayoutView } from '../components/ScorecardCanvas';
import type { ScorecardLayout } from '../types/scorecardDesigner';
import type { ScorecardDataContext } from '../utils/scorecardDataBinding';
import {
  CARROMMEN_PER_SIDE, DEFAULT_CARROM_OVERLAY_CONFIG, DEFAULT_CARROM_RULES,
  carromStrokeSecondsRemaining, coinColorFor, currentCarromGame,
} from '../types/carrom';
import type {
  CarromLiveState, CarromMatchSetup, CarromOverlayConfig, CarromOverlayControl, CarromRulesConfig, CarromSide, CarromTeamRef,
} from '../types/carrom';
import './CarromOBSOverlayPage.css';

function celebrationText(control: CarromOverlayControl, match: CarromMatchSetup): { title: string; subtitle?: string } | null {
  const side = control.activeEvent?.side;
  const team = side === 'B' ? match.teamB : match.teamA;
  switch (control.activeOverlay) {
    case 'queen_covered': return { title: 'Queen Covered', subtitle: team.name };
    case 'board_won': return { title: `Board to ${team.shortName || team.name}`, subtitle: control.activeEvent?.points ? `+${control.activeEvent.points} points` : undefined };
    case 'game_won': return { title: `Game to ${team.name}`, subtitle: control.activeEvent?.description.replace(/^.*\(/, '(') };
    case 'match_won': return { title: `${team.name} win!`, subtitle: 'Match result' };
    case 'foul': return { title: 'Foul', subtitle: `Penalty · ${team.name}` };
    default: return null;
  }
}

function Coins({ remaining, colour }: Readonly<{ remaining: number; colour: 'white' | 'black' }>) {
  return (
    <span className="cbo__coins" aria-label={`${remaining} ${colour} carrommen left`}>
      {Array.from({ length: CARROMMEN_PER_SIDE }, (_, index) => (
        <span key={index} className={`cbo__coin cbo__coin--${colour} ${index < remaining ? '' : 'is-pocketed'}`} />
      ))}
    </span>
  );
}

function TeamBlock({ team, side, live, config, align }: Readonly<{
  team: CarromTeamRef; side: CarromSide; live: CarromLiveState; config: CarromOverlayConfig; align: 'left' | 'right';
}>) {
  const board = live.board;
  const colour = board ? coinColorFor(board, side) : null;
  const striking = board?.turn === side && live.phase === 'in_progress';
  const logo = team.logoUrl || team.photoUrl;
  return (
    <div className={`cbo__team cbo__team--${align} ${striking ? 'is-striking' : ''}`}>
      {logo ? (
        <span className="cbo__logo"><ResolvedImage src={logo} size={160} alt="" /></span>
      ) : (
        <span className="cbo__logo cbo__logo--initials" style={{ background: team.primaryColor || config.secondaryColor }}>{(team.shortName || team.name).slice(0, 3)}</span>
      )}
      <div className="cbo__team-info">
        <span className="cbo__team-name">{team.name}</span>
        {config.showCoinTracker && board && colour && (
          <span className="cbo__team-coins"><Coins remaining={board.remaining[side]} colour={colour} /><em>{board.remaining[side]}</em></span>
        )}
        {striking && <span className="cbo__strike">On strike</span>}
      </div>
    </div>
  );
}

export default function CarromOBSOverlayPage() {
  useBroadcastOverlaySurface();
  const [ready, setReady] = useState(false);
  const [urlMatchId, setUrlMatchId] = useState<string | null>(null);
  const [urlPinned, setUrlPinned] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CarromMatchSetup[]>([]);
  const [config, setConfig] = useState<CarromOverlayConfig>(DEFAULT_CARROM_OVERLAY_CONFIG);
  const [rules, setRules] = useState<CarromRulesConfig>(DEFAULT_CARROM_RULES);
  const [match, setMatch] = useState<CarromMatchSetup | null>(null);
  const [live, setLive] = useState<CarromLiveState | null>(null);
  const [control, setControl] = useState<CarromOverlayControl | null>(null);
  const [customLayout, setCustomLayout] = useState<ScorecardLayout | null>(null);
  const [, setTick] = useState(0);

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
        scorecardLayoutService.initialize(db);
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
      carromService.subscribeRules(setRules),
      carromService.subscribeActiveMatch(setActiveMatchId),
      carromService.subscribeMatches(setMatches),
      scorecardLayoutService.subscribeEffectiveLayout('carrom', setCustomLayout),
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

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (!match || !live || live.phase === 'not_started') return <div className="cbo cbo--empty" />;

  const celebration = config.enableCelebrations && control && control.activeOverlay !== 'none'
    ? celebrationText(control, match)
    : null;

  if (customLayout && customLayout.widgets.length > 0) {
    const ctx: ScorecardDataContext = {
      sport: 'carrom', match, live, rules, overlay: control,
      branding: { tournamentLogo: config.tournamentLogo, partnerLogo: config.broadcastPartnerLogo },
    };
    const layoutHasCelebrations = customLayout.widgets.some(widget => widget.kind === 'carrom_queen_flag' || widget.kind === 'carrom_board_won_flag');
    return (
      <div className="cbo cbo--custom">
        <ScorecardLayoutView layout={customLayout} ctx={ctx} />
        <AnimatePresence>
          {celebration && !layoutHasCelebrations && <Celebration key={control?.lastUpdated} {...celebration} kind={control?.activeOverlay ?? 'none'} />}
        </AnimatePresence>
      </div>
    );
  }

  const game = currentCarromGame(live);
  const board = live.board;
  const secs = carromStrokeSecondsRemaining(live, rules);
  const theme = {
    '--cbo-frame': config.primaryColor,
    '--cbo-felt': config.secondaryColor,
    '--cbo-trim': config.accentColor,
    '--cbo-text': config.textColor,
  } as React.CSSProperties;
  const stageLabel = live.phase === 'completed'
    ? 'Final result'
    : live.phase === 'game_break'
      ? `End of game ${live.currentGame}`
      : `Game ${live.currentGame} · ${board && board.number > rules.boardsPerGame ? 'Extra board' : `Board ${board?.number ?? 1}`}`;

  return (
    <div className={`cbo cbo--${config.scoreboardPosition}`} style={theme}>
      {config.tournamentLogo && (
        <div className="cbo__tournament"><ResolvedImage src={config.tournamentLogo} size={192} alt="" /></div>
      )}

      <motion.div className="cbo__scoreboard" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
        <div className="cbo__ribbon">
          {config.showLiveBadge && live.phase === 'in_progress' && <span className="cbo__live"><span />LIVE</span>}
          <span className="cbo__games">Games {live.gamesWon.A} – {live.gamesWon.B}</span>
          {config.tournamentName && <span className="cbo__title">{config.tournamentName}</span>}
          {match.stage && <span className="cbo__stage">{match.stage}</span>}
          {secs !== null && <span className={`cbo__clock ${secs <= 5 ? 'is-urgent' : ''}`}>{secs}s</span>}
        </div>

        <div className="cbo__frame">
          <TeamBlock team={match.teamA} side="A" live={live} config={config} align="left" />

          <div className="cbo__plate">
            <div className="cbo__score">
              <motion.span key={`a-${game?.score.A}`} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{game?.score.A ?? 0}</motion.span>
              <i>:</i>
              <motion.span key={`b-${game?.score.B}`} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{game?.score.B ?? 0}</motion.span>
            </div>
            <div className="cbo__stage-label">{stageLabel}</div>
            {board && (
              <div className={`cbo__queen cbo__queen--${board.queen}`}>
                <span className="cbo__queen-dot" />
                {board.queen === 'on_board' ? 'Queen on board' : board.queen === 'pending_cover' ? 'Queen · cover pending' : `Queen · ${(board.queenBy === 'B' ? match.teamB : match.teamA).shortName}`}
              </div>
            )}
          </div>

          <TeamBlock team={match.teamB} side="B" live={live} config={config} align="right" />
        </div>

        {config.showBoardHistory && game && game.boards.length > 0 && (
          <div className="cbo__history">
            {game.boards.slice(-8).map(result => (
              <span key={result.board} className={`cbo__history-chip cbo__history-chip--${result.winner}`}>
                B{result.board} <strong>{(result.winner === 'A' ? match.teamA : match.teamB).shortName}</strong> +{result.points}{result.queenCredited ? ' ♛' : ''}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {celebration && <Celebration key={control?.lastUpdated} {...celebration} kind={control?.activeOverlay ?? 'none'} />}
      </AnimatePresence>
    </div>
  );
}

function Celebration({ title, subtitle, kind }: Readonly<{ title: string; subtitle?: string; kind: CarromOverlayControl['activeOverlay'] }>) {
  return (
    <motion.div
      className={`cbo__celebration cbo__celebration--${kind}`}
      initial={{ opacity: 0, scale: 0.6, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16 }}
    >
      <span className="cbo__celebration-ring" aria-hidden="true" />
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </motion.div>
  );
}
