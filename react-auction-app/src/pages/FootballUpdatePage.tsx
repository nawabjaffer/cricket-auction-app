// ============================================================================
// FOOTBALL UPDATE PAGE — /:tenantSlug/football/scorer/update?matchId=xxx
// Live scorer control: match timer (start/pause/half/extra-time), goals,
// cards, substitutions. Writes live state + fires OBS overlay celebrations.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IoPlay, IoPause, IoFootball, IoSquare, IoSwapHorizontal, IoClose,
  IoAdd, IoRemove, IoTime, IoArrowForward, IoWarning,
} from 'react-icons/io5';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { tenantPath } from '../services/tenantPath';
import { realtimeSync } from '../services/realtimeSync';
import { footballService } from '../services/football';
import {
  computeMatchMinute, halfBaseMinute, FOOTBALL_HALF_LABELS, createEmptyFootballLiveState,
} from '../types/football';
import type {
  FootballMatchSetup, FootballLiveState, FootballPlayer, FootballHalf,
  FootballMatchEvent, FootballEventType, FootballOverlayControl,
} from '../types/football';
import './FootballUpdatePage.css';

const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

// Progression of match phases when tapping "Next Phase".
const NEXT_HALF: Record<FootballHalf, FootballHalf> = {
  not_started: 'first_half',
  first_half: 'half_time',
  half_time: 'second_half',
  second_half: 'full_time',
  extra_first: 'extra_break',
  extra_break: 'extra_second',
  extra_second: 'penalties',
  penalties: 'full_time',
  full_time: 'full_time',
};

