// ============================================================================
// CARROM ADMIN — entries (singles players / doubles pairs), fixtures,
// broadcast branding and the ICF rules summary for the tenant's carrom event.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IoAdd, IoTrash, IoPlay, IoRadio, IoCopyOutline, IoSave } from 'react-icons/io5';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { carromService } from '../services/carrom';
import {
  CARROM_STAGES, DEFAULT_CARROM_OVERLAY_CONFIG, DEFAULT_CARROM_RULES,
} from '../types/carrom';
import type {
  CarromMatchSetup, CarromOverlayConfig, CarromRulesConfig, CarromTeam, CarromTeamRef,
} from '../types/carrom';
import { withScorerAdminChrome } from './withScorerAdminChrome';
import './CarromAdminPage.css';

type Tab = 'entries' | 'matches' | 'broadcast' | 'rules';

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function toRef(team: CarromTeam): CarromTeamRef {
  return {
    id: team.id, name: team.name, shortName: team.shortName, members: team.members,
    logoUrl: team.logoUrl, photoUrl: team.photoUrl, primaryColor: team.primaryColor,
  };
}

function shortNameFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? words.map(word => word[0]).join('') : name.trim().slice(0, 3);
  return code.toUpperCase().slice(0, 4);
}

function statusRank(status: CarromMatchSetup['status']): number {
  return status === 'live' ? 0 : status === 'scheduled' ? 1 : 2;
}

function CarromAdminPageContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantSlug = getTenantSlugFromPath(location.pathname);
  const baseUrl = window.location.origin + (tenantSlug ? `/${tenantSlug}` : '');
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('matches');
  const [teams, setTeams] = useState<CarromTeam[]>([]);
  const [matches, setMatches] = useState<CarromMatchSetup[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [rules, setRules] = useState<CarromRulesConfig>(DEFAULT_CARROM_RULES);
  const [config, setConfig] = useState<CarromOverlayConfig>(DEFAULT_CARROM_OVERLAY_CONFIG);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const [entryForm, setEntryForm] = useState({ name: '', shortName: '', memberOne: '', memberTwo: '', club: '', logoUrl: '', primaryColor: '#b45309' });
  const [matchForm, setMatchForm] = useState({ teamAId: '', teamBId: '', stage: 'League', venue: '', boardNumber: '', scheduledAt: '' });

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
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
      carromService.subscribeTeams(setTeams),
      carromService.subscribeMatches(setMatches),
      carromService.subscribeActiveMatch(setActiveMatchId),
      carromService.subscribeRules(setRules),
      carromService.subscribeOverlayConfig(setConfig),
    ];
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [ready]);

  const sortedMatches = useMemo(() => [...matches].sort((a, b) =>
    statusRank(a.status) - statusRank(b.status)
    || (a.status === 'completed' || a.status === 'abandoned'
      ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      : (a.scheduledAt ?? a.createdAt) - (b.scheduledAt ?? b.createdAt))), [matches]);

  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await task();
      flash(success);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = entryForm.name.trim() || [entryForm.memberOne, entryForm.memberTwo].map(v => v.trim()).filter(Boolean).join(' / ');
    const members = [entryForm.memberOne, rules.format === 'doubles' ? entryForm.memberTwo : '']
      .map(value => value.trim()).filter(Boolean);
    if (!name || members.length === 0) { flash('Enter the player name(s)'); return; }
    if (rules.format === 'doubles' && members.length < 2) { flash('Doubles entries need two players'); return; }
    const now = Date.now();
    const team: CarromTeam = {
      id: newId('ct'),
      name,
      shortName: (entryForm.shortName.trim() || shortNameFor(name)).toUpperCase().slice(0, 5),
      members,
      club: entryForm.club.trim() || undefined,
      logoUrl: entryForm.logoUrl.trim() || undefined,
      primaryColor: entryForm.primaryColor,
      createdAt: now,
      updatedAt: now,
    };
    await run(() => carromService.saveTeam(team), `${team.name} added`);
    setEntryForm(form => ({ ...form, name: '', shortName: '', memberOne: '', memberTwo: '', club: '', logoUrl: '' }));
  };

  const deleteEntry = async (team: CarromTeam) => {
    if (matches.some(match => match.status !== 'completed' && (match.teamA.id === team.id || match.teamB.id === team.id))) {
      flash('Remove or finish this entry\'s fixtures first');
      return;
    }
    if (!window.confirm(`Remove ${team.name}?`)) return;
    await run(() => carromService.deleteTeam(team.id), 'Entry removed');
  };

  const addMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    const teamA = teams.find(team => team.id === matchForm.teamAId);
    const teamB = teams.find(team => team.id === matchForm.teamBId);
    if (!teamA || !teamB) { flash('Pick both entries'); return; }
    if (teamA.id === teamB.id) { flash('An entry cannot play itself'); return; }
    const now = Date.now();
    const scheduledAt = matchForm.scheduledAt ? new Date(matchForm.scheduledAt).getTime() : undefined;
    const match: CarromMatchSetup = {
      id: newId('cm'),
      teamA: toRef(teamA),
      teamB: toRef(teamB),
      stage: matchForm.stage || undefined,
      venue: matchForm.venue.trim() || undefined,
      boardNumber: matchForm.boardNumber.trim() || undefined,
      date: new Date(scheduledAt ?? now).toISOString(),
      scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : undefined,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    };
    await run(() => carromService.saveMatch(match), 'Fixture created');
    setMatchForm(form => ({ ...form, teamAId: '', teamBId: '', boardNumber: '' }));
  };

  const deleteMatch = async (match: CarromMatchSetup) => {
    if (!window.confirm(`Delete ${match.teamA.name} vs ${match.teamB.name}? Its score history will be removed.`)) return;
    await run(() => carromService.deleteMatch(match.id), 'Fixture deleted');
  };

  const saveConfig = async () => {
    await run(() => carromService.saveOverlayConfig({
      ...config,
      tournamentName: config.tournamentName?.trim() || undefined,
      tournamentLogo: config.tournamentLogo?.trim() || undefined,
      broadcastPartnerLogo: config.broadcastPartnerLogo?.trim() || undefined,
    }), 'Broadcast settings saved');
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      flash('URL copied');
    } catch {
      flash(url);
    }
  };

  const setConfigField = <K extends keyof CarromOverlayConfig>(key: K, value: CarromOverlayConfig[K]) =>
    setConfig(current => ({ ...current, [key]: value }));

  const overlayUrl = `${baseUrl}/carrom/scorer/obs-overlay`;

  return (
    <div className="carrom-admin">
      {toast && <div className="carrom-admin__toast" role="status">{toast}</div>}
      <nav className="carrom-admin__tabs" aria-label="Carrom admin sections">
        {([['matches', 'Fixtures'], ['entries', rules.format === 'doubles' ? 'Pairs' : 'Players'], ['broadcast', 'Broadcast'], ['rules', 'Rules']] as const).map(([key, label]) => (
          <button key={key} className={`carrom-admin__tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {!ready && <p className="carrom-admin__muted">Connecting…</p>}

      {ready && tab === 'entries' && (
        <section className="carrom-admin__grid">
          <form className="carrom-admin__card" onSubmit={addEntry}>
            <h2>Add {rules.format === 'doubles' ? 'pair' : 'player'}</h2>
            <label>{rules.format === 'doubles' ? 'Player 1' : 'Player name'}
              <input value={entryForm.memberOne} onChange={e => setEntryForm({ ...entryForm, memberOne: e.target.value })} required maxLength={60} />
            </label>
            {rules.format === 'doubles' && (
              <label>Player 2
                <input value={entryForm.memberTwo} onChange={e => setEntryForm({ ...entryForm, memberTwo: e.target.value })} required maxLength={60} />
              </label>
            )}
            <label>Display name <span>(optional)</span>
              <input value={entryForm.name} onChange={e => setEntryForm({ ...entryForm, name: e.target.value })} maxLength={60} placeholder="Defaults to the player name(s)" />
            </label>
            <div className="carrom-admin__row">
              <label>Short code
                <input value={entryForm.shortName} onChange={e => setEntryForm({ ...entryForm, shortName: e.target.value })} maxLength={5} placeholder="Auto" />
              </label>
              <label>Colour
                <input type="color" value={entryForm.primaryColor} onChange={e => setEntryForm({ ...entryForm, primaryColor: e.target.value })} />
              </label>
            </div>
            <label>Club / district <span>(optional)</span>
              <input value={entryForm.club} onChange={e => setEntryForm({ ...entryForm, club: e.target.value })} maxLength={60} />
            </label>
            <label>Logo / photo URL <span>(optional)</span>
              <input type="url" value={entryForm.logoUrl} onChange={e => setEntryForm({ ...entryForm, logoUrl: e.target.value })} placeholder="https://…" />
            </label>
            <button className="carrom-admin__btn carrom-admin__btn--primary" disabled={busy} type="submit"><IoAdd /> Add</button>
          </form>

          <div className="carrom-admin__card">
            <h2>{teams.length} {rules.format === 'doubles' ? 'pairs' : 'players'}</h2>
            {teams.length === 0 && <p className="carrom-admin__muted">No entries yet.</p>}
            <ul className="carrom-admin__list">
              {teams.map(team => (
                <li key={team.id}>
                  <span className="carrom-admin__swatch" style={{ background: team.primaryColor || '#b45309' }} />
                  <div>
                    <strong>{team.name}</strong> <code>{team.shortName}</code>
                    <small>{team.members.join(' & ')}{team.club ? ` · ${team.club}` : ''}</small>
                  </div>
                  <button className="carrom-admin__icon-btn" onClick={() => void deleteEntry(team)} aria-label={`Remove ${team.name}`}><IoTrash /></button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {ready && tab === 'matches' && (
        <section className="carrom-admin__grid">
          <form className="carrom-admin__card" onSubmit={addMatch}>
            <h2>New fixture</h2>
            {teams.length < 2 && <p className="carrom-admin__muted">Add at least two entries first.</p>}
            <label>Side A
              <select value={matchForm.teamAId} onChange={e => setMatchForm({ ...matchForm, teamAId: e.target.value })} required>
                <option value="">Select…</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>Side B
              <select value={matchForm.teamBId} onChange={e => setMatchForm({ ...matchForm, teamBId: e.target.value })} required>
                <option value="">Select…</option>
                {teams.filter(team => team.id !== matchForm.teamAId).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <div className="carrom-admin__row">
              <label>Stage
                <select value={matchForm.stage} onChange={e => setMatchForm({ ...matchForm, stage: e.target.value })}>
                  {CARROM_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </label>
              <label>Board #
                <input value={matchForm.boardNumber} onChange={e => setMatchForm({ ...matchForm, boardNumber: e.target.value })} maxLength={6} />
              </label>
            </div>
            <label>Venue <span>(optional)</span>
              <input value={matchForm.venue} onChange={e => setMatchForm({ ...matchForm, venue: e.target.value })} maxLength={80} />
            </label>
            <label>Scheduled at <span>(optional)</span>
              <input type="datetime-local" value={matchForm.scheduledAt} onChange={e => setMatchForm({ ...matchForm, scheduledAt: e.target.value })} />
            </label>
            <button className="carrom-admin__btn carrom-admin__btn--primary" disabled={busy || teams.length < 2} type="submit"><IoAdd /> Create fixture</button>
          </form>

          <div className="carrom-admin__card">
            <h2>Fixtures</h2>
            {sortedMatches.length === 0 && <p className="carrom-admin__muted">No fixtures yet.</p>}
            <ul className="carrom-admin__list">
              {sortedMatches.map(match => (
                <li key={match.id}>
                  <span className={`carrom-admin__status carrom-admin__status--${match.status}`}>{match.status}</span>
                  <div>
                    <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                    <small>
                      {[match.stage, match.boardNumber ? `Board ${match.boardNumber}` : '', match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : '', match.resultSummary]
                        .filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <div className="carrom-admin__actions">
                    {activeMatchId === match.id
                      ? <span className="carrom-admin__on-air"><IoRadio /> On air</span>
                      : <button className="carrom-admin__btn" disabled={busy} onClick={() => void run(() => carromService.setActiveMatch(match.id), 'Overlay now follows this match')}><IoRadio /> On air</button>}
                    {match.status !== 'completed' && match.status !== 'abandoned' && (
                      <button className="carrom-admin__btn carrom-admin__btn--primary" onClick={() => navigate(`/carrom/scorer/update?matchId=${encodeURIComponent(match.id)}&pin=1`)}><IoPlay /> Score</button>
                    )}
                    <button className="carrom-admin__icon-btn" disabled={busy} onClick={() => void deleteMatch(match)} aria-label="Delete fixture"><IoTrash /></button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {ready && tab === 'broadcast' && (
        <section className="carrom-admin__grid">
          <div className="carrom-admin__card">
            <h2>OBS browser source</h2>
            <p className="carrom-admin__muted">Add this as a 1920×1080 browser source. It follows the on-air fixture automatically and uses your active Scorecard Designer layout, or the built-in Walnut &amp; Gold scoreboard.</p>
            <div className="carrom-admin__url">
              <code>{overlayUrl}</code>
              <button className="carrom-admin__icon-btn" onClick={() => void copy(overlayUrl)} aria-label="Copy overlay URL"><IoCopyOutline /></button>
            </div>
            <label className="carrom-admin__check">
              <input type="checkbox" checked={!!config.singleOverlayMode} onChange={e => setConfigField('singleOverlayMode', e.target.checked)} />
              Single overlay mode — always follow the on-air fixture
            </label>
          </div>
          <div className="carrom-admin__card">
            <h2>Branding</h2>
            <label>Tournament name
              <input value={config.tournamentName ?? ''} onChange={e => setConfigField('tournamentName', e.target.value)} maxLength={80} />
            </label>
            <label>Tournament logo URL
              <input type="url" value={config.tournamentLogo ?? ''} onChange={e => setConfigField('tournamentLogo', e.target.value)} />
            </label>
            <label>Broadcast partner logo URL
              <input type="url" value={config.broadcastPartnerLogo ?? ''} onChange={e => setConfigField('broadcastPartnerLogo', e.target.value)} />
            </label>
            <div className="carrom-admin__row carrom-admin__row--colors">
              {([['primaryColor', 'Frame'], ['secondaryColor', 'Felt'], ['accentColor', 'Trim'], ['textColor', 'Text']] as const).map(([key, label]) => (
                <label key={key}>{label}
                  <input type="color" value={config[key]} onChange={e => setConfigField(key, e.target.value)} />
                </label>
              ))}
            </div>
            <label>Position
              <select value={config.scoreboardPosition} onChange={e => setConfigField('scoreboardPosition', e.target.value as CarromOverlayConfig['scoreboardPosition'])}>
                <option value="bottom-center">Bottom centre</option>
                <option value="top-center">Top centre</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </label>
            {([['showLiveBadge', 'LIVE badge'], ['showCoinTracker', 'Carrommen tracker'], ['showBoardHistory', 'Board-by-board strip'], ['enableCelebrations', 'Queen / board / game celebrations']] as const).map(([key, label]) => (
              <label key={key} className="carrom-admin__check">
                <input type="checkbox" checked={config[key]} onChange={e => setConfigField(key, e.target.checked)} /> {label}
              </label>
            ))}
            <button className="carrom-admin__btn carrom-admin__btn--primary" disabled={busy} onClick={() => void saveConfig()}><IoSave /> Save broadcast settings</button>
          </div>
        </section>
      )}

      {ready && tab === 'rules' && (
        <section className="carrom-admin__card carrom-admin__rules">
          <h2>Tournament rules · {rules.format}</h2>
          <p className="carrom-admin__muted">Rules are configured by the platform admin and applied automatically by the scorer and overlay.</p>
          <dl>
            <div><dt>Game</dt><dd>{rules.pointsToWinGame} points or {rules.boardsPerGame} boards{rules.extraBoardOnTie ? ' (extra board on tie)' : ''}</dd></div>
            <div><dt>Match</dt><dd>Best of {rules.gamesPerMatch} games</dd></div>
            <div><dt>Board points</dt><dd>Opponent carrommen left + Queen {rules.queenPoints} (only while the winner is on ≤ {rules.queenCutoffScore}); max {rules.maxBoardPoints}</dd></div>
            <div><dt>Queen</dt><dd>Pocket after your first carromman; cover in the same or next stroke or it returns to the centre</dd></div>
            <div><dt>Due</dt><dd>Striker pocketed → one carromman returned (pending if none pocketed yet)</dd></div>
            <div><dt>Foul</dt><dd>Penalty carromman + loss of turn; technical foul keeps the turn</dd></div>
            <div><dt>Last carromman</dt><dd>Pocketing your last before the Queen is covered, or the opponent's last, loses the board</dd></div>
            <div><dt>Timing</dt><dd>{rules.strokeTimeSec}s per stroke · {rules.breakAttempts} break attempts</dd></div>
          </dl>
          {rules.notes && <p className="carrom-admin__notes">{rules.notes}</p>}
        </section>
      )}
    </div>
  );
}

const CarromAdminPage = withScorerAdminChrome(CarromAdminPageContent, {
  gameType: 'carrom',
  subtitle: 'Entries, fixtures and broadcast for ICF-rules carrom',
});

export default CarromAdminPage;
