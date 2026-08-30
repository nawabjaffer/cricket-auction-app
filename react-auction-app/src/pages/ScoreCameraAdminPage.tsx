// ============================================================================
// SCORE CAMERA ADMIN — /:tenantSlug/cricket/scorer/camera/admin
//
// Quick-match control for ground-side recording days: build ad-hoc teams and
// rosters by hand (no auction listing required), spin up a fixture, and jump
// straight into the camera recorder / scorer.
//
// Writes into the same tenant scoring namespace the normal scorer uses, so a
// quick match behaves exactly like an auction-backed one:
//   scoring/quickTeams/{teamId}          QuickTeam (reusable roster)
//   scoring/matches/{matchId}/setup      MatchSetup
//   scoring/matches/{matchId}/lineups/*  MatchLineup
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  IoAdd, IoTrash, IoPeople, IoVideocam, IoArrowBack, IoFlash,
  IoClose, IoPlay, IoDesktop, IoSave, IoPencil, IoLayers,
} from 'react-icons/io5';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { PLAYER_ROLES } from '../utils/constants';
import type {
  QuickTeam, MatchSquadPlayer, MatchSetup, MatchStage, MatchLineup,
} from '../types/scoring';
import { MATCH_STAGE_LABELS } from '../types/scoring';
import './ScoreCameraAdminPage.css';

type Tab = 'teams' | 'match' | 'fixtures';

const ROLE_OPTIONS: string[] = [
  PLAYER_ROLES.BATSMAN,
  PLAYER_ROLES.BOWLER,
  PLAYER_ROLES.ALL_ROUNDER,
  PLAYER_ROLES.WICKET_KEEPER_BATSMAN,
  PLAYER_ROLES.PLAYER,
];

const TEAM_COLORS = ['#2563eb', '#e11d1d', '#16a34a', '#f59e0b', '#8b5cf6', '#0ea5e9', '#db2777', '#0f766e'];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Parse a bulk roster paste. Accepts one player per line as
 * `Name`, `Name, Role` or `Name - Role`.
 */
function parseBulkRoster(text: string): { name: string; role: string }[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\s*[,|]\s*|\s+-\s+/);
      const name = (parts[0] || '').trim();
      const rawRole = (parts[1] || '').trim();
      const matched = ROLE_OPTIONS.find(r => r.toLowerCase() === rawRole.toLowerCase())
        ?? ROLE_OPTIONS.find(r => rawRole && r.toLowerCase().startsWith(rawRole.toLowerCase()));
      return { name, role: matched || PLAYER_ROLES.PLAYER };
    })
    .filter(p => !!p.name);
}

