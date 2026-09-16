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
  IoArrowUndo, IoArrowRedo, IoTimer, IoPeople, IoWarning, IoSwapHorizontal, IoPencil,
} from 'react-icons/io5';
import { realtimeSync } from '../services/realtimeSync';
import { kabaddiService } from '../services/kabaddi';
import { auctionPersistence, type SoldPlayerRecord } from '../services/auctionPersistence';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { getKabaddiRoleCategory } from '../utils/kabaddiRoles';
import { ResolvedImage } from '../components/ResolvedImage';
import {
  computeKabaddiClock, raidSecondsRemaining, raidInputGraceRemaining, KABADDI_HALF_LABELS,
  createEmptyKabaddiLiveState, DEFAULT_KABADDI_RULES, isBonusAvailable, playerMatchPoints,
} from '../types/kabaddi';
import type {
  KabaddiMatchSetup, KabaddiLiveState, KabaddiPlayer, KabaddiRulesConfig,
  KabaddiHalf, KabaddiOverlayType, KabaddiPosition, KabaddiDefenderRole,
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
  const [soldPlayers, setSoldPlayers] = useState<SoldPlayerRecord[]>([]);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // Raid entry
  const [raiderId, setRaiderId] = useState('');
  const [touches, setTouches] = useState(0);
  const [touchedDefenderIds, setTouchedDefenderIds] = useState<string[]>([]);
  const [excludedDefenderIds, setExcludedDefenderIds] = useState<string[]>([]);
  const [bonus, setBonus] = useState(false);
  const [tacklerIds, setTacklerIds] = useState<string[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [subOutId, setSubOutId] = useState<Record<string, string>>({});
  const [subInId, setSubInId] = useState<Record<string, string>>({});

  const undoStack = useRef<KabaddiLiveState[]>([]);
  const redoStack = useRef<KabaddiLiveState[]>([]);
  const autoResolvedRaidRef = useRef<number>(-1);

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
        auctionPersistence.initialize(db);
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
    void auctionPersistence.getSoldPlayers().then(setSoldPlayers).catch(() => setSoldPlayers([]));
    return () => unsubs.forEach(u => u());
  }, [ready, matchId]);

  // 2 Hz tick keeps the match clock and raid countdown honest.
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  const persist = useCallback(async (next: KabaddiLiveState, remember = true) => {
    if (remember && live) {
      undoStack.current = [...undoStack.current.slice(-19), live];
      redoStack.current = [];
    }
    setLive(next);
    await kabaddiService.saveLive(next);
  }, [live]);

  const kabaddiPositionFor = useCallback((role: string): { position: KabaddiPosition; defenderRole?: KabaddiDefenderRole } => {
    const category = getKabaddiRoleCategory(role);
    if (category === 'Raider') return { position: 'RAIDER' };
    if (category === 'Defender') return { position: 'DEFENDER', defenderRole: 'left_corner' };
    return { position: 'ALL_ROUNDER' };
  }, []);

  const scorerPlayers = useMemo(() => {
    if (!match) return players;
    const byId = new Map(players.map(p => [p.id, p]));
    const sourceIds = new Set(players.map(p => p.sourcePlayerId).filter(Boolean));
    const teamForSoldPlayer = (sp: SoldPlayerRecord): string | null => {
      const teamName = sp.teamName?.trim().toLowerCase();
      if (sp.teamId === match.teamA.id || teamName === match.teamA.name.trim().toLowerCase()) return match.teamA.id;
      if (sp.teamId === match.teamB.id || teamName === match.teamB.name.trim().toLowerCase()) return match.teamB.id;
      return null;
    };
    const extras = soldPlayers.flatMap((sp): KabaddiPlayer[] => {
      if (byId.has(sp.id) || sourceIds.has(sp.id)) return [];
      const teamId = teamForSoldPlayer(sp);
      if (!teamId) return [];
      const { position, defenderRole } = kabaddiPositionFor(sp.role);
      return [{
        id: sp.id,
        teamId,
        name: sp.playerName,
        photoUrl: sp.imageUrl || undefined,
        age: sp.age ?? undefined,
        position,
        defenderRole,
        isStarter: true,
        sourcePlayerId: sp.id,
        createdAt: sp.timestamp || Date.now(),
        updatedAt: sp.timestamp || Date.now(),
      }];
    });
    return [...players, ...extras];
  }, [players, soldPlayers, match, kabaddiPositionFor]);

  const ensureLive = useCallback(async (): Promise<KabaddiLiveState | null> => {
    if (live) return live;
    if (!match || !matchId) return null;
    const startersFirst = (a: KabaddiPlayer, b: KabaddiPlayer) => Number(b.isStarter !== false) - Number(a.isStarter !== false);
    const lineupFor = (teamId: string) => scorerPlayers
      .filter(p => p.teamId === teamId)
      .sort(startersFirst)
      .slice(0, rules.playersPerSide)
      .map(p => p.id);
    const teamAIds = lineupFor(match.teamA.id);
    const teamBIds = lineupFor(match.teamB.id);
    const seeded = createEmptyKabaddiLiveState(matchId, match.teamA.id, match.teamB.id, rules.playersPerSide);
    seeded.teamA = { ...seeded.teamA, onCourtIds: teamAIds, startingIds: teamAIds };
    seeded.teamB = { ...seeded.teamB, onCourtIds: teamBIds, startingIds: teamBIds };
    await kabaddiService.saveLive(seeded);
    setLive(seeded);
    return seeded;
  }, [live, match, matchId, rules.playersPerSide, scorerPlayers]);

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
    const player = scorerPlayers.find(p => p.id === raiderId);
    const next: KabaddiLiveState = {
      ...cur,
      raidingTeamId: teamId,
      raiderId: raiderId || undefined,
      raiderName: player?.name,
      raiderPhotoUrl: player?.photoUrl,
      raidClockStartedAt: Date.now(),
    };
    await persist(next, false);
    setTouchedDefenderIds([]);
    setTacklerIds([]);
    if (next.isDoOrDie) await triggerOverlay('do_or_die');
  };

  const selectRaider = async (playerId: string) => {
    if (!live) { setRaiderId(playerId); return; }
    const p = scorerPlayers.find(x => x.id === playerId);
    setRaiderId(playerId);
    await persist({ ...live, raiderId: playerId || undefined, raiderName: p?.name, raiderPhotoUrl: p?.photoUrl }, false);
  };

  const resolveRaid = async (opts: { raiderOut: boolean }) => {
    const cur = await ensureLive();
    if (!cur?.raidingTeamId) { flash('Start a raid first'); return; }
    setBusy(true);
    try {
      const player = scorerPlayers.find(p => p.id === cur.raiderId);
      const tacklers = opts.raiderOut ? scorerPlayers.filter(p => tacklerIds.includes(p.id)) : [];
      const touchedDefenders = scorerPlayers.filter(p => touchedDefenderIds.includes(p.id));
      const result = kabaddiService.resolveRaid(cur, {
        raidingTeamId: cur.raidingTeamId,
        touches,
        bonus,
        raiderOut: opts.raiderOut,
        raiderId: cur.raiderId,
        raiderName: player?.name,
        touchedIds: touchedDefenders.map(p => p.id),
        touchedNames: touchedDefenders.map(p => p.name),
        tacklerIds: tacklers.length ? tacklers.map(p => p.id) : undefined,
        tacklerNames: tacklers.length ? tacklers.map(p => p.name) : undefined,
      }, rules);

      await persist(result.live);

      // Credit season stats from the normalized events so tackles and super
      // plays are recorded for the actual player involved.
      const statUpdates: Promise<void>[] = [];
      for (const event of result.events) {
        if (event.type === 'touch_point' || event.type === 'bonus_point') {
          if (event.playerId && event.points > 0) {
            statUpdates.push(kabaddiService.incrementPlayerStat(event.playerId, 'raidPoints', event.points));
          }
        } else if (event.type === 'tackle_point' || event.type === 'super_tackle') {
          if (event.playerId && event.points > 0) {
            statUpdates.push(kabaddiService.incrementPlayerStat(event.playerId, 'tacklePoints', event.points));
          }
          if (event.type === 'super_tackle' && event.playerId) {
            statUpdates.push(kabaddiService.incrementPlayerStat(event.playerId, 'superTackles'));
          }
        } else if (event.type === 'super_raid' && event.playerId) {
          statUpdates.push(kabaddiService.incrementPlayerStat(event.playerId, 'superRaids'));
        }
      }
      for (const statUpdate of statUpdates) await statUpdate;

      if (result.celebration) {
        const ev = result.events.find(e =>
          e.type === result.celebration || (result.celebration === 'all_out' && e.type === 'all_out'));
        await triggerOverlay(result.celebration, ev);
      }

      setTouches(0);
      setBonus(false);
      setRaiderId('');
      setExcludedDefenderIds(ids => Array.from(new Set([...ids, ...touchedDefenderIds])));
      setTouchedDefenderIds([]);
      setTacklerIds([]);
      if (result.live.isDoOrDie) await triggerOverlay('do_or_die');
    } catch (e) {
      flash(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Once the raid clock (plus input grace) runs out with no scorer action,
  // resolve automatically so the next team's raid starts without delay.
  useEffect(() => {
    if (!live?.raidingTeamId || !live.raidClockStartedAt || busy) return;
    const left = raidInputGraceRemaining(live, rules);
    if (left === 0 && autoResolvedRaidRef.current !== live.raidNumber) {
      autoResolvedRaidRef.current = live.raidNumber;
      void resolveRaid({ raiderOut: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const undo = async () => {
    const prev = undoStack.current.pop();
    if (!prev) { flash('Nothing to undo'); return; }
    if (live) redoStack.current = [...redoStack.current, live];
    setLive(prev);
    await kabaddiService.saveLive(prev);
    flash('Reverted last raid');
  };

  const redo = async () => {
    const next = redoStack.current.pop();
    if (!next) { flash('Nothing to redo'); return; }
    if (live) undoStack.current = [...undoStack.current, live];
    setLive(next);
    await kabaddiService.saveLive(next);
    flash('Redo applied');
  };

  const substitutePlayer = async (teamId: string) => {
    const cur = await ensureLive();
    if (!cur) return;
    const outId = subOutId[teamId];
    const inId = subInId[teamId];
    if (!outId || !inId) { flash('Pick both players for the substitution'); return; }
    const outPlayer = scorerPlayers.find(p => p.id === outId);
    const inPlayer = scorerPlayers.find(p => p.id === inId);
    const result = kabaddiService.substitutePlayer(cur, teamId, outId, inId, inPlayer?.name, outPlayer?.name);
    await persist(result.live);
    setSubOutId(ids => ({ ...ids, [teamId]: '' }));
    setSubInId(ids => ({ ...ids, [teamId]: '' }));
    flash(`${inPlayer?.name ?? 'Substitute'} is on for ${outPlayer?.name ?? 'the bench'}`);
  };

  const adjustEventPoints = async (eventId: string, delta: number) => {
    if (!live || !match) return;
    const idx = live.events.findIndex(e => e.id === eventId);
    if (idx === -1) return;
    const ev = live.events[idx];
    const newPoints = Math.max(0, ev.points + delta);
    const appliedDelta = newPoints - ev.points;
    if (appliedDelta === 0) return;
    const side = ev.teamId === match.teamA.id ? 'teamA' : 'teamB';
    const events = [...live.events];
    events[idx] = { ...ev, points: newPoints };
    await persist({
      ...live,
      events,
      [side]: { ...live[side], score: Math.max(0, live[side].score + appliedDelta) },
    });
    flash('Score corrected');
  };

  // ── Derived ──
  const { minute, second } = computeKabaddiClock(live);
  const raidLeft = raidSecondsRemaining(live, rules);
  const inputGraceLeft = raidInputGraceRemaining(live, rules);

  const raidingTeam = useMemo(() => {
    if (!live?.raidingTeamId || !match) return null;
    return live.raidingTeamId === match.teamA.id ? match.teamA : match.teamB;
  }, [live?.raidingTeamId, match]);

  const defendingSide = live && match
    ? (live.raidingTeamId === match.teamA.id ? live.teamB : live.teamA)
    : null;

  const startersFirst = (a: KabaddiPlayer, b: KabaddiPlayer) => Number(b.isStarter !== false) - Number(a.isStarter !== false);

  /** The starting 7 (or configured squad size) — used before onCourtIds exist. */
  const defaultLineup = useCallback((teamId: string) => scorerPlayers
    .filter(p => p.teamId === teamId)
    .sort(startersFirst)
    .slice(0, rules.playersPerSide)
    .map(p => p.id), [scorerPlayers, rules.playersPerSide]);

  /** Currently active (on-mat) player IDs for a team — only these are scoreable. */
  const onCourtIdsFor = useCallback((teamId: string): string[] => {
    const side = live && match && teamId === match.teamA.id ? live.teamA : live && match ? live.teamB : undefined;
    return side?.onCourtIds?.length ? side.onCourtIds : defaultLineup(teamId);
  }, [live, match, defaultLineup]);

  /** Roster members not currently on the mat — shown only in Advanced options. */
  const benchPlayersFor = useCallback((teamId: string) => {
    const onCourt = new Set(onCourtIdsFor(teamId));
    return scorerPlayers.filter(p => p.teamId === teamId && !onCourt.has(p.id));
  }, [scorerPlayers, onCourtIdsFor]);

  const raiderOptions = useMemo(() => {
    if (!live?.raidingTeamId) return [];
    const onCourt = new Set(onCourtIdsFor(live.raidingTeamId));
    return scorerPlayers.filter(p => p.teamId === live.raidingTeamId && onCourt.has(p.id));
  }, [scorerPlayers, live?.raidingTeamId, onCourtIdsFor]);

  const defenderOptions = useMemo(() => {
    if (!live?.raidingTeamId || !match) return [];
    const defendingTeamId = live.raidingTeamId === match.teamA.id ? match.teamB.id : match.teamA.id;
    const onCourt = new Set(onCourtIdsFor(defendingTeamId));
    return scorerPlayers
      .filter(p => p.teamId === defendingTeamId && onCourt.has(p.id) && !excludedDefenderIds.includes(p.id))
      .sort(startersFirst);
  }, [scorerPlayers, live?.raidingTeamId, match, excludedDefenderIds, onCourtIdsFor]);

  /** Only the 7 active players — the rest live under Advanced options. */
  const activePlayersFirst = (teamId: string) => {
    const onCourt = new Set(onCourtIdsFor(teamId));
    return scorerPlayers.filter(p => p.teamId === teamId && onCourt.has(p.id)).sort(startersFirst);
  };

  const toggleTouchedDefender = (playerId: string) => {
    setTouchedDefenderIds(ids => {
      const next = ids.includes(playerId) ? ids.filter(id => id !== playerId) : [...ids, playerId];
      setTouches(next.length);
      return next;
    });
  };

  const toggleTackler = (playerId: string) => {
    setTacklerIds(ids => (ids.includes(playerId) ? ids.filter(x => x !== playerId) : [...ids, playerId]));
  };

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
        <button className="kbu__icon-btn" onClick={undo} title="Undo last raid"><IoArrowUndo size={18} /></button>
        <button className="kbu__icon-btn" onClick={redo} title="Redo"><IoArrowRedo size={18} /></button>
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
          <span className="kbu__clock-label">Raid {live?.raidNumber ? live.raidNumber + 1 : 1}</span>
          <span className={`kbu__clock ${raidLeft !== null && raidLeft <= 5 ? 'is-urgent' : ''}`}>
            {raidLeft !== null ? `${raidLeft}s` : `${rules.raidDurationSec}s`}
          </span>
          {raidLeft === 0 && inputGraceLeft !== null && inputGraceLeft > 0 && (
            <span className="kbu__grace-clock">Input window {inputGraceLeft}s</span>
          )}
          <span className="kbu__total-time">
            <IoTimer size={13} /> {String(minute).padStart(2, '0')}:{String(second).padStart(2, '0')}
            <small>{KABADDI_HALF_LABELS[live?.half ?? 'not_started']}</small>
          </span>
          <button className={`kbu__clock-btn ${live?.running ? 'is-running' : ''}`} onClick={toggleClock}>
            {live?.running ? <IoPause size={17} /> : <IoPlay size={17} />}
            {live?.running ? 'Pause' : 'Start'}
          </button>
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
            <p className="kbu__hint">Pick the raider, then start the {rules.raidDurationSec}-second raid clock.</p>
            <div className="kbu__sides">
              <div className="kbu__side">
                <h3 style={{ color: match.teamA.primaryColor }}>{match.teamA.shortName}</h3>
                <PlayerPicker
                  players={activePlayersFirst(match.teamA.id)}
                  selectedIds={raiderId ? [raiderId] : []}
                  onPick={id => setRaiderId(id === raiderId ? '' : id)}
                  live={live}
                />
                <button className="kbu__btn kbu__btn--a" onClick={() => startRaid(match.teamA.id)}>
                  {match.teamA.shortName} raids
                </button>
              </div>
              <div className="kbu__side">
                <h3 style={{ color: match.teamB.primaryColor }}>{match.teamB.shortName}</h3>
                <PlayerPicker
                  players={activePlayersFirst(match.teamB.id)}
                  selectedIds={raiderId ? [raiderId] : []}
                  onPick={id => setRaiderId(id === raiderId ? '' : id)}
                  live={live}
                />
                <button className="kbu__btn kbu__btn--b" onClick={() => startRaid(match.teamB.id)}>
                  {match.teamB.shortName} raids
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="kbu__raid-live">
              <span className="kbu__raid-team" style={{ background: raidingTeam?.primaryColor }}>
                {raidingTeam?.shortName} raiding
              </span>
              {live.raiderName && (
                <span className="kbu__raid-current">
                  {live.raiderPhotoUrl && <ResolvedImage src={live.raiderPhotoUrl} size={96} />}
                  <strong>{live.raiderName}</strong>
                  <span className="kbu__raid-pts">{playerMatchPoints(live, live.raiderId)} pts</span>
                </span>
              )}
            </div>

            <div className="kbu__sides">
              <div className="kbu__side">
                <h3>Raider</h3>
                <PlayerPicker
                  players={raiderOptions}
                  selectedIds={live.raiderId ? [live.raiderId] : []}
                  onPick={id => void selectRaider(id === live.raiderId ? '' : id)}
                  live={live}
                />
              </div>
              <div className="kbu__side">
                <h3>Defenders touched this raid</h3>
                <PlayerPicker
                  players={defenderOptions}
                  selectedIds={touchedDefenderIds}
                  onPick={toggleTouchedDefender}
                  live={live}
                />
                <p className="kbu__hint">Selected touched defenders disappear from the next raid list.</p>
                <h3>Defender(s) who tackled</h3>
                <PlayerPicker
                  players={defenderOptions}
                  selectedIds={tacklerIds}
                  onPick={toggleTackler}
                  live={live}
                />
              </div>
            </div>

            <div className="kbu__outcome">
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
                <IoShieldCheckmark size={16} /> Raider tackled{tacklerIds.length ? ` (${tacklerIds.length})` : ''}
              </button>
            </div>
            <p className="kbu__hint">
              {touchedDefenderIds.length} defender(s) selected for this raid. A tackle with {rules.superTackleMaxDefenders} or fewer defenders scores {rules.superTacklePoints} (super tackle).
            </p>
            <div className="kbu__advanced">
              <button type="button" className="kbu__advanced-toggle" onClick={() => setShowAdvancedOptions(value => !value)}>
                {showAdvancedOptions ? 'Hide' : 'Show'} advanced raid options
              </button>
              {showAdvancedOptions && (
                <div className="kbu__advanced-panel">
                  <div className="kbu__advanced-row">
                    <button type="button" className="kbu__btn" onClick={undo}><IoArrowUndo size={15} /> Undo last raid</button>
                    <button type="button" className="kbu__btn" onClick={redo}><IoArrowRedo size={15} /> Redo</button>
                  </div>
                  <label className="kbu__field">
                    <span>Manual touch count</span>
                    <input type="number" min={0} max={rules.playersPerSide} value={touches} onChange={event => setTouches(Math.max(0, Number(event.target.value) || 0))} />
                  </label>
                  <p className="kbu__hint">Use this only when the defender cards do not represent the official touch count.</p>

                  <h4 className="kbu__advanced-heading"><IoSwapHorizontal size={14} /> Substitutes</h4>
                  <p className="kbu__hint">Only the 7 active players are scoreable above. Bring on a bench player here if a substitution is called.</p>
                  {[match.teamA, match.teamB].map(team => (
                    <div key={team.id} className="kbu__sub-row">
                      <span className="kbu__sub-team-name" style={{ color: team.primaryColor }}>{team.shortName}</span>
                      <select value={subOutId[team.id] ?? ''} onChange={e => setSubOutId(ids => ({ ...ids, [team.id]: e.target.value }))}>
                        <option value="">Bench (active player)…</option>
                        {activePlayersFirst(team.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <select value={subInId[team.id] ?? ''} onChange={e => setSubInId(ids => ({ ...ids, [team.id]: e.target.value }))}>
                        <option value="">Bring in…</option>
                        {benchPlayersFor(team.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button type="button" className="kbu__btn kbu__btn--sm" onClick={() => substitutePlayer(team.id)}>
                        Substitute
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Recent events ── */}
      <section className="kbu__card">
        <div className="kbu__log-header">
          <h2><IoPeople size={16} /> Match log</h2>
          <button type="button" className="kbu__advanced-toggle" onClick={() => setShowCorrections(v => !v)}>
            <IoPencil size={13} /> {showCorrections ? 'Done correcting' : 'Correct scores'}
          </button>
        </div>
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
                {showCorrections && (
                  <span className="kbu__log-edit">
                    <button type="button" onClick={() => adjustEventPoints(ev.id, -1)} title="Reduce point">−</button>
                    <button type="button" onClick={() => adjustEventPoints(ev.id, 1)} title="Add point">+</button>
                  </span>
                )}
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

/** Tap-friendly photo grid — faster than a dropdown while scoring live. */
function PlayerPicker({ players, selectedIds, onPick, live }: Readonly<{
  players: KabaddiPlayer[];
  selectedIds: string[];
  onPick: (playerId: string) => void;
  live: KabaddiLiveState | null;
}>) {
  if (players.length === 0) {
    return <p className="kbu__hint">No players on this roster. Add them in the Kabaddi Admin.</p>;
  }
  return (
    <div className="kbu__picker">
      {players.map(p => (
        <button
          key={p.id}
          type="button"
          className={`kbu__pick ${selectedIds.includes(p.id) ? 'is-on' : ''}`}
          onClick={() => onPick(p.id)}
          title={p.name}
        >
          <span className="kbu__pick-photo">
            <ResolvedImage src={p.photoUrl} size={128} fallback={<span>{p.name.charAt(0)}</span>} />
          </span>
          <span className="kbu__pick-name">{p.number ? `#${p.number} ` : ''}{p.name}</span>
          <span className="kbu__pick-pts">{playerMatchPoints(live, p.id)}</span>
        </button>
      ))}
    </div>
  );
}
