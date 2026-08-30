// ============================================================================
// KABADDI ADMIN PAGE — /:tenantSlug/kabaddi/scorer/admin
//
// Mirrors the football admin (teams → players → matches → overlay) with
// kabaddi specifics: raider/defender/all-rounder positions, court roles, and
// configurable super raid / super tackle / all-out / bonus / do-or-die
// celebration animations consumed by the OBS overlay.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IoAdd, IoTrash, IoSave, IoClose, IoPeople, IoShirt, IoSettings,
  IoDesktop, IoFlash, IoPlay, IoPencil, IoTrophy,
} from 'react-icons/io5';
import { realtimeSync } from '../services/realtimeSync';
import { kabaddiService } from '../services/kabaddi';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import {
  KABADDI_POSITIONS, KABADDI_DEFENDER_ROLES, DEFAULT_KABADDI_OVERLAY_CONFIG,
  DEFAULT_KABADDI_RULES, createEmptyKabaddiLiveState,
} from '../types/kabaddi';
import type {
  KabaddiTeam, KabaddiPlayer, KabaddiMatchSetup, KabaddiOverlayConfig,
  KabaddiPosition, KabaddiDefenderRole, KabaddiRulesConfig, KabaddiAnimationConfig,
} from '../types/kabaddi';
import './KabaddiAdminPage.css';

type Tab = 'teams' | 'players' | 'matches' | 'overlay';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ANIMATION_FIELDS = [
  { key: 'superRaidAnimation', flag: 'enableSuperRaidAnimation', label: 'Super Raid', hint: '3+ points in one raid' },
  { key: 'superTackleAnimation', flag: 'enableSuperTackleAnimation', label: 'Super Tackle', hint: 'Tackle with a thin defence' },
  { key: 'allOutAnimation', flag: 'enableAllOutAnimation', label: 'All Out', hint: 'Whole side out — 2 bonus points' },
  { key: 'bonusAnimation', flag: 'enableBonusAnimation', label: 'Bonus Point', hint: 'Raider crosses the bonus line' },
  { key: 'doOrDieAnimation', flag: 'enableDoOrDieAnimation', label: 'Do or Die', hint: 'Third consecutive empty raid' },
] as const;

