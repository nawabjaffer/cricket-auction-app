// ============================================================================
// KABADDI UPDATE PAGE — /:tenantSlug/kabaddi/scorer/update?matchId=xxx
//
// Live scorer console. Mirrors the football scorer's clock/half controls and
// adds the raid workflow: pick the raider, run the 30-second raid clock, then
// record the outcome (touches / bonus / tackle). Rule application — super raid,
// super tackle, all-out with revival, do-or-die — is handled by KabaddiService
// so the scorer only records what happened on the mat.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IoPlay, IoPause, IoArrowBack, IoFlash, IoShieldCheckmark,
  IoRefresh, IoTimer, IoPeople, IoWarning,
} from 'react-icons/io5';
import { realtimeSync } from '../services/realtimeSync';
import { kabaddiService } from '../services/kabaddi';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import {
  computeKabaddiClock, raidSecondsRemaining, KABADDI_HALF_LABELS,
  createEmptyKabaddiLiveState, DEFAULT_KABADDI_RULES, isBonusAvailable,
} from '../types/kabaddi';
import type {
  KabaddiMatchSetup, KabaddiLiveState, KabaddiPlayer, KabaddiRulesConfig,
  KabaddiHalf, KabaddiOverlayType,
} from '../types/kabaddi';
import './KabaddiUpdatePage.css';

const HALF_FLOW: KabaddiHalf[] = ['not_started', 'first_half', 'half_time', 'second_half', 'full_time'];

