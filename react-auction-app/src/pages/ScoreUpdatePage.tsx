// ============================================================================
// SCORE UPDATE PAGE — /:tenantSlug/cricket/scorer/update?matchId=xxx
// Ball-by-ball scoring interface with run buttons, wicket modal, undo
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { IoArrowUndo, IoSwapHorizontal, IoClose, IoPlay, IoChevronDown } from 'react-icons/io5';
import { GiCricketBat, GiBowlingStrike } from 'react-icons/gi';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { useScoringState } from '../hooks/useScoringState';
import { scoringService } from '../services/scoring';
import { statsEngine } from '../services/scoring/statsEngine';
import { obsReplaySourceService } from '../services/scoring/obsReplaySourceService';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import type {
  BallOutcome, DismissalType, WicketDetail, MatchSquadPlayer, OBSReplayButton,
  TickerStatWidget, Innings, BatsmanInnings, BowlerInnings, LiveScore,
  TournamentStats,
} from '../types/scoring';
import FieldPlacementEditor from '../components/FieldPlacementEditor/FieldPlacementEditor';
import LiveCameraSwitcher from '../components/LiveCameraSwitcher/LiveCameraSwitcher';
import './ScoreUpdatePage.css';

// ── Run buttons layout ───────────────────────────────────────────────────────

const RUN_BUTTONS: { outcome: BallOutcome; label: string; className: string }[] = [
  { outcome: '0', label: '0', className: 'dot' },
  { outcome: '1', label: '1', className: 'single' },
  { outcome: '2', label: '2', className: 'double' },
  { outcome: '3', label: '3', className: 'triple' },
  { outcome: '4', label: '4', className: 'four' },
  { outcome: '6', label: '6', className: 'six' },
];

const NB_SUB_OPTIONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'NB+0', label: 'NB (dot)' },
  { outcome: 'NB+1', label: 'NB+1' },
  { outcome: 'NB+2', label: 'NB+2' },
  { outcome: 'NB+3', label: 'NB+3' },
  { outcome: 'NB+4', label: 'NB+4' },
  { outcome: 'NB+6', label: 'NB+6' },
];

const WD_SUB_OPTIONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'WD', label: 'WD (dot)' },
  { outcome: 'WD+1', label: 'WD+1' },
  { outcome: 'WD+2', label: 'WD+2' },
  { outcome: 'WD+3', label: 'WD+3' },
  { outcome: 'WD+4', label: 'WD+4' },
];

const B_SUB_OPTIONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'B+1', label: 'B+1' },
  { outcome: 'B+2', label: 'B+2' },
  { outcome: 'B+3', label: 'B+3' },
  { outcome: 'B+4', label: 'B+4' },
];

const LB_SUB_OPTIONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'LB+1', label: 'LB+1' },
  { outcome: 'LB+2', label: 'LB+2' },
  { outcome: 'LB+3', label: 'LB+3' },
  { outcome: 'LB+4', label: 'LB+4' },
];

const PEN_SUB_OPTIONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'PEN+1', label: 'PEN+1' },
  { outcome: 'PEN+2', label: 'PEN+2' },
  { outcome: 'PEN+3', label: 'PEN+3' },
  { outcome: 'PEN+4', label: 'PEN+4' },
  { outcome: 'PEN+5', label: 'PEN+5' },
];

const DISMISSAL_TYPES: { value: DismissalType; label: string }[] = [
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'caught_and_bowled', label: 'Caught & Bowled' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run_out', label: 'Run Out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit_wicket', label: 'Hit Wicket' },
  { value: 'obstructing_field', label: 'Obstruct Field' },
  { value: 'retired_hurt', label: 'Retired Hurt' },
  { value: 'retired_out', label: 'Retired Out' },
];

const TICKER_WIDGET_OPTIONS: Array<{ key: TickerStatWidget; label: string }> = [
  { key: 'run_rate', label: 'Run Rate' },
  { key: 'projection', label: 'Projection' },
  { key: 'chase', label: 'Chase Eqn' },
];

