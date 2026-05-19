// ============================================================================
// SCORE OBS CONTROL DOCK — /:tenantSlug/cricket/scorer/obs-dock
// Compact dock panel for controlling scoring overlays in OBS
// Add as Custom Browser Dock in OBS: Docks → Custom Browser Docks
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { scoringService } from '../services/scoring';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import type { MatchSetup, LiveScore, OverlayControlState, OverlayType } from '../types/scoring';
import './ScoreOBSControlDock.css';

const OVERLAY_BUTTONS: { key: OverlayType; label: string; icon: string; shortcut: string; color: string }[] = [
  { key: 'full_scorecard', label: 'Scorecard', icon: '📊', shortcut: 'F', color: '#3b82f6' },
  { key: 'batsman_striker', label: 'Striker', icon: '🏏', shortcut: '[', color: '#22c55e' },
  { key: 'batsman_nonstriker', label: 'Non-Striker', icon: '🏏', shortcut: ']', color: '#14b8a6' },
  { key: 'bowler', label: 'Bowler', icon: '⚾', shortcut: ';', color: '#a855f7' },
  { key: 'boundary_four', label: '4!', icon: '4️⃣', shortcut: '4', color: '#eab308' },
  { key: 'boundary_six', label: '6!', icon: '6️⃣', shortcut: '6', color: '#f97316' },
  { key: 'wicket', label: 'Wicket', icon: '🔴', shortcut: 'W', color: '#ef4444' },
  { key: 'duck_out', label: 'Duck', icon: '🦆', shortcut: 'D', color: '#f59e0b' },
  { key: 'hat_trick', label: 'Hat-Trick', icon: '🎩', shortcut: 'H', color: '#ec4899' },
  { key: 'live_question', label: 'Question', icon: '❓', shortcut: 'Q', color: '#6366f1' },
  { key: 'ads_break', label: 'Ads Break', icon: '📺', shortcut: 'A', color: '#64748b' },
];

const STATS_OVERLAY_BUTTONS: { key: OverlayType; label: string; icon: string; color: string }[] = [
  { key: 'stats_fours', label: '4s Stats', icon: '4️⃣', color: '#eab308' },
  { key: 'stats_sixes', label: '6s Stats', icon: '6️⃣', color: '#f97316' },
  { key: 'stats_sr', label: 'Strike Rate', icon: '📈', color: '#22c55e' },
  { key: 'stats_mvp', label: 'MVP', icon: '🏆', color: '#fbbf24' },
  { key: 'match_summary', label: 'Summary', icon: '📋', color: '#3b82f6' },
  { key: 'points_table', label: 'Points Table', icon: '📊', color: '#0ea5e9' },
  { key: 'award_orange_cap', label: 'Orange Cap', icon: '🧢', color: '#f97316' },
  { key: 'award_purple_cap', label: 'Purple Cap', icon: '🧢', color: '#a855f7' },
];