export default function FootballUpdatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const matchId = params.get('matchId');
  const { isAuthenticated, extendSession } = useAdminAuth();

  const [ready, setReady] = useState(false);
  const [match, setMatch] = useState<FootballMatchSetup | null>(null);
  const [live, setLive] = useState<FootballLiveState | null>(null);
  const [players, setPlayers] = useState<FootballPlayer[]>([]);
  const [, setTick] = useState(0); // forces clock re-render each second
  const [eventModal, setEventModal] = useState<null | { type: FootballEventType; teamId: string }>(null);

  const liveRef = useRef<FootballLiveState | null>(null);
  useEffect(() => { liveRef.current = live; }, [live]);

  // ── Init ──
  useEffect(() => {
    (async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) footballService.initialize(db, tenantPath('football'));
      } catch (err) { console.warn('[FootballUpdate] init warning:', err); }
      setReady(true);
    })();
  }, []);

  // ── Auth guard ──
  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
    const activity = () => extendSession();
    window.addEventListener('click', activity);
    return () => window.removeEventListener('click', activity);
  }, [isAuthenticated, navigate, extendSession]);

  // ── Subscriptions ──
  useEffect(() => {
    if (!ready || !matchId) return;
    const unsubMatch = footballService.subscribeMatch(matchId, setMatch);
    const unsubLive = footballService.subscribeLive(matchId, (l) => setLive(l ?? createEmptyFootballLiveState(matchId)));
    const unsubPlayers = footballService.subscribePlayers(setPlayers);
    return () => { unsubMatch(); unsubLive(); unsubPlayers(); };
  }, [ready, matchId]);

  // ── Clock ticker ──
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback(async (next: FootballLiveState) => {
    setLive(next);
    await footballService.saveLive(next);
  }, []);

  const fireOverlay = useCallback(async (control: FootballOverlayControl) => {
    if (!matchId) return;
    await footballService.triggerOverlay(matchId, control);
  }, [matchId]);

  // ── Timer controls ──
  const toggleClock = useCallback(async () => {
    const l = liveRef.current;
    if (!l) return;
    if (l.running) {
      const add = Math.floor((Date.now() - l.clockStartedAt) / 1000);
      await persist({ ...l, running: false, baseElapsedSec: l.baseElapsedSec + Math.max(0, add), clockStartedAt: 0 });
    } else {
      const half = l.half === 'not_started' ? 'first_half' : l.half;
      await persist({ ...l, running: true, half, clockStartedAt: Date.now() });
      if (l.half === 'not_started') {
        fireOverlay({ activeOverlay: 'kickoff', lastUpdated: Date.now() });
        if (matchId) footballService.updateMatchStatus(matchId, 'live');
      }
    }
  }, [persist, fireOverlay, matchId]);

  const nextPhase = useCallback(async () => {
    const l = liveRef.current;
    if (!l) return;
    const target = NEXT_HALF[l.half];
    // Reset the running clock to the new half's base minute.
    const base = halfBaseMinute(target) * 60;
    await persist({ ...l, half: target, running: false, clockStartedAt: 0, baseElapsedSec: base, addedTimeMin: 0 });
    if (target === 'half_time') fireOverlay({ activeOverlay: 'half_time', lastUpdated: Date.now() });
    if (target === 'full_time') { fireOverlay({ activeOverlay: 'full_time', lastUpdated: Date.now() }); if (matchId) footballService.updateMatchStatus(matchId, 'completed'); }
  }, [persist, fireOverlay, matchId]);

  const setAddedTime = useCallback(async (delta: number) => {
    const l = liveRef.current;
    if (!l) return;
    await persist({ ...l, addedTimeMin: Math.max(0, l.addedTimeMin + delta) });
  }, [persist]);

  const adjustScore = useCallback(async (side: 'home' | 'away', delta: number) => {
    const l = liveRef.current;
    if (!l) return;
    const key = side === 'home' ? 'homeScore' : 'awayScore';
    await persist({ ...l, [key]: Math.max(0, l[key] + delta) });
  }, [persist]);

  // ── Events ──
  const addEvent = useCallback(async (type: FootballEventType, teamId: string, player?: FootballPlayer, assist?: FootballPlayer, subOut?: FootballPlayer) => {
    const l = liveRef.current;
    if (!l) return;
    const { minute } = computeMatchMinute(l);
    const ev: FootballMatchEvent = {
      id: uid('ev'), type, teamId, playerId: player?.id, playerName: player?.name,
      assistPlayerId: assist?.id, assistPlayerName: assist?.name,
      subOutPlayerId: subOut?.id, subOutPlayerName: subOut?.name,
      minute, half: l.half, timestamp: Date.now(),
    };
    const isHome = match?.teamA.id === teamId;
    let next = { ...l, events: [ev, ...l.events] };
    if (type === 'goal' || type === 'own_goal' || type === 'penalty_goal') {
      next = { ...next, [isHome ? 'homeScore' : 'awayScore']: (isHome ? l.homeScore : l.awayScore) + 1 };
      if (player) footballService.incrementPlayerStat(player.id, 'goals');
      if (assist) footballService.incrementPlayerStat(assist.id, 'assists');
      fireOverlay({ activeOverlay: type === 'penalty_goal' ? 'penalty' : 'goal', activeEvent: ev, lastUpdated: Date.now() });
    } else if (type === 'red_card' || type === 'second_yellow') {
      if (player) footballService.incrementPlayerStat(player.id, 'redCards');
      fireOverlay({ activeOverlay: 'red_card', activeEvent: ev, lastUpdated: Date.now() });
    } else if (type === 'yellow_card') {
      if (player) footballService.incrementPlayerStat(player.id, 'yellowCards');
      fireOverlay({ activeOverlay: 'yellow_card', activeEvent: ev, lastUpdated: Date.now() });
    } else if (type === 'substitution') {
      fireOverlay({ activeOverlay: 'substitution', activeEvent: ev, lastUpdated: Date.now() });
    }
    await persist(next);
    setEventModal(null);
  }, [match, persist, fireOverlay]);

  const removeEvent = useCallback(async (id: string) => {
    const l = liveRef.current;
    if (!l) return;
    await persist({ ...l, events: l.events.filter((e) => e.id !== id) });
  }, [persist]);

  if (!isAuthenticated) return null;
  if (!matchId) return <div className="fbu"><div className="fbu__empty">No matchId. Open this page from the Football Admin.</div></div>;
  if (!ready || !match || !live) return <div className="fbu"><div className="fbu__empty">Loading match…</div></div>;

  const { minute, second } = computeMatchMinute(live);
  const displayClock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const homePlayers = players.filter((p) => p.teamId === match.teamA.id);
  const awayPlayers = players.filter((p) => p.teamId === match.teamB.id);

  return (
    <div className="fbu">
      <header className="fbu__top">
        <button className="fbu__back" onClick={() => navigate('/football/scorer/admin')}>← Admin</button>
        <div className="fbu__competition">{match.competition || 'Match'} · {match.venue}</div>
        <button className="fbu__overlay-link" onClick={() => window.open(`/football/scorer/obs-overlay?matchId=${matchId}`, '_blank')}>Open Overlay</button>
      </header>

      {/* Scoreboard */}
      <section className="fbu__scoreboard">
        <TeamScore side="home" name={match.teamA.shortName} full={match.teamA.name} logo={match.teamA.logoUrl}
          color={match.teamA.primaryColor} score={live.homeScore} onAdd={() => adjustScore('home', 1)} onSub={() => adjustScore('home', -1)} />

        <div className="fbu__center">
          <div className="fbu__clock" data-running={live.running}>
            <IoTime size={16} /> {displayClock}
            {live.addedTimeMin > 0 && <span className="fbu__added">+{live.addedTimeMin}</span>}
          </div>
          <div className="fbu__half">{FOOTBALL_HALF_LABELS[live.half]}</div>
          <div className="fbu__timer-controls">
            <button className={`fbu__timer-btn ${live.running ? 'fbu__timer-btn--pause' : 'fbu__timer-btn--play'}`} onClick={toggleClock}>
              {live.running ? <IoPause size={20} /> : <IoPlay size={20} />}
              {live.running ? 'Pause' : 'Start'}
            </button>
            <button className="fbu__timer-btn fbu__timer-btn--next" onClick={nextPhase}>
              <IoArrowForward size={18} /> Next: {FOOTBALL_HALF_LABELS[NEXT_HALF[live.half]]}
            </button>
          </div>
          <div className="fbu__added-controls">
            <span>Added time</span>
            <button onClick={() => setAddedTime(-1)}><IoRemove size={14} /></button>
            <strong>+{live.addedTimeMin}</strong>
            <button onClick={() => setAddedTime(1)}><IoAdd size={14} /></button>
          </div>
        </div>

        <TeamScore side="away" name={match.teamB.shortName} full={match.teamB.name} logo={match.teamB.logoUrl}
          color={match.teamB.primaryColor} score={live.awayScore} onAdd={() => adjustScore('away', 1)} onSub={() => adjustScore('away', -1)} />
      </section>

      {/* Event actions */}
      <section className="fbu__actions">
        <div className="fbu__action-col">
          <h3>{match.teamA.name}</h3>
          <EventButtons onPick={(type) => setEventModal({ type, teamId: match.teamA.id })} />
        </div>
        <div className="fbu__action-col">
          <h3>{match.teamB.name}</h3>
          <EventButtons onPick={(type) => setEventModal({ type, teamId: match.teamB.id })} />
        </div>
      </section>

      {/* Timeline */}
      <section className="fbu__timeline">
        <h3>Match Events</h3>
        {live.events.length === 0 && <p className="fbu__empty-sm">No events yet.</p>}
        <div className="fbu__events">
          {live.events.map((e) => {
            const isHome = e.teamId === match.teamA.id;
            return (
              <div key={e.id} className={`fbu__event ${isHome ? 'fbu__event--home' : 'fbu__event--away'}`}>
                <span className="fbu__event-min">{e.minute}'</span>
                <span className="fbu__event-icon">{eventIcon(e.type)}</span>
                <span className="fbu__event-text">
                  <strong>{e.playerName || 'Unknown'}</strong>
                  {e.assistPlayerName && <em> (assist {e.assistPlayerName})</em>}
                  {e.subOutPlayerName && <em> ⇄ {e.subOutPlayerName}</em>}
                  <span className="fbu__event-type">{eventLabel(e.type)}</span>
                </span>
                <button className="fbu__event-del" onClick={() => removeEvent(e.id)}><IoClose size={14} /></button>
              </div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {eventModal && (
          <EventModal
            type={eventModal.type}
            teamName={eventModal.teamId === match.teamA.id ? match.teamA.name : match.teamB.name}
            players={eventModal.teamId === match.teamA.id ? homePlayers : awayPlayers}
            onClose={() => setEventModal(null)}
            onConfirm={(player, assist, subOut) => addEvent(eventModal.type, eventModal.teamId, player, assist, subOut)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamScore({ name, full, logo, color, score, onAdd, onSub }: Readonly<{
  side: 'home' | 'away'; name: string; full: string; logo?: string; color?: string;
  score: number; onAdd: () => void; onSub: () => void;
}>) {
  return (
    <div className="fbu__team">
      <div className="fbu__team-logo" style={{ background: color ?? '#e11d1d' }}>
        {logo ? <img src={logo} alt={full} /> : <IoFootball size={26} />}
      </div>
      <div className="fbu__team-name" title={full}>{name}</div>
      <div className="fbu__team-score">{score}</div>
      <div className="fbu__team-score-controls">
        <button onClick={onSub}><IoRemove size={16} /></button>
        <button onClick={onAdd}><IoAdd size={16} /></button>
      </div>
    </div>
  );
}

function EventButtons({ onPick }: Readonly<{ onPick: (type: FootballEventType) => void }>) {
  return (
    <div className="fbu__event-buttons">
      <button className="fbu__eb fbu__eb--goal" onClick={() => onPick('goal')}><IoFootball size={18} /> Goal</button>
      <button className="fbu__eb fbu__eb--pen" onClick={() => onPick('penalty_goal')}>⚽ Penalty</button>
      <button className="fbu__eb fbu__eb--yellow" onClick={() => onPick('yellow_card')}><IoSquare size={16} /> Yellow</button>
      <button className="fbu__eb fbu__eb--red" onClick={() => onPick('red_card')}><IoSquare size={16} /> Red</button>
      <button className="fbu__eb fbu__eb--sub" onClick={() => onPick('substitution')}><IoSwapHorizontal size={16} /> Sub</button>
      <button className="fbu__eb fbu__eb--og" onClick={() => onPick('own_goal')}><IoWarning size={15} /> Own Goal</button>
    </div>
  );
}

function EventModal({ type, teamName, players, onClose, onConfirm }: Readonly<{
  type: FootballEventType; teamName: string; players: FootballPlayer[];
  onClose: () => void; onConfirm: (player?: FootballPlayer, assist?: FootballPlayer, subOut?: FootballPlayer) => void;
}>) {
  const [playerId, setPlayerId] = useState('');
  const [assistId, setAssistId] = useState('');
  const [subOutId, setSubOutId] = useState('');
  const needsAssist = type === 'goal' || type === 'penalty_goal';
  const needsSub = type === 'substitution';

  const confirm = () => {
    const player = players.find((p) => p.id === playerId);
    const assist = players.find((p) => p.id === assistId);
    const subOut = players.find((p) => p.id === subOutId);
    onConfirm(player, assist, subOut);
  };

  return (
    <motion.div className="fbu__modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="fbu__modal-card" initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="fbu__modal-head">
          <h3>{eventLabel(type)} · {teamName}</h3>
          <button onClick={onClose}><IoClose size={20} /></button>
        </div>
        <div className="fbu__modal-body">
          <label className="fbu__field"><span>{needsSub ? 'Player In' : 'Player'}</span>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="">Select player…</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.number != null ? `#${p.number} ` : ''}{p.name}</option>)}
            </select>
          </label>
          {needsAssist && (
            <label className="fbu__field"><span>Assist (optional)</span>
              <select value={assistId} onChange={(e) => setAssistId(e.target.value)}>
                <option value="">No assist</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {needsSub && (
            <label className="fbu__field"><span>Player Out</span>
              <select value={subOutId} onChange={(e) => setSubOutId(e.target.value)}>
                <option value="">Select player…</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="fbu__modal-foot">
          <button className="fbu__btn-ghost" onClick={onClose}>Cancel</button>
          <button className="fbu__btn-primary" onClick={confirm} disabled={!playerId}>Confirm</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function eventIcon(type: FootballEventType): string {
  switch (type) {
    case 'goal': case 'penalty_goal': return '⚽';
    case 'own_goal': return '🔴';
    case 'yellow_card': return '🟨';
    case 'red_card': case 'second_yellow': return '🟥';
    case 'substitution': return '🔁';
    default: return '•';
  }
}
function eventLabel(type: FootballEventType): string {
  const map: Record<FootballEventType, string> = {
    goal: 'Goal', own_goal: 'Own Goal', penalty_goal: 'Penalty', penalty_miss: 'Penalty Miss',
    yellow_card: 'Yellow Card', red_card: 'Red Card', second_yellow: 'Second Yellow',
    substitution: 'Substitution', assist: 'Assist',
  };
  return map[type];
}