export default function ScoreCameraAdminPage() {
  const navigate = useNavigate();
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('teams');
  const [teams, setTeams] = useState<QuickTeam[]>([]);
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }, []);

  // ── Init scoring service ──
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Database not available');
        scoringService.initialize(db, tenantPath('scoring'));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(() => void init(), 800);
      }
    };
    void init();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, []);

  // ── Subscribe quick teams + load fixtures ──
  useEffect(() => {
    if (!ready) return;
    const unsub = scoringService.subscribeQuickTeams(setTeams);
    return () => unsub();
  }, [ready]);

  const reloadMatches = useCallback(async () => {
    if (!ready) return;
    try { setMatches(await scoringService.getAllMatches()); } catch { /* ignore */ }
  }, [ready]);

  useEffect(() => { void reloadMatches(); }, [reloadMatches]);

  // ── Team editor state ──
  const [teamForm, setTeamForm] = useState({ name: '', shortCode: '', primaryColor: TEAM_COLORS[0], logoUrl: '' });
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkTeamId, setBulkTeamId] = useState<string | null>(null);

  const resetTeamForm = () => {
    setTeamForm({ name: '', shortCode: '', primaryColor: TEAM_COLORS[teams.length % TEAM_COLORS.length], logoUrl: '' });
    setEditingTeamId(null);
  };

  const saveTeam = async () => {
    const name = teamForm.name.trim();
    if (!name) { flash('Team name is required'); return; }
    setBusy(true);
    try {
      const existing = editingTeamId ? teams.find(t => t.id === editingTeamId) : undefined;
      const team: QuickTeam = {
        id: existing?.id || makeId('qteam'),
        name,
        shortCode: (teamForm.shortCode.trim() || name.slice(0, 3)).toUpperCase(),
        primaryColor: teamForm.primaryColor,
        logoUrl: teamForm.logoUrl.trim() || undefined,
        players: existing?.players ?? [],
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await scoringService.saveQuickTeam(team);
      flash(existing ? 'Team updated' : 'Team created');
      resetTeamForm();
    } catch (e) {
      flash(`Save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const editTeam = (t: QuickTeam) => {
    setTeamForm({
      name: t.name,
      shortCode: t.shortCode || '',
      primaryColor: t.primaryColor || TEAM_COLORS[0],
      logoUrl: t.logoUrl || '',
    });
    setEditingTeamId(t.id);
  };

  const deleteTeam = async (t: QuickTeam) => {
    if (!window.confirm(`Delete "${t.name}" and its ${t.players.length} players?`)) return;
    try {
      await scoringService.deleteQuickTeam(t.id);
      flash('Team deleted');
    } catch (e) { flash(`Delete failed: ${String(e)}`); }
  };

  // ── Roster editing ──
  const persistPlayers = async (team: QuickTeam, players: MatchSquadPlayer[]) => {
    await scoringService.saveQuickTeam({
      ...team,
      players: players.map((p, i) => ({ ...p, battingOrder: i + 1 })),
      updatedAt: Date.now(),
    });
  };

  const addPlayer = async (team: QuickTeam, name: string, role: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await persistPlayers(team, [
      ...team.players,
      { playerId: makeId('qp'), playerName: trimmed, role: role || PLAYER_ROLES.PLAYER },
    ]);
  };

  const removePlayer = async (team: QuickTeam, playerId: string) => {
    await persistPlayers(team, team.players.filter(p => p.playerId !== playerId));
  };

  const changePlayerRole = async (team: QuickTeam, playerId: string, role: string) => {
    await persistPlayers(team, team.players.map(p => (p.playerId === playerId ? { ...p, role } : p)));
  };

  const applyBulk = async (team: QuickTeam) => {
    const parsed = parseBulkRoster(bulkText);
    if (parsed.length === 0) { flash('Nothing to add'); return; }
    setBusy(true);
    try {
      await persistPlayers(team, [
        ...team.players,
        ...parsed.map(p => ({ playerId: makeId('qp'), playerName: p.name, role: p.role })),
      ]);
      flash(`Added ${parsed.length} player${parsed.length === 1 ? '' : 's'}`);
      setBulkText('');
      setBulkTeamId(null);
    } catch (e) {
      flash(`Bulk add failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Match creation ──
  const [matchForm, setMatchForm] = useState({
    teamAId: '', teamBId: '', venue: '', maxOvers: 10,
    date: toLocalInput(new Date()), stage: 'friendly' as MatchStage,
  });

  const canCreate = matchForm.teamAId && matchForm.teamBId && matchForm.teamAId !== matchForm.teamBId;

  const createMatch = async (startNow: boolean) => {
    if (!canCreate) { flash('Pick two different teams'); return; }
    const teamA = teams.find(t => t.id === matchForm.teamAId);
    const teamB = teams.find(t => t.id === matchForm.teamBId);
    if (!teamA || !teamB) { flash('Teams not found'); return; }

    setBusy(true);
    try {
      const matchId = makeId('qmatch');
      const setup: MatchSetup = {
        id: matchId,
        teamA: { id: teamA.id, name: teamA.name, logoUrl: teamA.logoUrl, primaryColor: teamA.primaryColor },
        teamB: { id: teamB.id, name: teamB.name, logoUrl: teamB.logoUrl, primaryColor: teamB.primaryColor },
        venue: matchForm.venue.trim() || 'Ground',
        date: new Date(matchForm.date).toISOString(),
        maxOvers: matchForm.maxOvers,
        powerplayOvers: matchForm.maxOvers <= 20 ? Math.min(6, matchForm.maxOvers) : 10,
        stage: matchForm.stage,
        status: startNow ? 'live' : 'scheduled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await scoringService.createMatch(setup);

      // Copy quick rosters into match lineups so the scorer can pick XIs immediately.
      for (const team of [teamA, teamB]) {
        const lineup: MatchLineup = {
          matchId,
          teamId: team.id,
          players: team.players.map((p, i) => ({ ...p, battingOrder: p.battingOrder ?? i + 1 })),
        };
        await scoringService.saveLineup(matchId, lineup);
      }

      if (startNow) await scoringService.setActiveMatch(matchId);
      await reloadMatches();
      flash(startNow ? 'Match created and set live' : 'Match created');
      setTab('fixtures');
    } catch (e) {
      flash(`Create failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Fixture actions ──
  const startFixture = async (m: MatchSetup) => {
    try {
      await scoringService.startMatchQuick(m.id);
      await reloadMatches();
      flash('Match is live');
    } catch (e) { flash(`Start failed: ${String(e)}`); }
  };

  const deleteFixture = async (m: MatchSetup) => {
    if (!window.confirm(`Delete ${m.teamA.name} vs ${m.teamB.name}?`)) return;
    try {
      await scoringService.deleteMatch(m.id);
      await reloadMatches();
      flash('Match deleted');
    } catch (e) { flash(`Delete failed: ${String(e)}`); }
  };

  const openIn = (path: string, matchId: string) => {
    const prefix = tenantSlug ? `/${tenantSlug}` : '';
    window.open(`${prefix}${path}?matchId=${matchId}`, '_blank', 'noopener');
  };

  const totalPlayers = useMemo(() => teams.reduce((n, t) => n + t.players.length, 0), [teams]);

  if (!ready) {
    return (
      <div className="cam-admin cam-admin--loading">
        <div className="cam-admin__spinner" />
        <p>Connecting to scoring database…</p>
      </div>
    );
  }

  return (
    <div className="cam-admin">
      <header className="cam-admin__header">
        <button className="cam-admin__icon-btn" onClick={() => navigate('/cricket/scorer/admin')} title="Back to Scoring Admin">
          <IoArrowBack size={20} />
        </button>
        <div className="cam-admin__title">
          <IoVideocam size={22} />
          <div>
            <h1>Camera Quick Match</h1>
            <span>Build teams and fixtures on the ground — no auction data needed</span>
          </div>
        </div>
        <div className="cam-admin__stats">
          <span><IoPeople size={14} /> {teams.length} teams</span>
          <span><IoLayers size={14} /> {totalPlayers} players</span>
        </div>
      </header>

      <nav className="cam-admin__tabs">
        <button className={tab === 'teams' ? 'is-active' : ''} onClick={() => setTab('teams')}>Teams &amp; Players</button>
        <button className={tab === 'match' ? 'is-active' : ''} onClick={() => setTab('match')}>New Match</button>
        <button className={tab === 'fixtures' ? 'is-active' : ''} onClick={() => setTab('fixtures')}>Fixtures ({matches.length})</button>
      </nav>

      {toast && <div className="cam-admin__toast">{toast}</div>}

      {/* ── Teams & Players ── */}
      {tab === 'teams' && (
        <section className="cam-admin__body">
          <div className="cam-admin__card">
            <h2>{editingTeamId ? 'Edit team' : 'Add a team'}</h2>
            <div className="cam-admin__form-grid">
              <label>
                <span>Team name *</span>
                <input
                  value={teamForm.name}
                  onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Thunder XI"
                />
              </label>
              <label>
                <span>Short code</span>
                <input
                  value={teamForm.shortCode}
                  onChange={e => setTeamForm(f => ({ ...f, shortCode: e.target.value }))}
                  placeholder="THU"
                  maxLength={4}
                />
              </label>
              <label>
                <span>Logo URL</span>
                <input
                  value={teamForm.logoUrl}
                  onChange={e => setTeamForm(f => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </label>
              <div className="cam-admin__colors">
                <span>Colour</span>
                <div>
                  {TEAM_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`cam-admin__swatch ${teamForm.primaryColor === c ? 'is-on' : ''}`}
                      style={{ background: c }}
                      onClick={() => setTeamForm(f => ({ ...f, primaryColor: c }))}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="cam-admin__actions">
              <button className="cam-admin__btn cam-admin__btn--primary" onClick={saveTeam} disabled={busy}>
                <IoSave size={16} /> {editingTeamId ? 'Update team' : 'Create team'}
              </button>
              {editingTeamId && (
                <button className="cam-admin__btn" onClick={resetTeamForm}><IoClose size={16} /> Cancel</button>
              )}
            </div>
          </div>

          {teams.length === 0 && (
            <p className="cam-admin__empty">No quick teams yet. Create one above to get started.</p>
          )}

          <div className="cam-admin__team-list">
            {teams.map(team => (
              <div key={team.id} className="cam-admin__team">
                <div className="cam-admin__team-head" style={{ borderLeftColor: team.primaryColor }}>
                  <div className="cam-admin__team-id">
                    {team.logoUrl
                      ? <img src={team.logoUrl} alt={team.name} />
                      : <span className="cam-admin__team-badge" style={{ background: team.primaryColor }}>{team.shortCode}</span>}
                    <div>
                      <strong>{team.name}</strong>
                      <small>{team.players.length} players</small>
                    </div>
                  </div>
                  <div className="cam-admin__team-actions">
                    <button onClick={() => setExpandedTeamId(id => (id === team.id ? null : team.id))}>
                      {expandedTeamId === team.id ? 'Hide roster' : 'Roster'}
                    </button>
                    <button onClick={() => editTeam(team)} title="Edit team"><IoPencil size={15} /></button>
                    <button onClick={() => deleteTeam(team)} title="Delete team"><IoTrash size={15} /></button>
                  </div>
                </div>

                {expandedTeamId === team.id && (
                  <div className="cam-admin__roster">
                    <QuickAddPlayer onAdd={(name, role) => addPlayer(team, name, role)} />

                    <div className="cam-admin__bulk">
                      {bulkTeamId === team.id ? (
                        <>
                          <textarea
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                            rows={5}
                            placeholder={'One player per line:\nRavi Kumar, Batsman\nArun S - Bowler\nVijay'}
                          />
                          <div className="cam-admin__actions">
                            <button className="cam-admin__btn cam-admin__btn--primary" onClick={() => applyBulk(team)} disabled={busy}>
                              <IoAdd size={16} /> Add all
                            </button>
                            <button className="cam-admin__btn" onClick={() => { setBulkTeamId(null); setBulkText(''); }}>Cancel</button>
                          </div>
                        </>
                      ) : (
                        <button className="cam-admin__btn cam-admin__btn--ghost" onClick={() => { setBulkTeamId(team.id); setBulkText(''); }}>
                          <IoFlash size={15} /> Bulk paste roster
                        </button>
                      )}
                    </div>

                    {team.players.length === 0 ? (
                      <p className="cam-admin__empty">No players yet.</p>
                    ) : (
                      <ul className="cam-admin__players">
                        {team.players.map((p, i) => (
                          <li key={p.playerId}>
                            <span className="cam-admin__player-no">{i + 1}</span>
                            <span className="cam-admin__player-name">{p.playerName}</span>
                            <select value={p.role} onChange={e => changePlayerRole(team, p.playerId, e.target.value)}>
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button onClick={() => removePlayer(team, p.playerId)} title="Remove"><IoClose size={15} /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── New Match ── */}
      {tab === 'match' && (
        <section className="cam-admin__body">
          <div className="cam-admin__card">
            <h2>Create a quick fixture</h2>
            {teams.length < 2 && <p className="cam-admin__empty">Add at least two teams first.</p>}
            <div className="cam-admin__form-grid">
              <label>
                <span>Team A *</span>
                <select value={matchForm.teamAId} onChange={e => setMatchForm(f => ({ ...f, teamAId: e.target.value }))}>
                  <option value="">Select…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.players.length})</option>)}
                </select>
              </label>
              <label>
                <span>Team B *</span>
                <select value={matchForm.teamBId} onChange={e => setMatchForm(f => ({ ...f, teamBId: e.target.value }))}>
                  <option value="">Select…</option>
                  {teams.filter(t => t.id !== matchForm.teamAId).map(t => <option key={t.id} value={t.id}>{t.name} ({t.players.length})</option>)}
                </select>
              </label>
              <label>
                <span>Overs</span>
                <input
                  type="number" min={1} max={50} value={matchForm.maxOvers}
                  onChange={e => setMatchForm(f => ({ ...f, maxOvers: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </label>
              <label>
                <span>Stage</span>
                <select value={matchForm.stage} onChange={e => setMatchForm(f => ({ ...f, stage: e.target.value as MatchStage }))}>
                  {Object.entries(MATCH_STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>
                <span>Venue</span>
                <input value={matchForm.venue} onChange={e => setMatchForm(f => ({ ...f, venue: e.target.value }))} placeholder="Corporation Ground" />
              </label>
              <label>
                <span>Date &amp; time</span>
                <input type="datetime-local" value={matchForm.date} onChange={e => setMatchForm(f => ({ ...f, date: e.target.value }))} />
              </label>
            </div>
            <div className="cam-admin__actions">
              <button className="cam-admin__btn cam-admin__btn--primary" onClick={() => createMatch(true)} disabled={busy || !canCreate}>
                <IoPlay size={16} /> Create &amp; go live
              </button>
              <button className="cam-admin__btn" onClick={() => createMatch(false)} disabled={busy || !canCreate}>
                <IoAdd size={16} /> Create only
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Fixtures ── */}
      {tab === 'fixtures' && (
        <section className="cam-admin__body">
          {matches.length === 0 && <p className="cam-admin__empty">No fixtures yet.</p>}
          <div className="cam-admin__fixtures">
            {matches.map(m => (
              <div key={m.id} className="cam-admin__fixture">
                <div className="cam-admin__fixture-main">
                  <span className={`cam-admin__status cam-admin__status--${m.status}`}>{m.status}</span>
                  <strong>{m.teamA.name} vs {m.teamB.name}</strong>
                  <small>{m.maxOvers} ov · {m.venue} · {MATCH_STAGE_LABELS[m.stage || 'league']}</small>
                </div>
                <div className="cam-admin__fixture-actions">
                  {m.status !== 'live' && (
                    <button onClick={() => startFixture(m)} title="Set live"><IoPlay size={15} /> Go live</button>
                  )}
                  <button onClick={() => openIn('/cricket/scorer/camera', m.id)} title="Open camera"><IoVideocam size={15} /> Camera</button>
                  <button onClick={() => openIn('/cricket/scorer/camera/host', m.id)} title="Open the multi-camera host view"><IoLayers size={15} /> Host</button>
                  <button onClick={() => openIn('/cricket/scorer/update', m.id)} title="Open scorer"><IoFlash size={15} /> Score</button>
                  <button onClick={() => openIn('/cricket/scorer/obs-overlay', m.id)} title="Open overlay"><IoDesktop size={15} /> Overlay</button>
                  <button onClick={() => deleteFixture(m)} title="Delete"><IoTrash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Inline add-player row ────────────────────────────────────────────────────

function QuickAddPlayer({ onAdd }: Readonly<{ onAdd: (name: string, role: string) => void | Promise<void> }>) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(PLAYER_ROLES.PLAYER);

  const submit = async () => {
    if (!name.trim()) return;
    await onAdd(name, role);
    setName('');
  };

  return (
    <div className="cam-admin__add-player">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
        placeholder="Player name — press Enter to add"
      />
      <select value={role} onChange={e => setRole(e.target.value)}>
        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <button className="cam-admin__btn cam-admin__btn--primary" onClick={submit}><IoAdd size={16} /> Add</button>
    </div>
  );
}