export default function KabaddiAdminPage() {
  const navigate = useNavigate();
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('teams');
  const [teams, setTeams] = useState<KabaddiTeam[]>([]);
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [matches, setMatches] = useState<KabaddiMatchSetup[]>([]);
  const [overlayConfig, setOverlayConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  }, []);

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

  useEffect(() => {
    if (!ready) return;
    const unsubs = [
      kabaddiService.subscribeTeams(setTeams),
      kabaddiService.subscribePlayers(setPlayers),
      kabaddiService.subscribeRules(setRules),
      kabaddiService.subscribeOverlayConfig(c =>
        setOverlayConfig(c ? { ...DEFAULT_KABADDI_OVERLAY_CONFIG, ...c } : DEFAULT_KABADDI_OVERLAY_CONFIG)),
    ];
    return () => unsubs.forEach(u => u());
  }, [ready]);

  const reloadMatches = useCallback(async () => {
    if (!ready) return;
    try { setMatches(await kabaddiService.getMatches()); } catch { /* ignore */ }
  }, [ready]);

  useEffect(() => { void reloadMatches(); }, [reloadMatches]);

  // ── Teams ──
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', primaryColor: '#7c3aed', logoUrl: '', coach: '' });
  const [editTeamId, setEditTeamId] = useState<string | null>(null);

  const resetTeam = () => { setTeamForm({ name: '', shortName: '', primaryColor: '#7c3aed', logoUrl: '', coach: '' }); setEditTeamId(null); };

  const saveTeam = async () => {
    if (!teamForm.name.trim()) { flash('Team name required'); return; }
    setBusy(true);
    try {
      const existing = editTeamId ? teams.find(t => t.id === editTeamId) : undefined;
      await kabaddiService.saveTeam({
        id: existing?.id ?? makeId('kteam'),
        name: teamForm.name.trim(),
        shortName: (teamForm.shortName.trim() || teamForm.name.slice(0, 3)).toUpperCase(),
        primaryColor: teamForm.primaryColor,
        logoUrl: teamForm.logoUrl.trim() || undefined,
        coach: teamForm.coach.trim() || undefined,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      flash(existing ? 'Team updated' : 'Team created');
      resetTeam();
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  // ── Players ──
  const [playerForm, setPlayerForm] = useState({
    teamId: '', name: '', number: '', position: 'RAIDER' as KabaddiPosition,
    defenderRole: 'left_corner' as KabaddiDefenderRole, photoUrl: '', isCaptain: false, isStarter: true,
  });
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState('');

  const resetPlayer = () => {
    setPlayerForm(f => ({ ...f, name: '', number: '', photoUrl: '', isCaptain: false, isStarter: true }));
    setEditPlayerId(null);
  };

  const savePlayer = async () => {
    if (!playerForm.teamId) { flash('Pick a team'); return; }
    if (!playerForm.name.trim()) { flash('Player name required'); return; }
    setBusy(true);
    try {
      const existing = editPlayerId ? players.find(p => p.id === editPlayerId) : undefined;
      await kabaddiService.savePlayer({
        id: existing?.id ?? makeId('kplayer'),
        teamId: playerForm.teamId,
        name: playerForm.name.trim(),
        number: playerForm.number ? Number(playerForm.number) : undefined,
        position: playerForm.position,
        defenderRole: playerForm.position === 'DEFENDER' ? playerForm.defenderRole : undefined,
        photoUrl: playerForm.photoUrl.trim() || undefined,
        isCaptain: playerForm.isCaptain,
        isStarter: playerForm.isStarter,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      flash(existing ? 'Player updated' : 'Player added');
      resetPlayer();
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  const editPlayer = (p: KabaddiPlayer) => {
    setPlayerForm({
      teamId: p.teamId, name: p.name, number: p.number ? String(p.number) : '',
      position: p.position, defenderRole: p.defenderRole ?? 'left_corner',
      photoUrl: p.photoUrl ?? '', isCaptain: !!p.isCaptain, isStarter: p.isStarter !== false,
    });
    setEditPlayerId(p.id);
    setTab('players');
  };

  const visiblePlayers = useMemo(
    () => (filterTeam ? players.filter(p => p.teamId === filterTeam) : players),
    [players, filterTeam],
  );

  // ── Matches ──
  const [matchForm, setMatchForm] = useState({
    teamAId: '', teamBId: '', venue: '', competition: '',
    date: toLocalInput(new Date()), halfDurationMin: DEFAULT_KABADDI_RULES.halfDurationMin,
    tossWonBy: '', tossElected: 'raid' as 'raid' | 'defend',
  });

  const createMatch = async (startNow: boolean) => {
    const a = teams.find(t => t.id === matchForm.teamAId);
    const b = teams.find(t => t.id === matchForm.teamBId);
    if (!a || !b || a.id === b.id) { flash('Pick two different teams'); return; }
    setBusy(true);
    try {
      const id = makeId('kmatch');
      const setup: KabaddiMatchSetup = {
        id,
        teamA: { id: a.id, name: a.name, shortName: a.shortName, logoUrl: a.logoUrl, primaryColor: a.primaryColor },
        teamB: { id: b.id, name: b.name, shortName: b.shortName, logoUrl: b.logoUrl, primaryColor: b.primaryColor },
        venue: matchForm.venue.trim() || 'Indoor Court',
        date: new Date(matchForm.date).toISOString(),
        competition: matchForm.competition.trim() || undefined,
        halfDurationMin: matchForm.halfDurationMin,
        status: startNow ? 'live' : 'scheduled',
        tossWonBy: matchForm.tossWonBy || undefined,
        tossElected: matchForm.tossWonBy ? matchForm.tossElected : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await kabaddiService.saveMatch(setup);

      // Seed the live state so the overlay has something to render immediately.
      const firstRaider = matchForm.tossWonBy
        ? (matchForm.tossElected === 'raid' ? matchForm.tossWonBy : (matchForm.tossWonBy === a.id ? b.id : a.id))
        : a.id;
      await kabaddiService.saveLive({
        ...createEmptyKabaddiLiveState(id, a.id, b.id, rules.playersPerSide),
        raidingTeamId: firstRaider,
      });

      await reloadMatches();
      flash(startNow ? 'Match created and live' : 'Match created');
      setTab('matches');
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  const openIn = (path: string, matchId: string) => {
    const prefix = tenantSlug ? `/${tenantSlug}` : '';
    window.open(`${prefix}${path}?matchId=${matchId}`, '_blank', 'noopener');
  };

  // ── Overlay config ──
  const saveOverlay = async () => {
    setBusy(true);
    try {
      await kabaddiService.saveOverlayConfig(overlayConfig);
      await kabaddiService.saveRules(rules);
      flash('Overlay settings saved');
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  const setAnim = (key: typeof ANIMATION_FIELDS[number]['key'], patch: Partial<KabaddiAnimationConfig>) => {
    setOverlayConfig(c => ({
      ...c,
      [key]: { ...(c[key] ?? { enabled: true, durationMs: 4000 }), ...patch },
    }));
  };

  if (!ready) {
    return <div className="kba kba--loading"><div className="kba__spinner" /><p>Connecting…</p></div>;
  }

  return (
    <div className="kba">
      <header className="kba__header">
        <div className="kba__brand">
          <span className="kba__logo">🤼</span>
          <div>
            <h1>Kabaddi Control Room</h1>
            <span>Teams, players, fixtures and broadcast overlay</span>
          </div>
        </div>
        <div className="kba__counts">
          <span><IoPeople size={14} /> {teams.length} teams</span>
          <span><IoShirt size={14} /> {players.length} players</span>
          <span><IoTrophy size={14} /> {matches.length} matches</span>
        </div>
      </header>

      <nav className="kba__tabs">
        <button className={tab === 'teams' ? 'is-active' : ''} onClick={() => setTab('teams')}>Teams</button>
        <button className={tab === 'players' ? 'is-active' : ''} onClick={() => setTab('players')}>Players</button>
        <button className={tab === 'matches' ? 'is-active' : ''} onClick={() => setTab('matches')}>Matches</button>
        <button className={tab === 'overlay' ? 'is-active' : ''} onClick={() => setTab('overlay')}>Overlay &amp; Animations</button>
      </nav>

      {toast && <div className="kba__toast">{toast}</div>}

      {/* ── Teams ── */}
      {tab === 'teams' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2>{editTeamId ? 'Edit team' : 'Add team'}</h2>
            <div className="kba__grid">
              <label><span>Name *</span><input value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} placeholder="Chennai Chargers" /></label>
              <label><span>Short code</span><input value={teamForm.shortName} maxLength={4} onChange={e => setTeamForm(f => ({ ...f, shortName: e.target.value }))} placeholder="CHE" /></label>
              <label><span>Logo URL</span><input value={teamForm.logoUrl} onChange={e => setTeamForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…" /></label>
              <label><span>Coach</span><input value={teamForm.coach} onChange={e => setTeamForm(f => ({ ...f, coach: e.target.value }))} /></label>
              <label><span>Colour</span><input type="color" value={teamForm.primaryColor} onChange={e => setTeamForm(f => ({ ...f, primaryColor: e.target.value }))} /></label>
            </div>
            <div className="kba__actions">
              <button className="kba__btn kba__btn--primary" onClick={saveTeam} disabled={busy}><IoSave size={16} /> {editTeamId ? 'Update' : 'Create'}</button>
              {editTeamId && <button className="kba__btn" onClick={resetTeam}><IoClose size={16} /> Cancel</button>}
            </div>
          </div>

          <div className="kba__list">
            {teams.length === 0 && <p className="kba__empty">No teams yet.</p>}
            {teams.map(t => (
              <div key={t.id} className="kba__row" style={{ borderLeftColor: t.primaryColor }}>
                <div className="kba__row-id">
                  {t.logoUrl ? <img src={t.logoUrl} alt={t.name} /> : <span className="kba__badge" style={{ background: t.primaryColor }}>{t.shortName}</span>}
                  <div>
                    <strong>{t.name}</strong>
                    <small>{players.filter(p => p.teamId === t.id).length} players{t.coach ? ` · ${t.coach}` : ''}</small>
                  </div>
                </div>
                <div className="kba__row-actions">
                  <button onClick={() => { setTeamForm({ name: t.name, shortName: t.shortName, primaryColor: t.primaryColor ?? '#7c3aed', logoUrl: t.logoUrl ?? '', coach: t.coach ?? '' }); setEditTeamId(t.id); }}><IoPencil size={15} /></button>
                  <button onClick={async () => { if (window.confirm(`Delete ${t.name}?`)) { await kabaddiService.deleteTeam(t.id); flash('Team deleted'); } }}><IoTrash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Players ── */}
      {tab === 'players' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2>{editPlayerId ? 'Edit player' : 'Add player'}</h2>
            <div className="kba__grid">
              <label>
                <span>Team *</span>
                <select value={playerForm.teamId} onChange={e => setPlayerForm(f => ({ ...f, teamId: e.target.value }))}>
                  <option value="">Select…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label><span>Name *</span><input value={playerForm.name} onChange={e => setPlayerForm(f => ({ ...f, name: e.target.value }))} /></label>
              <label><span>Jersey #</span><input type="number" value={playerForm.number} onChange={e => setPlayerForm(f => ({ ...f, number: e.target.value }))} /></label>
              <label>
                <span>Position *</span>
                <select value={playerForm.position} onChange={e => setPlayerForm(f => ({ ...f, position: e.target.value as KabaddiPosition }))}>
                  {KABADDI_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              {playerForm.position === 'DEFENDER' && (
                <label>
                  <span>Court role</span>
                  <select value={playerForm.defenderRole} onChange={e => setPlayerForm(f => ({ ...f, defenderRole: e.target.value as KabaddiDefenderRole }))}>
                    {KABADDI_DEFENDER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
              )}
              <label><span>Photo URL</span><input value={playerForm.photoUrl} onChange={e => setPlayerForm(f => ({ ...f, photoUrl: e.target.value }))} /></label>
            </div>
            <div className="kba__toggles">
              <button className={playerForm.isStarter ? 'is-on' : ''} onClick={() => setPlayerForm(f => ({ ...f, isStarter: !f.isStarter }))}>
                {playerForm.isStarter ? 'On the mat' : 'On the bench'}
              </button>
              <button className={playerForm.isCaptain ? 'is-on' : ''} onClick={() => setPlayerForm(f => ({ ...f, isCaptain: !f.isCaptain }))}>
                Captain
              </button>
            </div>
            <div className="kba__actions">
              <button className="kba__btn kba__btn--primary" onClick={savePlayer} disabled={busy}><IoAdd size={16} /> {editPlayerId ? 'Update' : 'Add player'}</button>
              {editPlayerId && <button className="kba__btn" onClick={resetPlayer}><IoClose size={16} /> Cancel</button>}
            </div>
          </div>

          <div className="kba__card">
            <div className="kba__filter">
              <span>Filter</span>
              <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
                <option value="">All teams</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {visiblePlayers.length === 0 ? <p className="kba__empty">No players.</p> : (
              <ul className="kba__players">
                {visiblePlayers.map(p => {
                  const team = teams.find(t => t.id === p.teamId);
                  return (
                    <li key={p.id}>
                      <span className={`kba__pos kba__pos--${p.position.toLowerCase()}`}>
                        {KABADDI_POSITIONS.find(k => k.value === p.position)?.label}
                      </span>
                      <span className="kba__pname">
                        {p.number ? `#${p.number} ` : ''}{p.name}{p.isCaptain ? ' (C)' : ''}
                      </span>
                      <small>{team?.shortName}</small>
                      <button onClick={() => editPlayer(p)}><IoPencil size={14} /></button>
                      <button onClick={async () => { if (window.confirm(`Remove ${p.name}?`)) { await kabaddiService.deletePlayer(p.id); flash('Player removed'); } }}><IoTrash size={14} /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── Matches ── */}
      {tab === 'matches' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2>Create match</h2>
            <div className="kba__grid">
              <label>
                <span>Team A *</span>
                <select value={matchForm.teamAId} onChange={e => setMatchForm(f => ({ ...f, teamAId: e.target.value }))}>
                  <option value="">Select…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>
                <span>Team B *</span>
                <select value={matchForm.teamBId} onChange={e => setMatchForm(f => ({ ...f, teamBId: e.target.value }))}>
                  <option value="">Select…</option>
                  {teams.filter(t => t.id !== matchForm.teamAId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label><span>Venue</span><input value={matchForm.venue} onChange={e => setMatchForm(f => ({ ...f, venue: e.target.value }))} /></label>
              <label><span>Competition</span><input value={matchForm.competition} onChange={e => setMatchForm(f => ({ ...f, competition: e.target.value }))} placeholder="League / Final" /></label>
              <label><span>Half duration (min)</span><input type="number" min={5} value={matchForm.halfDurationMin} onChange={e => setMatchForm(f => ({ ...f, halfDurationMin: Number(e.target.value) || 20 }))} /></label>
              <label><span>Date &amp; time</span><input type="datetime-local" value={matchForm.date} onChange={e => setMatchForm(f => ({ ...f, date: e.target.value }))} /></label>
              <label>
                <span>Toss won by</span>
                <select value={matchForm.tossWonBy} onChange={e => setMatchForm(f => ({ ...f, tossWonBy: e.target.value }))}>
                  <option value="">Not decided</option>
                  {[matchForm.teamAId, matchForm.teamBId].filter(Boolean).map(id => {
                    const t = teams.find(x => x.id === id);
                    return t ? <option key={t.id} value={t.id}>{t.name}</option> : null;
                  })}
                </select>
              </label>
              <label>
                <span>Elected to</span>
                <select value={matchForm.tossElected} disabled={!matchForm.tossWonBy} onChange={e => setMatchForm(f => ({ ...f, tossElected: e.target.value as 'raid' | 'defend' }))}>
                  <option value="raid">Raid first</option>
                  <option value="defend">Defend first</option>
                </select>
              </label>
            </div>
            <div className="kba__actions">
              <button className="kba__btn kba__btn--primary" onClick={() => createMatch(true)} disabled={busy}><IoPlay size={16} /> Create &amp; go live</button>
              <button className="kba__btn" onClick={() => createMatch(false)} disabled={busy}><IoAdd size={16} /> Create only</button>
            </div>
          </div>

          <div className="kba__list">
            {matches.length === 0 && <p className="kba__empty">No matches yet.</p>}
            {matches.map(m => (
              <div key={m.id} className="kba__row">
                <div className="kba__row-id">
                  <div>
                    <strong>{m.teamA.name} vs {m.teamB.name}</strong>
                    <small>
                      <span className={`kba__status kba__status--${m.status}`}>{m.status}</span>
                      {' '}{m.venue} · {m.halfDurationMin}′ halves{m.competition ? ` · ${m.competition}` : ''}
                    </small>
                  </div>
                </div>
                <div className="kba__row-actions">
                  <button onClick={() => openIn('/kabaddi/scorer/update', m.id)}><IoFlash size={15} /> Score</button>
                  <button onClick={() => openIn('/kabaddi/scorer/obs-overlay', m.id)}><IoDesktop size={15} /> Overlay</button>
                  <button onClick={async () => { await kabaddiService.updateMatchStatus(m.id, 'live'); await reloadMatches(); flash('Match is live'); }}><IoPlay size={15} /></button>
                  <button onClick={async () => { if (window.confirm('Delete match?')) { await kabaddiService.deleteMatch(m.id); await reloadMatches(); flash('Deleted'); } }}><IoTrash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Overlay & animations ── */}
      {tab === 'overlay' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2><IoSettings size={15} /> Broadcast look</h2>
            <div className="kba__grid">
              <label><span>Tournament name</span><input value={overlayConfig.tournamentName ?? ''} onChange={e => setOverlayConfig(c => ({ ...c, tournamentName: e.target.value }))} /></label>
              <label><span>Tournament logo URL</span><input value={overlayConfig.tournamentLogo ?? ''} onChange={e => setOverlayConfig(c => ({ ...c, tournamentLogo: e.target.value }))} /></label>
              <label><span>Partner logo URL</span><input value={overlayConfig.broadcastPartnerLogo ?? ''} onChange={e => setOverlayConfig(c => ({ ...c, broadcastPartnerLogo: e.target.value }))} /></label>
              <label>
                <span>Scorecard position</span>
                <select value={overlayConfig.scoreboardPosition} onChange={e => setOverlayConfig(c => ({ ...c, scoreboardPosition: e.target.value as KabaddiOverlayConfig['scoreboardPosition'] }))}>
                  <option value="bottom-center">Bottom centre</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="top-center">Top centre</option>
                </select>
              </label>
              <label><span>Accent colour</span><input type="color" value={overlayConfig.accentColor} onChange={e => setOverlayConfig(c => ({ ...c, accentColor: e.target.value }))} /></label>
              <label><span>Border colour</span><input type="color" value={overlayConfig.secondaryColor} onChange={e => setOverlayConfig(c => ({ ...c, secondaryColor: e.target.value }))} /></label>
            </div>
            <div className="kba__toggles">
              <button className={overlayConfig.showLiveBadge ? 'is-on' : ''} onClick={() => setOverlayConfig(c => ({ ...c, showLiveBadge: !c.showLiveBadge }))}>LIVE badge</button>
              <button className={overlayConfig.showTimer ? 'is-on' : ''} onClick={() => setOverlayConfig(c => ({ ...c, showTimer: !c.showTimer }))}>Match clock</button>
              <button className={overlayConfig.showRaidClock ? 'is-on' : ''} onClick={() => setOverlayConfig(c => ({ ...c, showRaidClock: !c.showRaidClock }))}>Raid clock</button>
              <button className={overlayConfig.showMatDiagram ? 'is-on' : ''} onClick={() => setOverlayConfig(c => ({ ...c, showMatDiagram: !c.showMatDiagram }))}>Players on mat</button>
            </div>
          </div>

          <div className="kba__card">
            <h2><IoFlash size={15} /> Celebration animations</h2>
            <p className="kba__hint">Leave the media URL blank to use the built-in animated text.</p>
            {ANIMATION_FIELDS.map(field => {
              const anim = overlayConfig[field.key] as KabaddiAnimationConfig | undefined;
              const on = overlayConfig[field.flag];
              return (
                <div key={field.key} className={`kba__anim ${on ? '' : 'is-off'}`}>
                  <div className="kba__anim-head">
                    <button
                      className={`kba__anim-toggle ${on ? 'is-on' : ''}`}
                      onClick={() => setOverlayConfig(c => ({ ...c, [field.flag]: !c[field.flag] }))}
                    >
                      {on ? 'ON' : 'OFF'}
                    </button>
                    <div>
                      <strong>{field.label}</strong>
                      <small>{field.hint}</small>
                    </div>
                  </div>
                  <div className="kba__grid">
                    <label><span>Text</span><input value={anim?.text ?? ''} onChange={e => setAnim(field.key, { text: e.target.value })} /></label>
                    <label><span>Media URL (image / gif)</span><input value={anim?.mediaUrl ?? ''} onChange={e => setAnim(field.key, { mediaUrl: e.target.value })} /></label>
                    <label><span>Duration (ms)</span><input type="number" min={500} step={250} value={anim?.durationMs ?? 4000} onChange={e => setAnim(field.key, { durationMs: Number(e.target.value) || 4000 })} /></label>
                    <label><span>Colour</span><input type="color" value={anim?.color ?? '#f59e0b'} onChange={e => setAnim(field.key, { color: e.target.value })} /></label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="kba__card">
            <h2>Rulebook in play</h2>
            <p className="kba__hint">
              {rules.playersPerSide} a side · {rules.halfDurationMin}′ × {rules.numberOfHalves} with a {rules.halfTimeBreakMin}′ break ·
              {' '}{rules.raidDurationSec}s raids · super raid at {rules.superRaidPoints} pts ·
              {' '}super tackle at ≤{rules.superTackleMaxDefenders} defenders · all-out worth {rules.allOutBonusPoints}.
              Change these in Platform Admin → Kabaddi Rules.
            </p>
          </div>

          <div className="kba__actions kba__actions--sticky">
            <button className="kba__btn kba__btn--primary" onClick={saveOverlay} disabled={busy}><IoSave size={16} /> Save overlay settings</button>
            <button className="kba__btn" onClick={() => navigate('/kabaddi/scorer/admin')}><IoClose size={16} /> Done</button>
          </div>
        </section>
      )}
    </div>
  );
}