export default function ScoreUpdatePage() {
  const [searchParams] = useSearchParams();
  const urlMatchId = searchParams.get('matchId') || undefined;
  const urlPinned = searchParams.get('pin') === '1';
  const navigate = useNavigate();
  const { isAuthenticated, extendSession } = useAdminAuth();

  const [singleOverlayMode, setSingleOverlayMode] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matchActionFeedback, setMatchActionFeedback] = useState('');
  const matchId = singleOverlayMode
    ? (urlPinned ? (urlMatchId || activeMatchId || undefined) : (activeMatchId || urlMatchId || undefined))
    : urlMatchId;

  // Single Overlay Mode: resolve + follow the tenant's active match when no explicit matchId in URL
  useEffect(() => {
    let unsubConfig: (() => void) | undefined;
    let unsubActive: (() => void) | undefined;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) return;
        try { scoringService.initialize(db, tenantPath('scoring')); } catch { /* already initialized */ }
        const cfg = await scoringService.getOverlayConfig().catch(() => null);
        setSingleOverlayMode(!!cfg?.singleOverlayMode);
        unsubConfig = scoringService.subscribeOverlayConfig((liveCfg) => setSingleOverlayMode(!!liveCfg.singleOverlayMode));
        unsubActive = scoringService.subscribeActiveMatch(setActiveMatchId);
      } catch { /* non-critical — falls back to explicit matchId only */ }
    };
    init();
    return () => { unsubConfig?.(); unsubActive?.(); };
  }, []);

  const {
    match, liveScore, lineups, loading, error, recording,
    undoStack, recordBall, undoLastBall, initInnings,
    setOverlay, changeBatsman, changeBowler, swapStrike,
    completeMatch, isInningsComplete, isMatchComplete, needsBowlerChange,
    addPlayerToLineup,
  } = useScoringState(matchId);

  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);
  const [showTossModal, setShowTossModal] = useState(false);
  const [initModalDefaults, setInitModalDefaults] = useState<{ inningsNumber?: 1 | 2; battingTeamId?: string; target?: number } | null>(null);
  const [showBatsmanPicker, setShowBatsmanPicker] = useState<'striker' | 'non-striker' | null>(null);
  const [showBowlerPicker, setShowBowlerPicker] = useState(false);
  const [showEndOfInningsModal, setShowEndOfInningsModal] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [expandedExtra, setExpandedExtra] = useState<'NB' | 'WD' | 'B' | 'LB' | 'PEN' | null>(null);
  const [pendingExtraOutcome, setPendingExtraOutcome] = useState<BallOutcome | null>(null); // for wicket-on-extra flow
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showPlayerStatsModal, setShowPlayerStatsModal] = useState(false);
  const [obsRelayButtons, setObsRelayButtons] = useState<OBSReplayButton[]>([]);
  const [obsRelayFeedback, setObsRelayFeedback] = useState('');
  const [tickerWidgetModes, setTickerWidgetModes] = useState<TickerStatWidget[]>(['run_rate']);
  const [showCompletedEditModal, setShowCompletedEditModal] = useState(false);
  const [completedEditFeedback, setCompletedEditFeedback] = useState('');
  const [tournamentStats, setTournamentStats] = useState<TournamentStats | null>(null);
  const [recordAlertDismissed, setRecordAlertDismissed] = useState(false);

  const handleStartNextMatch = useCallback(async () => {
    try {
      const all = await scoringService.getAllMatches();
      const next = all
        .filter(m => m.status === 'scheduled')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
      if (!next) {
        setMatchActionFeedback('No upcoming scheduled match to start');
        setTimeout(() => setMatchActionFeedback(''), 2500);
        return;
      }
      await scoringService.startMatchQuick(next.id);
      setShowMatchCompleteModal(false);
    } catch {
      setMatchActionFeedback('Failed to start next match');
      setTimeout(() => setMatchActionFeedback(''), 2500);
    }
  }, []);

  const handleEndScorerSession = useCallback(async () => {
    try {
      await scoringService.setActiveMatch(null);
      setShowMatchCompleteModal(false);
      navigate('/cricket/scorer/admin');
    } catch {
      setMatchActionFeedback('Failed to end session');
      setTimeout(() => setMatchActionFeedback(''), 2500);
    }
  }, [navigate]);

  // Auto-show bowler picker at end of over
  useEffect(() => {
    if (needsBowlerChange && !showBowlerPicker) {
      setShowBowlerPicker(true);
    }
  }, [needsBowlerChange]);

  // Auto-show end-of-innings / match-complete modals
  useEffect(() => {
    if (isMatchComplete) {
      setShowMatchCompleteModal(true);
    } else if (isInningsComplete) {
      setShowEndOfInningsModal(true);
    }
  }, [isInningsComplete, isMatchComplete]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
    const handleActivity = () => extendSession();
    window.addEventListener('click', handleActivity);
    return () => window.removeEventListener('click', handleActivity);
  }, [isAuthenticated, navigate, extendSession]);

  // Tournament records — powers the "closing in on the highest score" alert
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const load = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) return;
        try { statsEngine.initialize(db, tenantPath('scoring')); } catch { /* already initialized */ }
        unsub = statsEngine.subscribeTournamentStats(setTournamentStats);
      } catch { /* non-critical */ }
    };
    load();
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const loadObsButtons = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) {
          obsReplaySourceService.initialize(db, tenantPath('scoring'));
        }
        const cfg = await scoringService.getOverlayConfig();
        const buttons = (cfg?.obsReplayConfig?.buttons || [])
          .filter(b => b.enabled)
          .sort((a, b) => a.order - b.order);
        setObsRelayButtons(buttons);
        const configuredModes = cfg?.tickerConfig?.widgetModes;
        if (configuredModes && configuredModes.length > 0) {
          setTickerWidgetModes(configuredModes);
        }
      } catch {
        setObsRelayButtons([]);
      }
    };
    loadObsButtons();
  }, []);

  const saveTickerWidgetModes = useCallback(async (nextModes: TickerStatWidget[]) => {    const normalized: TickerStatWidget[] = nextModes.length > 0 ? nextModes : ['run_rate'];
    setTickerWidgetModes(normalized);
    try {
      const cfg = await scoringService.getOverlayConfig();
      const updated = {
        ...(cfg || {
          showLiveBadge: true,
          enableBoundaryAnimation: true,
          enableWicketAnimation: true,
          enableDuckOutAnimation: true,
          enableHatTrickAnimation: true,
          enableSixerAnimation: true,
          enableKeyboardShortcuts: true,
          autoOverlayEnabled: true,
          autoOverlayIntervalSeconds: 30,
          liveQuestions: [],
        }),
        tickerConfig: {
          ...(cfg?.tickerConfig || {
            mode: 'html' as const,
            position: 'bottom' as const,
            height: 120,
            showBowlerOnRight: true,
            animationSpeed: 500,
          }),
          widgetModes: normalized,
        },
      };
      await scoringService.saveOverlayConfig(updated);
    } catch {
      // keep local mode even if network save fails
    }
  }, []);

  const toggleTickerWidget = useCallback((mode: TickerStatWidget) => {
    const nextSet = new Set(tickerWidgetModes);
    if (nextSet.has(mode)) nextSet.delete(mode);
    else nextSet.add(mode);
    saveTickerWidgetModes(Array.from(nextSet) as TickerStatWidget[]);
  }, [saveTickerWidgetModes, tickerWidgetModes]);

  const moveTickerWidget = useCallback((mode: TickerStatWidget, delta: -1 | 1) => {
    const current = [...tickerWidgetModes];
    const idx = current.indexOf(mode);
    if (idx < 0) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= current.length) return;
    [current[idx], current[nextIdx]] = [current[nextIdx], current[idx]];
    saveTickerWidgetModes(current);
  }, [saveTickerWidgetModes, tickerWidgetModes]);

  // Keyboard shortcuts for quick scoring
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!liveScore || recording) return;
      const key = e.key;
      if (key === '0') recordBall('0');
      else if (key === '1') recordBall('1');
      else if (key === '2') recordBall('2');
      else if (key === '3') recordBall('3');
      else if (key === '4') recordBall('4');
      else if (key === '6') recordBall('6');
      else if (key.toLowerCase() === 'w') setShowWicketModal(true);
      else if (key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) undoLastBall();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [liveScore, recording, recordBall, undoLastBall]);

  const handleRunClick = useCallback((outcome: BallOutcome) => {
    recordBall(outcome);
  }, [recordBall]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="score-update score-update--loading">
        <div className="score-update__spinner" />
        <p>Loading match...</p>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="score-update score-update--error">
        <h2>Error</h2>
        <p>{error || 'Match not found'}</p>
        <button onClick={() => navigate('/cricket/scorer/admin')} className="score-update__btn score-update__btn--primary">
          Back to Scoring Admin
        </button>
      </div>
    );
  }

  // No live score yet → show init modal
  if (!liveScore) {
    return (
      <div className="score-update">
        <ScoreHeader match={match} />
        <div className="score-update__center-prompt">
          <GiCricketBat size={48} color="#fbbf24" />
          <h2>Ready to Score</h2>
          <p>{match.teamA.name} vs {match.teamB.name}</p>
          <button
            className="score-update__btn score-update__btn--primary score-update__btn--lg"
            onClick={() => {
              if (!match.tossWonBy || !match.tossElected) {
                setShowTossModal(true);
                return;
              }
              setShowInitModal(true);
            }}
          >
            <IoPlay size={20} /> Start Innings
          </button>
          <p className="score-update__hint" style={{ marginTop: '0.6rem' }}>
            Toss details are captured here before the first innings starts.
          </p>
        </div>
        {showTossModal && (
          <TossSetupModal
            match={match}
            onConfirm={async (wonBy, elected) => {
              await scoringService.updateMatch(match.id, { tossWonBy: wonBy, tossElected: elected });
              setShowTossModal(false);
              setShowInitModal(true);
            }}
            onClose={() => setShowTossModal(false)}
          />
        )}
        {showInitModal && (
          <InitInningsModal
            match={match}
            lineups={lineups}
            onStart={async (data) => {
              await initInnings(
                data.inningsNumber,
                data.battingTeamId,
                data.bowlingTeamId,
                data.openers,
                data.openingBowler,
                data.target,
              );
              setShowInitModal(false);
            }}
            onClose={() => setShowInitModal(false)}
          />
        )}
      </div>
    );
  }

  // Get lineup for batting/bowling teams
  const battingLineup = lineups.teamA?.teamId === liveScore.battingTeamId ? lineups.teamA : lineups.teamB;
  const bowlingLineup = lineups.teamA?.teamId === liveScore.bowlingTeamId ? lineups.teamA : lineups.teamB;

  // Record chase: alert the scorer when the total closes in on the tournament best
  const teamRecord = tournamentStats?.highestTeamScore || null;
  const runsToRecord = teamRecord ? teamRecord.runs - liveScore.runs : null;
  const isRecordBroken = runsToRecord !== null && runsToRecord < 0;
  const isNearRecord = runsToRecord !== null && runsToRecord >= 0 && runsToRecord <= 20;
  const showRecordAlert = !recordAlertDismissed
    && !!teamRecord
    && teamRecord.matchId !== match.id
    && (isNearRecord || isRecordBroken);

  return (
    <div className="score-update">
      <ScoreHeader match={match} />

      {singleOverlayMode && match.status === 'completed' && (
        <div className="score-update__session-banner">
          <span>🏁 This match has ended</span>
          <button className="score-update__overlay-btn" onClick={handleStartNextMatch}>▶ Start Next Match</button>
          <button className="score-update__overlay-btn score-update__overlay-btn--clear" onClick={handleEndScorerSession}>End Session</button>
          <button className="score-update__overlay-btn" onClick={() => setShowCompletedEditModal(true)}>Edit Completed Scorecard</button>
          {matchActionFeedback && <span className="score-update__hint">{matchActionFeedback}</span>}
          {completedEditFeedback && <span className="score-update__hint">{completedEditFeedback}</span>}
        </div>
      )}

      {!singleOverlayMode && match.status === 'completed' && (
        <div className="score-update__session-banner">
          <span>🏁 Match completed</span>
          <button className="score-update__overlay-btn" onClick={() => setShowCompletedEditModal(true)}>Edit Completed Scorecard</button>
          {completedEditFeedback && <span className="score-update__hint">{completedEditFeedback}</span>}
        </div>
      )}

      {/* ── Powerplay & Free Hit Indicators ─────────────────────────── */}
      <div className="score-update__indicators">
        {liveScore.isPowerplay && (
          <span className="score-update__indicator score-update__indicator--powerplay">
            ⚡ POWERPLAY
          </span>
        )}
        {liveScore.isFreehit && (
          <span className="score-update__indicator score-update__indicator--freehit">
            🆓 FREE HIT
          </span>
        )}
      </div>

      {/* ── Multi-camera angle control (appears once a camera joins) ─── */}
      <LiveCameraSwitcher matchId={matchId ?? null} />

      {/* ── Tournament Record Chase Alert ───────────────────────────── */}
      {showRecordAlert && teamRecord && (
        <div className={`score-update__record-alert ${isRecordBroken ? 'score-update__record-alert--broken' : ''}`}>
          <div className="score-update__record-alert-text">
            {isRecordBroken ? (
              <>
                <strong>🏆 New tournament record!</strong>
                <span>
                  Beat {teamRecord.teamName}&rsquo;s {teamRecord.runs}/{teamRecord.wickets}
                  {' '}by {Math.abs(runsToRecord ?? 0)} run{Math.abs(runsToRecord ?? 0) === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              <>
                <strong>🔥 {runsToRecord} run{runsToRecord === 1 ? '' : 's'} to the tournament record</strong>
                <span>
                  Highest so far: {teamRecord.teamName} {teamRecord.runs}/{teamRecord.wickets} ({teamRecord.overs} ov)
                  {teamRecord.opponentName ? ` vs ${teamRecord.opponentName}` : ''}
                </span>
              </>
            )}
          </div>
          <div className="score-update__record-alert-actions">
            <button
              className="score-update__overlay-btn"
              onClick={() => setOverlay('award_orange_cap')}
              title="Show the tournament's highest run scorer on the broadcast"
            >
              🧢 Show Top Scorer
            </button>
            <button
              className="score-update__overlay-btn"
              onClick={() => setOverlay('match_summary')}
              title="Show the match summary overlay"
            >
              📋 Summary
            </button>
            <button
              className="score-update__overlay-btn score-update__overlay-btn--clear"
              onClick={() => setRecordAlertDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Live Score Strip ───────────────────────────────────────────── */}
      <div className="score-update__score-strip">
        <div className="score-update__team-score">
          <span className="score-update__team-label">
            {liveScore.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}
          </span>
          <span className="score-update__runs">
            {liveScore.runs}/{liveScore.wickets}
          </span>
          <span className="score-update__overs">({liveScore.overs} ov)</span>
        </div>
        <div className="score-update__rate-info">
          <span>CRR: {liveScore.runRate}</span>
          {liveScore.requiredRate !== undefined && <span>RRR: {liveScore.requiredRate}</span>}
          {liveScore.target !== undefined && <span>Target: {liveScore.target}</span>}
        </div>
      </div>

      {/* ── Current Over ──────────────────────────────────────────────── */}
      <div className="score-update__current-over">
        <span className="score-update__over-label">This Over:</span>
        <div className="score-update__ball-sequence">
          {(liveScore.currentOverBalls || []).map((ball, i) => (
            <span key={i} className={`score-update__ball-chip score-update__ball-chip--${getBallChipClass(ball)}`}>
              {ball}
            </span>
          ))}
        </div>
        {(liveScore.recentOvers || []).length > 0 && (
          <div className="score-update__recent-overs">
            {(liveScore.recentOvers || []).slice(-6).map((o, i) => (
              <span key={i} className="score-update__over-runs">{o}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Batsmen ───────────────────────────────────────────────────── */}
      <div className="score-update__batsmen">
        {(liveScore.currentBatsmen || []).map((bat, i) => (
          <div
            key={bat.playerId}
            className={`score-update__batsman ${bat.isOnStrike ? 'score-update__batsman--strike' : ''}`}
            onClick={() => setShowBatsmanPicker(i === 0 ? 'striker' : 'non-striker')}
          >
            <span className="score-update__bat-name">
              {bat.isOnStrike && <span className="score-update__strike-dot">●</span>}
              {bat.playerName}
            </span>
            <span className="score-update__bat-score">
              {bat.runs} ({bat.balls}) {bat.fours > 0 && `· ${bat.fours}×4`} {bat.sixes > 0 && `· ${bat.sixes}×6`}
            </span>
            <span className="score-update__bat-sr">SR: {bat.strikeRate}</span>
          </div>
        ))}
        <div className="score-update__partnership">
          P'ship: {(liveScore.partnership || { runs: 0, balls: 0 }).runs} ({(liveScore.partnership || { runs: 0, balls: 0 }).balls})
        </div>
      </div>

      {/* ── Bowler ────────────────────────────────────────────────────── */}
      <div className="score-update__bowler" onClick={() => setShowBowlerPicker(true)}>
        <GiBowlingStrike size={16} color="#60a5fa" />
        <span className="score-update__bowler-name">{liveScore.currentBowler.playerName}</span>
        <span className="score-update__bowler-figs">
          {liveScore.currentBowler.overs}-{liveScore.currentBowler.maidens}-{liveScore.currentBowler.runs}-{liveScore.currentBowler.wickets}
        </span>
        <span className="score-update__bowler-eco">Eco: {liveScore.currentBowler.economy}</span>
        <IoChevronDown size={14} />
      </div>

      {/* ── Run Buttons ───────────────────────────────────────────────── */}
      <div className="score-update__run-grid">
        {RUN_BUTTONS.map(btn => (
          <button
            key={btn.outcome}
            className={`score-update__run-btn score-update__run-btn--${btn.className}`}
            onClick={() => handleRunClick(btn.outcome)}
            disabled={recording}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Wicket + Extra Buttons ────────────────────────────────────── */}
      <div className="score-update__action-row">
        <button
          className="score-update__btn score-update__btn--wicket"
          onClick={() => setShowWicketModal(true)}
          disabled={recording}
        >
          W
        </button>
        <button
          className={`score-update__btn score-update__btn--extra ${expandedExtra === 'NB' ? 'score-update__btn--active' : ''}`}
          onClick={() => setExpandedExtra(expandedExtra === 'NB' ? null : 'NB')}
          disabled={recording}
        >
          NB
        </button>
        <button
          className={`score-update__btn score-update__btn--extra ${expandedExtra === 'WD' ? 'score-update__btn--active' : ''}`}
          onClick={() => setExpandedExtra(expandedExtra === 'WD' ? null : 'WD')}
          disabled={recording}
        >
          WD
        </button>
        <button
          className={`score-update__btn score-update__btn--extra ${expandedExtra === 'B' ? 'score-update__btn--active' : ''}`}
          onClick={() => setExpandedExtra(expandedExtra === 'B' ? null : 'B')}
          disabled={recording}
        >
          B
        </button>
        <button
          className={`score-update__btn score-update__btn--extra ${expandedExtra === 'LB' ? 'score-update__btn--active' : ''}`}
          onClick={() => setExpandedExtra(expandedExtra === 'LB' ? null : 'LB')}
          disabled={recording}
        >
          LB
        </button>
        <button
          className={`score-update__btn score-update__btn--extra ${expandedExtra === 'PEN' ? 'score-update__btn--active' : ''}`}
          onClick={() => setExpandedExtra(expandedExtra === 'PEN' ? null : 'PEN')}
          disabled={recording}
          title="Penalty runs"
        >
          PEN
        </button>
      </div>

      {/* ── Extra Sub-options Panels ──────────────────────────────────── */}
      <AnimatePresence>
        {expandedExtra === 'NB' && (
          <motion.div
            className="score-update__sub-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="score-update__sub-label">No Ball:</span>
            {NB_SUB_OPTIONS.map(btn => (
              <button
                key={btn.outcome}
                className="score-update__btn score-update__btn--sub"
                onClick={() => { handleRunClick(btn.outcome); setExpandedExtra(null); }}
                disabled={recording}
              >
                {btn.label}
              </button>
            ))}
            <button
              className="score-update__btn score-update__btn--sub score-update__btn--runout"
              onClick={() => { setPendingExtraOutcome('NB+0'); setShowWicketModal(true); setExpandedExtra(null); }}
              disabled={recording}
            >
              NB + Run Out
            </button>
          </motion.div>
        )}
        {expandedExtra === 'WD' && (
          <motion.div
            className="score-update__sub-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="score-update__sub-label">Wide:</span>
            {WD_SUB_OPTIONS.map(btn => (
              <button
                key={btn.outcome}
                className="score-update__btn score-update__btn--sub"
                onClick={() => { handleRunClick(btn.outcome); setExpandedExtra(null); }}
                disabled={recording}
              >
                {btn.label}
              </button>
            ))}
            <button
              className="score-update__btn score-update__btn--sub score-update__btn--runout"
              onClick={() => { setPendingExtraOutcome('WD'); setShowWicketModal(true); setExpandedExtra(null); }}
              disabled={recording}
            >
              WD + Stumped/Run Out
            </button>
          </motion.div>
        )}
        {expandedExtra === 'B' && (
          <motion.div
            className="score-update__sub-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="score-update__sub-label">Bye:</span>
            {B_SUB_OPTIONS.map(btn => (
              <button
                key={btn.outcome}
                className="score-update__btn score-update__btn--sub"
                onClick={() => { handleRunClick(btn.outcome); setExpandedExtra(null); }}
                disabled={recording}
              >
                {btn.label}
              </button>
            ))}
            <button
              className="score-update__btn score-update__btn--sub score-update__btn--runout"
              onClick={() => { setPendingExtraOutcome('B+1'); setShowWicketModal(true); setExpandedExtra(null); }}
              disabled={recording}
            >
              B + Run Out
            </button>
          </motion.div>
        )}
        {expandedExtra === 'LB' && (
          <motion.div
            className="score-update__sub-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="score-update__sub-label">Leg Bye:</span>
            {LB_SUB_OPTIONS.map(btn => (
              <button
                key={btn.outcome}
                className="score-update__btn score-update__btn--sub"
                onClick={() => { handleRunClick(btn.outcome); setExpandedExtra(null); }}
                disabled={recording}
              >
                {btn.label}
              </button>
            ))}
            <button
              className="score-update__btn score-update__btn--sub score-update__btn--runout"
              onClick={() => { setPendingExtraOutcome('LB+1'); setShowWicketModal(true); setExpandedExtra(null); }}
              disabled={recording}
            >
              LB + Run Out
            </button>
          </motion.div>
        )}
        {expandedExtra === 'PEN' && (
          <motion.div
            className="score-update__sub-options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="score-update__sub-label">Penalty Runs:</span>
            {PEN_SUB_OPTIONS.map(btn => (
              <button
                key={btn.outcome}
                className="score-update__btn score-update__btn--sub"
                onClick={() => { handleRunClick(btn.outcome); setExpandedExtra(null); }}
                disabled={recording}
              >
                {btn.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Undo + Controls ───────────────────────────────────────────── */}
      <div className="score-update__controls">
        <button
          className="score-update__btn score-update__btn--undo"
          onClick={undoLastBall}
          disabled={undoStack.length === 0 || recording}
        >
          <IoArrowUndo size={16} /> Undo ({undoStack.length})
        </button>
        <button
          className="score-update__btn"
          onClick={() => swapStrike()}
        >
          <IoSwapHorizontal size={16} /> Swap
        </button>
        <button
          className="score-update__btn score-update__btn--secondary"
          onClick={() => { setInitModalDefaults(null); setShowInitModal(true); }}
        >
          New Innings
        </button>
        <button
          className="score-update__btn score-update__btn--secondary"
          onClick={() => setShowAddPlayerModal(true)}
        >
          + Add Player
        </button>
      </div>

      {/* ── Overlay Trigger Buttons ───────────────────────────────────── */}
      <div className="score-update__overlay-triggers">
        <span className="score-update__overlay-label">Overlay:</span>
        {[
          { type: 'full_scorecard' as const, label: 'Scorecard' },
          { type: 'batsman_striker' as const, label: 'Striker' },
          { type: 'batsman_nonstriker' as const, label: 'Non-Striker' },
          { type: 'bowler' as const, label: 'Bowler' },
          { type: 'boundary_four' as const, label: '4!' },
          { type: 'boundary_six' as const, label: '6!' },
          { type: 'wicket' as const, label: 'Wicket' },
          { type: 'duck_out' as const, label: 'Duck' },
          { type: 'hat_trick' as const, label: 'Hat-Trick' },
          { type: 'stats_fours' as const, label: '4s Stats' },
          { type: 'stats_sixes' as const, label: '6s Stats' },
          { type: 'stats_sr' as const, label: 'SR Stats' },
          { type: 'stats_mvp' as const, label: 'MVP' },
          { type: 'match_summary' as const, label: 'Summary' },
          { type: 'live_question' as const, label: 'Question' },
          { type: 'field_placement' as const, label: 'Field' },
          { type: 'none' as const, label: 'Clear' },
        ].map(item => (
          <button
            key={item.type}
            className={`score-update__overlay-btn ${item.type === 'none' ? 'score-update__overlay-btn--clear' : ''}`}
            onClick={() => setOverlay(item.type)}
          >
            {item.label}
          </button>
        ))}
        <button
          className={`score-update__overlay-btn ${showFieldEditor ? 'score-update__overlay-btn--active' : ''}`}
          onClick={() => setShowFieldEditor(v => !v)}
        >
          🟢 Edit Field
        </button>
        <button
          className="score-update__overlay-btn"
          onClick={() => setShowPlayerStatsModal(true)}
        >
          📊 Player Stats
        </button>
      </div>

      {/* ── OBS Custom Buttons (relay to OBS dock) ───────────────────── */}
      {obsRelayButtons.length > 0 && matchId && (
        <div className="score-update__overlay-triggers" style={{ marginTop: '0.8rem' }}>
          <span className="score-update__overlay-label">OBS Quick Buttons:</span>
          {obsRelayButtons.map(btn => (
            <button
              key={btn.id}
              className="score-update__overlay-btn"
              style={{ borderColor: `${btn.color}66`, color: '#e2e8f0', background: `${btn.color}26` }}
              onClick={async () => {
                await obsReplaySourceService.sendRelayCommand(matchId, btn.id);
                setObsRelayFeedback(`Sent: ${btn.label}`);
                setTimeout(() => setObsRelayFeedback(''), 1800);
              }}
              title={btn.action === 'series'
                ? `Series: ${(btn.series || []).length} steps`
                : (btn.hotkeyName ? `Mapped: ${btn.hotkeyName}` : btn.label)}
            >
              <span>{btn.icon}</span>
              <span>{btn.label}</span>
              {btn.action === 'series' && <span style={{ opacity: 0.75 }}>({(btn.series || []).length})</span>}
            </button>
          ))}
          {obsRelayFeedback && (
            <span className="score-update__overlay-label" style={{ marginLeft: '0.4rem', color: '#38bdf8' }}>
              {obsRelayFeedback}
            </span>
          )}
        </div>
      )}

      {/* ── Ticker Widget Quick Controls (live scorer) ───────────────── */}
      <div className="score-update__overlay-triggers" style={{ marginTop: '0.6rem' }}>
        <span className="score-update__overlay-label">Ticker Widgets:</span>
        {TICKER_WIDGET_OPTIONS.map((widget) => {
          const enabled = tickerWidgetModes.includes(widget.key);
          const pos = tickerWidgetModes.indexOf(widget.key);
          return (
            <div key={widget.key} className="score-update__ticker-widget-chip">
              <button
                className={`score-update__overlay-btn ${enabled ? 'score-update__overlay-btn--active' : ''}`}
                onClick={() => toggleTickerWidget(widget.key)}
                title={`Toggle ${widget.label}`}
              >
                {widget.label}
              </button>
              <button
                className="score-update__ticker-order-btn"
                onClick={() => moveTickerWidget(widget.key, -1)}
                disabled={!enabled || pos <= 0}
                title="Move left"
              >
                ←
              </button>
              <button
                className="score-update__ticker-order-btn"
                onClick={() => moveTickerWidget(widget.key, 1)}
                disabled={!enabled || pos < 0 || pos >= tickerWidgetModes.length - 1}
                title="Move right"
              >
                →
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Field Placement Editor Panel ──────────────────────────────── */}
      <AnimatePresence>
        {showFieldEditor && matchId && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <FieldPlacementEditor matchId={matchId} onClose={() => setShowFieldEditor(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showWicketModal && (
          <WicketModal
            battingLineup={battingLineup?.players || []}
            bowlingLineup={bowlingLineup?.players || []}
            currentBatsmen={liveScore.currentBatsmen}
            currentBowler={liveScore.currentBowler}
            allBatsmen={liveScore.allBatsmen}
            extraContext={pendingExtraOutcome}
            isFreehit={liveScore.isFreehit}
            onConfirm={async (wicket, runsCompleted) => {
              let outcome: BallOutcome;
              if (pendingExtraOutcome) {
                // Build correct outcome with runs completed
                const extraStr = String(pendingExtraOutcome);
                if (extraStr.startsWith('NB')) {
                  outcome = (runsCompleted ? `NB+${runsCompleted}` : 'NB+0') as BallOutcome;
                } else if (extraStr.startsWith('WD')) {
                  outcome = (runsCompleted ? `WD+${runsCompleted}` : 'WD') as BallOutcome;
                } else if (extraStr.startsWith('B')) {
                  outcome = (runsCompleted ? `B+${runsCompleted}` : 'B') as BallOutcome;
                } else if (extraStr.startsWith('LB')) {
                  outcome = (runsCompleted ? `LB+${runsCompleted}` : 'LB') as BallOutcome;
                } else {
                  outcome = pendingExtraOutcome;
                }
              } else {
                // Plain wicket — runs scored on the ball (e.g., caught off a big shot attempt = 0)
                // For run_out without extras, runs go as batsman runs
                if (wicket.dismissalType === 'run_out' && runsCompleted && runsCompleted > 0) {
                  outcome = String(runsCompleted) as BallOutcome;
                } else {
                  outcome = 'W';
                }
              }
              await recordBall(outcome, wicket);
              setShowWicketModal(false);
              setPendingExtraOutcome(null);
            }}
            onClose={() => { setShowWicketModal(false); setPendingExtraOutcome(null); }}
          />
        )}
      </AnimatePresence>

      {showBatsmanPicker && (
        <PlayerPickerModal
          title={`Select ${showBatsmanPicker === 'striker' ? 'Striker' : 'Non-Striker'}`}
          players={(battingLineup?.players || []).filter(p => {
            // Exclude already dismissed batsmen
            const dismissed = (liveScore.allBatsmen || []).find(b => b.playerId === p.playerId);
            if (dismissed?.isOut) return false;
            // Exclude currently batting players
            if (liveScore.currentBatsmen.some(b => b.playerId === p.playerId)) return false;
            return true;
          })}
          onSelect={(p) => { changeBatsman(p, showBatsmanPicker!); setShowBatsmanPicker(null); }}
          onQuickAdd={async (name) => {
            const newPlayer: MatchSquadPlayer = {
              playerId: `quick_bat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              playerName: name,
              role: 'Batsman',
              battingOrder: 99,
              isImpactSub: true,
            };
            await addPlayerToLineup(liveScore.battingTeamId, newPlayer);
            changeBatsman(newPlayer, showBatsmanPicker);
            setShowBatsmanPicker(null);
          }}
          quickAddLabel="Add missing batsman"
          onClose={() => setShowBatsmanPicker(null)}
        />
      )}

      {showBowlerPicker && (
        <PlayerPickerModal
          title={needsBowlerChange ? 'Select New Bowler (required)' : 'Select Bowler'}
          players={bowlingLineup?.players || []}
          disabledPlayerId={liveScore.previousBowlerId}
          disabledReason="Bowled last over"
          onSelect={(p) => { changeBowler(p); setShowBowlerPicker(false); }}
          onQuickAdd={async (name) => {
            const newPlayer: MatchSquadPlayer = {
              playerId: `quick_bowl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              playerName: name,
              role: 'Bowler',
              battingOrder: 99,
              isImpactSub: true,
            };
            await addPlayerToLineup(liveScore.bowlingTeamId, newPlayer);
            changeBowler(newPlayer);
            setShowBowlerPicker(false);
          }}
          quickAddLabel="Add missing bowler"
          onClose={() => { if (!needsBowlerChange) setShowBowlerPicker(false); }}
        />
      )}

      {showInitModal && (
        <InitInningsModal
          match={match}
          lineups={lineups}
          defaults={initModalDefaults}
          onStart={async (data) => {
            await initInnings(
              data.inningsNumber,
              data.battingTeamId,
              data.bowlingTeamId,
              data.openers,
              data.openingBowler,
              data.target,
            );
            setShowInitModal(false);
            setInitModalDefaults(null);
          }}
          onClose={() => { setShowInitModal(false); setInitModalDefaults(null); }}
        />
      )}

      {/* ── End of Innings Modal ──────────────────────────────────────── */}
      {showEndOfInningsModal && liveScore && (
        <div className="score-update__modal-overlay" onClick={() => setShowEndOfInningsModal(false)}>
          <motion.div
            className="score-update__modal"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <h3>Innings Complete</h3>
            <div className="score-update__innings-summary">
              <p className="score-update__innings-total">
                {liveScore.runs}/{liveScore.wickets} ({liveScore.overs} ov)
              </p>
              <p>Run Rate: {liveScore.runRate}</p>
            </div>
            {liveScore.currentInnings === 1 ? (
              <>
                <p>Target for 2nd innings: <strong>{liveScore.runs + 1}</strong></p>
                <div className="score-update__modal-actions">
                  <button
                    className="score-update__btn score-update__btn--primary score-update__btn--lg"
                    onClick={() => {
                      setShowEndOfInningsModal(false);
                      // Pre-fill 2nd innings: swap teams, auto-set target
                      setInitModalDefaults({
                        inningsNumber: 2,
                        battingTeamId: liveScore.bowlingTeamId,
                        target: liveScore.runs + 1,
                      });
                      setShowInitModal(true);
                    }}
                  >
                    Start 2nd Innings
                  </button>
                </div>
              </>
            ) : (
              <div className="score-update__modal-actions">
                <button
                  className="score-update__btn score-update__btn--primary score-update__btn--lg"
                  onClick={() => {
                    setShowEndOfInningsModal(false);
                    completeMatch();
                  }}
                >
                  Complete Match
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Match Complete Modal ──────────────────────────────────────── */}
      {showMatchCompleteModal && (
        <div className="score-update__modal-overlay">
          <motion.div
            className="score-update__modal"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h3>🏆 Match Complete</h3>
            <p>The match has been completed and stats saved.</p>
            <div className="score-update__modal-actions">
              <button
                className="score-update__btn score-update__btn--primary"
                onClick={() => {
                  setOverlay('match_summary');
                  setShowMatchCompleteModal(false);
                }}
              >
                Show Summary Overlay
              </button>
              <button
                className="score-update__btn"
                onClick={() => {
                  setShowMatchCompleteModal(false);
                  navigate('/cricket/scorer/admin');
                }}
              >
                Back to Admin
              </button>
            </div>
            {singleOverlayMode && (
              <div className="score-update__modal-actions" style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.6rem' }}>
                <button className="score-update__btn score-update__btn--primary" onClick={handleStartNextMatch}>
                  <IoPlay size={16} /> Start Next Match
                </button>
                <button className="score-update__btn" onClick={handleEndScorerSession}>
                  End This Scorer Session
                </button>
              </div>
            )}
            {matchActionFeedback && <p className="score-update__hint">{matchActionFeedback}</p>}
          </motion.div>
        </div>
      )}

      {/* ── Add Player Modal (injury replacement) ─────────────────────── */}
      {showAddPlayerModal && match && liveScore && (
        <AddPlayerModal
          match={match}
          lineups={lineups}
          onAdd={(teamId, player) => {
            addPlayerToLineup(teamId, player);
            setShowAddPlayerModal(false);
          }}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}

      {/* ── Player Stats Notes Modal ──────────────────────────────────── */}
      {showPlayerStatsModal && matchId && (
        <PlayerStatsNotesModal
          matchId={matchId}
          lineups={lineups}
          onClose={() => setShowPlayerStatsModal(false)}
        />
      )}

      {showCompletedEditModal && matchId && liveScore && (
        <CompletedScorecardEditModal
          matchId={matchId}
          liveScore={liveScore}
          maxOvers={match.maxOvers}
          onClose={() => setShowCompletedEditModal(false)}
          onSaved={async (message) => {
            setShowCompletedEditModal(false);
            setCompletedEditFeedback(message);
            setTimeout(() => setCompletedEditFeedback(''), 3500);
            await completeMatch();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreHeader({ match }: { match: { teamA: { name: string }; teamB: { name: string }; venue: string } }) {
  const navigate = useNavigate();
  return (
    <header className="score-update__header">
      <div>
        <h1 className="score-update__match-title">
          {match.teamA.name} vs {match.teamB.name}
        </h1>
        <p className="score-update__venue">{match.venue}</p>
      </div>
      <button className="score-update__close-btn" onClick={() => navigate('/cricket/scorer/admin')}>
        <IoClose size={20} />
      </button>
    </header>
  );
}

function getBallChipClass(ball: string): string {
  if (ball === 'W' || ball.includes('·W')) return 'wicket';
  if (ball === '4') return 'four';
  if (ball === '6') return 'six';
  if (ball === '0') return 'dot';
  if (ball.includes('WD') || ball.includes('NB') || ball === 'B' || ball === 'LB' || ball.startsWith('P')) return 'extra';
  return 'run';
}

// ── Wicket Modal ─────────────────────────────────────────────────────────────

function WicketModal({ battingLineup, bowlingLineup, currentBatsmen, currentBowler, allBatsmen, extraContext, isFreehit, onConfirm, onClose }: {
  battingLineup: MatchSquadPlayer[];
  bowlingLineup: MatchSquadPlayer[];
  currentBatsmen: [{ playerId: string; playerName: string }, { playerId: string; playerName: string }];
  currentBowler: { playerId: string; playerName: string };
  allBatsmen?: { playerId: string; isOut: boolean }[];
  extraContext?: BallOutcome | null;
  isFreehit?: boolean;
  onConfirm: (wicket: WicketDetail, runsCompleted?: number) => void;
  onClose: () => void;
}) {
  // Determine allowed dismissal types based on delivery context
  const allowedDismissals = (() => {
    // Free hit: only run_out is valid (and obstructing the field)
    if (isFreehit && !extraContext) {
      return DISMISSAL_TYPES.filter(d => d.value === 'run_out' || d.value === 'obstructing_field');
    }
    if (!extraContext) return DISMISSAL_TYPES;
    const str = String(extraContext);
    if (str.startsWith('NB') || str.startsWith('B+') || str.startsWith('LB+') || str === 'B' || str === 'LB') {
      return DISMISSAL_TYPES.filter(d => d.value === 'run_out');
    }
    if (str.startsWith('WD') || str === 'WD') {
      return DISMISSAL_TYPES.filter(d => d.value === 'run_out' || d.value === 'stumped');
    }
    return DISMISSAL_TYPES;
  })();

  const [dismissalType, setDismissalType] = useState<DismissalType>(allowedDismissals[0]?.value || 'run_out');
  const [outBatsman, setOutBatsman] = useState(currentBatsmen[0].playerId);
  const [fielderId, setFielderId] = useState('');
  const [newBatsmanId, setNewBatsmanId] = useState('');
  const [runsCompleted, setRunsCompleted] = useState(0);

  // Show runs completed field for run_out (batsmen cross before dismissal)
  const showRunsCompleted = dismissalType === 'run_out';

  const needsFielder = ['caught', 'run_out', 'stumped'].includes(dismissalType);
  const dismissedIds = new Set((allBatsmen || []).filter(b => b.isOut).map(b => b.playerId));
  const currentIds = new Set(currentBatsmen.map(b => b.playerId));
  const availableBatsmen = battingLineup.filter(
    p => !dismissedIds.has(p.playerId) && !currentIds.has(p.playerId),
  );

  return (
    <motion.div className="score-update__modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="score-update__modal" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} onClick={e => e.stopPropagation()}>
        <h3>{extraContext ? `Wicket on ${String(extraContext)}` : 'Wicket'}</h3>

        <div className="score-update__modal-field">
          <label>Dismissal Type</label>
          <select value={dismissalType} onChange={e => setDismissalType(e.target.value as DismissalType)} className="score-update__select">
            {allowedDismissals.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        <div className="score-update__modal-field">
          <label>Out Batsman</label>
          <select value={outBatsman} onChange={e => setOutBatsman(e.target.value)} className="score-update__select">
            {currentBatsmen.map(b => <option key={b.playerId} value={b.playerId}>{b.playerName}</option>)}
          </select>
        </div>

        {needsFielder && (
          <div className="score-update__modal-field">
            <label>Fielder</label>
            <select value={fielderId} onChange={e => setFielderId(e.target.value)} className="score-update__select">
              <option value="">Select fielder</option>
              {bowlingLineup.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
            </select>
          </div>
        )}

        {showRunsCompleted && (
          <div className="score-update__modal-field">
            <label>Runs completed before run out</label>
            <div className="score-update__runs-row">
              {[0, 1, 2, 3].map(n => (
                <button
                  key={n}
                  className={`score-update__btn score-update__btn--sub ${runsCompleted === n ? 'score-update__btn--active' : ''}`}
                  onClick={() => setRunsCompleted(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="score-update__modal-field">
          <label>New Batsman</label>
          <select value={newBatsmanId} onChange={e => setNewBatsmanId(e.target.value)} className="score-update__select">
            <option value="">Select new batsman</option>
            {availableBatsmen.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
          </select>
        </div>

        <div className="score-update__modal-actions">
          <button
            className="score-update__btn score-update__btn--wicket"
            onClick={() => {
              const isCaughtAndBowled = dismissalType === 'caught_and_bowled';
              onConfirm({
                dismissalType,
                batsmanId: outBatsman,
                bowlerId: currentBowler.playerId,
                fielderId: isCaughtAndBowled ? currentBowler.playerId : (fielderId || undefined),
                fielderName: isCaughtAndBowled ? currentBowler.playerName : bowlingLineup.find(p => p.playerId === fielderId)?.playerName,
                newBatsmanId: newBatsmanId || undefined,
                newBatsmanName: battingLineup.find(p => p.playerId === newBatsmanId)?.playerName,
              }, showRunsCompleted ? runsCompleted : undefined);
            }}
          >
            Confirm Wicket
          </button>
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Toss Setup Modal ────────────────────────────────────────────────────────

function TossSetupModal({ match, onConfirm, onClose }: {
  match: { teamA: { id: string; name: string }; teamB: { id: string; name: string } };
  onConfirm: (wonBy: string, elected: 'bat' | 'bowl') => void | Promise<void>;
  onClose: () => void;
}) {
  const [wonBy, setWonBy] = useState(match.teamA.id);
  const [elected, setElected] = useState<'bat' | 'bowl'>('bat');

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal" onClick={e => e.stopPropagation()}>
        <h3>Enter Toss Details</h3>
        <p className="score-update__hint" style={{ marginBottom: '0.8rem' }}>Required once before first innings starts.</p>

        <div className="score-update__modal-field">
          <label>Toss Won By</label>
          <select value={wonBy} onChange={e => setWonBy(e.target.value)} className="score-update__select">
            <option value={match.teamA.id}>{match.teamA.name}</option>
            <option value={match.teamB.id}>{match.teamB.name}</option>
          </select>
        </div>

        <div className="score-update__modal-field">
          <label>Elected to</label>
          <select value={elected} onChange={e => setElected(e.target.value as 'bat' | 'bowl')} className="score-update__select">
            <option value="bat">Bat</option>
            <option value="bowl">Bowl</option>
          </select>
        </div>

        <div className="score-update__modal-actions">
          <button className="score-update__btn score-update__btn--primary" onClick={() => onConfirm(wonBy, elected)}>
            Save Toss & Continue
          </button>
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Init Innings Modal ───────────────────────────────────────────────────────

function InitInningsModal({ match, lineups, defaults, onStart, onClose }: {
  match: { id: string; teamA: { id: string; name: string }; teamB: { id: string; name: string }; maxOvers: number };
  lineups: { teamA: { players: MatchSquadPlayer[] } | null; teamB: { players: MatchSquadPlayer[] } | null };
  defaults?: { inningsNumber?: 1 | 2; battingTeamId?: string; target?: number } | null;
  onStart: (data: {
    inningsNumber: 1 | 2;
    battingTeamId: string;
    bowlingTeamId: string;
    openers: [MatchSquadPlayer, MatchSquadPlayer];
    openingBowler: MatchSquadPlayer;
    target?: number;
  }) => void;
  onClose: () => void;
}) {
  const [inningsNumber, setInningsNumber] = useState<1 | 2>(defaults?.inningsNumber || 1);
  const [battingTeamId, setBattingTeamId] = useState(defaults?.battingTeamId || match.teamA.id);
  const [opener1, setOpener1] = useState('');
  const [opener2, setOpener2] = useState('');
  const [bowlerId, setBowlerId] = useState('');
  const [target, setTarget] = useState<number | ''>(defaults?.target || '');

  const bowlingTeamId = battingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;
  const battingPlayers = (battingTeamId === match.teamA.id ? lineups.teamA : lineups.teamB)?.players || [];
  const bowlingPlayers = (bowlingTeamId === match.teamA.id ? lineups.teamA : lineups.teamB)?.players || [];

  // Sort batting players: Batsman → All-rounder → Bowler
  const battingRoleOrder = ['batsman', 'wicket keeper', 'batting all-rounder', 'all-rounder', 'bowling all-rounder', 'bowler', 'uncategorized'];
  const bowlingRoleOrder = ['bowler', 'bowling all-rounder', 'all-rounder', 'batting all-rounder', 'batsman', 'wicket keeper', 'uncategorized'];
  const getRoleIdx = (role: string, order: string[]) => {
    const n = role.toLowerCase().trim();
    const idx = order.findIndex(r => n.includes(r));
    return idx >= 0 ? idx : order.length;
  };
  const sortedBattingPlayers = [...battingPlayers].sort((a, b) => getRoleIdx(a.role, battingRoleOrder) - getRoleIdx(b.role, battingRoleOrder));
  const sortedBowlingPlayers = [...bowlingPlayers].sort((a, b) => getRoleIdx(a.role, bowlingRoleOrder) - getRoleIdx(b.role, bowlingRoleOrder));

  const handleStart = () => {
    const o1 = battingPlayers.find(p => p.playerId === opener1);
    const o2 = battingPlayers.find(p => p.playerId === opener2);
    const bowler = bowlingPlayers.find(p => p.playerId === bowlerId);
    if (!o1 || !o2 || !bowler) return;
    onStart({
      inningsNumber,
      battingTeamId,
      bowlingTeamId,
      openers: [o1, o2],
      openingBowler: bowler,
      target: target ? Number(target) : undefined,
    });
  };

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal score-update__modal--wide" onClick={e => e.stopPropagation()}>
        <h3>Start Innings</h3>

        <div className="score-update__modal-grid">
          <div className="score-update__modal-field">
            <label>Innings</label>
            <select value={inningsNumber} onChange={e => setInningsNumber(Number(e.target.value) as 1 | 2)} className="score-update__select">
              <option value={1}>1st Innings</option>
              <option value={2}>2nd Innings</option>
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Batting Team</label>
            <select value={battingTeamId} onChange={e => setBattingTeamId(e.target.value)} className="score-update__select">
              <option value={match.teamA.id}>{match.teamA.name}</option>
              <option value={match.teamB.id}>{match.teamB.name}</option>
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Opener 1 (Striker)</label>
            <select value={opener1} onChange={e => setOpener1(e.target.value)} className="score-update__select">
              <option value="">Select</option>
              {sortedBattingPlayers.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName} ({p.role})</option>)}
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Opener 2 (Non-Striker)</label>
            <select value={opener2} onChange={e => setOpener2(e.target.value)} className="score-update__select">
              <option value="">Select</option>
              {sortedBattingPlayers.filter(p => p.playerId !== opener1).map(p => <option key={p.playerId} value={p.playerId}>{p.playerName} ({p.role})</option>)}
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Opening Bowler</label>
            <select value={bowlerId} onChange={e => setBowlerId(e.target.value)} className="score-update__select">
              <option value="">Select</option>
              {sortedBowlingPlayers.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName} ({p.role})</option>)}
            </select>
          </div>

          {inningsNumber === 2 && (
            <div className="score-update__modal-field">
              <label>Target</label>
              <input type="number" value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Target score" className="score-update__input" />
            </div>
          )}
        </div>

        <div className="score-update__modal-actions">
          <button
            className="score-update__btn score-update__btn--primary score-update__btn--lg"
            onClick={handleStart}
            disabled={!opener1 || !opener2 || !bowlerId}
          >
            <IoPlay size={18} /> Start Innings
          </button>
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Player Picker Modal ──────────────────────────────────────────────────────

function PlayerPickerModal({ title, players, disabledPlayerId, disabledReason, onSelect, onQuickAdd, quickAddLabel, onClose }: {
  title: string;
  players: MatchSquadPlayer[];
  disabledPlayerId?: string;
  disabledReason?: string;
  onSelect: (p: MatchSquadPlayer) => void;
  onQuickAdd?: (name: string) => void | Promise<void>;
  quickAddLabel?: string;
  onClose: () => void;
}) {
  // Sort players by role: for batting selectors show Batsman → All-rounder → Bowler
  // For bowling selectors show Bowler → All-rounder → Batsman
  const isBowlerPicker = title.toLowerCase().includes('bowler');
  const roleOrder = isBowlerPicker
    ? ['bowler', 'bowling all-rounder', 'all-rounder', 'batting all-rounder', 'batsman', 'wicket keeper', 'uncategorized']
    : ['batsman', 'wicket keeper', 'batting all-rounder', 'all-rounder', 'bowling all-rounder', 'bowler', 'uncategorized'];

  const getRoleWeight = (role: string) => {
    const normalized = role.toLowerCase().trim();
    const idx = roleOrder.findIndex(r => normalized.includes(r));
    return idx >= 0 ? idx : roleOrder.length;
  };

  const sortedPlayers = [...players].sort((a, b) => getRoleWeight(a.role) - getRoleWeight(b.role));
  const [quickName, setQuickName] = useState('');

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="score-update__player-list">
          {sortedPlayers.map(p => {
            const isDisabled = p.playerId === disabledPlayerId;
            return (
              <button
                key={p.playerId}
                className={`score-update__player-btn ${isDisabled ? 'score-update__player-btn--disabled' : ''}`}
                onClick={() => !isDisabled && onSelect(p)}
                disabled={isDisabled}
              >
                {p.playerName}
                <span className="score-update__player-role">
                  {isDisabled ? disabledReason : p.role}
                  {p.isImpactSub ? ' ⭐' : ''}
                </span>
              </button>
            );
          })}
        </div>
        {onQuickAdd && (
          <div className="score-update__modal-field" style={{ marginTop: '0.7rem' }}>
            <label>{quickAddLabel || 'Add missing player'}</label>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <input
                type="text"
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                placeholder="Player name"
                className="score-update__input"
              />
              <button
                className="score-update__btn score-update__btn--secondary"
                onClick={async () => {
                  const name = quickName.trim();
                  if (!name) return;
                  await onQuickAdd(name);
                  setQuickName('');
                }}
                disabled={!quickName.trim()}
              >
                + Add
              </button>
            </div>
            <small className="score-update__hint">Name-only add for live continuity. Edit full details later in admin.</small>
          </div>
        )}
        <div className="score-update__modal-actions">
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Player Modal (injury replacement mid-match) ──────────────────────────

function AddPlayerModal({ match, lineups, onAdd, onClose }: {
  match: { id: string; teamA: { id: string; name: string }; teamB: { id: string; name: string } };
  lineups: { teamA: { players: MatchSquadPlayer[] } | null; teamB: { players: MatchSquadPlayer[] } | null };
  onAdd: (teamId: string, player: MatchSquadPlayer) => void;
  onClose: () => void;
}) {
  const [teamId, setTeamId] = useState(match.teamA.id);
  const [playerName, setPlayerName] = useState('');
  const [role, setRole] = useState('Batsman');

  const handleAdd = () => {
    if (!playerName.trim()) return;
    const newPlayer: MatchSquadPlayer = {
      playerId: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      playerName: playerName.trim(),
      role,
      battingOrder: 99,
      isImpactSub: true,
    };
    onAdd(teamId, newPlayer);
  };

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal" onClick={e => e.stopPropagation()}>
        <h3>Add Player (Injury Replacement)</h3>
        <div className="score-update__modal-field">
          <label>Team</label>
          <select value={teamId} onChange={e => setTeamId(e.target.value)} className="score-update__select">
            <option value={match.teamA.id}>{match.teamA.name}</option>
            <option value={match.teamB.id}>{match.teamB.name}</option>
          </select>
        </div>
        <div className="score-update__modal-field">
          <label>Player Name</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter player name"
            className="score-update__input"
            autoFocus
          />
        </div>
        <div className="score-update__modal-field">
          <label>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="score-update__select">
            <option value="Batsman">Batsman</option>
            <option value="Bowler">Bowler</option>
            <option value="All-rounder">All-rounder</option>
            <option value="Wicket Keeper">Wicket Keeper</option>
          </select>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '8px 0' }}>
          Current squad: {teamId === match.teamA.id
            ? lineups.teamA?.players.length || 0
            : lineups.teamB?.players.length || 0} players
        </p>
        <div className="score-update__modal-actions">
          <button
            className="score-update__btn score-update__btn--primary"
            onClick={handleAdd}
            disabled={!playerName.trim()}
          >
            Add to Squad
          </button>
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Player Stats Notes Modal (input/edit stats mid-match) ────────────────────

function PlayerStatsNotesModal({ matchId, lineups, onClose }: {
  matchId: string;
  lineups: { teamA: { players: MatchSquadPlayer[] } | null; teamB: { players: MatchSquadPlayer[] } | null };
  onClose: () => void;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [statKey, setStatKey] = useState('');
  const [statValue, setStatValue] = useState('');
  const [notes, setNotes] = useState<Record<string, { stats: { stat: string; value: string }[] }>>({});
  const [saving, setSaving] = useState(false);

  const allPlayers = [
    ...(lineups.teamA?.players || []),
    ...(lineups.teamB?.players || []),
  ];

  useEffect(() => {
    scoringService.getPlayerMatchNotes(matchId).then(setNotes);
  }, [matchId]);

  const handleAdd = async () => {
    if (!selectedPlayer || !statKey.trim() || !statValue.trim()) return;
    setSaving(true);
    await scoringService.savePlayerMatchNote(matchId, selectedPlayer, { stat: statKey.trim(), value: statValue.trim() });
    const updated = await scoringService.getPlayerMatchNotes(matchId);
    setNotes(updated);
    setStatKey('');
    setStatValue('');
    setSaving(false);
  };

  const handleDelete = async (playerId: string, stat: string) => {
    await scoringService.deletePlayerMatchNote(matchId, playerId, stat);
    const updated = await scoringService.getPlayerMatchNotes(matchId);
    setNotes(updated);
  };

  const playerName = (id: string) => allPlayers.find(p => p.playerId === id)?.playerName || id;

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal score-update__modal--wide" onClick={e => e.stopPropagation()}>
        <h3>📊 Player Stats & Notes</h3>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>
          Add stats or notes for players during the match. These can be displayed in overlays.
        </p>

        {/* Input form */}
        <div className="score-update__modal-grid">
          <div className="score-update__modal-field">
            <label>Player</label>
            <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} className="score-update__select">
              <option value="">Select Player</option>
              {allPlayers.map(p => (
                <option key={p.playerId} value={p.playerId}>{p.playerName} ({p.role})</option>
              ))}
            </select>
          </div>
          <div className="score-update__modal-field">
            <label>Stat Name</label>
            <input
              type="text"
              value={statKey}
              onChange={e => setStatKey(e.target.value)}
              placeholder="e.g. Season Avg, Last 5 Inns, Strike Rate"
              className="score-update__input"
            />
          </div>
          <div className="score-update__modal-field">
            <label>Value</label>
            <input
              type="text"
              value={statValue}
              onChange={e => setStatValue(e.target.value)}
              placeholder="e.g. 45.5, 3/25, 156.2"
              className="score-update__input"
            />
          </div>
        </div>
        <button
          className="score-update__btn score-update__btn--primary"
          onClick={handleAdd}
          disabled={!selectedPlayer || !statKey.trim() || !statValue.trim() || saving}
          style={{ marginTop: '8px' }}
        >
          {saving ? 'Saving...' : 'Add Stat'}
        </button>

        {/* Display existing notes */}
        <div style={{ marginTop: '16px', maxHeight: '300px', overflow: 'auto' }}>
          {Object.entries(notes).filter(([, v]) => v.stats && v.stats.length > 0).map(([playerId, data]) => (
            <div key={playerId} style={{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <strong style={{ color: '#fbbf24', fontSize: '13px' }}>{playerName(playerId)}</strong>
              {data.stats.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '12px' }}>
                  <span style={{ color: '#9ca3af' }}>{s.stat}: <strong style={{ color: '#fff' }}>{s.value}</strong></span>
                  <button
                    onClick={() => handleDelete(playerId, s.stat)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
          {Object.keys(notes).length === 0 && (
            <p style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center' }}>No stats added yet</p>
          )}
        </div>

        <div className="score-update__modal-actions">
          <button className="score-update__btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function isValidOverValue(value: number, maxOvers: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > maxOvers) return false;
  const whole = Math.floor(value);
  const balls = Math.round((value - whole) * 10);
  return balls >= 0 && balls <= 5;
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validateInningsCorrection(innings: Innings): string[] {
  const issues: string[] = [];
  const extras = innings.extras;
  const extrasSum = asNum(extras.wides) + asNum(extras.noBalls) + asNum(extras.byes) + asNum(extras.legByes) + asNum(extras.penalty);
  if (extrasSum !== asNum(extras.total)) {
    issues.push(`Innings ${innings.number}: extras total (${extras.total}) must equal breakdown (${extrasSum}).`);
  }

  if (!isValidOverValue(asNum(innings.totalOvers), asNum(innings.maxOvers))) {
    issues.push(`Innings ${innings.number}: overs must be in cricket format (x.0 to x.5) and within max overs.`);
  }

  if (innings.totalWickets < 0 || innings.totalWickets > 10) {
    issues.push(`Innings ${innings.number}: wickets must be between 0 and 10.`);
  }

  const batsmanRuns = innings.batsmen.reduce((sum, b) => sum + asNum(b.runs), 0);
  if (batsmanRuns + asNum(extras.total) !== asNum(innings.totalRuns)) {
    issues.push(`Innings ${innings.number}: total runs (${innings.totalRuns}) must equal batsman runs + extras (${batsmanRuns + asNum(extras.total)}).`);
  }

  const outCount = innings.batsmen.filter(b => b.isOut).length;
  if (asNum(innings.totalWickets) > outCount) {
    issues.push(`Innings ${innings.number}: wickets (${innings.totalWickets}) cannot exceed dismissed batsmen (${outCount}).`);
  }

  const batKeys = new Set<string>();
  for (const b of innings.batsmen) {
    const key = (b.playerId || b.playerName).trim().toLowerCase();
    if (!key) {
      issues.push(`Innings ${innings.number}: batsman row has empty player id/name.`);
      continue;
    }
    if (batKeys.has(key)) issues.push(`Innings ${innings.number}: duplicate batsman detected (${b.playerName}).`);
    batKeys.add(key);
  }

  const bowlKeys = new Set<string>();
  for (const b of innings.bowlers) {
    const key = (b.playerId || b.playerName).trim().toLowerCase();
    if (!key) {
      issues.push(`Innings ${innings.number}: bowler row has empty player id/name.`);
      continue;
    }
    if (bowlKeys.has(key)) issues.push(`Innings ${innings.number}: duplicate bowler detected (${b.playerName}).`);
    bowlKeys.add(key);
    if (!isValidOverValue(asNum(b.overs), asNum(innings.maxOvers))) {
      issues.push(`Innings ${innings.number}: bowler overs invalid for ${b.playerName}.`);
    }
  }

  return issues;
}

function CompletedScorecardEditModal({
  matchId,
  liveScore,
  maxOvers,
  onClose,
  onSaved,
}: {
  matchId: string;
  liveScore: LiveScore;
  maxOvers: number;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedInnings, setSelectedInnings] = useState<1 | 2>(liveScore.currentInnings);
  const [inningsMap, setInningsMap] = useState<Record<1 | 2, Innings | null>>({ 1: null, 2: null });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [inn1, inn2] = await Promise.all([
        scoringService.getInnings(matchId, 1),
        scoringService.getInnings(matchId, 2),
      ]);
      setInningsMap({ 1: inn1, 2: inn2 });
      if (!inn1 && inn2) setSelectedInnings(2);
      setLoading(false);
    };
    void load();
  }, [matchId]);

  const current = inningsMap[selectedInnings];

  const patchCurrent = (next: Innings) => {
    setInningsMap(prev => ({ ...prev, [selectedInnings]: next }));
  };

  const saveCorrections = async () => {
    const inn1 = inningsMap[1];
    const inn2 = inningsMap[2];
    const all = [inn1, inn2].filter((x): x is Innings => !!x);
    const issues = all.flatMap(validateInningsCorrection);
    setErrors(issues);
    if (issues.length > 0) return;

    setSaving(true);
    try {
      if (inn1) await scoringService.saveInnings(matchId, 1, inn1);
      if (inn2) await scoringService.saveInnings(matchId, 2, inn2);

      const updatedCurrent = inningsMap[liveScore.currentInnings];
      if (updatedCurrent) {
        const notOut = updatedCurrent.batsmen.filter(b => !b.isOut);
        const striker = notOut[0] || updatedCurrent.batsmen[0];
        const nonStriker = notOut[1] || updatedCurrent.batsmen[1] || striker;
        const primaryBowler = [...updatedCurrent.bowlers].sort((a, b) => asNum(b.overs) - asNum(a.overs))[0] || liveScore.currentBowler;
        const balls = Math.floor(asNum(updatedCurrent.totalOvers)) * 6 + Math.round((asNum(updatedCurrent.totalOvers) % 1) * 10);
        const rr = balls > 0 ? Math.round((asNum(updatedCurrent.totalRuns) / balls) * 6 * 100) / 100 : 0;

        const nextLive: LiveScore = {
          ...liveScore,
          runs: asNum(updatedCurrent.totalRuns),
          wickets: asNum(updatedCurrent.totalWickets),
          overs: asNum(updatedCurrent.totalOvers),
          runRate: rr,
          currentBatsmen: [
            {
              playerId: striker.playerId,
              playerName: striker.playerName,
              runs: asNum(striker.runs),
              balls: asNum(striker.balls),
              fours: asNum(striker.fours),
              sixes: asNum(striker.sixes),
              strikeRate: asNum(striker.strikeRate),
              isOnStrike: true,
            },
            {
              playerId: nonStriker.playerId,
              playerName: nonStriker.playerName,
              runs: asNum(nonStriker.runs),
              balls: asNum(nonStriker.balls),
              fours: asNum(nonStriker.fours),
              sixes: asNum(nonStriker.sixes),
              strikeRate: asNum(nonStriker.strikeRate),
              isOnStrike: false,
            },
          ],
          currentBowler: {
            playerId: primaryBowler.playerId,
            playerName: primaryBowler.playerName,
            overs: asNum(primaryBowler.overs),
            maidens: asNum(primaryBowler.maidens),
            runs: asNum(primaryBowler.runs),
            wickets: asNum(primaryBowler.wickets),
            economy: asNum(primaryBowler.economy),
            dots: asNum(primaryBowler.dots),
          },
          allBatsmen: updatedCurrent.batsmen,
          allBowlers: updatedCurrent.bowlers,
          lastUpdated: Date.now(),
        };
        await scoringService.saveLiveScore(matchId, nextLive);
      }

      await onSaved('Completed scorecard corrected and validated');
    } catch (err) {
      setErrors([`Failed to save corrections: ${String(err)}`]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal score-update__modal--wide" style={{ width: 'min(1100px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <h3>Completed Match Scorecard Corrections</h3>
        <p className="score-update__hint">Edit innings safely. Validation blocks duplicate batsmen/bowlers and inconsistent cricket totals.</p>

        <div className="score-update__modal-actions" style={{ justifyContent: 'flex-start', marginBottom: '0.5rem' }}>
          <button className={`score-update__btn ${selectedInnings === 1 ? 'score-update__btn--primary' : ''}`} onClick={() => setSelectedInnings(1)}>Innings 1</button>
          <button className={`score-update__btn ${selectedInnings === 2 ? 'score-update__btn--primary' : ''}`} onClick={() => setSelectedInnings(2)}>Innings 2</button>
        </div>

        {loading && <p>Loading scorecard...</p>}
        {!loading && !current && <p className="score-update__hint">No innings data available for this side yet.</p>}
        {!loading && current && (
          <>
            <div className="score-update__modal-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div className="score-update__modal-field"><label>Total</label><input className="score-update__input" type="number" value={current.totalRuns} onChange={e => patchCurrent({ ...current, totalRuns: asNum(e.target.value) })} /></div>
              <div className="score-update__modal-field"><label>Wickets</label><input className="score-update__input" type="number" min={0} max={10} value={current.totalWickets} onChange={e => patchCurrent({ ...current, totalWickets: asNum(e.target.value) })} /></div>
              <div className="score-update__modal-field"><label>Overs</label><input className="score-update__input" type="number" step="0.1" value={current.totalOvers} onChange={e => patchCurrent({ ...current, totalOvers: asNum(e.target.value) })} /></div>
              <div className="score-update__modal-field"><label>Max Overs</label><input className="score-update__input" type="number" value={current.maxOvers || maxOvers} onChange={e => patchCurrent({ ...current, maxOvers: asNum(e.target.value) })} /></div>
            </div>

            <div className="score-update__modal-grid" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
              <div className="score-update__modal-field"><label>Extras Total</label><input className="score-update__input" type="number" value={current.extras.total} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, total: asNum(e.target.value) } })} /></div>
              <div className="score-update__modal-field"><label>Wides</label><input className="score-update__input" type="number" value={current.extras.wides} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, wides: asNum(e.target.value) } })} /></div>
              <div className="score-update__modal-field"><label>No Balls</label><input className="score-update__input" type="number" value={current.extras.noBalls} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, noBalls: asNum(e.target.value) } })} /></div>
              <div className="score-update__modal-field"><label>Byes</label><input className="score-update__input" type="number" value={current.extras.byes} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, byes: asNum(e.target.value) } })} /></div>
              <div className="score-update__modal-field"><label>Leg Byes</label><input className="score-update__input" type="number" value={current.extras.legByes} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, legByes: asNum(e.target.value) } })} /></div>
              <div className="score-update__modal-field"><label>Penalty</label><input className="score-update__input" type="number" value={current.extras.penalty} onChange={e => patchCurrent({ ...current, extras: { ...current.extras, penalty: asNum(e.target.value) } })} /></div>
            </div>

            <div style={{ marginTop: '0.8rem' }}>
              <h4 style={{ margin: 0 }}>Batsmen</h4>
              {current.batsmen.map((b, i) => (
                <div key={`${b.playerId}-${i}`} className="score-update__modal-grid" style={{ gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 1.4fr 0.8fr auto', marginBottom: '0.35rem' }}>
                  <input className="score-update__input" value={b.playerName} onChange={e => {
                    const next = [...current.batsmen];
                    next[i] = { ...next[i], playerName: e.target.value, playerId: next[i].playerId || e.target.value.toLowerCase().replace(/\s+/g, '_') };
                    patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" type="number" value={b.runs} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], runs: asNum(e.target.value) }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" type="number" value={b.balls} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], balls: asNum(e.target.value) }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" type="number" value={b.fours} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], fours: asNum(e.target.value) }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" type="number" value={b.sixes} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], sixes: asNum(e.target.value) }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" type="number" step="0.01" value={b.strikeRate} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], strikeRate: asNum(e.target.value) }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <input className="score-update__input" value={b.dismissal || ''} onChange={e => {
                    const next = [...current.batsmen]; next[i] = { ...next[i], dismissal: e.target.value }; patchCurrent({ ...current, batsmen: next });
                  }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '11px', color: '#cbd5e1' }}>
                    <input type="checkbox" checked={!!b.isOut} onChange={e => {
                      const next = [...current.batsmen]; next[i] = { ...next[i], isOut: e.target.checked }; patchCurrent({ ...current, batsmen: next });
                    }} />
                    Out
                  </label>
                  <button className="score-update__btn score-update__btn--clear" onClick={() => patchCurrent({ ...current, batsmen: current.batsmen.filter((_, idx) => idx !== i) })}>✕</button>
                </div>
              ))}
              <button className="score-update__btn score-update__btn--secondary" onClick={() => patchCurrent({ ...current, batsmen: [...current.batsmen, { playerId: `bat_${Date.now()}`, playerName: 'New Batsman', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, dismissal: 'not out', isOut: false, order: current.batsmen.length + 1 } as BatsmanInnings] })}>+ Add Batsman</button>
            </div>

            <div style={{ marginTop: '0.8rem' }}>
              <h4 style={{ margin: 0 }}>Bowlers</h4>
              {current.bowlers.map((b, i) => (
                <div key={`${b.playerId}-${i}`} className="score-update__modal-grid" style={{ gridTemplateColumns: '2fr repeat(6, 0.85fr) auto', marginBottom: '0.35rem' }}>
                  <input className="score-update__input" value={b.playerName} onChange={e => {
                    const next = [...current.bowlers];
                    next[i] = { ...next[i], playerName: e.target.value, playerId: next[i].playerId || e.target.value.toLowerCase().replace(/\s+/g, '_') };
                    patchCurrent({ ...current, bowlers: next });
                  }} />
                  <input className="score-update__input" type="number" step="0.1" value={b.overs} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], overs: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <input className="score-update__input" type="number" value={b.maidens} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], maidens: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <input className="score-update__input" type="number" value={b.runs} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], runs: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <input className="score-update__input" type="number" value={b.wickets} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], wickets: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <input className="score-update__input" type="number" step="0.01" value={b.economy} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], economy: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <input className="score-update__input" type="number" value={b.dots} onChange={e => { const next = [...current.bowlers]; next[i] = { ...next[i], dots: asNum(e.target.value) }; patchCurrent({ ...current, bowlers: next }); }} />
                  <button className="score-update__btn score-update__btn--clear" onClick={() => patchCurrent({ ...current, bowlers: current.bowlers.filter((_, idx) => idx !== i) })}>✕</button>
                </div>
              ))}
              <button className="score-update__btn score-update__btn--secondary" onClick={() => patchCurrent({ ...current, bowlers: [...current.bowlers, { playerId: `bowl_${Date.now()}`, playerName: 'New Bowler', overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, wides: 0, noBalls: 0, dots: 0 } as BowlerInnings] })}>+ Add Bowler</button>
            </div>
          </>
        )}

        {errors.length > 0 && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
            {errors.map((e, i) => <p key={i} style={{ margin: '0.2rem 0', color: '#fecaca', fontSize: '12px' }}>{e}</p>)}
          </div>
        )}

        <div className="score-update__modal-actions">
          <button className="score-update__btn score-update__btn--primary" onClick={saveCorrections} disabled={saving || loading}>Save Corrections</button>
          <button className="score-update__btn" onClick={onClose} disabled={saving}>Close</button>
        </div>
      </div>
    </div>
  );
}
