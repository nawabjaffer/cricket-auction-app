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
import type { BallOutcome, DismissalType, WicketDetail, MatchSquadPlayer } from '../types/scoring';
import FieldPlacementEditor from '../components/FieldPlacementEditor/FieldPlacementEditor';
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

export default function ScoreUpdatePage() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || undefined;
  const navigate = useNavigate();
  const { isAuthenticated, extendSession } = useAdminAuth();

  const {
    match, liveScore, lineups, loading, error, recording,
    undoStack, recordBall, undoLastBall, initInnings,
    setOverlay, changeBatsman, changeBowler, swapStrike,
    completeMatch, isInningsComplete, isMatchComplete, needsBowlerChange,
    addPlayerToLineup,
  } = useScoringState(matchId);

  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);
  const [initModalDefaults, setInitModalDefaults] = useState<{ inningsNumber?: 1 | 2; battingTeamId?: string; target?: number } | null>(null);
  const [showBatsmanPicker, setShowBatsmanPicker] = useState<'striker' | 'non-striker' | null>(null);
  const [showBowlerPicker, setShowBowlerPicker] = useState(false);
  const [showEndOfInningsModal, setShowEndOfInningsModal] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [expandedExtra, setExpandedExtra] = useState<'NB' | 'WD' | 'B' | 'LB' | null>(null);
  const [pendingExtraOutcome, setPendingExtraOutcome] = useState<BallOutcome | null>(null); // for wicket-on-extra flow
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showPlayerStatsModal, setShowPlayerStatsModal] = useState(false);

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
            onClick={() => setShowInitModal(true)}
          >
            <IoPlay size={20} /> Start Innings
          </button>
        </div>
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

  return (
    <div className="score-update">
      <ScoreHeader match={match} />

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
  if (ball.includes('WD') || ball.includes('NB') || ball === 'B' || ball === 'LB') return 'extra';
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

function PlayerPickerModal({ title, players, disabledPlayerId, disabledReason, onSelect, onClose }: {
  title: string;
  players: MatchSquadPlayer[];
  disabledPlayerId?: string;
  disabledReason?: string;
  onSelect: (p: MatchSquadPlayer) => void;
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