export default function ScoreOBSControlDock() {
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('none');
  const [feedback, setFeedback] = useState('');
  const initialized = useRef(false);

  // Initialize scoring service + load matches
  useEffect(() => {
    const init = async () => {
      try {
        if (!initialized.current) {
          await realtimeSync.ensureInitialized();
          const db = realtimeSync.getDatabase();
          if (db) {
            scoringService.initialize(db, tenantPath('scoring'));
            initialized.current = true;
          } else {
            console.error('[ScoreOBSControlDock] Failed to get database');
            return;
          }
        }
        const all = await scoringService.getAllMatches();
        setMatches(all);
        const params = new URLSearchParams(window.location.search);
        const qMatch = params.get('matchId');
        if (qMatch && all.some(m => m.id === qMatch)) {
          setSelectedMatchId(qMatch);
        } else if (all.length > 0) {
          const live = all.find(m => m.status === 'live');
          setSelectedMatchId(live?.id || all[0].id);
        }
      } catch (err) { console.error('[ScoreOBSControlDock] Init error:', err); }
    };
    init();
  }, []);

  // Subscribe to live score
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsub = scoringService.subscribeLiveScore(selectedMatchId, (score) => {
      setLiveScore(score);
    });
    return unsub;
  }, [selectedMatchId]);

  // Subscribe to overlay control
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsub = scoringService.subscribeOverlayControl(selectedMatchId, (control: OverlayControlState) => {
      setActiveOverlay(control.activeOverlay);
    });
    return unsub;
  }, [selectedMatchId]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2000);
  }, []);

  const triggerOverlay = useCallback(async (overlay: OverlayType) => {
    if (!selectedMatchId) return;
    try {
      // Animation overlays always re-trigger (don't toggle off)
      const animationTypes = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
      const isAnimation = animationTypes.includes(overlay);
      const newOverlay = isAnimation ? overlay : (activeOverlay === overlay ? 'none' : overlay);
      await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: newOverlay });
      setActiveOverlay(newOverlay);
      showFeedback(newOverlay === 'none' ? 'Overlay cleared' : `Showing: ${overlay.replace(/_/g, ' ')}`);
    } catch (err) {
      showFeedback(`Error: ${err}`);
    }
  }, [selectedMatchId, activeOverlay, showFeedback]);

  const clearOverlay = useCallback(async () => {
    if (!selectedMatchId) return;
    try {
      await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: 'none' });
      setActiveOverlay('none');
      showFeedback('Overlay cleared');
    } catch (err) {
      showFeedback(`Error: ${err}`);
    }
  }, [selectedMatchId, showFeedback]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toUpperCase();
      const mapping: Record<string, OverlayType> = {
        'F': 'full_scorecard',
        '[': 'batsman_striker',
        ']': 'batsman_nonstriker',
        ';': 'bowler',
        '4': 'boundary_four',
        '6': 'boundary_six',
        'W': 'wicket',
        'D': 'duck_out',
        'H': 'hat_trick',
        'Q': 'live_question',
        'A': 'ads_break',
      };
      if (e.key === 'Escape') {
        clearOverlay();
      } else if (mapping[key]) {
        triggerOverlay(mapping[key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [triggerOverlay, clearOverlay]);

  const selectedMatch = matches.find(m => m.id === selectedMatchId);

  return (
    <div className="score-dock">
      {/* Header */}
      <div className="score-dock__header">
        <span className="score-dock__title">Score × OBS</span>
        <span className={`score-dock__live-dot ${liveScore ? 'active' : ''}`} />
      </div>

      {/* Match Selector */}
      <div className="score-dock__section">
        <select
          className="score-dock__select"
          value={selectedMatchId}
          onChange={e => setSelectedMatchId(e.target.value)}
        >
          <option value="">Select match...</option>
          {matches.map(m => (
            <option key={m.id} value={m.id}>
              {m.teamA.name} vs {m.teamB.name} {m.status === 'live' ? '● LIVE' : `(${m.status})`}
            </option>
          ))}
        </select>
      </div>

      {/* Live Score Preview */}
      {liveScore && selectedMatch && (
        <div className="score-dock__score-preview">
          <div className="score-dock__score-teams">
            <span className="score-dock__batting-team">{liveScore.battingTeamId === selectedMatch.teamA.id ? selectedMatch.teamA.name : selectedMatch.teamB.name}</span>
            <span className="score-dock__score-value">{liveScore.runs}/{liveScore.wickets}</span>
            <span className="score-dock__overs">({liveScore.overs} ov)</span>
          </div>
          <div className="score-dock__batsmen">
            <span className="score-dock__batsman">
              🏏 {liveScore.currentBatsmen[0]?.playerName || '—'} {liveScore.currentBatsmen[0]?.runs || 0}*({liveScore.currentBatsmen[0]?.balls || 0})
            </span>
            <span className="score-dock__batsman">
              {liveScore.currentBatsmen[1]?.playerName || '—'} {liveScore.currentBatsmen[1]?.runs || 0}({liveScore.currentBatsmen[1]?.balls || 0})
            </span>
          </div>
          <div className="score-dock__bowler-info">
            ⚾ {liveScore.currentBowler?.playerName || '—'} {liveScore.currentBowler?.wickets || 0}/{liveScore.currentBowler?.runs || 0}
          </div>
          <div className="score-dock__this-over">
            {liveScore.currentOverBalls?.map((b, i) => (
              <span key={i} className={`score-dock__ball ${b === 'W' ? 'wicket' : b === '4' ? 'four' : b === '6' ? 'six' : ''}`}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Overlay Controls */}
      <div className="score-dock__section">
        <div className="score-dock__section-label">Overlay Controls</div>
        <div className="score-dock__overlay-grid">
          {OVERLAY_BUTTONS.map(btn => (
            <button
              key={btn.key}
              className={`score-dock__overlay-btn ${activeOverlay === btn.key ? 'active' : ''}`}
              style={{ '--btn-color': btn.color } as React.CSSProperties}
              onClick={() => triggerOverlay(btn.key)}
              title={`${btn.label} (${btn.shortcut})`}
            >
              <span className="score-dock__overlay-icon">{btn.icon}</span>
              <span className="score-dock__overlay-label">{btn.label}</span>
              <kbd className="score-dock__kbd">{btn.shortcut}</kbd>
            </button>
          ))}
        </div>
        <button className="score-dock__clear-btn" onClick={clearOverlay}>
          ✕ Clear Overlay (ESC)
        </button>
      </div>

      {/* Active Overlay Indicator */}
      {activeOverlay !== 'none' && (
        <div className="score-dock__active-indicator">
          <span className="score-dock__active-dot" />
          <span>{activeOverlay.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
      )}

      {/* Stats Overlay Controls */}
      <div className="score-dock__section">
        <div className="score-dock__section-label">Stats & Awards</div>
        <div className="score-dock__overlay-grid">
          {STATS_OVERLAY_BUTTONS.map(btn => (
            <button
              key={btn.key}
              className={`score-dock__overlay-btn ${activeOverlay === btn.key ? 'active' : ''}`}
              style={{ '--btn-color': btn.color } as React.CSSProperties}
              onClick={() => triggerOverlay(btn.key)}
              title={btn.label}
            >
              <span className="score-dock__overlay-icon">{btn.icon}</span>
              <span className="score-dock__overlay-label">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Replay Controls */}
      <div className="score-dock__section">
        <div className="score-dock__section-label">Replay Buffer</div>
        <div className="score-dock__replay-controls">
          <button
            className="score-dock__replay-btn"
            onClick={async () => {
              try {
                const { obsReplayService } = await import('../services/scoring/obsReplayService');
                obsReplayService.triggerManualReplay();
                showFeedback('Replay triggered');
              } catch {
                showFeedback('Connect to OBS first');
              }
            }}
          >
            ⏪ Instant Replay
          </button>
          <button
            className="score-dock__replay-btn"
            onClick={async () => {
              try {
                const { obsReplayService } = await import('../services/scoring/obsReplayService');
                obsReplayService.startReplayBuffer();
                showFeedback('Replay buffer started');
              } catch {
                showFeedback('Connect to OBS first');
              }
            }}
          >
            ▶️ Start Buffer
          </button>
          <button
            className="score-dock__replay-btn"
            onClick={async () => {
              try {
                const { obsReplayService } = await import('../services/scoring/obsReplayService');
                obsReplayService.stopReplayBuffer();
                showFeedback('Replay buffer stopped');
              } catch {
                showFeedback('Connect to OBS first');
              }
            }}
          >
            ⏹️ Stop Buffer
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && <div className="score-dock__feedback">{feedback}</div>}

      {/* Shortcuts Reference */}
      <div className="score-dock__section score-dock__shortcuts">
        <div className="score-dock__section-label">Keyboard Shortcuts</div>
        <div className="score-dock__shortcut-list">
          {OVERLAY_BUTTONS.map(btn => (
            <div key={btn.key} className="score-dock__shortcut-row">
              <kbd className="score-dock__kbd">{btn.shortcut}</kbd>
              <span>{btn.label}</span>
            </div>
          ))}
          <div className="score-dock__shortcut-row">
            <kbd className="score-dock__kbd">ESC</kbd>
            <span>Clear</span>
          </div>
        </div>
      </div>
    </div>
  );
}
