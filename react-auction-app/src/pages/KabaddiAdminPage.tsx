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
  IoDesktop, IoFlash, IoPlay, IoPencil, IoTrophy, IoVideocam, IoStatsChart, IoRefresh,
} from 'react-icons/io5';
import { realtimeSync } from '../services/realtimeSync';
import { kabaddiService } from '../services/kabaddi';
import { auctionPersistence } from '../services/auctionPersistence';
import type { SoldPlayerRecord } from '../services/auctionPersistence';
import { uploadFileToStorage } from '../services';
import { getKabaddiRoleCategory } from '../utils/kabaddiRoles';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { withScorerAdminChrome } from './withScorerAdminChrome';
import { ResolvedImage } from '../components/ResolvedImage';
import {
  KABADDI_POSITIONS, KABADDI_DEFENDER_ROLES, DEFAULT_KABADDI_OVERLAY_CONFIG,
  DEFAULT_KABADDI_RULES, createEmptyKabaddiLiveState,
} from '../types/kabaddi';
import type {
  KabaddiTeam, KabaddiPlayer, KabaddiMatchSetup, KabaddiOverlayConfig,
  KabaddiPosition, KabaddiDefenderRole, KabaddiRulesConfig, KabaddiAnimationConfig,
} from '../types/kabaddi';
import type { Team } from '../types';
import './KabaddiAdminPage.css';

