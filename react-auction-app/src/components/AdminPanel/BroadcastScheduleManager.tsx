import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref, runTransaction, set, type Database } from 'firebase/database';
import { IoCalendar, IoCheckmarkCircle, IoPlay, IoWarning } from 'react-icons/io5';
import { realtimeSync } from '../../services/realtimeSync';
import { scoringService } from '../../services/scoring';
import { obsService } from '../../services/obsService';
import { obsConnectionBridgeService } from '../../services/obsConnectionBridgeService';
import { tenantPath } from '../../services/tenantPath';
import type { MatchSetup } from '../../types/scoring';
import './BroadcastScheduleManager.css';

type ScheduleStatus = 'scheduled' | 'starting' | 'started' | 'failed';

interface BroadcastScheduleEntry {
  matchId: string;
  startAt: number;
  leadMinutes: number;
  status: ScheduleStatus;
  createdAt: number;
  startedAt?: number;
  error?: string;
  claimOwner?: string;
}

function getKickoffTimestamp(match: MatchSetup): number | null {
  const timestamp = new Date(match.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function BroadcastScheduleManager({ compact = false }: { compact?: boolean }) {
  const [database, setDatabase] = useState<Database | null>(null);
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [schedules, setSchedules] = useState<Record<string, BroadcastScheduleEntry>>({});
  const [leadMinutes, setLeadMinutes] = useState(10);
  const [obsConnected, setObsConnected] = useState(obsService.isConnected());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [autoSchedule, setAutoSchedule] = useState(false);
  const claimedMatchIds = useRef(new Set<string>());
  const autoCreating = useRef(false);

  useEffect(() => {
    let active = true;
    let stopMatches = () => {};
    let stopSchedules = () => {};
    let stopSettings = () => {};
    let stopBridge = () => {};

    const initialize = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!active || !db) return;
        scoringService.initialize(db, tenantPath('scoring'));
        setDatabase(db);
        setMatches(await scoringService.getAllMatches());
        stopMatches = scoringService.subscribeMatches(setMatches);
        stopSchedules = onValue(ref(db, tenantPath('scoring/broadcastSchedule')), snapshot => {
          setSchedules(snapshot.exists() ? snapshot.val() as Record<string, BroadcastScheduleEntry> : {});
        });
        stopSettings = onValue(ref(db, tenantPath('scoring/broadcastScheduleSettings/timeDefault')), snapshot => setAutoSchedule(snapshot.val() === true));
        stopBridge = onValue(ref(db, tenantPath('scoring/obsConnectionBridge')), snapshot => {
          setObsConnected(obsService.isConnected() || obsConnectionBridgeService.isAlive(snapshot.val()));
        });
      } catch (error) {
        if (active) setMessage(`Could not load match schedule: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    void initialize();
    return () => { active = false; stopMatches(); stopSchedules(); stopSettings(); stopBridge(); };
  }, []);

  useEffect(() => obsService.onConnectionChange(state => setObsConnected(state === 'connected')), []);

  const startScheduledMatch = useCallback(async (matchId: string, force = false) => {
    if (!database || claimedMatchIds.current.has(matchId)) return;
    claimedMatchIds.current.add(matchId);
    const entryRef = ref(database, `${tenantPath('scoring/broadcastSchedule')}/${matchId}`);
    const claimOwner = crypto.randomUUID();
    try {
      await obsConnectionBridgeService.assertBroadcastReady(database);
      const claim = await runTransaction(entryRef, current => {
        const schedule = current as BroadcastScheduleEntry | null;
        if (!schedule || schedule.status === 'started') return;
        if (schedule.status === 'starting' && Date.now() - (schedule.startedAt || 0) < 60_000) return;
        if (!force && schedule.startAt > Date.now()) return;
        return { ...schedule, status: 'starting', error: null, startedAt: Date.now(), claimOwner };
      });
      if (!claim.committed) return;

      await obsConnectionBridgeService.startYouTubeBroadcast(database, matchId);
      await runTransaction(entryRef, current => current?.claimOwner === claimOwner
        ? { ...current, status: 'started', startedAt: Date.now(), error: null } : undefined);
      setMessage(`Streaming started for ${matches.find(match => match.id === matchId)?.teamA.name || 'scheduled match'}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await runTransaction(entryRef, current => current?.status === 'starting' && current.claimOwner === claimOwner
        ? { ...current, status: 'failed', error: detail } : undefined).catch(() => {});
      setMessage(`Could not start scheduled stream: ${detail}`);
    } finally {
      claimedMatchIds.current.delete(matchId);
    }
  }, [database, matches]);

  useEffect(() => {
    if (!database || !obsConnected) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [matchId, schedule] of Object.entries(schedules)) {
        const fixture = matches.find(match => match.id === matchId);
        if (fixture && (fixture.status === 'scheduled' || fixture.status === 'live')
          && (schedule.status === 'scheduled' || (schedule.status === 'starting' && now - (schedule.startedAt || 0) >= 60_000))
          && schedule.startAt <= now && (getKickoffTimestamp(fixture) || 0) >= now - 3_600_000) {
          void startScheduledMatch(matchId);
        }
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [database, obsConnected, schedules, startScheduledMatch, matches]);

  const createSchedule = useCallback(async (match: MatchSetup, minutes = leadMinutes) => {
    if (!database) return false;
    const kickoff = getKickoffTimestamp(match);
    if (kickoff === null) return false;
    const entry: BroadcastScheduleEntry = {
      matchId: match.id,
      startAt: kickoff - minutes * 60_000,
      leadMinutes: minutes,
      status: 'scheduled',
      createdAt: Date.now(),
    };
    const result = await runTransaction(ref(database, `${tenantPath('scoring/broadcastSchedule')}/${match.id}`), current => current == null ? entry : undefined);
    return result.committed;
  }, [database, leadMinutes]);

  const handleSyncAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!database) throw new Error('Broadcast scheduling is still loading.');
      await obsConnectionBridgeService.assertBroadcastReady(database);
      const upcoming = matches.filter(match => match.status === 'scheduled' && getKickoffTimestamp(match) !== null);
      const results = await Promise.all(upcoming.map(match => createSchedule(match)));
      const count = results.filter(Boolean).length;
      setMessage(count > 0 ? `Created ${count} broadcast schedule${count === 1 ? '' : 's'}; existing schedules were kept.` : 'No missing broadcast schedules. Existing schedules were kept.');
    } catch (error) {
      setMessage(`Could not sync schedules: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleTimeDefault = async (enabled: boolean) => {
    if (!database) return;
    try {
      if (enabled) await obsConnectionBridgeService.assertBroadcastReady(database);
      await set(ref(database, tenantPath('scoring/broadcastScheduleSettings/timeDefault')), enabled);
      setAutoSchedule(enabled);
      setMessage(enabled ? 'Time default enabled: kickoff minus 10 minutes.' : 'Time default disabled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (!database || !autoSchedule || !obsConnected) return;
    let active = true;
    const createMissing = async () => {
      if (autoCreating.current) return;
      const missing = matches.filter(match => match.status === 'scheduled' && !schedules[match.id]
        && (getKickoffTimestamp(match) || 0) >= Date.now() - 600_000);
      if (!missing.length) return;
      autoCreating.current = true;
      try {
        await obsConnectionBridgeService.assertBroadcastReady(database);
        for (const match of missing) {
          if (!active) break;
          await createSchedule(match, 10);
        }
      } catch (error) {
        if (active) setMessage(`Automatic scheduling blocked: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        autoCreating.current = false;
      }
    };
    void createMissing();
    const timer = window.setInterval(() => void createMissing(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [autoSchedule, database, obsConnected, matches, schedules, createSchedule]);

  const timeDefaultControl = <label className="broadcast-schedule__time-default">
    <input type="checkbox" checked={autoSchedule} disabled={!database || busy} onChange={event => void toggleTimeDefault(event.target.checked)} />
    Time default (-10 min)
  </label>;

  if (compact) return (
    <div className="broadcast-schedule__compact">
      <button type="button" className="scoring-admin__btn scoring-admin__btn--secondary" onClick={() => void handleSyncAll()} disabled={busy || !database}>
        <IoCalendar size={16} />{busy ? 'Scheduling...' : 'Broadcast schedules'}
      </button>
      {timeDefaultControl}
      {message && <span className="broadcast-schedule__compact-message" role="status">{message}</span>}
      {!obsConnected && <span className="broadcast-schedule__compact-message" role="alert">Connect the app to OBS with YouTube output configured.</span>}
    </div>
  );

  const upcomingMatches = matches
    .filter(match => match.status !== 'completed' && match.status !== 'abandoned')
    .sort((left, right) => (getKickoffTimestamp(left) ?? 0) - (getKickoffTimestamp(right) ?? 0));

  return (
    <section className="broadcast-schedule">
      <header className="broadcast-schedule__header">
        <div>
          <h3><IoCalendar size={17} /> Match Broadcast Schedule</h3>
          <p>Syncs scheduled scoring fixtures. Keep this page open and OBS connected for automatic start at the planned time.</p>
        </div>
        <span className={`broadcast-schedule__connection ${obsConnected ? 'is-connected' : ''}`}>
          {obsConnected ? 'OBS connected' : 'Connect OBS to enable start'}
        </span>
      </header>

      <div className="broadcast-schedule__toolbar">
        <label>
          <span>Start streaming before kickoff</span>
          <input type="number" min={0} max={180} value={leadMinutes} onChange={event => setLeadMinutes(Math.max(0, Math.min(180, Number(event.target.value) || 0)))} />
          <span>minutes</span>
        </label>
        <button type="button" className="admin-panel__btn admin-panel__btn--primary" onClick={() => void handleSyncAll()} disabled={busy || !database}>
          <IoCalendar size={15} /> {busy ? 'Syncing…' : 'Create all schedules'}
        </button>
        {timeDefaultControl}
      </div>

      {message && <p className="broadcast-schedule__message" role="status">{message}</p>}
      {upcomingMatches.length === 0 ? (
        <p className="broadcast-schedule__empty">No upcoming scoring fixtures. Create matches in the scorer admin first.</p>
      ) : (
        <div className="broadcast-schedule__list">
          {upcomingMatches.map(match => {
            const schedule = schedules[match.id];
            const kickoff = getKickoffTimestamp(match);
            const due = !!schedule && schedule.startAt <= Date.now();
            return (
              <article className="broadcast-schedule__match" key={match.id}>
                <div>
                  <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                  <span>{new Date(match.date).toLocaleString()} · {match.venue || 'Venue TBC'}</span>
                  {schedule && <span className={`broadcast-schedule__status broadcast-schedule__status--${schedule.status}`}>
                    {schedule.status === 'scheduled' && due ? 'Due · waiting for OBS' : schedule.status}
                    {schedule.status === 'scheduled' && !due ? ` · starts ${new Date(schedule.startAt).toLocaleTimeString()}` : ''}
                    {schedule.error ? ` · ${schedule.error}` : ''}
                  </span>}
                </div>
                {schedule?.status === 'started' ? (
                  <span className="broadcast-schedule__started"><IoCheckmarkCircle size={16} /> Streaming</span>
                ) : (
                  <div className="broadcast-schedule__actions">
                    {!schedule && <button type="button" onClick={() => void obsConnectionBridgeService.assertBroadcastReady(database!).then(() => createSchedule(match)).then(ok => setMessage(ok ? 'Match schedule created.' : 'Already scheduled or invalid match date.')).catch(error => setMessage(error instanceof Error ? error.message : String(error)))}>Schedule</button>}
                    <button type="button" className="is-primary" disabled={!obsConnected || !schedule || schedule.status === 'starting' || kickoff === null} onClick={() => void startScheduledMatch(match.id, true)}>
                      <IoPlay size={14} /> {schedule?.status === 'failed' ? 'Retry stream' : 'Start stream now'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <footer className="broadcast-schedule__footer">
        <IoWarning size={14} /> Keep Matches or Streaming open with OBS connected for automatic starts. These are OBS start schedules, not YouTube event creation.
      </footer>
    </section>
  );
}