export default function KabaddiUpdatePage() {
  const navigate = useNavigate();
  const [matchId, setMatchId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [match, setMatch] = useState<KabaddiMatchSetup | null>(null);
  const [live, setLive] = useState<KabaddiLiveState | null>(null);
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [, force] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // Raid entry
  const [raiderId, setRaiderId] = useState('');
  const [touches, setTouches] = useState(0);
  const [bonus, setBonus] = useState(false);

  const undoStack = useRef<KabaddiLiveState[]>([]);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2400);
  }, []);

  useEffect(() => {
    setMatchId(new URLSearchParams(window.location.search).get('matchId'));
  }, []);

  // Init service
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('no db');
        kabaddiService.initialize(db, tenantPath('kabaddi'));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(() => void init(), 800);
      }
    };
    void init();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, []);

  // Subscriptions
  useEffect(() => {
    if (!ready || !matchId) return;
    const unsubs = [
      kabaddiService.subscribeMatch(matchId, setMatch),
      kabaddiService.subscribeLive(matchId, setLive),
      kabaddiService.subscribePlayers(setPlayers),
      kabaddiService.subscribeRules(setRules),
    ];
    return () => unsubs.forEach(u => u());
  }, [ready, matchId]);

  // 2 Hz tick keeps the match clock and raid countdown honest.
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback(async (next: KabaddiLiveState, remember = true) => {
    if (remember && live) undoStack.current = [...undoStack.current.slice(-19), live];
    setLive(next);
    await kabaddiService.saveLive(next);
  }, [live]);

  const ensureLive = useCallback(async (): Promise<KabaddiLiveState | null> => {
    if (live) return live;
    if (!match || !matchId) return null;
    const seeded = createEmptyKabaddiLiveState(matchId, match.teamA.id, match.teamB.id, rules.playersPerSide);
    await kabaddiService.saveLive(seeded);
    setLive(seeded);
    return seeded;
  }, [live, match, matchId, rules.playersPerSide]);

  const triggerOverlay = useCallback(async (type: KabaddiOverlayType, event?: KabaddiLiveState['events'][number]) => {
    if (!matchId) return;
    await kabaddiService.triggerOverlay(matchId, {
      activeOverlay: type,
      activeEvent: event,
      lastUpdated: Date.now(),
    });
    setTimeout(() => { void kabaddiService.clearOverlay(matchId); }, 8000);
  }, [matchId]);

  // ── Clock ──
  const toggleClock = async () => {
    const cur = await ensureLive();
    if (!cur) return;
    if (cur.running) {
      const elapsed = cur.baseElapsedSec + Math.floor((Date.now() - cur.clockStartedAt) / 1000);
      await persist({ ...cur, running: false, clockStartedAt: 0, baseElapsedSec: elapsed }, false);
    } else {
      await persist({ ...cur, running: true, clockStartedAt: Date.now() }, false);
    }
  };

  const setHalf = async (half: KabaddiHalf) => {
    const cur = await ensureLive();
    if (!cur) return;
    const isBreak = half === 'half_time' || half === 'full_time' || half === 'not_started';
    const elapsed = cur.running && cur.clockStartedAt
      ? cur.baseElapsedSec + Math.floor((Date.now() - cur.clockStartedAt) / 1000)
      : cur.baseElapsedSec;
    await persist({
      ...cur,
      half,
      running: false,
      clockStartedAt: 0,
      baseElapsedSec: half === 'second_half' ? rules.halfDurationMin * 60 : elapsed,
      raidClockStartedAt: 0,
    }, false);
    if (isBreak) await triggerOverlay(half === 'full_time' ? 'full_time' : 'half_time');
  };

  // ── Raids ──
  const startRaid = async (teamId: string) => {
    const cur = await ensureLive();
    if (!cur) return;
    const player = players.find(p => p.id === raiderId);
    const next: KabaddiLiveState = {
      ...cur,
      raidingTeamId: teamId,
      raiderId: raiderId || undefined,
      raiderName: player?.name,
      raidClockStartedAt: Date.now(),
    };
    await persist(next, false);
    if (next.isDoOrDie) await triggerOverlay('do_or_die');
  };

  const resolveRaid = async (opts: { raiderOut: boolean }) => {
    const cur = await ensureLive();
    if (!cur?.raidingTeamId) { flash('Start a raid first'); return; }
    setBusy(true);
    try {
      const player = players.find(p => p.id === cur.raiderId);
      const result = kabaddiService.resolveRaid(cur, {
        raidingTeamId: cur.raidingTeamId,
        touches,
        bonus,
        raiderOut: opts.raiderOut,
        raiderId: cur.raiderId,
        raiderName: player?.name,
      }, rules);

      await persist(result.live);

      // Credit season stats for the raider / defence.
      const raidPts = result.events.filter(e => e.type === 'touch_point' || e.type === 'bonus_point')
        .reduce((n, e) => n + e.points, 0);
      if (cur.raiderId && raidPts > 0) {
        await kabaddiService.incrementPlayerStat(cur.raiderId, 'raidPoints', raidPts);
      }

      if (result.celebration) {
        const ev = result.events.find(e =>
          e.type === result.celebration || (result.celebration === 'all_out' && e.type === 'all_out'));
        await triggerOverlay(result.celebration, ev);
      }

      setTouches(0);
      setBonus(false);
      setRaiderId('');
      if (result.live.isDoOrDie) await triggerOverlay('do_or_die');
    } catch (e) {
      flash(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const prev = undoStack.current.pop();
    if (!prev) { flash('Nothing to undo'); return; }
    setLive(prev);
    await kabaddiService.saveLive(prev);
    flash('Reverted last raid');
  };

  // ── Derived ──
  const { minute, second } = computeKabaddiClock(live);
  const raidLeft = raidSecondsRemaining(live, rules);
  const raidingTeam = useMemo(() => {
    if (!live?.raidingTeamId || !match) return null;
    return live.raidingTeamId === match.teamA.id ? match.teamA : match.teamB;
  }, [live?.raidingTeamId, match]);

  const defendingSide = live && match
    ? (live.raidingTeamId === match.teamA.id ? live.teamB : live.teamA)
    : null;

  const raiderOptions = useMemo(() => {
    if (!live?.raidingTeamId) return [];
    return players.filter(p => p.teamId === live.raidingTeamId);
  }, [players, live?.raidingTeamId]);

  const bonusOn = defendingSide ? isBonusAvailable(defendingSide.playersOnCourt, rules) : false;

  if (!matchId) {
    return (
      <div className="kbu kbu--empty">
        <p>Open this page with a <code>?matchId=…</code> from the Kabaddi Admin.</p>
        <button onClick={() => navigate('/kabaddi/scorer/admin')}>Go to Kabaddi Admin</button>
      </div>
    );
  }

  if (!ready || !match) {
    return <div className="kbu kbu--empty"><div className="kbu__spinner" /><p>Loading match…</p></div>;
  }

  return (
    <div className="kbu">
      <header className="kbu__bar">
        <button className="kbu__icon-btn" onClick={() => navigate('/kabaddi/scorer/admin')}><IoArrowBack size={20} /></button>
        <div className="kbu__title">
          <strong>{match.teamA.name} vs {match.teamB.name}</strong>
          <small>{match.venue} · {KABADDI_HALF_LABELS[live?.half ?? 'not_started']}</small>
        </div>
        <button className="kbu__icon-btn" onClick={undo} title="Undo last raid"><IoRefresh size={18} /></button>
      </header>

      {toast && <div className="kbu__toast">{toast}</div>}

      {/* ── Scoreboard ── */}
      <section className="kbu__scoreboard">
        <TeamScore
          name={match.teamA.shortName}
          color={match.teamA.primaryColor}
          score={live?.teamA.score ?? 0}
          onCourt={live?.teamA.playersOnCourt ?? rules.playersPerSide}
          total={rules.playersPerSide}
          raiding={live?.raidingTeamId === match.teamA.id}
        />
        <div className="kbu__clock-block">
          <span className="kbu__clock">{String(minute).padStart(2, '0')}:{String(second).padStart(2, '0')}</span>
          <button className={`kbu__clock-btn ${live?.running ? 'is-running' : ''}`} onClick={toggleClock}>
            {live?.running ? <IoPause size={17} /> : <IoPlay size={17} />}
            {live?.running ? 'Pause' : 'Start'}
          </button>
          {raidLeft !== null && (
            <span className={`kbu__raid-clock ${raidLeft <= 5 ? 'is-urgent' : ''}`}>
              <IoTimer size={14} /> {raidLeft}s
            </span>
          )}
        </div>
        <TeamScore
          name={match.teamB.shortName}
          color={match.teamB.primaryColor}
          score={live?.teamB.score ?? 0}
          onCourt={live?.teamB.playersOnCourt ?? rules.playersPerSide}
          total={rules.playersPerSide}
          raiding={live?.raidingTeamId === match.teamB.id}
        />
      </section>

      {/* ── Half control ── */}
      <section className="kbu__halves">
        {HALF_FLOW.map(h => (
          <button
            key={h}
            className={live?.half === h ? 'is-active' : ''}
            onClick={() => setHalf(h)}
          >
            {KABADDI_HALF_LABELS[h]}
          </button>
        ))}
      </section>

      {/* ── Raid workflow ── */}
      <section className="kbu__card">
        <h2><IoFlash size={16} /> Raid</h2>

        {live?.isDoOrDie && (
          <div className="kbu__dod"><IoWarning size={15} /> Do-or-die raid — an empty raid puts the raider out.</div>
        )}

        {!live?.raidingTeamId || live.raidClockStartedAt === 0 ? (
          <>
            <p className="kbu__hint">Choose the raiding side to start the {rules.raidDurationSec}-second raid clock.</p>
            <div className="kbu__raid-start">
              <select value={raiderId} onChange={e => setRaiderId(e.target.value)}>
                <option value="">Raider (optional)</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="kbu__btn kbu__btn--a" onClick={() => startRaid(match.teamA.id)}>
                {match.teamA.shortName} raids
              </button>
              <button className="kbu__btn kbu__btn--b" onClick={() => startRaid(match.teamB.id)}>
                {match.teamB.shortName} raids
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="kbu__raid-live">
              <span className="kbu__raid-team" style={{ background: raidingTeam?.primaryColor }}>
                {raidingTeam?.shortName} raiding
              </span>
              {raiderOptions.length > 0 && (
                <select value={live.raiderId ?? ''} onChange={async e => {
                  const p = players.find(x => x.id === e.target.value);
                  await persist({ ...live, raiderId: e.target.value || undefined, raiderName: p?.name }, false);
                }}>
                  <option value="">Select raider</option>
                  {raiderOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            <div className="kbu__outcome">
              <div className="kbu__field">
                <span>Defenders touched</span>
                <div className="kbu__touches">
                  {Array.from({ length: rules.playersPerSide + 1 }, (_, i) => (
                    <button key={i} className={touches === i ? 'is-on' : ''} onClick={() => setTouches(i)}>{i}</button>
                  ))}
                </div>
              </div>
              <button
                className={`kbu__bonus ${bonus ? 'is-on' : ''}`}
                onClick={() => setBonus(v => !v)}
                disabled={!bonusOn}
                title={bonusOn ? 'Raider crossed the bonus line' : `Bonus needs ${rules.bonusMinDefenders}+ defenders on the mat`}
              >
                Bonus point
              </button>
            </div>

            <div className="kbu__actions">
              <button className="kbu__btn kbu__btn--primary" disabled={busy} onClick={() => resolveRaid({ raiderOut: false })}>
                <IoFlash size={16} /> Raider returns safe
              </button>
              <button className="kbu__btn kbu__btn--danger" disabled={busy} onClick={() => resolveRaid({ raiderOut: true })}>
                <IoShieldCheckmark size={16} /> Raider tackled
              </button>
            </div>
            <p className="kbu__hint">
              A tackle with {rules.superTackleMaxDefenders} or fewer defenders scores {rules.superTacklePoints} (super tackle).
              {' '}{rules.superRaidPoints}+ raid points triggers a super raid.
            </p>
          </>
        )}
      </section>

      {/* ── Recent events ── */}
      <section className="kbu__card">
        <h2><IoPeople size={16} /> Match log</h2>
        {(!live?.events || live.events.length === 0) ? (
          <p className="kbu__hint">No events yet.</p>
        ) : (
          <ul className="kbu__log">
            {[...live.events].reverse().slice(0, 14).map(ev => (
              <li key={ev.id}>
                <span className="kbu__log-min">{ev.minute}&apos;</span>
                <span className={`kbu__log-type kbu__log-type--${ev.type}`}>{ev.type.replace(/_/g, ' ')}</span>
                <span className="kbu__log-name">{ev.playerName || ''}</span>
                {ev.points > 0 && <span className="kbu__log-pts">+{ev.points}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TeamScore({ name, color, score, onCourt, total, raiding }: Readonly<{
  name: string; color?: string; score: number; onCourt: number; total: number; raiding: boolean;
}>) {
  return (
    <div className={`kbu__team ${raiding ? 'is-raiding' : ''}`}>
      <span className="kbu__team-name" style={{ color }}>{name}</span>
      <span className="kbu__team-score">{score}</span>
      <span className="kbu__mat">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < onCourt ? 'is-on' : ''} />
        ))}
      </span>
    </div>
  );
}
