import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref, runTransaction, set, type Database } from 'firebase/database';
import { IoCalendar, IoCheckmarkCircle, IoPlay, IoWarning } from 'react-icons/io5';
import { realtimeSync } from '../../services/realtimeSync';
import { scoringService } from '../../services/scoring';
import { obsService } from '../../services/obsService';
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
}

function getKickoffTimestamp(match: MatchSetup): number | null {
  const timestamp = new Date(match.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function BroadcastScheduleManager() {
  const [database, setDatabase] = useState<Database | null>(null);
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [schedules, setSchedules] = useState<Record<string, BroadcastScheduleEntry>>({});
  const [leadMinutes, setLeadMinutes] = useState(10);
  const [obsConnected, setObsConnected] = useState(obsService.isConnected());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const claimedMatchIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let stopMatches = () => {};
    let stopSchedules = () => {};

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
      } catch (error) {
        if (active) setMessage(`Could not load match schedule: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    void initialize();
    return () => { active = false; stopMatches(); stopSchedules(); };
  }, []);

  useEffect(() => obsService.onConnectionChange(state => setObsConnected(state === 'connected')), []);

  const startScheduledMatch = useCallback(async (matchId: string, force = false) => {
    if (!database || !obsService.isConnected() || claimedMatchIds.current.has(matchId)) return;
    claimedMatchIds.current.add(matchId);
    const entryRef = ref(database, `${tenantPath('scoring/broadcastSchedule')}/${matchId}`);
    try {
      const claim = await runTransaction(entryRef, current => {
        const schedule = current as BroadcastScheduleEntry | null;
        if (!schedule || schedule.status === 'starting' || schedule.status === 'started') return;
        if (!force && schedule.startAt > Date.now()) return;
        return { ...schedule, status: 'starting', error: null, startedAt: Date.now() };
      });
      if (!claim.committed) return;

      const currentStatus = await obsService.getStreamingStatus();
      const success = currentStatus?.outputActive || await obsService.startStreaming();
      const claimedSchedule = claim.snapshot.val() as BroadcastScheduleEntry;
      await set(entryRef, {
        ...claimedSchedule,
        status: success ? 'started' : 'failed',
        startedAt: success ? Date.now() : null,
        error: success ? null : obsService.getLastErrorDetail() || 'OBS did not start streaming.',
      });
      setMessage(success ? `Streaming started for ${matches.find(match => match.id === matchId)?.teamA.name || 'scheduled match'}.` : 'OBS could not start streaming. Check the OBS output settings.');
    } catch (error) {
      setMessage(`Could not start scheduled stream: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      claimedMatchIds.current.delete(matchId);
    }
  }, [database, matches]);

  useEffect(() => {
    if (!database || !obsConnected) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [matchId, schedule] of Object.entries(schedules)) {
        if (schedule.status === 'scheduled' && schedule.startAt <= now) {
          void startScheduledMatch(matchId);
        }
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [database, obsConnected, schedules, startScheduledMatch]);

  const createSchedule = async (match: MatchSetup, overwrite = false) => {
    if (!database) return false;
    const kickoff = getKickoffTimestamp(match);
    if (kickoff === null) return false;
    const existing = schedules[match.id];
    if (!overwrite && existing && ['starting', 'started'].includes(existing.status)) return true;
    const entry: BroadcastScheduleEntry = {
      matchId: match.id,
      startAt: kickoff - leadMinutes * 60_000,
      leadMinutes,
      status: 'scheduled',
      createdAt: existing?.createdAt || Date.now(),
    };
    await set(ref(database, `${tenantPath('scoring/broadcastSchedule')}/${match.id}`), entry);
    return true;
  };

  const handleSyncAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      const upcoming = matches.filter(match => match.status === 'scheduled' && getKickoffTimestamp(match) !== null);
      const results = await Promise.all(upcoming.map(match => createSchedule(match)));
      const count = results.filter(Boolean).length;
      setMessage(count > 0 ? `Synced ${count} scheduled match${count === 1 ? '' : 'es'}.` : 'No scheduled fixtures found to sync.');
    } catch (error) {
      setMessage(`Could not sync schedules: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

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
                    {!schedule && <button type="button" onClick={() => void createSchedule(match).then(ok => setMessage(ok ? 'Match schedule created.' : 'Match date is invalid.'))}>Schedule</button>}
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
        <IoWarning size={14} /> OBS must remain connected and this Streaming tab must stay open for automatic scheduled starts.
      </footer>
    </section>
  );
}