type Tab = 'teams' | 'players' | 'matches' | 'overlay';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Remembers up to 20 previously typed values per field in localStorage. */
function useFieldHistory(storageKey: string): [string[], (value: string) => void] {
  const key = `kbaFieldHistory:${storageKey}`;
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(key) ?? '[]'); } catch { return []; }
  });
  const remember = useCallback((value: string) => {
    const v = value.trim();
    if (!v) return;
    setHistory(prev => {
      if (prev[0] === v) return prev;
      const next = [v, ...prev.filter(x => x !== v)].slice(0, 20);
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [key]);
  return [history, remember];
}

/** Text input backed by a datalist of previously typed values — no re-typing the same venue, coach, URL, etc. */
function HistoryField({ storageKey, value, onChange, placeholder }: Readonly<{
  storageKey: string; value: string; onChange: (v: string) => void; placeholder?: string;
}>) {
  const [history, remember] = useFieldHistory(storageKey);
  const listId = `kba-dl-${storageKey}`;
  return (
    <>
      <input
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={e => remember(e.target.value)}
      />
      <datalist id={listId}>
        {history.map(h => <option key={h} value={h} />)}
      </datalist>
    </>
  );
}

const ANIMATION_FIELDS = [
  { key: 'superRaidAnimation', flag: 'enableSuperRaidAnimation', label: 'Super Raid', hint: '3+ points in one raid' },
  { key: 'superTackleAnimation', flag: 'enableSuperTackleAnimation', label: 'Super Tackle', hint: 'Tackle with a thin defence' },
  { key: 'allOutAnimation', flag: 'enableAllOutAnimation', label: 'All Out', hint: 'Whole side out — 2 bonus points' },
  { key: 'bonusAnimation', flag: 'enableBonusAnimation', label: 'Bonus Point', hint: 'Raider crosses the bonus line' },
  { key: 'doOrDieAnimation', flag: 'enableDoOrDieAnimation', label: 'Do or Die', hint: 'Third consecutive empty raid' },
] as const;

function KabaddiAdminPageContent() {
  const navigate = useNavigate();
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('matches');
  const [teams, setTeams] = useState<KabaddiTeam[]>([]);
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [matches, setMatches] = useState<KabaddiMatchSetup[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const singleOverlayMode = !!overlayConfig.singleOverlayMode;

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
        auctionPersistence.initialize(db);
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
      kabaddiService.subscribeActiveMatch(setActiveMatchId),
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

  // ── Auction teams (source of truth from /{tenantSlug}/admin) ──
  const [auctionTeams, setAuctionTeams] = useState<Team[]>([]);

  const reloadAuctionTeams = useCallback(async () => {
    if (!ready) return;
    try { setAuctionTeams((await auctionPersistence.getTeams()) ?? []); } catch { /* ignore */ }
  }, [ready]);

  useEffect(() => { void reloadAuctionTeams(); }, [reloadAuctionTeams]);

  const importableAuctionTeams = useMemo(
    () => auctionTeams.filter(at => !teams.some(kt => kt.sourceTeamId === at.id
      || kt.name.trim().toLowerCase() === at.name.trim().toLowerCase())),
    [auctionTeams, teams],
  );

  const importAuctionTeam = async (at: Team) => {
    setBusy(true);
    try {
      await kabaddiService.saveTeam({
        id: makeId('kteam'),
        name: at.name,
        shortName: at.name.slice(0, 3).toUpperCase(),
        primaryColor: at.primaryColor || '#7c3aed',
        secondaryColor: at.secondaryColor,
        logoUrl: at.brandLogoUrl || at.logoUrl || undefined,
        coach: at.ownerCompany || undefined,
        sourceTeamId: at.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      flash(`Imported ${at.name} from Auction Admin`);
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  // ── Sold players (source of truth from /{tenantSlug}/admin) ──
  const [soldPlayers, setSoldPlayers] = useState<SoldPlayerRecord[]>([]);

  const reloadSoldPlayers = useCallback(async () => {
    if (!ready) return;
    try { setSoldPlayers(await auctionPersistence.getSoldPlayers()); } catch { /* ignore */ }
  }, [ready]);

  useEffect(() => { void reloadSoldPlayers(); }, [reloadSoldPlayers]);

  const kabaddiPositionFor = (role: string): { position: KabaddiPosition; defenderRole?: KabaddiDefenderRole } => {
    const category = getKabaddiRoleCategory(role);
    if (category === 'Raider') return { position: 'RAIDER' };
    if (category === 'Defender') return { position: 'DEFENDER', defenderRole: 'left_corner' };
    return { position: 'ALL_ROUNDER' };
  };

  // Auction records don't always carry teamId, so fall back to the team name.
  const teamForSoldPlayer = useCallback((sp: SoldPlayerRecord): KabaddiTeam | undefined => teams.find(t =>
    (!!sp.teamId && !!t.sourceTeamId && t.sourceTeamId === sp.teamId)
    || (!!sp.teamName && t.name.trim().toLowerCase() === sp.teamName.trim().toLowerCase())
  ), [teams]);

  const importablePlayers = useMemo(() => soldPlayers.filter(sp => {
    const mappedTeam = teamForSoldPlayer(sp);
    if (!mappedTeam) return false;
    return !players.some(p => (!!p.sourcePlayerId && p.sourcePlayerId === sp.id)
      || (p.teamId === mappedTeam.id && p.name.trim().toLowerCase() === sp.playerName.trim().toLowerCase()));
  }), [soldPlayers, teamForSoldPlayer, players]);

  /** Sold players whose auction team has no kabaddi team yet — import the team first. */
  const unmappedSoldTeams = useMemo(() => {
    const names = new Set<string>();
    for (const sp of soldPlayers) if (!teamForSoldPlayer(sp) && sp.teamName) names.add(sp.teamName);
    return [...names];
  }, [soldPlayers, teamForSoldPlayer]);

  const importSoldPlayer = async (sp: SoldPlayerRecord) => {
    const mappedTeam = teamForSoldPlayer(sp);
    if (!mappedTeam) return;
    const { position, defenderRole } = kabaddiPositionFor(sp.role);
    setBusy(true);
    try {
      await kabaddiService.savePlayer({
        id: makeId('kplayer'),
        teamId: mappedTeam.id,
        name: sp.playerName,
        position,
        defenderRole,
        photoUrl: sp.imageUrl || undefined,
        age: sp.age ?? undefined,
        isStarter: true,
        sourcePlayerId: sp.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) { flash(`Failed: ${String(e)}`); }
  };

  const importAllPlayers = async () => {
    setBusy(true);
    try {
      for (const sp of importablePlayers) await importSoldPlayer(sp);
      flash(`Imported ${importablePlayers.length} player(s) from Auction Admin`);
    } finally { setBusy(false); }
  };

  // ── Teams ──
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', primaryColor: '#7c3aed', logoUrl: '', animationUrl: '', coach: '' });
  const [editTeamId, setEditTeamId] = useState<string | null>(null);

  const resetTeam = () => { setTeamForm({ name: '', shortName: '', primaryColor: '#7c3aed', logoUrl: '', animationUrl: '', coach: '' }); setEditTeamId(null); };

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
        animationUrl: teamForm.animationUrl.trim() || undefined,
        coach: teamForm.coach.trim() || undefined,
        sourceTeamId: existing?.sourceTeamId,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      flash(existing ? 'Team updated' : 'Team created');
      resetTeam();
    } catch (e) { flash(`Failed: ${String(e)}`); } finally { setBusy(false); }
  };

  const uploadTeamAnimation = async (file: File) => {
    try {
      const url = await uploadFileToStorage(file, `media/kabaddi/teams/anim-${Date.now()}`);
      setTeamForm(f => ({ ...f, animationUrl: url }));
      flash('Animation uploaded');
    } catch { flash('Upload failed'); }
  };

  const uploadTeamLogo = async (file: File) => {
    try {
      const url = await uploadFileToStorage(file, `media/kabaddi/teams/logo-${Date.now()}`);
      setTeamForm(f => ({ ...f, logoUrl: url }));
      flash('Logo uploaded');
    } catch { flash('Upload failed'); }
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
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [matchForm, setMatchForm] = useState({
    teamAId: '', teamBId: '', venue: '', competition: '',
    date: toLocalInput(new Date()), halfDurationMin: DEFAULT_KABADDI_RULES.halfDurationMin,
    tossWonBy: '', tossElected: 'raid' as 'raid' | 'defend',
    status: 'scheduled' as KabaddiMatchSetup['status'],
  });

  const resetMatchForm = () => {
    setMatchForm({
      teamAId: '', teamBId: '', venue: '', competition: '',
      date: toLocalInput(new Date()), halfDurationMin: DEFAULT_KABADDI_RULES.halfDurationMin,
      tossWonBy: '', tossElected: 'raid',
      status: 'scheduled',
    });
    setEditingMatchId(null);
    setShowMatchForm(false);
  };

  const editMatch = (m: KabaddiMatchSetup) => {
    setMatchForm({
      teamAId: m.teamA.id,
      teamBId: m.teamB.id,
      venue: m.venue || '',
      competition: m.competition || '',
      date: m.date ? toLocalInput(new Date(m.date)) : toLocalInput(new Date()),
      halfDurationMin: m.halfDurationMin || DEFAULT_KABADDI_RULES.halfDurationMin,
      tossWonBy: m.tossWonBy || '',
      tossElected: m.tossElected || 'raid',
      status: m.status || 'scheduled',
    });
    setEditingMatchId(m.id);
    setShowMatchForm(true);
    setTab('matches');
  };

  const saveMatchChanges = async () => {
    if (!editingMatchId) return;
    const a = teams.find(t => t.id === matchForm.teamAId);
    const b = teams.find(t => t.id === matchForm.teamBId);
    if (!a || !b || a.id === b.id) { flash('Pick two different teams'); return; }
    setBusy(true);
    try {
      const existing = matches.find(m => m.id === editingMatchId);
      const setup: KabaddiMatchSetup = {
        id: editingMatchId,
        teamA: {
          id: a.id,
          name: a.name,
          shortName: a.shortName,
          logoUrl: a.logoUrl || existing?.teamA.logoUrl,
          animationUrl: a.animationUrl || existing?.teamA.animationUrl,
          primaryColor: a.primaryColor || existing?.teamA.primaryColor,
        },
        teamB: {
          id: b.id,
          name: b.name,
          shortName: b.shortName,
          logoUrl: b.logoUrl || existing?.teamB.logoUrl,
          animationUrl: b.animationUrl || existing?.teamB.animationUrl,
          primaryColor: b.primaryColor || existing?.teamB.primaryColor,
        },
        venue: matchForm.venue.trim() || 'Indoor Court',
        date: new Date(matchForm.date).toISOString(),
        competition: matchForm.competition.trim() || undefined,
        halfDurationMin: matchForm.halfDurationMin,
        status: matchForm.status || existing?.status || 'scheduled',
        tossWonBy: matchForm.tossWonBy || undefined,
        tossElected: matchForm.tossWonBy ? matchForm.tossElected : undefined,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await kabaddiService.saveMatch(setup);

      // Also update live match state if present
      const existingLive = await kabaddiService.getLive(editingMatchId, rules.playersPerSide).catch(() => null);
      if (existingLive) {
        await kabaddiService.saveLive({
          ...existingLive,
          teamAId: a.id,
          teamBId: b.id,
          lastUpdated: Date.now(),
        });
      }

      if (matchForm.status === 'live' && singleOverlayMode) {
        await kabaddiService.setActiveMatch(editingMatchId);
      }

      await reloadMatches();
      flash('Match updated successfully');
      resetMatchForm();
    } catch (e) {
      flash(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const createMatch = async (startNow: boolean) => {
    const a = teams.find(t => t.id === matchForm.teamAId);
    const b = teams.find(t => t.id === matchForm.teamBId);
    if (!a || !b || a.id === b.id) { flash('Pick two different teams'); return; }
    setBusy(true);
    try {
      const id = makeId('kmatch');
      const setup: KabaddiMatchSetup = {
        id,
        teamA: { id: a.id, name: a.name, shortName: a.shortName, logoUrl: a.logoUrl, animationUrl: a.animationUrl, primaryColor: a.primaryColor },
        teamB: { id: b.id, name: b.name, shortName: b.shortName, logoUrl: b.logoUrl, animationUrl: b.animationUrl, primaryColor: b.primaryColor },
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
      // Crucially this must include onCourtIds/startingIds — without them the
      // scorer can never tell who's actually on the mat, so tackled/touched
      // players would keep reappearing in the raider/defender pickers.
      const firstRaider = matchForm.tossWonBy
        ? (matchForm.tossElected === 'raid' ? matchForm.tossWonBy : (matchForm.tossWonBy === a.id ? b.id : a.id))
        : a.id;
      const startersFirst = (p: KabaddiPlayer, q: KabaddiPlayer) => Number(q.isStarter !== false) - Number(p.isStarter !== false);
      const lineupFor = (teamId: string) => players
        .filter(p => p.teamId === teamId)
        .sort(startersFirst)
        .slice(0, rules.playersPerSide)
        .map(p => p.id);
      const teamAIds = lineupFor(a.id);
      const teamBIds = lineupFor(b.id);
      const seeded = createEmptyKabaddiLiveState(id, a.id, b.id, rules.playersPerSide);
      await kabaddiService.saveLive({
        ...seeded,
        teamA: { ...seeded.teamA, onCourtIds: teamAIds, startingIds: teamAIds },
        teamB: { ...seeded.teamB, onCourtIds: teamBIds, startingIds: teamBIds },
        raidingTeamId: firstRaider,
      });

      if (startNow) {
        await kabaddiService.setActiveMatch(id);
      }

      await reloadMatches();
      flash(startNow ? 'Match created and live' : 'Match created');
      resetMatchForm();
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

  const uploadAnimMedia = async (key: typeof ANIMATION_FIELDS[number]['key'], file: File) => {
    try {
      const url = await uploadFileToStorage(file, `media/kabaddi/animations/${key}-${Date.now()}`);
      setAnim(key, { mediaUrl: url });
      flash('Upload successful');
    } catch { flash('Upload failed'); }
  };

  if (!ready) {
    return <div className="kba kba--loading"><div className="kba__spinner" /><p>Connecting…</p></div>;
  }

  return (
    <div className="kba">
      <div className="kba__counts kba__counts--bar">
        <span><IoPeople size={14} /> {teams.length} teams</span>
        <span><IoShirt size={14} /> {players.length} players</span>
        <span><IoTrophy size={14} /> {matches.length} matches</span>
      </div>

      <nav className="kba__tabs">
        <button className={tab === 'matches' ? 'is-active' : ''} onClick={() => setTab('matches')}>Matches</button>
        <button className={tab === 'teams' ? 'is-active' : ''} onClick={() => setTab('teams')}>Teams</button>
        <button className={tab === 'players' ? 'is-active' : ''} onClick={() => setTab('players')}>Players</button>
        <button className={tab === 'overlay' ? 'is-active' : ''} onClick={() => setTab('overlay')}>Overlay &amp; Animations</button>
      </nav>

      {toast && <div className="kba__toast">{toast}</div>}

      {/* ── Teams ── */}
      {tab === 'teams' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2>Import from Auction Admin</h2>
            <p className="kba__hint">
              Teams are managed once in <code>/{tenantSlug}/admin</code> and reused here — no need to re-enter names,
              logos or colours for kabaddi.
            </p>
            {importableAuctionTeams.length === 0 ? (
              <p className="kba__empty">
                {auctionTeams.length === 0
                  ? 'No teams found in the Auction Admin yet.'
                  : 'All auction teams are already imported.'}
              </p>
            ) : (
              <div className="kba__list">
                {importableAuctionTeams.map(at => (
                  <div key={at.id} className="kba__row" style={{ borderLeftColor: at.primaryColor }}>
                    <div className="kba__row-id">
                      {(at.brandLogoUrl || at.logoUrl)
                          ? <ResolvedImage src={at.brandLogoUrl || at.logoUrl} alt={at.name} size={96} />
                        : <span className="kba__badge" style={{ background: at.primaryColor }}>{at.name.slice(0, 3).toUpperCase()}</span>}
                      <div><strong>{at.name}</strong></div>
                    </div>
                    <div className="kba__row-actions">
                      <button onClick={() => importAuctionTeam(at)} disabled={busy}><IoAdd size={15} /> Import</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="kba__actions">
              <button className="kba__btn" onClick={reloadAuctionTeams}><IoSettings size={16} /> Refresh from Auction Admin</button>
            </div>
          </div>

          <div className="kba__card">
            <h2>{editTeamId ? 'Edit team' : 'Add team'}</h2>
            <div className="kba__grid">
              <label><span>Name *</span><HistoryField storageKey="team-name" value={teamForm.name} onChange={v => setTeamForm(f => ({ ...f, name: v }))} placeholder="Chennai Chargers" /></label>
              <label><span>Short code</span><HistoryField storageKey="team-shortcode" value={teamForm.shortName} onChange={v => setTeamForm(f => ({ ...f, shortName: v.slice(0, 4) }))} placeholder="CHE" /></label>
              <label>
                <span>Logo URL</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><HistoryField storageKey="team-logo-url" value={teamForm.logoUrl} onChange={v => setTeamForm(f => ({ ...f, logoUrl: v }))} placeholder="https://…" /></div>
                  <label className="kba__btn" style={{ cursor: 'pointer', margin: 0 }}>
                    Upload
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) void uploadTeamLogo(e.target.files[0]); }} />
                  </label>
                  {teamForm.logoUrl && <ResolvedImage src={teamForm.logoUrl} size={96} style={{ width: 34, height: 34, objectFit: 'contain' }} />}
                </div>
              </label>
              <label>
                <span>Overlay animation (looping GIF/PNG)</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input value={teamForm.animationUrl} onChange={e => setTeamForm(f => ({ ...f, animationUrl: e.target.value }))} placeholder="https://… transparent .gif" style={{ flex: 1 }} />
                  <label className="kba__btn" style={{ cursor: 'pointer', margin: 0 }}>
                    Upload
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) void uploadTeamAnimation(e.target.files[0]); }} />
                  </label>
                  {teamForm.animationUrl && <ResolvedImage src={teamForm.animationUrl} size={96} style={{ width: 34, height: 34, objectFit: 'contain' }} />}
                </div>
              </label>
              <label><span>Coach</span><HistoryField storageKey="team-coach" value={teamForm.coach} onChange={v => setTeamForm(f => ({ ...f, coach: v }))} /></label>
              <label><span>Colour</span><input type="color" value={teamForm.primaryColor} onChange={e => setTeamForm(f => ({ ...f, primaryColor: e.target.value }))} /></label>
            </div>
            <p className="kba__hint">Prefer the Upload button over pasting a link — uploaded logos are hosted on this project's storage and always render on the OBS overlay, while some external links (e.g. Google Drive) can be blocked by the browser source.</p>
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
                  {t.logoUrl ? <ResolvedImage src={t.logoUrl} alt={t.name} size={96} /> : <span className="kba__badge" style={{ background: t.primaryColor }}>{t.shortName}</span>}
                  <div>
                    <strong>{t.name}</strong>
                    <small>{players.filter(p => p.teamId === t.id).length} players{t.coach ? ` · ${t.coach}` : ''}</small>
                  </div>
                </div>
                <div className="kba__row-actions">
                  <button onClick={() => { setTeamForm({ name: t.name, shortName: t.shortName, primaryColor: t.primaryColor ?? '#7c3aed', logoUrl: t.logoUrl ?? '', animationUrl: t.animationUrl ?? '', coach: t.coach ?? '' }); setEditTeamId(t.id); }}><IoPencil size={15} /></button>
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
            <h2>Import from Auction Admin</h2>
            <p className="kba__hint">
              Players sold in <code>/{tenantSlug}/admin</code> are matched to their imported team and can be added to
              the kabaddi roster in one click. Role is guessed from the auction role (raider / defender / all-rounder)
              and can be edited afterwards.
            </p>
            {importablePlayers.length === 0 ? (
              <p className="kba__empty">
                {soldPlayers.length === 0 ? 'No sold players found in the Auction Admin yet.' : 'All eligible players are already imported.'}
              </p>
            ) : (
              <>
                <ul className="kba__players">
                  {importablePlayers.map(sp => (
                    <li key={sp.id}>
                      <span className="kba__pname">{sp.playerName}</span>
                      <small>{sp.teamName} · {sp.role}</small>
                      <button onClick={() => importSoldPlayer(sp)} disabled={busy}><IoAdd size={14} /></button>
                    </li>
                  ))}
                </ul>
                <div className="kba__actions">
                  <button className="kba__btn kba__btn--primary" onClick={importAllPlayers} disabled={busy}>
                    <IoAdd size={16} /> Import all {importablePlayers.length} players
                  </button>
                  <button className="kba__btn" onClick={reloadSoldPlayers}><IoSettings size={16} /> Refresh</button>
                </div>
              </>
            )}
            {unmappedSoldTeams.length > 0 && (
              <p className="kba__hint">
                Waiting on a kabaddi team for: <strong>{unmappedSoldTeams.join(', ')}</strong>. Import those teams on the
                Teams tab (or create one with the same name) and their players will appear here.
              </p>
            )}
          </div>

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
              Matches ({matches.length})
            </h2>
            <button
              className="kba__btn kba__btn--primary"
              onClick={() => {
                if (showMatchForm) {
                  resetMatchForm();
                } else {
                  resetMatchForm();
                  setShowMatchForm(true);
                }
              }}
            >
              {showMatchForm ? (editingMatchId ? '✕ Cancel Edit' : '✕ Cancel') : <><IoAdd size={16} /> Create Match</>}
            </button>
          </div>

          {singleOverlayMode && (
            <div className="kba__card" style={{ borderLeft: '4px solid #22c55e', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <strong style={{ color: '#22c55e', fontSize: '0.95rem' }}>🔗 Single Overlay Mode is ON</strong>
                  <p className="kba__hint" style={{ margin: '0.25rem 0 0' }}>
                    Universal links (Overlay, Dock, Scorer) automatically follow whichever match is active. Toggle this mode from Admin → Streaming tab or below in Overlay tab.
                  </p>
                  {activeMatchId ? (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                      Current active match:{' '}
                      <strong>
                        {matches.find(m => m.id === activeMatchId)?.teamA.name ?? 'Team A'} vs{' '}
                        {matches.find(m => m.id === activeMatchId)?.teamB.name ?? 'Team B'}
                      </strong>
                    </p>
                  ) : (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#f59e0b' }}>
                      No match is currently marked active. Click Play on a match below to make it active.
                    </p>
                  )}
                </div>
                {activeMatchId && (
                  <button
                    className="kba__btn"
                    style={{ background: '#ef4444', color: '#fff', fontSize: '0.8rem', padding: '6px 12px' }}
                    onClick={async () => {
                      await kabaddiService.setActiveMatch(null);
                      flash('Session ended — cleared active match');
                    }}
                  >
                    End Session (Clear Active Match)
                  </button>
                )}
              </div>
            </div>
          )}

          {showMatchForm && (
            <div className="kba__card" style={{ borderLeft: editingMatchId ? '4px solid #a855f7' : undefined }}>
              <h2><IoSettings size={15} /> {editingMatchId ? 'Edit Match' : 'Create Match'}</h2>
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
                <label><span>Venue</span><HistoryField storageKey="match-venue" value={matchForm.venue} onChange={v => setMatchForm(f => ({ ...f, venue: v }))} /></label>
                <label><span>Competition</span><HistoryField storageKey="match-competition" value={matchForm.competition} onChange={v => setMatchForm(f => ({ ...f, competition: v }))} placeholder="League / Final" /></label>
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
                {editingMatchId && (
                  <label>
                    <span>Status</span>
                    <select value={matchForm.status} onChange={e => setMatchForm(f => ({ ...f, status: e.target.value as KabaddiMatchSetup['status'] }))}>
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                      <option value="abandoned">Abandoned</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="kba__actions">
                {editingMatchId ? (
                  <>
                    <button className="kba__btn kba__btn--primary" onClick={saveMatchChanges} disabled={busy}>
                      <IoSave size={16} /> Save Changes
                    </button>
                    <button className="kba__btn" onClick={resetMatchForm} disabled={busy}>
                      <IoClose size={16} /> Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="kba__btn kba__btn--primary" onClick={() => createMatch(true)} disabled={busy}>
                      <IoPlay size={16} /> Create &amp; go live
                    </button>
                    <button className="kba__btn" onClick={() => createMatch(false)} disabled={busy}>
                      <IoAdd size={16} /> Create only
                    </button>
                    <button className="kba__btn" onClick={resetMatchForm} disabled={busy}>
                      <IoClose size={16} /> Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="kba__list">
            {matches.length === 0 && (
              <div className="kba__empty" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <p>No matches yet.</p>
                {!showMatchForm && (
                  <button className="kba__btn kba__btn--primary" style={{ marginTop: '0.5rem' }} onClick={() => setShowMatchForm(true)}>
                    <IoAdd size={16} /> Create First Match
                  </button>
                )}
              </div>
            )}
            {matches.map(m => {
              const isActive = m.id === activeMatchId;
              return (
                <div key={m.id} className="kba__row" style={isActive ? { borderLeft: '4px solid #22c55e', background: 'rgba(34, 197, 94, 0.05)' } : undefined}>
                  <div className="kba__row-id">
                    <div>
                      <strong>
                        {m.teamA.name} vs {m.teamB.name}
                        {isActive && (
                          <span style={{ background: '#22c55e', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, marginLeft: 8 }}>
                            ACTIVE
                          </span>
                        )}
                      </strong>
                      <small>
                        <span className={`kba__status kba__status--${m.status}`}>{m.status === 'live' ? 'STARTED' : m.status === 'scheduled' ? 'NOT STARTED' : m.status}</span>
                        {' '}{m.venue} · {m.halfDurationMin}′ halves{m.competition ? ` · ${m.competition}` : ''}
                      </small>
                    </div>
                  </div>
                  <div className="kba__row-actions">
                    <button onClick={() => editMatch(m)} title="Edit Match"><IoPencil size={15} /> Edit</button>
                    <button onClick={() => openIn('/kabaddi/scorer/update', m.id)}><IoFlash size={15} /> Score</button>
                    <button onClick={() => openIn('/kabaddi/scorer/obs-overlay', m.id)}><IoDesktop size={15} /> Overlay</button>
                    <button onClick={() => openIn('/kabaddi/scorer/camera', m.id)}><IoVideocam size={15} /> Camera</button>
                    <button onClick={() => openIn('/kabaddi/scorer/obs-dock', m.id)}><IoStatsChart size={15} /> Dock</button>
                    <button
                      title={isActive ? 'Active match' : 'Make Live & Active'}
                      style={isActive ? { background: '#22c55e', color: '#fff' } : undefined}
                      onClick={async () => {
                        await kabaddiService.updateMatchStatus(m.id, 'live');
                        await kabaddiService.setActiveMatch(m.id);
                        await reloadMatches();
                        flash('Match is live and set as active');
                      }}
                    >
                      <IoPlay size={15} />
                    </button>
                    <button
                      title="Reset match results and return to Not Started"
                      disabled={!ready || busy}
                      onClick={async () => {
                        if (!window.confirm('Reset this match result? Scores, clock, raids, events, and overlay state will be cleared.')) return;
                        if (!ready || !kabaddiService.isReady) {
                          flash('Kabaddi service is still connecting — try again in a moment');
                          return;
                        }
                        try {
                          await kabaddiService.resetMatchResults(m.id);
                          await reloadMatches();
                          flash('Match reset — NOT STARTED');
                        } catch (error) {
                          console.error('[KabaddiAdmin] Failed to reset match', error);
                          flash(`Failed to reset match: ${error instanceof Error ? error.message : String(error)}`);
                        }
                      }}
                    >
                      <IoRefresh size={15} /> Reset
                    </button>
                    <button onClick={async () => { if (window.confirm('Delete match?')) { await kabaddiService.deleteMatch(m.id); await reloadMatches(); flash('Deleted'); } }}><IoTrash size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Overlay & animations ── */}
      {tab === 'overlay' && (
        <section className="kba__body">
          <div className="kba__card">
            <h2><IoSettings size={15} /> Broadcast look</h2>

            {/* Single Overlay Mode toggle */}
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              background: overlayConfig.singleOverlayMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${overlayConfig.singleOverlayMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '0.5rem',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!overlayConfig.singleOverlayMode}
                  onChange={e => setOverlayConfig(c => ({ ...c, singleOverlayMode: e.target.checked }))}
                />
                Single Overlay Mode (All Matches)
              </label>
              <p className="kba__hint" style={{ margin: '0.35rem 0 0' }}>
                When enabled, a single universal OBS overlay, dock, and update-scorecard link automatically follows whichever match is live/active — no per-match links needed in OBS Studio, Prism Live Studio, or mobile streaming apps.
              </p>
            </div>

            <div className="kba__grid">
              <label><span>Tournament name</span><HistoryField storageKey="overlay-tournament-name" value={overlayConfig.tournamentName ?? ''} onChange={v => setOverlayConfig(c => ({ ...c, tournamentName: v }))} /></label>
              <label><span>Tournament logo URL</span><HistoryField storageKey="overlay-tournament-logo" value={overlayConfig.tournamentLogo ?? ''} onChange={v => setOverlayConfig(c => ({ ...c, tournamentLogo: v }))} /></label>
              <label><span>Partner logo URL</span><HistoryField storageKey="overlay-partner-logo" value={overlayConfig.broadcastPartnerLogo ?? ''} onChange={v => setOverlayConfig(c => ({ ...c, broadcastPartnerLogo: v }))} /></label>
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
              <button className={overlayConfig.showRaiderInfo ? 'is-on' : ''} onClick={() => setOverlayConfig(c => ({ ...c, showRaiderInfo: !c.showRaiderInfo }))}>Raider info</button>
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
                    <label>
                      <span>Media URL (video / gif / image)</span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input value={anim?.mediaUrl ?? ''} onChange={e => setAnim(field.key, { mediaUrl: e.target.value })} style={{ flex: 1 }} />
                        <label className="kba__btn" style={{ cursor: 'pointer', margin: 0 }}>
                          Upload
                          <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) void uploadAnimMedia(field.key, e.target.files[0]); }} />
                        </label>
                      </div>
                    </label>
                    <label><span>Duration (ms)</span><input type="number" min={500} step={250} value={anim?.durationMs ?? 4000} onChange={e => setAnim(field.key, { durationMs: Number(e.target.value) || 4000 })} /></label>
                    <label><span>Colour</span><input type="color" value={anim?.color ?? '#f59e0b'} onChange={e => setAnim(field.key, { color: e.target.value })} /></label>
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, textAlign: 'center' }}>
                    {anim?.mediaUrl ? (
                      /\.(mp4|webm|mov)(\?|$)/i.test(anim.mediaUrl) ? (
                        <video src={anim.mediaUrl} autoPlay muted loop playsInline style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, objectFit: 'contain' }} />
                      ) : (
                        <ResolvedImage src={anim.mediaUrl} alt="preview" size={320} style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, objectFit: 'contain' }} />
                      )
                    ) : (
                      <span style={{ fontSize: 24, fontWeight: 900, color: anim?.color ?? '#f59e0b', textShadow: `0 0 20px ${anim?.color ?? '#f59e0b'}80` }}>
                        {anim?.text || field.label}
                      </span>
                    )}
                    <p className="kba__hint" style={{ marginTop: 4 }}>{anim?.mediaUrl ? (/\.(mp4|webm|mov)(\?|$)/i.test(anim.mediaUrl) ? 'Custom video clip' : 'Custom media') : 'Default text'} · {anim?.durationMs ?? 4000}ms</p>
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

export default withScorerAdminChrome(KabaddiAdminPageContent, {
  gameType: 'kabaddi',
  subtitle: 'Teams, players, fixtures and broadcast overlay',
});
