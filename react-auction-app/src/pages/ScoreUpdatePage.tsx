// ============================================================================
// SCORE UPDATE PAGE — /:tenantSlug/match/score/update?matchId=xxx
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
import type { BallOutcome, DismissalType, WicketDetail, MatchSquadPlayer } from '../types/scoring';
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

const EXTRA_BUTTONS: { outcome: BallOutcome; label: string }[] = [
  { outcome: 'WD', label: 'WD' },
  { outcome: 'NB', label: 'NB' },
  { outcome: 'B', label: 'B' },
  { outcome: 'LB', label: 'LB' },
  { outcome: 'WD+1', label: 'WD+1' },
  { outcome: 'NB+1', label: 'NB+1' },
  { outcome: 'NB+4', label: 'NB+4' },
  { outcome: 'NB+6', label: 'NB+6' },
];

const DISMISSAL_TYPES: { value: DismissalType; label: string }[] = [
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run_out', label: 'Run Out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit_wicket', label: 'Hit Wicket' },
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
    setOverlay, changeBatsman, changeBowler,
  } = useScoringState(matchId);

  const [showWicketModal, setShowWicketModal] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);
  const [showBatsmanPicker, setShowBatsmanPicker] = useState<'striker' | 'non-striker' | null>(null);
  const [showBowlerPicker, setShowBowlerPicker] = useState(false);

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
        <button onClick={() => navigate('/scoring/admin')} className="score-update__btn score-update__btn--primary">
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
          {liveScore.currentOverBalls.map((ball, i) => (
            <span key={i} className={`score-update__ball-chip score-update__ball-chip--${getBallChipClass(ball)}`}>
              {ball}
            </span>
          ))}
        </div>
        {liveScore.recentOvers.length > 0 && (
          <div className="score-update__recent-overs">
            {liveScore.recentOvers.slice(-6).map((o, i) => (
              <span key={i} className="score-update__over-runs">{o}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Batsmen ───────────────────────────────────────────────────── */}
      <div className="score-update__batsmen">
        {liveScore.currentBatsmen.map((bat, i) => (
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
          P'ship: {liveScore.partnership.runs} ({liveScore.partnership.balls})
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
        {EXTRA_BUTTONS.map(btn => (
          <button
            key={btn.outcome}
            className="score-update__btn score-update__btn--extra"
            onClick={() => handleRunClick(btn.outcome)}
            disabled={recording}
          >
            {btn.label}
          </button>
        ))}
      </div>

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
          onClick={() => {
            const [a, b] = liveScore.currentBatsmen;
            // Trigger swap by setting overlay signal (manual adapter handles it)
            changeBatsman(
              { playerId: b.playerId, playerName: b.playerName, role: '' },
              'striker',
            );
            changeBatsman(
              { playerId: a.playerId, playerName: a.playerName, role: '' },
              'non-striker',
            );
          }}
        >
          <IoSwapHorizontal size={16} /> Swap
        </button>
        <button
          className="score-update__btn score-update__btn--secondary"
          onClick={() => setShowInitModal(true)}
        >
          New Innings
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
          { type: 'live_question' as const, label: 'Question' },
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
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showWicketModal && (
          <WicketModal
            battingLineup={battingLineup?.players || []}
            bowlingLineup={bowlingLineup?.players || []}
            currentBatsmen={liveScore.currentBatsmen}
            currentBowler={liveScore.currentBowler}
            onConfirm={async (wicket) => {
              await recordBall('W', wicket);
              setShowWicketModal(false);
            }}
            onClose={() => setShowWicketModal(false)}
          />
        )}
      </AnimatePresence>

      {showBatsmanPicker && (
        <PlayerPickerModal
          title={`Select ${showBatsmanPicker === 'striker' ? 'Striker' : 'Non-Striker'}`}
          players={battingLineup?.players || []}
          onSelect={(p) => { changeBatsman(p, showBatsmanPicker!); setShowBatsmanPicker(null); }}
          onClose={() => setShowBatsmanPicker(null)}
        />
      )}

      {showBowlerPicker && (
        <PlayerPickerModal
          title="Select Bowler"
          players={bowlingLineup?.players || []}
          onSelect={(p) => { changeBowler(p); setShowBowlerPicker(false); }}
          onClose={() => setShowBowlerPicker(false)}
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
      <button className="score-update__close-btn" onClick={() => navigate('/scoring/admin')}>
        <IoClose size={20} />
      </button>
    </header>
  );
}

function getBallChipClass(ball: string): string {
  if (ball === 'W') return 'wicket';
  if (ball === '4') return 'four';
  if (ball === '6') return 'six';
  if (ball === '0') return 'dot';
  if (ball.includes('WD') || ball.includes('NB')) return 'extra';
  return 'run';
}

// ── Wicket Modal ─────────────────────────────────────────────────────────────

function WicketModal({ battingLineup, bowlingLineup, currentBatsmen, currentBowler, onConfirm, onClose }: {
  battingLineup: MatchSquadPlayer[];
  bowlingLineup: MatchSquadPlayer[];
  currentBatsmen: [{ playerId: string; playerName: string }, { playerId: string; playerName: string }];
  currentBowler: { playerId: string; playerName: string };
  onConfirm: (wicket: WicketDetail) => void;
  onClose: () => void;
}) {
  const [dismissalType, setDismissalType] = useState<DismissalType>('bowled');
  const [outBatsman, setOutBatsman] = useState(currentBatsmen[0].playerId);
  const [fielderId, setFielderId] = useState('');
  const [newBatsmanId, setNewBatsmanId] = useState('');

  const needsFielder = ['caught', 'run_out', 'stumped'].includes(dismissalType);
  const availableBatsmen = battingLineup.filter(
    p => !currentBatsmen.some(b => b.playerId === p.playerId) || p.playerId === outBatsman,
  );

  return (
    <motion.div className="score-update__modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="score-update__modal" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} onClick={e => e.stopPropagation()}>
        <h3>Wicket</h3>

        <div className="score-update__modal-field">
          <label>Dismissal Type</label>
          <select value={dismissalType} onChange={e => setDismissalType(e.target.value as DismissalType)} className="score-update__select">
            {DISMISSAL_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
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

        <div className="score-update__modal-field">
          <label>New Batsman</label>
          <select value={newBatsmanId} onChange={e => setNewBatsmanId(e.target.value)} className="score-update__select">
            <option value="">Select new batsman</option>
            {availableBatsmen
              .filter(p => p.playerId !== outBatsman && !currentBatsmen.some(b => b.playerId === p.playerId))
              .map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
          </select>
        </div>

        <div className="score-update__modal-actions">
          <button
            className="score-update__btn score-update__btn--wicket"
            onClick={() => {
              onConfirm({
                dismissalType,
                batsmanId: outBatsman,
                bowlerId: currentBowler.playerId,
                fielderId: fielderId || undefined,
                fielderName: bowlingLineup.find(p => p.playerId === fielderId)?.playerName,
                newBatsmanId: newBatsmanId || undefined,
              });
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

function InitInningsModal({ match, lineups, onStart, onClose }: {
  match: { id: string; teamA: { id: string; name: string }; teamB: { id: string; name: string }; maxOvers: number };
  lineups: { teamA: { players: MatchSquadPlayer[] } | null; teamB: { players: MatchSquadPlayer[] } | null };
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
  const [inningsNumber, setInningsNumber] = useState<1 | 2>(1);
  const [battingTeamId, setBattingTeamId] = useState(match.teamA.id);
  const [opener1, setOpener1] = useState('');
  const [opener2, setOpener2] = useState('');
  const [bowlerId, setBowlerId] = useState('');
  const [target, setTarget] = useState<number | ''>('');

  const bowlingTeamId = battingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;
  const battingPlayers = (battingTeamId === match.teamA.id ? lineups.teamA : lineups.teamB)?.players || [];
  const bowlingPlayers = (bowlingTeamId === match.teamA.id ? lineups.teamA : lineups.teamB)?.players || [];

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
              {battingPlayers.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Opener 2 (Non-Striker)</label>
            <select value={opener2} onChange={e => setOpener2(e.target.value)} className="score-update__select">
              <option value="">Select</option>
              {battingPlayers.filter(p => p.playerId !== opener1).map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
            </select>
          </div>

          <div className="score-update__modal-field">
            <label>Opening Bowler</label>
            <select value={bowlerId} onChange={e => setBowlerId(e.target.value)} className="score-update__select">
              <option value="">Select</option>
              {bowlingPlayers.map(p => <option key={p.playerId} value={p.playerId}>{p.playerName}</option>)}
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

function PlayerPickerModal({ title, players, onSelect, onClose }: {
  title: string;
  players: MatchSquadPlayer[];
  onSelect: (p: MatchSquadPlayer) => void;
  onClose: () => void;
}) {
  return (
    <div className="score-update__modal-overlay" onClick={onClose}>
      <div className="score-update__modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="score-update__player-list">
          {players.map(p => (
            <button
              key={p.playerId}
              className="score-update__player-btn"
              onClick={() => onSelect(p)}
            >
              {p.playerName}
              <span className="score-update__player-role">{p.role}</span>
            </button>
          ))}
        </div>
        <div className="score-update__modal-actions">
          <button className="score-update__btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
