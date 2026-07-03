// ============================================================================
// FOOTBALL ADMIN PAGE — /:tenantSlug/football/scorer/admin
// Team Management, Player Management, Match setup, and OBS overlay branding.
// Mirrors the cricket ScoringAdminPage but with football logic (formations,
// positions, goals/assists, team logos + player photos uploaded to Storage).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IoAdd, IoTrash, IoSave, IoClose, IoShirt, IoPeople, IoFootball,
  IoImage, IoColorPalette, IoPencil, IoDesktop, IoStatsChart, IoPlay,
} from 'react-icons/io5';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { useLocation } from 'react-router-dom';
import { tenantPath } from '../services/tenantPath';
import { realtimeSync } from '../services/realtimeSync';
import { footballService } from '../services/football';
import { uploadFileToStorage } from '../services';
import {
  FOOTBALL_POSITIONS, FOOTBALL_FORMATIONS, DEFAULT_FOOTBALL_OVERLAY_CONFIG,
} from '../types/football';
import type {
  FootballTeam, FootballPlayer, FootballMatchSetup, FootballOverlayConfig,
  FootballPosition, FootballFormation, FootballTeamRef,
} from '../types/football';
import './FootballAdminPage.css';

type Tab = 'teams' | 'players' | 'matches' | 'overlay';

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export default function FootballAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantSlug = getTenantSlugFromPath(location.pathname);
  const baseUrl = window.location.origin + (tenantSlug ? `/${tenantSlug}` : '');
  const { isAuthenticated, extendSession } = useAdminAuth();

  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Data
  const [teams, setTeams] = useState<FootballTeam[]>([]);
  const [players, setPlayers] = useState<FootballPlayer[]>([]);
  const [matches, setMatches] = useState<FootballMatchSetup[]>([]);
  const [overlayConfig, setOverlayConfig] = useState<FootballOverlayConfig>(DEFAULT_FOOTBALL_OVERLAY_CONFIG);

  // ── Init Firebase + football service ──
  useEffect(() => {
    (async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) footballService.initialize(db, tenantPath('football'));
      } catch (err) {
        console.warn('[FootballAdmin] init warning:', err);
      }
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

  // ── Live subscriptions ──
  useEffect(() => {
    if (!ready) return;
    const unsubTeams = footballService.subscribeTeams(setTeams);
    const unsubPlayers = footballService.subscribePlayers(setPlayers);
    const unsubConfig = footballService.subscribeOverlayConfig((c) => setOverlayConfig(c ?? DEFAULT_FOOTBALL_OVERLAY_CONFIG));
    footballService.getMatches().then(setMatches);
    return () => { unsubTeams(); unsubPlayers(); unsubConfig(); };
  }, [ready]);

  const flash = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }, []);

  const refreshMatches = useCallback(() => { footballService.getMatches().then(setMatches); }, []);

  if (!isAuthenticated) return null;

  return (
    <div className="fb-admin">
      <header className="fb-admin__header">
        <div className="fb-admin__brand">
          <IoFootball size={26} />
          <div>
            <h1>Football Scorer</h1>
            <p>Team &amp; player management · match setup · broadcast overlay</p>
          </div>
        </div>
        <div className="fb-admin__header-actions">
          <button className="fb-admin__ghost" onClick={() => navigate('/cricket/scorer/admin')}>
            Switch to Cricket
          </button>
          <button className="fb-admin__ghost" onClick={() => navigate('/admin')}>Main Admin</button>
        </div>
      </header>

      <nav className="fb-admin__tabs">
        {([
          { id: 'teams', label: 'Teams', icon: <IoShirt size={18} /> },
          { id: 'players', label: 'Players', icon: <IoPeople size={18} /> },
          { id: 'matches', label: 'Matches', icon: <IoFootball size={18} /> },
          { id: 'overlay', label: 'Overlay & Branding', icon: <IoColorPalette size={18} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            className={`fb-admin__tab ${activeTab === t.id ? 'fb-admin__tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {feedback && (
          <motion.div className="fb-admin__toast" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="fb-admin__body">
        {!ready && <div className="fb-admin__loading">Connecting…</div>}
        {ready && activeTab === 'teams' && <TeamsTab teams={teams} onFlash={flash} />}
        {ready && activeTab === 'players' && <PlayersTab teams={teams} players={players} onFlash={flash} />}
        {ready && activeTab === 'matches' && (
          <MatchesTab teams={teams} matches={matches} baseUrl={baseUrl} onFlash={flash} onChanged={refreshMatches} />
        )}
        {ready && activeTab === 'overlay' && (
          <OverlayTab config={overlayConfig} onSave={async (c) => { await footballService.saveOverlayConfig(c); flash('Overlay saved'); }} onFlash={flash} />
        )}
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TEAMS TAB
// ════════════════════════════════════════════════════════════════════════════

function TeamsTab({ teams, onFlash }: { teams: FootballTeam[]; onFlash: (m: string) => void }) {
  const [editing, setEditing] = useState<FootballTeam | null>(null);

  const blank = (): FootballTeam => ({
    id: uid('team'), name: '', shortName: '', primaryColor: '#e11d1d', secondaryColor: '#0a0a0a',
    formation: '4-3-3', createdAt: Date.now(), updatedAt: Date.now(),
  });

  return (
    <div className="fb-section">
      <div className="fb-section__head">
        <h2>Team Management</h2>
        <button className="fb-btn fb-btn--primary" onClick={() => setEditing(blank())}>
          <IoAdd size={18} /> New Team
        </button>
      </div>

      <div className="fb-grid">
        {teams.map((t) => (
          <div key={t.id} className="fb-card">
            <div className="fb-card__logo" style={{ background: t.primaryColor }}>
              {t.logoUrl ? <img src={t.logoUrl} alt={t.name} /> : <IoShirt size={30} />}
            </div>
            <div className="fb-card__body">
              <div className="fb-card__title">{t.name || 'Unnamed'}</div>
              <div className="fb-card__sub">{t.shortName} · {t.formation}</div>
            </div>
            <div className="fb-card__actions">
              <button className="fb-icon-btn" onClick={() => setEditing(t)} title="Edit"><IoPencil size={16} /></button>
              <button className="fb-icon-btn fb-icon-btn--danger" title="Delete"
                onClick={async () => { if (confirm(`Delete ${t.name} and its players?`)) { await footballService.deleteTeam(t.id); onFlash('Team deleted'); } }}>
                <IoTrash size={16} />
              </button>
            </div>
          </div>
        ))}
        {teams.length === 0 && <div className="fb-empty">No teams yet. Create your first team.</div>}
      </div>

      <AnimatePresence>
        {editing && <TeamEditor team={editing} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); onFlash(msg); }} />}
      </AnimatePresence>
    </div>
  );
}

function TeamEditor({ team, onClose, onSaved }: { team: FootballTeam; onClose: () => void; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState<FootballTeam>(team);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadFileToStorage(file, `media/football/teams/${draft.id}/logo_${Date.now()}`);
      setDraft((d) => ({ ...d, logoUrl: url }));
    } catch (err) {
      console.error('[FootballAdmin] logo upload failed:', err);
      setUploadError('Logo upload failed. Please try again.');
    }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    await footballService.saveTeam({
      ...draft,
      shortName: (draft.shortName || draft.name.slice(0, 3)).toUpperCase(),
      updatedAt: Date.now(),
    });
    setSaving(false);
    onSaved('Team saved');
  };

  return (
    <motion.div className="fb-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="fb-modal__card" initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="fb-modal__head">
          <h3>{team.name ? 'Edit Team' : 'New Team'}</h3>
          <button className="fb-icon-btn" onClick={onClose}><IoClose size={20} /></button>
        </div>

        <div className="fb-modal__body">
          <div className="fb-logo-upload">
            <div className="fb-logo-preview" style={{ background: draft.primaryColor }}>
              {draft.logoUrl ? <img src={draft.logoUrl} alt="logo" /> : <IoImage size={34} />}
            </div>
            <label className="fb-btn fb-btn--ghost">
              {uploading ? 'Uploading…' : 'Upload Logo'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
          {uploadError && <div className="fb-upload-error">{uploadError}</div>}

          <label className="fb-field">
            <span>Team Name</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Team Blue" />
          </label>
          <div className="fb-field-row">
            <label className="fb-field">
              <span>Short Code</span>
              <input value={draft.shortName} maxLength={4} onChange={(e) => setDraft({ ...draft, shortName: e.target.value.toUpperCase() })} placeholder="BLU" />
            </label>
            <label className="fb-field">
              <span>Formation</span>
              <select value={draft.formation} onChange={(e) => setDraft({ ...draft, formation: e.target.value as FootballFormation })}>
                {FOOTBALL_FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <div className="fb-field-row">
            <label className="fb-field">
              <span>Primary Color</span>
              <input type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })} />
            </label>
            <label className="fb-field">
              <span>Secondary Color</span>
              <input type="color" value={draft.secondaryColor} onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })} />
            </label>
          </div>
          <label className="fb-field">
            <span>Coach (optional)</span>
            <input value={draft.coach ?? ''} onChange={(e) => setDraft({ ...draft, coach: e.target.value })} placeholder="Head coach" />
          </label>
        </div>

        <div className="fb-modal__foot">
          <button className="fb-btn fb-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="fb-btn fb-btn--primary" onClick={save} disabled={saving || !draft.name.trim()}>
            <IoSave size={16} /> {saving ? 'Saving…' : 'Save Team'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PLAYERS TAB
// ════════════════════════════════════════════════════════════════════════════

function PlayersTab({ teams, players, onFlash }: { teams: FootballTeam[]; players: FootballPlayer[]; onFlash: (m: string) => void }) {
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [editing, setEditing] = useState<FootballPlayer | null>(null);

  const filtered = teamFilter === 'all' ? players : players.filter((p) => p.teamId === teamFilter);
  const sorted = [...filtered].sort((a, b) => {
    const pa = FOOTBALL_POSITIONS.find((x) => x.value === a.position)?.order ?? 9;
    const pb = FOOTBALL_POSITIONS.find((x) => x.value === b.position)?.order ?? 9;
    return pa - pb || (a.number ?? 99) - (b.number ?? 99);
  });

  const blank = (): FootballPlayer => ({
    id: uid('ply'), teamId: teams[0]?.id ?? '', name: '', position: 'FWD',
    isStarter: true, goals: 0, assists: 0, appearances: 0, createdAt: Date.now(), updatedAt: Date.now(),
  });

  return (
    <div className="fb-section">
      <div className="fb-section__head">
        <h2>Player Management</h2>
        <div className="fb-section__head-controls">
          <select className="fb-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All Teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="fb-btn fb-btn--primary" disabled={teams.length === 0} onClick={() => setEditing(blank())}>
            <IoAdd size={18} /> New Player
          </button>
        </div>
      </div>

      {teams.length === 0 && <div className="fb-empty">Create a team first, then add players.</div>}

      <div className="fb-player-grid">
        {sorted.map((p) => {
          const team = teams.find((t) => t.id === p.teamId);
          return (
            <div key={p.id} className="fb-player-card">
              <div className="fb-player-card__photo">
                {p.photoUrl ? <img src={p.photoUrl} alt={p.name} /> : <IoPeople size={26} />}
                <span className="fb-player-card__pos" data-pos={p.position}>{p.position}</span>
              </div>
              <div className="fb-player-card__info">
                <div className="fb-player-card__name">
                  {p.number != null && <span className="fb-player-card__num">{p.number}</span>}
                  {p.name}{p.isCaptain && <span className="fb-player-card__cap">C</span>}
                </div>
                <div className="fb-player-card__team">{team?.name ?? '—'}</div>
                <div className="fb-player-card__stats">
                  <span>⚽ {p.goals ?? 0}</span><span>🅰 {p.assists ?? 0}</span>
                  {p.rating != null && <span>★ {p.rating.toFixed(1)}</span>}
                </div>
              </div>
              <div className="fb-player-card__actions">
                <button className="fb-icon-btn" onClick={() => setEditing(p)}><IoPencil size={15} /></button>
                <button className="fb-icon-btn fb-icon-btn--danger"
                  onClick={async () => { if (confirm(`Delete ${p.name}?`)) { await footballService.deletePlayer(p.id); onFlash('Player deleted'); } }}>
                  <IoTrash size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && <PlayerEditor player={editing} teams={teams} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); onFlash(m); }} />}
      </AnimatePresence>
    </div>
  );
}

function PlayerEditor({ player, teams, onClose, onSaved }: { player: FootballPlayer; teams: FootballTeam[]; onClose: () => void; onSaved: (m: string) => void }) {
  const [draft, setDraft] = useState<FootballPlayer>(player);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadFileToStorage(file, `media/football/players/${draft.id}/photo_${Date.now()}`);
      setDraft((d) => ({ ...d, photoUrl: url }));
    } catch (err) {
      console.error('[FootballAdmin] photo upload failed:', err);
      setUploadError('Photo upload failed. Please try again.');
    }
    finally { setUploading(false); }
  };

  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));

  const save = async () => {
    if (!draft.name.trim() || !draft.teamId) return;
    setSaving(true);
    await footballService.savePlayer({ ...draft, updatedAt: Date.now() });
    setSaving(false);
    onSaved('Player saved');
  };

  return (
    <motion.div className="fb-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="fb-modal__card fb-modal__card--wide" initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="fb-modal__head">
          <h3>{player.name ? 'Edit Player' : 'New Player'}</h3>
          <button className="fb-icon-btn" onClick={onClose}><IoClose size={20} /></button>
        </div>

        <div className="fb-modal__body">
          <div className="fb-logo-upload">
            <div className="fb-photo-preview">
              {draft.photoUrl ? <img src={draft.photoUrl} alt="player" /> : <IoPeople size={34} />}
            </div>
            <label className="fb-btn fb-btn--ghost">
              {uploading ? 'Uploading…' : 'Upload Photo'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
          {uploadError && <div className="fb-upload-error">{uploadError}</div>}

          <div className="fb-field-row">
            <label className="fb-field fb-field--grow">
              <span>Full Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Player A" />
            </label>
            <label className="fb-field">
              <span>Number</span>
              <input type="number" value={draft.number ?? ''} onChange={(e) => setDraft({ ...draft, number: num(e.target.value) })} placeholder="10" />
            </label>
          </div>

          <div className="fb-field-row">
            <label className="fb-field">
              <span>Team</span>
              <select value={draft.teamId} onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="fb-field">
              <span>Position</span>
              <select value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value as FootballPosition })}>
                {FOOTBALL_POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
          </div>

          <div className="fb-field-row">
            <label className="fb-field"><span>Goals</span>
              <input type="number" value={draft.goals ?? 0} onChange={(e) => setDraft({ ...draft, goals: num(e.target.value) ?? 0 })} /></label>
            <label className="fb-field"><span>Assists</span>
              <input type="number" value={draft.assists ?? 0} onChange={(e) => setDraft({ ...draft, assists: num(e.target.value) ?? 0 })} /></label>
            <label className="fb-field"><span>Apps</span>
              <input type="number" value={draft.appearances ?? 0} onChange={(e) => setDraft({ ...draft, appearances: num(e.target.value) ?? 0 })} /></label>
          </div>

          <div className="fb-field-row">
            <label className="fb-field"><span>Rating (0-10)</span>
              <input type="number" step="0.1" value={draft.rating ?? ''} onChange={(e) => setDraft({ ...draft, rating: num(e.target.value) })} placeholder="7.5" /></label>
            <label className="fb-field"><span>Ranking #</span>
              <input type="number" value={draft.ranking ?? ''} onChange={(e) => setDraft({ ...draft, ranking: num(e.target.value) })} placeholder="1" /></label>
            <label className="fb-field"><span>Nationality</span>
              <input value={draft.nationality ?? ''} onChange={(e) => setDraft({ ...draft, nationality: e.target.value })} placeholder="ARG" /></label>
          </div>

          <div className="fb-toggle-row">
            <button className={`fb-toggle ${draft.isStarter ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, isStarter: !draft.isStarter })}>
              {draft.isStarter ? 'Starting XI' : 'Bench'}
            </button>
            <button className={`fb-toggle ${draft.isCaptain ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, isCaptain: !draft.isCaptain })}>
              {draft.isCaptain ? 'Captain ✓' : 'Captain'}
            </button>
          </div>
        </div>

        <div className="fb-modal__foot">
          <button className="fb-btn fb-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="fb-btn fb-btn--primary" onClick={save} disabled={saving || !draft.name.trim()}>
            <IoSave size={16} /> {saving ? 'Saving…' : 'Save Player'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MATCHES TAB
// ════════════════════════════════════════════════════════════════════════════

function MatchesTab({ teams, matches, baseUrl, onFlash, onChanged }: {
  teams: FootballTeam[]; matches: FootballMatchSetup[]; baseUrl: string;
  onFlash: (m: string) => void; onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [venue, setVenue] = useState('');
  const [competition, setCompetition] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const toRef = (t: FootballTeam): FootballTeamRef => ({ id: t.id, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, primaryColor: t.primaryColor });

  const create = async () => {
    const home = teams.find((t) => t.id === homeId);
    const away = teams.find((t) => t.id === awayId);
    if (!home || !away || home.id === away.id) { onFlash('Pick two different teams'); return; }
    const match: FootballMatchSetup = {
      id: uid('match'), teamA: toRef(home), teamB: toRef(away), venue, competition,
      date, halfDurationMin: 45, status: 'scheduled', createdAt: Date.now(), updatedAt: Date.now(),
    };
    await footballService.saveMatch(match);
    setCreating(false); setHomeId(''); setAwayId(''); setVenue(''); setCompetition('');
    onChanged(); onFlash('Match created');
  };

  return (
    <div className="fb-section">
      <div className="fb-section__head">
        <h2>Matches</h2>
        <button className="fb-btn fb-btn--primary" disabled={teams.length < 2} onClick={() => setCreating((v) => !v)}>
          <IoAdd size={18} /> New Match
        </button>
      </div>
      {teams.length < 2 && <div className="fb-empty">Add at least two teams to create a match.</div>}

      {creating && (
        <div className="fb-match-form">
          <div className="fb-field-row">
            <label className="fb-field"><span>Home Team</span>
              <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
                <option value="">Select…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
            <label className="fb-field"><span>Away Team</span>
              <select value={awayId} onChange={(e) => setAwayId(e.target.value)}>
                <option value="">Select…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
          </div>
          <div className="fb-field-row">
            <label className="fb-field fb-field--grow"><span>Venue</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Stadium" /></label>
            <label className="fb-field"><span>Competition</span>
              <input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="Final" /></label>
            <label className="fb-field"><span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <div className="fb-modal__foot">
            <button className="fb-btn fb-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="fb-btn fb-btn--primary" onClick={create}><IoSave size={16} /> Create</button>
          </div>
        </div>
      )}

      <div className="fb-match-list">
        {matches.map((m) => (
          <div key={m.id} className="fb-match-row">
            <div className="fb-match-row__teams">
              <span className="fb-match-row__team">{m.teamA.shortName}</span>
              <span className="fb-match-row__vs">vs</span>
              <span className="fb-match-row__team">{m.teamB.shortName}</span>
            </div>
            <div className="fb-match-row__meta">
              <span className={`fb-status fb-status--${m.status}`}>{m.status}</span>
              <span>{m.competition || 'Match'} · {m.date}</span>
            </div>
            <div className="fb-match-row__actions">
              <button className="fb-btn fb-btn--sm" onClick={() => window.open(`${baseUrl}/football/scorer/update?matchId=${m.id}`, '_blank')}>
                <IoPlay size={14} /> Score
              </button>
              <button className="fb-btn fb-btn--sm fb-btn--ghost" onClick={() => window.open(`${baseUrl}/football/scorer/obs-overlay?matchId=${m.id}`, '_blank')}>
                <IoDesktop size={14} /> Overlay
              </button>
              <button className="fb-btn fb-btn--sm fb-btn--ghost" onClick={() => window.open(`${baseUrl}/football/scorer/obs-dock?matchId=${m.id}`, '_blank')}>
                <IoStatsChart size={14} /> Dock
              </button>
              <button className="fb-icon-btn fb-icon-btn--danger"
                onClick={async () => { if (confirm('Delete match?')) { await footballService.deleteMatch(m.id); onChanged(); onFlash('Match deleted'); } }}>
                <IoTrash size={15} />
              </button>
            </div>
          </div>
        ))}
        {matches.length === 0 && !creating && <div className="fb-empty">No matches yet.</div>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OVERLAY / BRANDING TAB
// ════════════════════════════════════════════════════════════════════════════

function OverlayTab({ config, onSave, onFlash }: { config: FootballOverlayConfig; onSave: (c: FootballOverlayConfig) => void; onFlash: (m: string) => void }) {
  const [draft, setDraft] = useState<FootballOverlayConfig>(config);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  useEffect(() => setDraft(config), [config]);

  const uploadLogo = async (file: File, key: 'tournamentLogo' | 'broadcastPartnerLogo') => {
    setUploadingKey(key);
    try {
      const url = await uploadFileToStorage(file, `media/football/overlay/${key}_${Date.now()}`);
      setDraft((d) => ({ ...d, [key]: url }));
    } catch (err) {
      console.error('[FootballAdmin] overlay logo upload failed:', err);
      onFlash('Upload failed');
    }
    finally { setUploadingKey(null); }
  };

  return (
    <div className="fb-section">
      <div className="fb-section__head">
        <h2>Overlay &amp; Branding</h2>
        <button className="fb-btn fb-btn--primary" onClick={() => onSave(draft)}><IoSave size={16} /> Save</button>
      </div>

      <div className="fb-overlay-grid">
        <div className="fb-panel">
          <h3>Broadcast Logos</h3>
          <div className="fb-logo-row">
            <div className="fb-logo-slot">
              <div className="fb-logo-slot__preview">{draft.tournamentLogo ? <img src={draft.tournamentLogo} alt="" /> : <IoImage size={28} />}</div>
              <label className="fb-btn fb-btn--ghost fb-btn--sm">
                {uploadingKey === 'tournamentLogo' ? 'Uploading…' : 'Tournament Logo'}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], 'tournamentLogo')} />
              </label>
            </div>
            <div className="fb-logo-slot">
              <div className="fb-logo-slot__preview">{draft.broadcastPartnerLogo ? <img src={draft.broadcastPartnerLogo} alt="" /> : <IoImage size={28} />}</div>
              <label className="fb-btn fb-btn--ghost fb-btn--sm">
                {uploadingKey === 'broadcastPartnerLogo' ? 'Uploading…' : 'Partner Logo'}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], 'broadcastPartnerLogo')} />
              </label>
            </div>
          </div>
          <label className="fb-field"><span>Tournament Name</span>
            <input value={draft.tournamentName ?? ''} onChange={(e) => setDraft({ ...draft, tournamentName: e.target.value })} placeholder="e.g. Champions Cup 2026" /></label>
        </div>

        <div className="fb-panel">
          <h3>Theme Colors</h3>
          <p className="fb-panel__hint">Broadcast palette (default red / yellow / black).</p>
          <div className="fb-color-grid">
            <label className="fb-field"><span>Primary (base)</span>
              <input type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })} /></label>
            <label className="fb-field"><span>Secondary (accent)</span>
              <input type="color" value={draft.secondaryColor} onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })} /></label>
            <label className="fb-field"><span>Highlight (timer)</span>
              <input type="color" value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} /></label>
            <label className="fb-field"><span>Text</span>
              <input type="color" value={draft.textColor} onChange={(e) => setDraft({ ...draft, textColor: e.target.value })} /></label>
          </div>
          <button className="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => setDraft({ ...draft, primaryColor: '#0a0a0a', secondaryColor: '#e11d1d', accentColor: '#facc15', textColor: '#ffffff' })}>
            Reset to Red / Yellow / Black
          </button>
        </div>

        <div className="fb-panel">
          <h3>Scoreboard Options</h3>
          <label className="fb-field"><span>Position</span>
            <select value={draft.scoreboardPosition} onChange={(e) => setDraft({ ...draft, scoreboardPosition: e.target.value as FootballOverlayConfig['scoreboardPosition'] })}>
              <option value="top-left">Top Left</option><option value="top-center">Top Center</option><option value="top-right">Top Right</option>
            </select></label>
          <div className="fb-toggle-row">
            <button className={`fb-toggle ${draft.showLiveBadge ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, showLiveBadge: !draft.showLiveBadge })}>LIVE Badge</button>
            <button className={`fb-toggle ${draft.showTimer ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, showTimer: !draft.showTimer })}>Match Timer</button>
          </div>
          <div className="fb-toggle-row">
            <button className={`fb-toggle ${draft.enableGoalAnimation ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, enableGoalAnimation: !draft.enableGoalAnimation })}>Goal Animation</button>
            <button className={`fb-toggle ${draft.enableCardAnimation ? 'fb-toggle--on' : ''}`} onClick={() => setDraft({ ...draft, enableCardAnimation: !draft.enableCardAnimation })}>Card Animation</button>
          </div>
        </div>

        <div className="fb-panel">
          <h3>Stats Sheet (optional)</h3>
          <p className="fb-panel__hint">Google Sheet CSV URL for ranking / top-scorer import.</p>
          <label className="fb-field"><span>Sheet CSV URL</span>
            <input value={draft.statsSheetUrl ?? ''} onChange={(e) => setDraft({ ...draft, statsSheetUrl: e.target.value })} placeholder="https://docs.google.com/…/pub?output=csv" /></label>
        </div>
      </div>
    </div>
  );
}
