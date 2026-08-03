// ============================================================================
// SCORING ADMIN PAGE — /:tenantSlug/cricket/scorer/admin
// Match setup, provider config, ads, overlay branding, animation triggers
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoAdd, IoTrash, IoSave, IoClose, IoPlay, IoStop, IoTrophy, IoSettings, IoImage, IoFlash, IoVideocam, IoLink, IoDesktop, IoPencil, IoPeople, IoGameController, IoFootball } from 'react-icons/io5';
import { GiCricketBat } from 'react-icons/gi';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { useLocation } from 'react-router-dom';
import { useInitialData, useAuctionDataLoader } from '../hooks';
import { useTeams, useSoldPlayers } from '../store';
import { tenantPath } from '../services/tenantPath';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { uploadFileToStorage } from '../services';
import { DEFAULT_MVP_WEIGHTS } from '../types/scoring';
import type { MatchSetup, ScoringAd, ScoringOverlayConfig, LiveQuestion, MatchScoringConfig, PreMatchState, PreMatchPhase, ImpactPlayer, TossConfig, MatchLineup, TickerConfig, OBSWebSocketConfig, MVPWeights, AnimationConfig, OBSReplayButton, OBSReplayConfig, TickerStatWidget } from '../types/scoring';
import type { SoldPlayer } from '../types';
import './ScoringAdminPage.css';

type Tab = 'matches' | 'provider' | 'ads' | 'overlay' | 'animations' | 'prematch' | 'ticker' | 'stats' | 'obs';

const DEFAULT_OVERLAY_CONFIG: ScoringOverlayConfig = {
  showLiveBadge: true,
  enableBoundaryAnimation: true,
  enableWicketAnimation: true,
  enableDuckOutAnimation: true,
  enableHatTrickAnimation: true,
  enableSixerAnimation: true,
  enableKeyboardShortcuts: true,
  autoOverlayEnabled: true,
  autoOverlayIntervalSeconds: 30,
  liveQuestions: [],
};

export default function ScoringAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantSlug = getTenantSlugFromPath(location.pathname);
  const baseUrl = window.location.origin + (tenantSlug ? `/${tenantSlug}` : '');
  const { isAuthenticated, extendSession } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<Tab>('matches');

  useInitialData();
  useAuctionDataLoader();

  const allTeams = useTeams();
  const soldPlayers = useSoldPlayers();

  const [scoringReady, setScoringReady] = useState(false);

  // Initialize scoring service
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const initScoring = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Database not available after init');
        scoringService.initialize(db, tenantPath('scoring'));
        if (!cancelled) setScoringReady(true);
      } catch (err) {
        console.warn('[ScoringAdmin] Init failed, retrying:', err);
        if (!cancelled) {
          setScoringReady(false);
          retryTimer = setTimeout(() => {
            void initScoring();
          }, 800);
        }
      }
    };
    void initScoring();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Auth check
  useEffect(() => {
    if (!isAuthenticated) navigate('/admin/login');
    const handleActivity = () => extendSession();
    window.addEventListener('click', handleActivity);
    return () => window.removeEventListener('click', handleActivity);
  }, [isAuthenticated, navigate, extendSession]);

  // ── State ──
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [ads, setAds] = useState<ScoringAd[]>([]);
  const [overlayConfig, setOverlayConfig] = useState<ScoringOverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Load data (after scoring service is ready)
  useEffect(() => {
    if (!scoringReady) return;
    const unsubs: (() => void)[] = [];
    try {
      unsubs.push(scoringService.subscribeMatches(setMatches));
      unsubs.push(scoringService.subscribeAds(setAds));
      unsubs.push(scoringService.subscribeOverlayConfig((cfg) => setOverlayConfig(cfg)));
    } catch { /* service not initialized yet */ }
    return () => unsubs.forEach(u => u());
  }, [scoringReady]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }, []);

  if (!isAuthenticated) return null;

  if (!scoringReady) {
    return (
      <div className="scoring-admin">
        <div className="scoring-admin__bg" />
        <div className="score-update score-update--loading" style={{ minHeight: '100vh' }}>
          <div className="score-update__spinner" />
          <p>Initializing scoring workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scoring-admin">
      <div className="scoring-admin__bg" />

      {/* Header */}
      <header className="scoring-admin__header">
        <div className="scoring-admin__header-left">
          <GiCricketBat size={28} color="#fbbf24" />
          <div>
            <h1 className="scoring-admin__title">Scoring Admin</h1>
            <p className="scoring-admin__subtitle">Match setup, overlays & live controls</p>
          </div>
        </div>
        <button className="scoring-admin__close-btn" onClick={() => navigate('/admin')}>
          <IoClose size={20} />
        </button>
      </header>

      {/* Quick Actions Bar */}
      <div className="scoring-admin__quick-actions">
        <button className="scoring-admin__quick-btn" onClick={() => navigate('/cricket/scorer/update')}>
          <IoPencil size={14} /> Update Scorecard
        </button>
        <button className="scoring-admin__quick-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/obs-overlay`, '_blank')}>
          <IoDesktop size={14} /> OBS Overlay
        </button>
        <button className="scoring-admin__quick-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/camera`, '_blank')}>
          <IoVideocam size={14} /> Camera Recorder
        </button>
        <button className="scoring-admin__quick-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/obs-dock`, '_blank')}>
          <IoGameController size={14} /> OBS Control Dock
        </button>
        <button className="scoring-admin__quick-btn" onClick={() => navigate('/football/scorer/admin')} title="Football Scorer">
          <IoFootball size={14} /> Football Scorer
        </button>
        <button className="scoring-admin__quick-btn" onClick={() => navigate('/admin')}>
          <IoSettings size={14} /> Auction Admin
        </button>
      </div>

      {/* Tabs */}
      <nav className="scoring-admin__tabs">
        {([
          { key: 'matches', icon: <IoTrophy size={16} />, label: 'Matches' },
          { key: 'provider', icon: <IoSettings size={16} />, label: 'Providers' },
          { key: 'ads', icon: <IoImage size={16} />, label: 'Ads' },
          { key: 'overlay', icon: <IoPlay size={16} />, label: 'Overlay' },
          { key: 'animations', icon: <IoFlash size={16} />, label: 'Animations' },
          { key: 'prematch', icon: <IoVideocam size={16} />, label: 'Pre-Match' },
          { key: 'ticker', icon: <IoDesktop size={16} />, label: 'Ticker' },
          { key: 'stats', icon: <IoTrophy size={16} />, label: 'Stats' },
          { key: 'obs', icon: <IoLink size={16} />, label: 'OBS WS' },
        ] as { key: Tab; icon: React.ReactNode; label: string }[]).map(tab => (
          <button
            key={tab.key}
            className={`scoring-admin__tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="scoring-admin__content">
        {activeTab === 'matches' && (
          <MatchesTab
            matches={matches}
            teams={allTeams}
            soldPlayers={soldPlayers}
            onFeedback={showFeedback}
            saving={saving}
            setSaving={setSaving}
            navigate={navigate}
            baseUrl={baseUrl}
            config={overlayConfig}
          />
        )}
        {activeTab === 'provider' && (
          <ProviderTab
            matches={matches}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'ads' && (
          <AdsTab
            ads={ads}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'overlay' && (
          <OverlayTab
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'animations' && (
          <AnimationsTab
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'prematch' && (
          <PreMatchTab
            matches={matches}
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
            soldPlayers={soldPlayers}
          />
        )}
        {activeTab === 'ticker' && (
          <TickerTab
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
          />
        )}
        {activeTab === 'obs' && (
          <OBSWebSocketTab
            config={overlayConfig}
            setConfig={setOverlayConfig}
            onFeedback={showFeedback}
            baseUrl={baseUrl}
          />
        )}
      </div>

      {/* Feedback toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            className="scoring-admin__toast"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCHES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function MatchesTab({ matches, teams, soldPlayers, onFeedback, saving, setSaving, navigate, baseUrl, config }: {
  matches: MatchSetup[];
  teams: { id: string; name: string; logoUrl?: string; primaryColor?: string }[];
  soldPlayers: SoldPlayer[];
  onFeedback: (msg: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  navigate: (to: string) => void;
  baseUrl: string;
  config: ScoringOverlayConfig;
}) {
  type MatchListMode = 'time-default' | 'upcoming' | 'not-done' | 'live' | 'completed';
  const formatDateTimeInput = (value: string) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  const localNowInputValue = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  const formatMatchDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };
  const getMatchTimeDistance = (value: string) => {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : Math.abs(parsed - Date.now());
  };
  const isTimeDefaultMatch = (match: MatchSetup) => {
    if (match.status === 'live') return true;
    if (match.status !== 'scheduled') return false;
    const scheduledAt = new Date(match.date).getTime();
    if (Number.isNaN(scheduledAt)) return false;
    const now = Date.now();
    return scheduledAt >= now - (30 * 60 * 1000) && scheduledAt <= now + (60 * 60 * 1000);
  };

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [squadMatchId, setSquadMatchId] = useState<string | null>(null);
  const [savedVenues, setSavedVenues] = useState<string[]>([]);
  const [matchListMode, setMatchListMode] = useState<MatchListMode>('time-default');
  const [form, setForm] = useState({
    teamAId: '', teamBId: '', venue: '', date: localNowInputValue(), maxOvers: 20, powerplayOvers: 6,
  });
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const singleOverlayMode = !!config.singleOverlayMode;

  useEffect(() => {
    try {
      const unsub = scoringService.subscribeActiveMatch(setActiveMatchId);
      return unsub;
    } catch {
      return () => {};
    }
  }, []);

  const resetForm = () => {
    setForm({ teamAId: '', teamBId: '', venue: '', date: localNowInputValue(), maxOvers: 20, powerplayOvers: 6 });
    setEditId(null);
    setShowForm(false);
  };

  useEffect(() => {
    const loadVenues = async () => {
      try {
        const venues = await scoringService.getSavedVenues();
        setSavedVenues(venues);
      } catch {
        setSavedVenues([]);
      }
    };
    loadVenues();
  }, []);

  useEffect(() => {
    const fromMatches = matches.map(m => m.venue?.trim()).filter(Boolean) as string[];
    if (fromMatches.length === 0) return;
    setSavedVenues(prev => Array.from(new Set([...prev, ...fromMatches])).sort((a, b) => a.localeCompare(b)));
  }, [matches]);

  const handleSave = async () => {
    if (!form.teamAId || !form.teamBId || !form.venue || !form.date) {
      onFeedback('Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const teamA = teams.find(t => t.id === form.teamAId);
      const teamB = teams.find(t => t.id === form.teamBId);
      if (!teamA || !teamB) { onFeedback('Invalid teams'); return; }

      const matchId = editId || `match_${Date.now()}`;
      const match: MatchSetup = {
        id: matchId,
        teamA: { id: teamA.id, name: teamA.name, logoUrl: teamA.logoUrl, primaryColor: teamA.primaryColor },
        teamB: { id: teamB.id, name: teamB.name, logoUrl: teamB.logoUrl, primaryColor: teamB.primaryColor },
        venue: form.venue,
        date: new Date(form.date).toISOString(),
        maxOvers: form.maxOvers,
        powerplayOvers: form.powerplayOvers,
        status: 'scheduled',
        createdAt: editId ? (matches.find(m => m.id === editId)?.createdAt ?? Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };
      await scoringService.createMatch(match);
      await scoringService.saveVenue(form.venue);
      const mergedVenues = Array.from(new Set([...savedVenues, form.venue.trim()].filter(Boolean))).sort((a, b) => a.localeCompare(b));
      setSavedVenues(mergedVenues);
      onFeedback(editId ? 'Match updated' : 'Match created');
      resetForm();
    } catch (err) {
      onFeedback(`Failed to save match: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (match: MatchSetup) => {
    setForm({
      teamAId: match.teamA.id,
      teamBId: match.teamB.id,
      venue: match.venue,
      date: formatDateTimeInput(match.date),
      maxOvers: match.maxOvers,
      powerplayOvers: match.powerplayOvers || (match.maxOvers <= 20 ? 6 : 10),
    });
    setEditId(match.id);
    setShowForm(true);
  };

  const handleDelete = async (matchId: string) => {
    if (!confirm('Delete this match and all associated data?')) return;
    try {
      await scoringService.deleteMatch(matchId);
      onFeedback('Match deleted');
    } catch {
      onFeedback('Failed to delete match');
    }
  };

  const handleStatusChange = async (matchId: string, status: MatchSetup['status']) => {
    try {
      // Prevent ending match until both innings are completed
      if (status === 'completed') {
        const inn1 = await scoringService.getInnings(matchId, 1);
        const inn2 = await scoringService.getInnings(matchId, 2);
        if (!inn1 || !inn2) {
          onFeedback('Cannot end match: both innings must be completed first');
          return;
        }
        if (!inn1.isCompleted || !inn2.isCompleted) {
          onFeedback('Cannot end match: both innings must be completed first');
          return;
        }
      }

      await scoringService.updateMatch(matchId, { status });

      // When starting a match, auto-populate default squads and run prematch ceremony
      if (status === 'live') {
        const match = matches.find(m => m.id === matchId);
        if (match) {
          // Auto-populate default playing 11 from sold players if no lineup exists
          const existingA = await scoringService.getLineup(matchId, match.teamA.id);
          const existingB = await scoringService.getLineup(matchId, match.teamB.id);

          if (!existingA || existingA.players.length === 0) {
            const teamAPlayers = soldPlayers
              .filter(p => p.teamId === match.teamA.id || p.teamName === match.teamA.name)
              .slice(0, 11)
              .map((p, i) => ({
                playerId: p.id,
                playerName: p.name,
                role: p.role || 'Unknown',
                imageUrl: p.imageUrl,
                auctionPrice: p.soldAmount,
                battingOrder: i + 1,
              }));
            if (teamAPlayers.length > 0) {
              await scoringService.saveLineup(matchId, { matchId, teamId: match.teamA.id, players: teamAPlayers });
            }
          }

          if (!existingB || existingB.players.length === 0) {
            const teamBPlayers = soldPlayers
              .filter(p => p.teamId === match.teamB.id || p.teamName === match.teamB.name)
              .slice(0, 11)
              .map((p, i) => ({
                playerId: p.id,
                playerName: p.name,
                role: p.role || 'Unknown',
                imageUrl: p.imageUrl,
                auctionPrice: p.soldAmount,
                battingOrder: i + 1,
              }));
            if (teamBPlayers.length > 0) {
              await scoringService.saveLineup(matchId, { matchId, teamId: match.teamB.id, players: teamBPlayers });
            }
          }

          // Build full prematch state with toss info from match setup
          const tossResult = match.tossWonBy && match.tossElected ? {
            wonBy: match.tossWonBy,
            elected: match.tossElected,
            coinSide: 'heads' as const,
          } : undefined;

          const fullPreMatchState: PreMatchState = {
            matchId,
            phase: 'squad_display',
            tossResult,
            squadRevealConfig: {
              autoReveal: true,
              delayAfterTossSeconds: 2,
              playerRevealIntervalMs: 800,
            },
            impactPlayers: { teamA: [], teamB: [] },
            revealedPlayersTeamA: [],
            revealedPlayersTeamB: [],
            lastUpdated: Date.now(),
          };

          // Save full prematch state so all overlay components have proper data
          await scoringService.savePreMatchState(matchId, fullPreMatchState);

          // Auto-progress through prematch phases with proper timing
          // Build sequence based on available data (skip toss if not set)
          const hasToss = Boolean(tossResult);
          const delays: Array<[number, PreMatchPhase]> = [];
          let t = 8000; // squad_display duration
          if (hasToss) {
            delays.push([t, 'toss_animation']);
            t += 5000;
            delays.push([t, 'toss_result']);
            t += 5000;
          }
          delays.push([t, 'squad_reveal_teamA']);
          t += 10000;
          delays.push([t, 'squad_reveal_teamB']);
          t += 10000;
          delays.push([t, 'match_ready']);
          for (const [delay, phase] of delays) {
            setTimeout(async () => {
              try {
                await scoringService.updatePreMatchPhase(matchId, phase);
              } catch { /* ignore if match ended */ }
            }, delay);
          }
        }
      }
      onFeedback(`Match status: ${status}`);
    } catch {
      onFeedback('Failed to update status');
    }
  };

  const handleStart = async (matchId: string) => {
    await handleStatusChange(matchId, 'live');
    if (singleOverlayMode) {
      try {
        await scoringService.setActiveMatch(matchId);
      } catch {
        onFeedback('Started match, but failed to set it as the active overlay match');
      }
    }
  };

  const handleStartNext = async () => {
    const next = [...matches]
      .filter(m => m.status === 'scheduled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    if (!next) { onFeedback('No upcoming scheduled match to start'); return; }
    await handleStart(next.id);
  };

  const handleEndSession = async () => {
    try {
      await scoringService.setActiveMatch(null);
      onFeedback('Session ended — universal link now shows no active match');
    } catch {
      onFeedback('Failed to end session');
    }
  };

  const visibleMatches = useMemo(() => {
    if (matchListMode === 'live') {
      return [...matches]
        .filter(match => match.status === 'live')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (matchListMode === 'completed') {
      return [...matches]
        .filter(match => match.status === 'completed')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    if (matchListMode === 'upcoming') {
      return [...matches]
        .filter(match => match.status === 'scheduled')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (matchListMode === 'not-done') {
      return [...matches]
        .filter(match => match.status !== 'completed')
        .sort((a, b) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (b.status === 'live' && a.status !== 'live') return 1;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    }

    return [...matches]
      .filter(match => isTimeDefaultMatch(match))
      .sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return getMatchTimeDistance(a.date) - getMatchTimeDistance(b.date);
      });
  }, [matchListMode, matches]);

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Matches</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
          <select
            className="scoring-admin__select"
            value={matchListMode}
            onChange={e => setMatchListMode(e.target.value as MatchListMode)}
            style={{ minWidth: 170 }}
          >
            <option value="time-default">Time Default</option>
            <option value="upcoming">Upcoming</option>
            <option value="not-done">Not Done</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
          <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={() => setShowForm(!showForm)}>
            <IoAdd size={16} /> {showForm ? 'Cancel' : 'New Match'}
          </button>
        </div>
      </div>

      {singleOverlayMode && (
        <div className="scoring-admin__form-card" style={{ marginBottom: '1rem' }}>
          <strong>🔗 Single Overlay Mode is ON</strong> — use the <strong>Quick Actions</strong> bar above for the universal Overlay/Scorer/Dock links. Toggle this mode from Admin → Streaming tab.
          {activeMatchId ? (
            <>
              <p className="scoring-admin__hint">
                Active match: <strong>{matches.find(m => m.id === activeMatchId)?.teamA.name} vs {matches.find(m => m.id === activeMatchId)?.teamB.name}</strong>
                {' '}({matches.find(m => m.id === activeMatchId)?.status})
              </p>
              <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--warning" onClick={handleEndSession}>
                End Session (Clear Active Match)
              </button>
            </>
          ) : (
            <p className="scoring-admin__hint">No match is currently active — click Start on a match below.</p>
          )}
        </div>
      )}

      {showForm && (
        <motion.div className="scoring-admin__form-card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}>
          <div className="scoring-admin__form-grid">
            <div className="scoring-admin__field">
              <label>Team A *</label>
              <select value={form.teamAId} onChange={e => setForm(f => ({ ...f, teamAId: e.target.value }))} className="scoring-admin__select">
                <option value="">Select team</option>
                {teams.filter(t => t.id !== form.teamBId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Team B *</label>
              <select value={form.teamBId} onChange={e => setForm(f => ({ ...f, teamBId: e.target.value }))} className="scoring-admin__select">
                <option value="">Select team</option>
                {teams.filter(t => t.id !== form.teamAId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Venue *</label>
              <input
                type="text"
                list="scoring-admin-venues"
                value={form.venue}
                onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Stadium name"
                className="scoring-admin__input"
              />
              <datalist id="scoring-admin-venues">
                {savedVenues.map(venue => <option key={venue} value={venue} />)}
              </datalist>
              <small className="scoring-admin__hint">Choose an existing location or type a new one. New venues are saved automatically.</small>
            </div>
            <div className="scoring-admin__field">
              <label>Date & Time *</label>
              <div className="scoring-admin__date-row">
                <input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="scoring-admin__input" />
                <button type="button" className="scoring-admin__btn scoring-admin__btn--sm" onClick={() => setForm(f => ({ ...f, date: localNowInputValue() }))}>Now</button>
              </div>
            </div>
            <div className="scoring-admin__field">
              <label>Max Overs</label>
              <input type="number" min={1} max={50} value={form.maxOvers} onChange={e => {
                const overs = Number(e.target.value);
                // Auto-calculate powerplay: T20=6, T10=3, 50-over=10, otherwise ~30% of overs (min 2)
                const pp = overs >= 40 ? 10 : overs >= 16 ? 6 : overs >= 8 ? 3 : Math.max(2, Math.round(overs * 0.3));
                setForm(f => ({ ...f, maxOvers: overs, powerplayOvers: pp }));
              }} className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field">
              <label>Powerplay Overs</label>
              <input type="number" min={1} max={form.maxOvers} value={form.powerplayOvers} onChange={e => setForm(f => ({ ...f, powerplayOvers: Number(e.target.value) }))} className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
              <small className="scoring-admin__hint">Toss is captured when scorer opens Edit Scorecard and starts the first innings.</small>
            </div>
          </div>
          <div className="scoring-admin__form-actions">
            <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave} disabled={saving}>
              <IoSave size={16} /> {editId ? 'Update' : 'Create'} Match
            </button>
            <button className="scoring-admin__btn scoring-admin__btn--secondary" onClick={resetForm}>Cancel</button>
          </div>
        </motion.div>
      )}

      {/* Match list */}
      <div className="scoring-admin__match-list">
        {visibleMatches.length === 0 && (
          <div className="scoring-admin__empty">
            {matchListMode === 'time-default'
              ? 'No live or near-time matches right now. Switch to Upcoming, Live, or Completed from the dropdown.'
              : 'No matches found in this category.'}
          </div>
        )}
        {visibleMatches.map(match => (
          <div key={match.id} className="scoring-admin__match-card">
            <div className="scoring-admin__match-teams">
              <span className="scoring-admin__team-name">{match.teamA.name}</span>
              <span className="scoring-admin__vs">vs</span>
              <span className="scoring-admin__team-name">{match.teamB.name}</span>
            </div>
            <div className="scoring-admin__match-meta">
              <span>{match.venue}</span>
              <span>{formatMatchDateTime(match.date)}</span>
              <span>{match.maxOvers} overs</span>
              <span className={`scoring-admin__status scoring-admin__status--${match.status}`}>{match.status}</span>
              {singleOverlayMode && match.id === activeMatchId && (
                <span className="scoring-admin__status scoring-admin__status--live">🔗 ACTIVE OVERLAY</span>
              )}
            </div>
            {/* Match ID & Quick Links */}
            <div className="scoring-admin__match-id-row">
              <span className="scoring-admin__match-id" title="Click to copy" onClick={() => { navigator.clipboard.writeText(match.id); onFeedback('Match ID copied'); }}>
                ID: {match.id}
              </span>
            </div>
            {singleOverlayMode ? (
              <div className="scoring-admin__match-links">
                <span className="scoring-admin__hint">🔗 Overlay / Dock / Scorer use the universal quick actions above — no per-match link needed</span>
                <button className="scoring-admin__link-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/camera?matchId=${match.id}`, '_blank')} title="Mobile Camera Recorder">
                  <IoVideocam size={13} /> Camera
                </button>
              </div>
            ) : (
              <div className="scoring-admin__match-links">
                <button className="scoring-admin__link-btn" onClick={() => navigate(`/cricket/scorer/update?matchId=${match.id}`)} title="Update Scorecard">
                  <IoPencil size={13} /> Edit Scorecard
                </button>
                <button className="scoring-admin__link-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/obs-overlay?matchId=${match.id}`, '_blank')} title="Open OBS Overlay">
                  <IoDesktop size={13} /> OBS Overlay
                </button>
                <button className="scoring-admin__link-btn" onClick={() => window.open(`${baseUrl}/cricket/scorer/camera?matchId=${match.id}`, '_blank')} title="Mobile Camera Recorder">
                  <IoVideocam size={13} /> Camera
                </button>
                <button className="scoring-admin__link-btn" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/cricket/scorer/obs-overlay?matchId=${match.id}`); onFeedback('OBS URL copied'); }} title="Copy OBS Overlay URL">
                  <IoLink size={13} /> Copy URL
                </button>
                <button
                  className="scoring-admin__link-btn"
                  onClick={() => window.open(`${baseUrl}/cricket/scorer/obs-dock?matchId=${match.id}`, '_blank')}
                  title="Open OBS Control Dock (locked to this match)"
                >
                  <IoGameController size={13} /> Control Dock
                </button>
                <button
                  className="scoring-admin__link-btn scoring-admin__link-btn--copy"
                  onClick={() => { navigator.clipboard.writeText(`${baseUrl}/cricket/scorer/obs-dock?matchId=${match.id}`); onFeedback('Dock URL copied — paste in OBS Custom Browser Docks'); }}
                  title="Copy dock URL to add to OBS"
                >
                  <IoLink size={13} /> Copy Dock URL
                </button>
              </div>
            )}
            <div className="scoring-admin__match-actions">
              <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--primary" onClick={() => setSquadMatchId(match.id)}>
                <IoPeople size={14} /> Squad
              </button>
              {match.status === 'scheduled' && (
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--success" onClick={() => handleStart(match.id)}>
                  <IoPlay size={14} /> Start
                </button>
              )}
              {match.status === 'live' && (
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--warning" onClick={() => handleStatusChange(match.id, 'completed')}>
                  <IoStop size={14} /> End
                </button>
              )}
              {singleOverlayMode && match.status === 'completed' && match.id === activeMatchId && (
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--success" onClick={handleStartNext}>
                  <IoPlay size={14} /> Start Next Match
                </button>
              )}
              <button className="scoring-admin__btn scoring-admin__btn--sm" onClick={() => handleEdit(match)}>Edit</button>
              <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--danger" onClick={() => handleDelete(match.id)}>
                <IoTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Squad Selection Modal */}
      <AnimatePresence>
        {squadMatchId && (() => {
          const sqMatch = matches.find(m => m.id === squadMatchId);
          if (!sqMatch) return null;
          return (
            <SquadSelectionModal
              match={sqMatch}
              soldPlayers={soldPlayers}
              onSave={async (matchId, lineupA, lineupB, impactA, impactB) => {
                try {
                  await scoringService.saveLineup(matchId, lineupA);
                  await scoringService.saveLineup(matchId, lineupB);

                  const existingState = await scoringService.getPreMatchState(matchId);
                  const mergedState: PreMatchState = {
                    matchId,
                    phase: existingState?.phase || 'idle',
                    tossResult: existingState?.tossResult,
                    squadRevealConfig: existingState?.squadRevealConfig || {
                      autoReveal: true,
                      delayAfterTossSeconds: 10,
                      playerRevealIntervalMs: 2000,
                    },
                    impactPlayers: {
                      teamA: impactA,
                      teamB: impactB,
                    },
                    revealedPlayersTeamA: existingState?.revealedPlayersTeamA || [],
                    revealedPlayersTeamB: existingState?.revealedPlayersTeamB || [],
                    lastUpdated: Date.now(),
                  };

                  await scoringService.savePreMatchState(matchId, mergedState);
                  onFeedback('Squad + impact subs saved successfully');
                  setSquadMatchId(null);
                } catch (err) {
                  onFeedback(`Failed to save squad: ${err}`);
                }
              }}
              onClose={() => setSquadMatchId(null)}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProviderTab({ matches, onFeedback }: {
  matches: MatchSetup[];
  onFeedback: (msg: string) => void;
}) {
  const [configs, setConfigs] = useState<Record<string, MatchScoringConfig>>({});
  const [globalApiKey, setGlobalApiKey] = useState('');

  useEffect(() => {
    // Load config for each match
    const loadConfigs = async () => {
      const result: Record<string, MatchScoringConfig> = {};
      for (const match of matches) {
        const cfg = await scoringService.getMatchConfig(match.id);
        if (cfg) result[match.id] = cfg;
      }
      setConfigs(result);
    };
    if (matches.length > 0) loadConfigs();
  }, [matches]);

  const handleSaveConfig = async (matchId: string, provider: string) => {
    try {
      const config: MatchScoringConfig = {
        provider: provider as MatchScoringConfig['provider'],
        apiKey: globalApiKey || undefined,
      };
      await scoringService.configureMatchScoring(matchId, config);
      setConfigs(prev => ({ ...prev, [matchId]: config }));
      onFeedback(`Provider set to ${provider}`);
    } catch {
      onFeedback('Failed to save config');
    }
  };

  const providers = scoringService.getAvailableProviders();

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Scoring Providers</h2>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">Global API Key (CricHeroes)</h3>
        <p className="scoring-admin__hint">Enter your CricHeroes API key to enable automatic score fetching. Leave blank for manual scoring.</p>
        <div className="scoring-admin__field" style={{ maxWidth: 500 }}>
          <input
            type="password"
            value={globalApiKey}
            onChange={e => setGlobalApiKey(e.target.value)}
            placeholder="CricHeroes API key"
            className="scoring-admin__input"
          />
        </div>
        <div className="scoring-admin__provider-badges">
          {providers.map(p => (
            <span key={p.provider} className={`scoring-admin__badge ${p.configured ? 'scoring-admin__badge--active' : ''}`}>
              {p.name} — {p.configured ? 'Ready' : 'Not Configured'}
            </span>
          ))}
        </div>
      </div>

      <h3 className="scoring-admin__subsection-title" style={{ marginTop: '1.5rem' }}>Per-Match Provider</h3>
      {matches.length === 0 && (
        <div className="scoring-admin__empty">Create matches first to configure providers.</div>
      )}
      {matches.map(match => (
        <div key={match.id} className="scoring-admin__form-card" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className="scoring-admin__team-name" style={{ fontSize: '0.85rem' }}>
              {match.teamA.name} vs {match.teamB.name}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {providers.map(p => (
                <button
                  key={p.provider}
                  className={`scoring-admin__btn scoring-admin__btn--sm ${configs[match.id]?.provider === p.provider ? 'scoring-admin__btn--primary' : ''}`}
                  onClick={() => handleSaveConfig(match.id, p.provider)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="scoring-admin__form-card" style={{ marginTop: '1.5rem' }}>
        <h3 className="scoring-admin__subsection-title">🔌 Future Adapters</h3>
        <p className="scoring-admin__hint">
          The scoring system uses an adapter pattern. Future providers (CricBuzz, custom webhooks, third-party APIs) can be plugged in without changing existing code.
          Contact the development team to add a new adapter.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AdsTab({ ads, onFeedback }: {
  ads: ScoringAd[];
  onFeedback: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', imageUrl: '', position: 'l-banner' as ScoringAd['position'], durationSeconds: 15 });

  const handleSave = async () => {
    if (!form.name || !form.imageUrl) { onFeedback('Name and image are required'); return; }
    try {
      const ad: ScoringAd = {
        id: `ad_${Date.now()}`,
        name: form.name,
        imageUrl: form.imageUrl,
        position: form.position,
        durationSeconds: form.durationSeconds,
        active: true,
        order: ads.length,
      };
      await scoringService.saveAd(ad);
      onFeedback('Ad saved');
      setForm({ name: '', imageUrl: '', position: 'l-banner', durationSeconds: 15 });
      setShowForm(false);
    } catch {
      onFeedback('Failed to save ad');
    }
  };

  const handleDelete = async (adId: string) => {
    try {
      await scoringService.deleteAd(adId);
      onFeedback('Ad deleted');
    } catch {
      onFeedback('Failed to delete ad');
    }
  };

  const handleToggle = async (ad: ScoringAd) => {
    try {
      await scoringService.saveAd({ ...ad, active: !ad.active });
    } catch {
      onFeedback('Failed to toggle ad');
    }
  };

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Broadcast Ads</h2>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={() => setShowForm(!showForm)}>
          <IoAdd size={16} /> {showForm ? 'Cancel' : 'Add Ad'}
        </button>
      </div>

      {showForm && (
        <div className="scoring-admin__form-card">
          <div className="scoring-admin__form-grid">
            <div className="scoring-admin__field">
              <label>Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ad name" className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field">
              <label>Image URL</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." className="scoring-admin__input" style={{ flex: 1 }} />
                <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                  Upload
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadFileToStorage(file, `media/scoring/ads/${Date.now()}`);
                      setForm(f => ({ ...f, imageUrl: url }));
                    } catch { onFeedback('Upload failed'); }
                  }} />
                </label>
              </div>
            </div>
            <div className="scoring-admin__field">
              <label>Position</label>
              <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value as ScoringAd['position'] }))} className="scoring-admin__select">
                <option value="l-banner">L-Banner</option>
                <option value="bottom-strip">Bottom Strip</option>
                <option value="break">Break / Boundary</option>
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Duration (seconds)</label>
              <input type="number" min={5} max={120} value={form.durationSeconds} onChange={e => setForm(f => ({ ...f, durationSeconds: Number(e.target.value) }))} className="scoring-admin__input" />
            </div>
          </div>
          <div className="scoring-admin__form-actions">
            <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave}><IoSave size={16} /> Save Ad</button>
          </div>
        </div>
      )}

      <div className="scoring-admin__ad-list">
        {ads.length === 0 && <div className="scoring-admin__empty">No ads configured. Ads will appear as L-banners and during boundary celebrations.</div>}
        {ads.map(ad => (
          <div key={ad.id} className="scoring-admin__ad-card">
            {ad.imageUrl && <img src={ad.imageUrl} alt={ad.name} className="scoring-admin__ad-preview" />}
            <div className="scoring-admin__ad-info">
              <span className="scoring-admin__ad-name">{ad.name}</span>
              <span className="scoring-admin__ad-meta">{ad.position} · {ad.durationSeconds}s</span>
            </div>
            <div className="scoring-admin__ad-actions">
              <button
                className={`scoring-admin__btn scoring-admin__btn--sm ${ad.active ? 'scoring-admin__btn--success' : ''}`}
                onClick={() => handleToggle(ad)}
              >
                {ad.active ? 'Active' : 'Inactive'}
              </button>
              <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--danger" onClick={() => handleDelete(ad.id)}>
                <IoTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY TAB — Logos, branding, broadcast partner
// ═══════════════════════════════════════════════════════════════════════════════

function OverlayTab({ config, setConfig, onFeedback }: {
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
}) {
  const handleSave = async () => {
    try {
      // Ensure service is initialized before saving
      if (!realtimeSync.getDatabase()) {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) scoringService.initialize(db, tenantPath('scoring'));
      }
      await scoringService.saveOverlayConfig(config);
      onFeedback('Overlay config saved');
    } catch (err) {
      onFeedback(`Failed to save overlay config: ${String(err)}`);
    }
  };

  const handleUpload = async (file: File, field: keyof ScoringOverlayConfig) => {
    try {
      const url = await uploadFileToStorage(file, `media/scoring/overlay/${field}-${Date.now()}`);
      setConfig({ ...config, [field]: url });
    } catch {
      onFeedback('Upload failed');
    }
  };

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Overlay Branding</h2>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave}>
          <IoSave size={16} /> Save Config
        </button>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">🏆 Tournament (Top-Left)</h3>
        <div className="scoring-admin__form-grid">
          <div className="scoring-admin__field">
            <label>Tournament Name</label>
            <input type="text" value={config.tournamentName || ''} onChange={e => setConfig({ ...config, tournamentName: e.target.value })} placeholder="Tournament name" className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Tournament Logo</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={config.tournamentLogo || ''} onChange={e => setConfig({ ...config, tournamentLogo: e.target.value })} placeholder="Logo URL" className="scoring-admin__input" style={{ flex: 1 }} />
              <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], 'tournamentLogo'); }} />
              </label>
              {config.tournamentLogo && <img src={config.tournamentLogo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />}
            </div>
          </div>
        </div>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">⭐ Title Sponsor</h3>
        <div className="scoring-admin__form-grid">
          <div className="scoring-admin__field">
            <label>Sponsor Name</label>
            <input type="text" value={config.titleSponsorName || ''} onChange={e => setConfig({ ...config, titleSponsorName: e.target.value })} placeholder="Sponsor name" className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Sponsor Logo</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={config.titleSponsorLogo || ''} onChange={e => setConfig({ ...config, titleSponsorLogo: e.target.value })} placeholder="Logo URL" className="scoring-admin__input" style={{ flex: 1 }} />
              <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], 'titleSponsorLogo'); }} />
              </label>
              {config.titleSponsorLogo && <img src={config.titleSponsorLogo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />}
            </div>
          </div>
        </div>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">📡 Broadcasting Partner (Top-Right + LIVE)</h3>
        <div className="scoring-admin__form-grid">
          <div className="scoring-admin__field">
            <label>Partner Name</label>
            <input type="text" value={config.broadcastPartnerName || ''} onChange={e => setConfig({ ...config, broadcastPartnerName: e.target.value })} placeholder="Partner name" className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Partner Logo</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={config.broadcastPartnerLogo || ''} onChange={e => setConfig({ ...config, broadcastPartnerLogo: e.target.value })} placeholder="Logo URL" className="scoring-admin__input" style={{ flex: 1 }} />
              <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], 'broadcastPartnerLogo'); }} />
              </label>
              {config.broadcastPartnerLogo && <img src={config.broadcastPartnerLogo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />}
            </div>
          </div>
          <div className="scoring-admin__field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={config.showLiveBadge} onChange={e => setConfig({ ...config, showLiveBadge: e.target.checked })} />
              Show LIVE badge
            </label>
          </div>
          <div className="scoring-admin__field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={config.enableKeyboardShortcuts} onChange={e => setConfig({ ...config, enableKeyboardShortcuts: e.target.checked })} />
              Enable overlay keyboard shortcuts
            </label>
          </div>
          <div className="scoring-admin__field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={config.autoOverlayEnabled} onChange={e => setConfig({ ...config, autoOverlayEnabled: e.target.checked })} />
              Auto-rotate scorecard/stats overlays
            </label>
          </div>
          <div className="scoring-admin__field">
            <label>Auto-rotate interval (seconds)</label>
            <input
              type="number"
              min={10}
              max={120}
              value={config.autoOverlayIntervalSeconds}
              onChange={e => setConfig({ ...config, autoOverlayIntervalSeconds: Number(e.target.value) || 30 })}
              className="scoring-admin__input"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AnimationsTab({ config, setConfig, onFeedback }: {
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
}) {
  const [newQ, setNewQ] = useState({ text: '', options: '', duration: 10 });

  // Safe access to liveQuestions (may be undefined from Firebase)
  const liveQuestions = config.liveQuestions || [];

  // Default animation configs
  const DEFAULT_FOUR_ANIMATION: AnimationConfig = {
    type: 'css', enabled: true, durationMs: 3000, text: 'FOUR!', color: '#22c55e', scale: 1,
  };
  const DEFAULT_SIX_ANIMATION: AnimationConfig = {
    type: 'css', enabled: true, durationMs: 4000, text: 'SIX!', color: '#8b5cf6', scale: 1.2,
  };
  const DEFAULT_WICKET_ANIMATION: AnimationConfig = {
    type: 'css', enabled: true, durationMs: 4000, text: 'OUT!', color: '#ef4444', scale: 1,
  };
  const DEFAULT_DUCK_ANIMATION: AnimationConfig = {
    type: 'css', enabled: true, durationMs: 5000, text: 'DUCK OUT!', color: '#fbbf24', scale: 1,
  };
  const DEFAULT_HATTRICK_ANIMATION: AnimationConfig = {
    type: 'css', enabled: true, durationMs: 8000, text: 'HAT-TRICK!', color: '#fbbf24', scale: 1,
  };

  const fourAnim = config.fourAnimation || DEFAULT_FOUR_ANIMATION;
  const sixAnim = config.sixAnimation || DEFAULT_SIX_ANIMATION;
  const wicketAnim = config.wicketAnimation || DEFAULT_WICKET_ANIMATION;
  const duckAnim = config.duckOutAnimation || DEFAULT_DUCK_ANIMATION;
  const hatTrickAnim = config.hatTrickAnimation || DEFAULT_HATTRICK_ANIMATION;

  const handleSave = async () => {
    try {
      // Ensure service is initialized before saving
      if (!realtimeSync.getDatabase()) {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) scoringService.initialize(db, tenantPath('scoring'));
      }
      await scoringService.saveOverlayConfig(config);
      onFeedback('Animation config saved');
    } catch (err) {
      onFeedback(`Failed to save: ${String(err)}`);
    }
  };

  const addQuestion = () => {
    if (!newQ.text.trim()) { onFeedback('Question text is required'); return; }
    const question: LiveQuestion = {
      id: `q_${Date.now()}`,
      text: newQ.text.trim(),
      options: newQ.options ? newQ.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
      duration: newQ.duration,
    };
    setConfig({ ...config, liveQuestions: [...liveQuestions, question] });
    setNewQ({ text: '', options: '', duration: 10 });
  };

  const removeQuestion = (id: string) => {
    setConfig({ ...config, liveQuestions: liveQuestions.filter(q => q.id !== id) });
  };

  const handleUpload = async (file: File, field: string) => {
    try {
      const url = await uploadFileToStorage(file, `media/scoring/animations/${field}-${Date.now()}`);
      // Check if field is an animation config key
      if (field === 'fourAnimation' || field === 'sixAnimation' || field === 'wicketAnimation') {
        const existing = config[field] || (field === 'fourAnimation' ? fourAnim : field === 'sixAnimation' ? sixAnim : wicketAnim);
        setConfig({ ...config, [field]: { ...existing, mediaUrl: url } });
      } else {
        setConfig({ ...config, [field]: url });
      }
      onFeedback('Upload successful');
    } catch {
      onFeedback('Upload failed');
    }
  };

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Overlay Animations</h2>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave}>
          <IoSave size={16} /> Save
        </button>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">⚡ Animation Toggles</h3>
        <div className="scoring-admin__toggle-grid">
          {[
            { key: 'enableBoundaryAnimation' as const, label: '4️⃣ Boundary (Four) Animation', shortcut: '4' },
            { key: 'enableSixerAnimation' as const, label: '6️⃣ Sixer Animation', shortcut: '6' },
            { key: 'enableWicketAnimation' as const, label: '🏏 Wicket Alert', shortcut: 'W' },
            { key: 'enableDuckOutAnimation' as const, label: '🦆 Duck Out Overlay', shortcut: 'D' },
            { key: 'enableHatTrickAnimation' as const, label: '🎩 Hat-Trick Celebration', shortcut: 'H' },
          ].map(item => (
            <label key={item.key} className="scoring-admin__toggle-label">
              <input
                type="checkbox"
                checked={config[item.key]}
                onChange={e => setConfig({ ...config, [item.key]: e.target.checked })}
              />
              <span>{item.label}</span>
              <kbd className="scoring-admin__kbd">{item.shortcut}</kbd>
            </label>
          ))}
        </div>
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">🎨 Custom Animation Assets</h3>
        <p className="scoring-admin__hint">Upload custom images for overlay animations. Leave blank for default CSS animations.</p>
        <div className="scoring-admin__form-grid">
          {[
            { field: 'duckOutImageUrl' as const, label: 'Duck Out Image' },
            { field: 'hatTrickImageUrl' as const, label: 'Hat-Trick Image' },
            { field: 'wicketImageUrl' as const, label: 'Wicket Alert Image' },
          ].map(item => (
            <div key={item.field} className="scoring-admin__field">
              <label>{item.label}</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={(config[item.field] as string) || ''}
                  onChange={e => setConfig({ ...config, [item.field]: e.target.value })}
                  placeholder="Image URL"
                  className="scoring-admin__input"
                  style={{ flex: 1 }}
                />
                <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                  Upload
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], item.field); }} />
                </label>
                {config[item.field] && <img src={config[item.field] as string} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-event Animation Configs */}
      {([
        { key: 'fourAnimation' as const, label: '4️⃣ Four (Boundary) Animation', defaults: fourAnim },
        { key: 'sixAnimation' as const, label: '6️⃣ Six (Maximum) Animation', defaults: sixAnim },
        { key: 'wicketAnimation' as const, label: '🏏 Wicket (Out) Animation', defaults: wicketAnim },
        { key: 'duckOutAnimation' as const, label: '🦆 Duck Out Animation', defaults: duckAnim },
        { key: 'hatTrickAnimation' as const, label: '🎩 Hat-Trick Animation', defaults: hatTrickAnim },
      ]).map(section => {
        const anim = config[section.key] || section.defaults;
        const updateAnim = (patch: Partial<AnimationConfig>) => {
          setConfig({ ...config, [section.key]: { ...anim, ...patch } });
        };
        const isCustom = anim.type !== 'css';
        return (
          <div key={section.key} className="scoring-admin__form-card">
            <h3 className="scoring-admin__subsection-title">{section.label}</h3>
            <div className="scoring-admin__form-grid">
              <div className="scoring-admin__field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={anim.enabled} onChange={e => updateAnim({ enabled: e.target.checked })} />
                  Enabled
                </label>
              </div>

              {/* Radio: Default vs Custom Upload */}
              <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>Animation Source</label>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name={`${section.key}_source`} checked={!isCustom} onChange={() => updateAnim({ type: 'css', mediaUrl: undefined, chromaKeyEnabled: false })} />
                    <span>Default (CSS Animation)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" name={`${section.key}_source`} checked={isCustom} onChange={() => updateAnim({ type: 'video' })} />
                    <span>Custom Upload (Video Overlay)</span>
                  </label>
                </div>
              </div>

              <div className="scoring-admin__field">
                <label>Duration (ms)</label>
                <input type="number" min={500} max={10000} step={100} value={anim.durationMs} onChange={e => updateAnim({ durationMs: Number(e.target.value) })} className="scoring-admin__input" />
              </div>
              <div className="scoring-admin__field">
                <label>Display Text</label>
                <input type="text" value={anim.text || ''} onChange={e => updateAnim({ text: e.target.value })} placeholder="e.g. FOUR!" className="scoring-admin__input" />
              </div>
              <div className="scoring-admin__field">
                <label>Accent Color</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="color" value={anim.color || '#22c55e'} onChange={e => updateAnim({ color: e.target.value })} />
                  <span className="scoring-admin__hint">{anim.color || '#22c55e'}</span>
                </div>
              </div>
              <div className="scoring-admin__field">
                <label>Scale ({(anim.scale || 1).toFixed(1)}x)</label>
                <input type="range" min={0.5} max={2} step={0.1} value={anim.scale || 1} onChange={e => updateAnim({ scale: Number(e.target.value) })} />
              </div>

              {/* Custom Upload Section */}
              {isCustom && (
                <>
                  <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                    <label>Upload Type</label>
                    <select value={anim.type} onChange={e => updateAnim({ type: e.target.value as AnimationConfig['type'] })} className="scoring-admin__select">
                      <option value="video">Video (.webm / .mp4)</option>
                      <option value="image">Image (.png / .gif)</option>
                      <option value="lottie">Lottie JSON</option>
                    </select>
                  </div>
                  <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                    <label>Media URL</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="text" value={anim.mediaUrl || ''} onChange={e => updateAnim({ mediaUrl: e.target.value })} placeholder={anim.type === 'lottie' ? 'Lottie JSON URL' : anim.type === 'video' ? 'Video URL (.webm / .mp4)' : 'Image URL (.png / .gif)'} className="scoring-admin__input" style={{ flex: 1 }} />
                      <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                        Upload
                        <input type="file" accept={anim.type === 'video' ? 'video/*' : anim.type === 'lottie' ? 'application/json' : 'image/*'} style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], section.key).then(() => {}).catch(() => {}); }} />
                      </label>
                    </div>
                  </div>

                  {/* Chroma Key Settings */}
                  {anim.type === 'video' && (
                    <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>🎬 Chroma Key (Background Removal)</label>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={anim.chromaKeyEnabled || false} onChange={e => updateAnim({ chromaKeyEnabled: e.target.checked })} />
                          <span>Enable Chroma Key</span>
                        </label>
                        {anim.chromaKeyEnabled && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <label>Key Color:</label>
                              <input type="color" value={anim.chromaKeyColor || '#00ff00'} onChange={e => updateAnim({ chromaKeyColor: e.target.value })} />
                              <span className="scoring-admin__hint">{anim.chromaKeyColor || '#00ff00'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <label>Similarity:</label>
                              <input type="range" min={0.1} max={0.8} step={0.05} value={anim.chromaKeySimilarity || 0.4} onChange={e => updateAnim({ chromaKeySimilarity: Number(e.target.value) })} style={{ width: 100 }} />
                              <span className="scoring-admin__hint">{(anim.chromaKeySimilarity || 0.4).toFixed(2)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <p className="scoring-admin__hint" style={{ marginTop: '0.3rem' }}>
                        Upload a video with a solid color background (green screen). Enable chroma key and pick the background color to remove it.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Preview */}
            {anim.type === 'css' && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: `${24 * (anim.scale || 1)}px`, fontWeight: 900, color: anim.color || '#22c55e', textShadow: `0 0 20px ${anim.color || '#22c55e'}80` }}>
                  {anim.text || 'PREVIEW'}
                </span>
                <p className="scoring-admin__hint" style={{ marginTop: 4 }}>CSS default • {anim.durationMs}ms</p>
              </div>
            )}
            {isCustom && anim.mediaUrl && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, textAlign: 'center' }}>
                {anim.type === 'video' ? (
                  <video src={anim.mediaUrl} autoPlay muted loop style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8 }} />
                ) : anim.type === 'image' ? (
                  <img src={anim.mediaUrl} alt="preview" style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, objectFit: 'contain' }} />
                ) : null}
                <p className="scoring-admin__hint" style={{ marginTop: 4 }}>
                  Custom {anim.type} • {anim.durationMs}ms
                  {anim.chromaKeyEnabled && ` • Chroma: ${anim.chromaKeyColor || '#00ff00'}`}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">❓ Live Questions (Q key)</h3>
        <p className="scoring-admin__hint">Queue trivia questions to display during the broadcast. Press Q in the overlay to show the next question.</p>

        {/* Audience Answer Link */}
        <div className="scoring-admin__field" style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: 8 }}>
          <label style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>📱 Audience Answer Link</label>
          <p className="scoring-admin__hint" style={{ marginBottom: '0.5rem' }}>Share this URL with the audience so they can vote on questions live. Append <code>?matchId=YOUR_MATCH_ID</code> for a specific match.</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="text" readOnly value={`${window.location.origin}${window.location.pathname.replace('/cricket/scorer/admin', '/cricket/scorer/live-question')}`} className="scoring-admin__input" style={{ flex: 1, fontSize: '0.8rem' }} />
            <button className="scoring-admin__btn scoring-admin__btn--secondary" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname.replace('/cricket/scorer/admin', '/cricket/scorer/live-question')}`); onFeedback('Audience link copied!'); }}>
              Copy
            </button>
          </div>
        </div>

        <div className="scoring-admin__form-grid" style={{ marginBottom: '1rem' }}>
          <div className="scoring-admin__field">
            <label>Question</label>
            <input type="text" value={newQ.text} onChange={e => setNewQ(q => ({ ...q, text: e.target.value }))} placeholder="Who scored the most runs...?" className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Options (comma-separated)</label>
            <input type="text" value={newQ.options} onChange={e => setNewQ(q => ({ ...q, options: e.target.value }))} placeholder="Option A, Option B, Option C" className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Duration (seconds)</label>
            <input type="number" min={5} max={60} value={newQ.duration} onChange={e => setNewQ(q => ({ ...q, duration: Number(e.target.value) }))} className="scoring-admin__input" />
          </div>
        </div>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={addQuestion}>
          <IoAdd size={16} /> Add Question
        </button>

        {liveQuestions.length > 0 && (
          <div className="scoring-admin__question-list">
            {liveQuestions.map((q, i) => (
              <div key={q.id} className="scoring-admin__question-card">
                <span className="scoring-admin__question-num">Q{i + 1}</span>
                <div className="scoring-admin__question-text">
                  <strong>{q.text}</strong>
                  {q.options && <span className="scoring-admin__question-options">{q.options.join(' · ')}</span>}
                </div>
                <span className="scoring-admin__question-duration">{q.duration}s</span>
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--danger" onClick={() => removeQuestion(q.id)}>
                  <IoTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">⌨️ OBS Overlay Keyboard Shortcuts</h3>
        <div className="scoring-admin__shortcuts-grid">
          {[
            { key: 'F', desc: 'Full Scorecard' },
            { key: '[', desc: 'Facing Batsman Stats' },
            { key: ']', desc: 'Non-Striker Stats' },
            { key: '; / \'', desc: 'Current Bowler Stats' },
            { key: '4', desc: 'Boundary Animation' },
            { key: '6', desc: 'Sixer Animation' },
            { key: 'W', desc: 'Wicket Alert' },
            { key: 'D', desc: 'Duck Out Overlay' },
            { key: 'H', desc: 'Hat-Trick Celebration' },
            { key: 'Q', desc: 'Live Question' },
            { key: 'ESC', desc: 'Dismiss All Overlays' },
          ].map(s => (
            <div key={s.key} className="scoring-admin__shortcut-item">
              <kbd className="scoring-admin__kbd">{s.key}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-MATCH TAB — Toss videos, squad reveal, impact players
// ═══════════════════════════════════════════════════════════════════════════════

function PreMatchTab({ matches, config, setConfig, onFeedback, soldPlayers }: {
  matches: MatchSetup[];
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
  soldPlayers: SoldPlayer[];
}) {
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [preMatchState, setPreMatchState] = useState<PreMatchState | null>(null);
  const [lineups, setLineups] = useState<{ teamA: MatchLineup | null; teamB: MatchLineup | null }>({ teamA: null, teamB: null });
  const [saving, setSaving] = useState(false);

  // Toss config state
  const [tossConfig, setTossConfig] = useState<TossConfig>({
    chromaKeyEnabled: true,
    chromaKeyColor: '#00FF00',
  });

  // Squad reveal config
  const [autoReveal, setAutoReveal] = useState(true);
  const [delayAfterToss, setDelayAfterToss] = useState(10);
  const [playerRevealInterval, setPlayerRevealInterval] = useState(2000);

  // Impact players
  const [impactPlayersA, setImpactPlayersA] = useState<ImpactPlayer[]>([]);
  const [impactPlayersB, setImpactPlayersB] = useState<ImpactPlayer[]>([]);

  const selectedMatch = matches.find(m => m.id === selectedMatchId);

  // Load pre-match state and lineups when match is selected
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsubs: (() => void)[] = [];

    try {
      unsubs.push(scoringService.subscribePreMatchState(selectedMatchId, (state) => {
        setPreMatchState(state);
        if (state.squadRevealConfig) {
          setAutoReveal(state.squadRevealConfig.autoReveal);
          setDelayAfterToss(state.squadRevealConfig.delayAfterTossSeconds);
          setPlayerRevealInterval(state.squadRevealConfig.playerRevealIntervalMs);
        }
        if (state.impactPlayers) {
          setImpactPlayersA(state.impactPlayers.teamA || []);
          setImpactPlayersB(state.impactPlayers.teamB || []);
        }
      }));
    } catch { /* not initialized */ }

    // Load lineups
    const loadLineups = async () => {
      if (!selectedMatch) return;
      try {
        const [lineupA, lineupB] = await Promise.all([
          scoringService.getLineup(selectedMatchId, selectedMatch.teamA.id),
          scoringService.getLineup(selectedMatchId, selectedMatch.teamB.id),
        ]);
        setLineups({ teamA: lineupA, teamB: lineupB });
      } catch { /* ignore */ }
    };
    loadLineups();

    return () => unsubs.forEach(u => u());
  }, [selectedMatchId, selectedMatch]);

  // Load toss config from overlay config
  useEffect(() => {
    if (config.tossConfig) {
      setTossConfig(config.tossConfig);
    }
  }, [config.tossConfig]);

  const handleSaveTossConfig = async () => {
    setSaving(true);
    try {
      await scoringService.saveOverlayConfig({ ...config, tossConfig });
      setConfig({ ...config, tossConfig });
      onFeedback('Toss video config saved');
    } catch { onFeedback('Failed to save toss config'); }
    finally { setSaving(false); }
  };

  const handleUploadVideo = async (file: File, field: 'headsVideoUrl' | 'tailsVideoUrl') => {
    try {
      const url = await uploadFileToStorage(file, `media/scoring/toss/${field}-${Date.now()}`);
      setTossConfig(prev => ({ ...prev, [field]: url }));
      onFeedback(`${field === 'headsVideoUrl' ? 'Heads' : 'Tails'} video uploaded`);
    } catch { onFeedback('Upload failed'); }
  };

  const handleSavePreMatch = async () => {
    if (!selectedMatchId || !selectedMatch) { onFeedback('Select a match first'); return; }
    setSaving(true);
    try {
      const state: PreMatchState = {
        matchId: selectedMatchId,
        phase: preMatchState?.phase || 'idle',
        tossResult: preMatchState?.tossResult,
        squadRevealConfig: {
          autoReveal,
          delayAfterTossSeconds: delayAfterToss,
          playerRevealIntervalMs: playerRevealInterval,
        },
        impactPlayers: {
          teamA: impactPlayersA.slice(0, 4),
          teamB: impactPlayersB.slice(0, 4),
        },
        revealedPlayersTeamA: preMatchState?.revealedPlayersTeamA || [],
        revealedPlayersTeamB: preMatchState?.revealedPlayersTeamB || [],
        lastUpdated: Date.now(),
      };
      await scoringService.savePreMatchState(selectedMatchId, state);
      onFeedback('Pre-match config saved');
    } catch { onFeedback('Failed to save pre-match config'); }
    finally { setSaving(false); }
  };

  const handleTriggerPhase = async (phase: PreMatchState['phase']) => {
    if (!selectedMatchId) { onFeedback('Select a match first'); return; }
    try {
      await scoringService.updatePreMatchPhase(selectedMatchId, phase);
      onFeedback(`Phase: ${phase}`);
    } catch { onFeedback('Failed to update phase'); }
  };

  const handleSetTossResult = async (wonBy: string, elected: 'bat' | 'bowl', coinSide: 'heads' | 'tails') => {
    if (!selectedMatchId) return;
    try {
      const base: PreMatchState = preMatchState || {
        matchId: selectedMatchId,
        phase: 'idle' as const,
        squadRevealConfig: { autoReveal: true, delayAfterTossSeconds: 10, playerRevealIntervalMs: 2000 },
        impactPlayers: { teamA: [], teamB: [] },
        revealedPlayersTeamA: [],
        revealedPlayersTeamB: [],
        lastUpdated: Date.now(),
      };
      await scoringService.savePreMatchState(selectedMatchId, {
        ...base,
        tossResult: { wonBy, elected, coinSide },
        phase: 'toss_animation',
        lastUpdated: Date.now(),
      });
      // Also update the match setup
      await scoringService.updateMatch(selectedMatchId, { tossWonBy: wonBy, tossElected: elected });
      onFeedback('Toss result set');
    } catch { onFeedback('Failed to save toss result'); }
  };

  const addImpactPlayer = (team: 'A' | 'B', player: ImpactPlayer) => {
    if (team === 'A') {
      if (impactPlayersA.length >= 4) { onFeedback('Maximum 4 impact players per team'); return; }
      setImpactPlayersA(prev => [...prev, player]);
    } else {
      if (impactPlayersB.length >= 4) { onFeedback('Maximum 4 impact players per team'); return; }
      setImpactPlayersB(prev => [...prev, player]);
    }
  };

  const removeImpactPlayer = (team: 'A' | 'B', playerId: string) => {
    if (team === 'A') setImpactPlayersA(prev => prev.filter(p => p.playerId !== playerId));
    else setImpactPlayersB(prev => prev.filter(p => p.playerId !== playerId));
  };

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Pre-Match Setup</h2>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSavePreMatch} disabled={saving}>
          <IoSave size={16} /> Save All
        </button>
      </div>

      {/* Match Selector */}
      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">🏏 Select Match</h3>
        <div className="scoring-admin__field" style={{ maxWidth: 500 }}>
          <select value={selectedMatchId} onChange={e => setSelectedMatchId(e.target.value)} className="scoring-admin__select">
            <option value="">Select a match...</option>
            {matches.map(m => (
              <option key={m.id} value={m.id}>{m.teamA.name} vs {m.teamB.name} — {new Date(m.date).toLocaleDateString()}</option>
            ))}
          </select>
        </div>
        {preMatchState && (
          <div style={{ marginTop: '0.75rem' }}>
            <span className="scoring-admin__hint">Current phase: <strong>{preMatchState.phase}</strong></span>
          </div>
        )}
      </div>

      {/* Phase Controls */}
      {selectedMatchId && (
        <div className="scoring-admin__form-card">
          <h3 className="scoring-admin__subsection-title">🎬 Overlay Phase Controls</h3>
          <p className="scoring-admin__hint">Trigger each phase manually for the OBS overlay. Phases play in sequence on the broadcast.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            {([
              { phase: 'squad_display' as const, label: 'Show Squads', color: '#3b82f6' },
              { phase: 'toss_animation' as const, label: 'Toss Animation', color: '#f59e0b' },
              { phase: 'toss_result' as const, label: 'Toss Result', color: '#10b981' },
              { phase: 'squad_reveal_teamA' as const, label: 'Reveal Team A', color: '#8b5cf6' },
              { phase: 'squad_reveal_teamB' as const, label: 'Reveal Team B', color: '#ec4899' },
              { phase: 'impact_players' as const, label: 'Impact Players', color: '#ef4444' },
              { phase: 'match_ready' as const, label: 'Match Ready', color: '#22c55e' },
              { phase: 'idle' as const, label: 'Reset (Idle)', color: '#6b7280' },
            ]).map(item => (
              <button
                key={item.phase}
                className="scoring-admin__btn scoring-admin__btn--sm"
                style={{ background: preMatchState?.phase === item.phase ? item.color : undefined, color: preMatchState?.phase === item.phase ? '#fff' : undefined }}
                onClick={() => handleTriggerPhase(item.phase)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toss Video Config */}
      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">🪙 Toss Animation Videos</h3>
        <p className="scoring-admin__hint">Upload coin flip videos. A chroma green matte filter will be applied in the overlay for transparent background.</p>
        <div className="scoring-admin__form-grid">
          <div className="scoring-admin__field">
            <label>Heads Video</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={tossConfig.headsVideoUrl || ''} onChange={e => setTossConfig(prev => ({ ...prev, headsVideoUrl: e.target.value }))} placeholder="Video URL" className="scoring-admin__input" style={{ flex: 1 }} />
              <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadVideo(e.target.files[0], 'headsVideoUrl'); }} />
              </label>
            </div>
          </div>
          <div className="scoring-admin__field">
            <label>Tails Video</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" value={tossConfig.tailsVideoUrl || ''} onChange={e => setTossConfig(prev => ({ ...prev, tailsVideoUrl: e.target.value }))} placeholder="Video URL" className="scoring-admin__input" style={{ flex: 1 }} />
              <label className="scoring-admin__btn scoring-admin__btn--secondary" style={{ cursor: 'pointer' }}>
                Upload
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUploadVideo(e.target.files[0], 'tailsVideoUrl'); }} />
              </label>
            </div>
          </div>
          <div className="scoring-admin__field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={tossConfig.chromaKeyEnabled} onChange={e => setTossConfig(prev => ({ ...prev, chromaKeyEnabled: e.target.checked }))} />
              Enable Chroma Key (Green Screen)
            </label>
          </div>
          <div className="scoring-admin__field">
            <label>Chroma Key Color</label>
            <input type="color" value={tossConfig.chromaKeyColor} onChange={e => setTossConfig(prev => ({ ...prev, chromaKeyColor: e.target.value }))} />
          </div>
          <div className="scoring-admin__field">
            <label>Chroma Key Sensitivity (0.1 - 1.0)</label>
            <input type="number" min="0.1" max="1" step="0.05" value={tossConfig.chromaKeySimilarity || 0.4} onChange={e => setTossConfig(prev => ({ ...prev, chromaKeySimilarity: parseFloat(e.target.value) || 0.4 }))} className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Toss Display Duration (seconds)</label>
            <input type="number" min="3" max="30" step="1" value={tossConfig.tossDurationSeconds || 5} onChange={e => setTossConfig(prev => ({ ...prev, tossDurationSeconds: parseInt(e.target.value) || 5 }))} className="scoring-admin__input" />
          </div>
        </div>
        <div className="scoring-admin__form-actions">
          <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSaveTossConfig} disabled={saving}>
            <IoSave size={16} /> Save Toss Config
          </button>
        </div>
      </div>

      {/* Toss Result */}
      {selectedMatch && (
        <div className="scoring-admin__form-card">
          <h3 className="scoring-admin__subsection-title">🏆 Set Toss Result</h3>
          {preMatchState?.tossResult ? (
            <div className="scoring-admin__hint" style={{ marginBottom: '0.75rem' }}>
              Toss won by: <strong>{preMatchState.tossResult.wonBy === selectedMatch.teamA.id ? selectedMatch.teamA.name : selectedMatch.teamB.name}</strong> —
              Elected to <strong>{preMatchState.tossResult.elected}</strong> —
              Coin: <strong>{preMatchState.tossResult.coinSide}</strong>
            </div>
          ) : (
            <p className="scoring-admin__hint">Select who won the toss and their choice.</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[selectedMatch.teamA, selectedMatch.teamB].map(team => (
              ['bat' as const, 'bowl' as const].map(choice => (
                ['heads' as const, 'tails' as const].map(coin => (
                  <button
                    key={`${team.id}-${choice}-${coin}`}
                    className="scoring-admin__btn scoring-admin__btn--sm"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => handleSetTossResult(team.id, choice, coin)}
                  >
                    {team.name} — {choice} ({coin})
                  </button>
                ))
              ))
            ))}
          </div>
        </div>
      )}

      {/* Squad Reveal Config */}
      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">👥 Squad Reveal Config</h3>
        <div className="scoring-admin__form-grid">
          <div className="scoring-admin__field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={autoReveal} onChange={e => setAutoReveal(e.target.checked)} />
              Auto-reveal squad after toss
            </label>
          </div>
          <div className="scoring-admin__field">
            <label>Delay after toss (seconds)</label>
            <input type="number" min={1} max={120} value={delayAfterToss} onChange={e => setDelayAfterToss(Number(e.target.value))} className="scoring-admin__input" />
          </div>
          <div className="scoring-admin__field">
            <label>Player reveal interval (ms)</label>
            <input type="number" min={500} max={5000} step={100} value={playerRevealInterval} onChange={e => setPlayerRevealInterval(Number(e.target.value))} className="scoring-admin__input" />
          </div>
        </div>
      </div>

      {/* Impact Players */}
      {selectedMatch && (
        <div className="scoring-admin__form-card">
          <h3 className="scoring-admin__subsection-title">⚡ Impact Substitutes (from remaining squad)</h3>
          <p className="scoring-admin__hint">Select up to 4 impact substitutes per team from players NOT in the playing XI. These will be shown in squad reveal and match view.</p>

          {/* Team A Impact Players */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ color: selectedMatch.teamA.primaryColor || '#3b82f6', margin: '0 0 0.5rem' }}>{selectedMatch.teamA.name} — Impact Subs</h4>
            <div className="scoring-admin__impact-list">
              {impactPlayersA.map(p => (
                <div key={p.playerId} className="scoring-admin__impact-item">
                  <span>{p.playerName} ({p.role})</span>
                  <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--danger" onClick={() => removeImpactPlayer('A', p.playerId)}>
                    <IoTrash size={14} />
                  </button>
                </div>
              ))}
              {impactPlayersA.length < 4 && (() => {
                const playingXIIds = new Set((lineups.teamA?.players || []).map(p => p.playerId));
                const remainingSquad = soldPlayers
                  .filter(p => (p.teamId === selectedMatch.teamA.id || p.teamName === selectedMatch.teamA.name) && !playingXIIds.has(p.id))
                  .filter(p => !impactPlayersA.some(ip => ip.playerId === p.id));
                return remainingSquad.length > 0 ? (
                  <select
                    className="scoring-admin__select"
                    onChange={e => {
                      const player = remainingSquad.find(p => p.id === e.target.value);
                      if (player) {
                        addImpactPlayer('A', { playerId: player.id, playerName: player.name, role: player.role || 'Unknown', imageUrl: player.imageUrl });
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">+ Add impact sub from remaining squad...</option>
                    {remainingSquad.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role || 'Unknown'})</option>)}
                  </select>
                ) : (
                  <span className="scoring-admin__hint">
                    {lineups.teamA ? 'No remaining players in squad (all in playing XI)' : 'Save lineup first to see remaining squad'}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Team B Impact Players */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ color: selectedMatch.teamB.primaryColor || '#ef4444', margin: '0 0 0.5rem' }}>{selectedMatch.teamB.name} — Impact Subs</h4>
            <div className="scoring-admin__impact-list">
              {impactPlayersB.map(p => (
                <div key={p.playerId} className="scoring-admin__impact-item">
                  <span>{p.playerName} ({p.role})</span>
                  <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--danger" onClick={() => removeImpactPlayer('B', p.playerId)}>
                    <IoTrash size={14} />
                  </button>
                </div>
              ))}
              {impactPlayersB.length < 4 && (() => {
                const playingXIIds = new Set((lineups.teamB?.players || []).map(p => p.playerId));
                const remainingSquad = soldPlayers
                  .filter(p => (p.teamId === selectedMatch.teamB.id || p.teamName === selectedMatch.teamB.name) && !playingXIIds.has(p.id))
                  .filter(p => !impactPlayersB.some(ip => ip.playerId === p.id));
                return remainingSquad.length > 0 ? (
                  <select
                    className="scoring-admin__select"
                    onChange={e => {
                      const player = remainingSquad.find(p => p.id === e.target.value);
                      if (player) {
                        addImpactPlayer('B', { playerId: player.id, playerName: player.name, role: player.role || 'Unknown', imageUrl: player.imageUrl });
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="">+ Add impact sub from remaining squad...</option>
                    {remainingSquad.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role || 'Unknown'})</option>)}
                  </select>
                ) : (
                  <span className="scoring-admin__hint">
                    {lineups.teamB ? 'No remaining players in squad (all in playing XI)' : 'Save lineup first to see remaining squad'}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Pre-Match Sequence Info */}
      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">📋 Broadcast Sequence</h3>
        <div className="scoring-admin__shortcuts-grid">
          {[
            { step: '1', desc: 'Squad Display — Show both teams\' full squads' },
            { step: '2', desc: 'Toss Animation — Coin flip video with chroma key' },
            { step: '3', desc: 'Toss Result — Winner & batting/bowling choice' },
            { step: '4', desc: 'Squad Reveal (Team A) — Animated player-by-player' },
            { step: '5', desc: 'Squad Reveal (Team B) — Animated player-by-player' },
            { step: '6', desc: 'Impact Players — 4 per team on right side' },
            { step: '7', desc: 'Match Ready — Transition to live scoring' },
          ].map(s => (
            <div key={s.step} className="scoring-admin__shortcut-item">
              <kbd className="scoring-admin__kbd">{s.step}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD SELECTION MODAL — Pick Playing XI from auctioned players
// ═══════════════════════════════════════════════════════════════════════════════

function SquadSelectionModal({ match, soldPlayers, onSave, onClose }: {
  match: MatchSetup;
  soldPlayers: SoldPlayer[];
  onSave: (matchId: string, lineupA: MatchLineup, lineupB: MatchLineup, impactA: ImpactPlayer[], impactB: ImpactPlayer[]) => void;
  onClose: () => void;
}) {
  const [activeTeam, setActiveTeam] = useState<'A' | 'B'>('A');
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [captainA, setCaptainA] = useState('');
  const [captainB, setCaptainB] = useState('');
  const [wkA, setWkA] = useState('');
  const [wkB, setWkB] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(false);

  const teamAPlayers = soldPlayers.filter(p => p.teamId === match.teamA.id || p.teamName === match.teamA.name);
  const teamBPlayers = soldPlayers.filter(p => p.teamId === match.teamB.id || p.teamName === match.teamB.name);

  // Load existing lineups, or pre-select default playing 11
  useEffect(() => {
    if (loadedExisting) return;
    const loadLineups = async () => {
      try {
        const [la, lb] = await Promise.all([
          scoringService.getLineup(match.id, match.teamA.id),
          scoringService.getLineup(match.id, match.teamB.id),
        ]);
        if (la && la.players.length > 0) {
          setSelectedA(la.players.map(p => p.playerId));
          const cap = la.players.find(p => p.isCaptain);
          const wk = la.players.find(p => p.isWicketKeeper);
          if (cap) setCaptainA(cap.playerId);
          if (wk) setWkA(wk.playerId);
        } else {
          // Auto-select first 11 players as default playing XI
          setSelectedA(teamAPlayers.slice(0, 11).map(p => p.id));
        }
        if (lb && lb.players.length > 0) {
          setSelectedB(lb.players.map(p => p.playerId));
          const cap = lb.players.find(p => p.isCaptain);
          const wk = lb.players.find(p => p.isWicketKeeper);
          if (cap) setCaptainB(cap.playerId);
          if (wk) setWkB(wk.playerId);
        } else {
          // Auto-select first 11 players as default playing XI
          setSelectedB(teamBPlayers.slice(0, 11).map(p => p.id));
        }
      } catch {
        // No existing lineups — pre-select defaults
        setSelectedA(teamAPlayers.slice(0, 11).map(p => p.id));
        setSelectedB(teamBPlayers.slice(0, 11).map(p => p.id));
      }
      setLoadedExisting(true);
    };
    loadLineups();
  }, [match.id, match.teamA.id, match.teamB.id, loadedExisting]);

  const togglePlayer = (playerId: string, team: 'A' | 'B') => {
    const setter = team === 'A' ? setSelectedA : setSelectedB;
    const selected = team === 'A' ? selectedA : selectedB;
    if (selected.includes(playerId)) {
      setter(selected.filter(id => id !== playerId));
      if (team === 'A' && captainA === playerId) setCaptainA('');
      if (team === 'A' && wkA === playerId) setWkA('');
      if (team === 'B' && captainB === playerId) setCaptainB('');
      if (team === 'B' && wkB === playerId) setWkB('');
    } else {
      setter([...selected, playerId]);
    }
  };

  const selectAll = (team: 'A' | 'B') => {
    const players = team === 'A' ? teamAPlayers : teamBPlayers;
    const setter = team === 'A' ? setSelectedA : setSelectedB;
    setter(players.map(p => p.id));
  };

  const buildLineup = (teamId: string, players: SoldPlayer[], selected: string[], captain: string, wk: string): MatchLineup => ({
    matchId: match.id,
    teamId,
    players: selected.map((id, idx) => {
      const p = players.find(pl => pl.id === id);
      return {
        playerId: id,
        playerName: p?.name || 'Unknown',
        role: p?.role || 'Uncategorized',
        battingOrder: idx + 1,
        isCaptain: id === captain,
        isWicketKeeper: id === wk,
        isImpactSub: idx >= 11,
      };
    }),
  });

  const buildImpactPlayers = (players: SoldPlayer[], selected: string[]): ImpactPlayer[] => (
    selected.slice(11, 15).map((id) => {
      const p = players.find(pl => pl.id === id);
      return {
        playerId: id,
        playerName: p?.name || 'Unknown',
        role: p?.role || 'Uncategorized',
        imageUrl: p?.imageUrl,
      };
    })
  );

  const handleSave = async () => {
    if (selectedA.length === 0 && selectedB.length === 0) return;
    setSaving(true);
    const lineupA = buildLineup(match.teamA.id, teamAPlayers, selectedA, captainA, wkA);
    const lineupB = buildLineup(match.teamB.id, teamBPlayers, selectedB, captainB, wkB);
    const impactA = buildImpactPlayers(teamAPlayers, selectedA);
    const impactB = buildImpactPlayers(teamBPlayers, selectedB);
    await onSave(match.id, lineupA, lineupB, impactA, impactB);
    setSaving(false);
  };

  useEffect(() => {
    if (captainA && selectedA.indexOf(captainA) >= 11) setCaptainA('');
    if (wkA && selectedA.indexOf(wkA) >= 11) setWkA('');
  }, [selectedA, captainA, wkA]);

  useEffect(() => {
    if (captainB && selectedB.indexOf(captainB) >= 11) setCaptainB('');
    if (wkB && selectedB.indexOf(wkB) >= 11) setWkB('');
  }, [selectedB, captainB, wkB]);

  const renderTeamSquad = (team: 'A' | 'B') => {
    const teamInfo = team === 'A' ? match.teamA : match.teamB;
    const players = team === 'A' ? teamAPlayers : teamBPlayers;
    const selected = team === 'A' ? selectedA : selectedB;
    const captain = team === 'A' ? captainA : captainB;
    const wk = team === 'A' ? wkA : wkB;
    const setCaptain = team === 'A' ? setCaptainA : setCaptainB;
    const setWk = team === 'A' ? setWkA : setWkB;

    return (
      <div className="squad-modal__team">
        <div className="squad-modal__team-header" style={{ borderColor: teamInfo.primaryColor || '#3b82f6' }}>
          {teamInfo.logoUrl && <img src={teamInfo.logoUrl} alt="" className="squad-modal__team-logo" />}
          <div>
            <h3 className="squad-modal__team-name" style={{ color: teamInfo.primaryColor || '#3b82f6' }}>{teamInfo.name}</h3>
            <span className="squad-modal__count">
              XI: {Math.min(selected.length, 11)}/11 · Impact: {Math.max(0, selected.length - 11)} · {players.length} available
            </span>
          </div>
          {players.length >= 11 && selected.length === 0 && (
            <button className="scoring-admin__btn scoring-admin__btn--sm" onClick={() => selectAll(team)}>Select All Squad</button>
          )}
        </div>

        <div className="squad-modal__players">
          {players.map(p => {
            const isSelected = selected.includes(p.id);
            const isCap = captain === p.id;
            const isWk = wk === p.id;
            const selectedIndex = selected.indexOf(p.id);
            const isImpactCandidate = isSelected && selectedIndex >= 11;
            return (
              <div
                key={p.id}
                className={`squad-modal__player ${isSelected ? 'squad-modal__player--selected' : ''}`}
                onClick={() => togglePlayer(p.id, team)}
              >
                <div className="squad-modal__player-check">
                  {isSelected ? String(selectedIndex + 1) : ''}
                </div>
                <div className="squad-modal__player-info">
                  <span className="squad-modal__player-name">{p.name}</span>
                  <span className="squad-modal__player-role">{p.role}</span>
                </div>
                <div className="squad-modal__player-badges">
                  {isCap && <span className="squad-modal__badge squad-modal__badge--cap">C</span>}
                  {isWk && <span className="squad-modal__badge squad-modal__badge--wk">WK</span>}
                  {isImpactCandidate && <span className="squad-modal__badge">IMPACT</span>}
                </div>
                {isSelected && !isImpactCandidate && (
                  <div className="squad-modal__player-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className={`squad-modal__role-btn ${isCap ? 'active' : ''}`}
                      onClick={() => setCaptain(isCap ? '' : p.id)}
                      title="Captain"
                    >C</button>
                    <button
                      className={`squad-modal__role-btn ${isWk ? 'active' : ''}`}
                      onClick={() => setWk(isWk ? '' : p.id)}
                      title="Wicket Keeper"
                    >WK</button>
                  </div>
                )}
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="squad-modal__empty">No sold players found for this team. Complete the auction first.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div className="squad-modal__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="squad-modal" initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} onClick={e => e.stopPropagation()}>
        <div className="squad-modal__header">
          <div>
            <h2 className="squad-modal__title">Select Playing XI + Impact Subs</h2>
            <p className="squad-modal__subtitle">{match.teamA.name} vs {match.teamB.name} · {match.venue}</p>
          </div>
          <button className="scoring-admin__close-btn" onClick={onClose}><IoClose size={20} /></button>
        </div>

        <div className="squad-modal__team-tabs">
          <button className={`squad-modal__team-tab ${activeTeam === 'A' ? 'active' : ''}`} style={{ '--tab-color': match.teamA.primaryColor || '#3b82f6' } as React.CSSProperties} onClick={() => setActiveTeam('A')}>
            {match.teamA.name} ({selectedA.length})
          </button>
          <button className={`squad-modal__team-tab ${activeTeam === 'B' ? 'active' : ''}`} style={{ '--tab-color': match.teamB.primaryColor || '#ef4444' } as React.CSSProperties} onClick={() => setActiveTeam('B')}>
            {match.teamB.name} ({selectedB.length})
          </button>
        </div>

        <div className="squad-modal__body">
          <div className="squad-modal__desktop-grid">
            {renderTeamSquad('A')}
            <div className="squad-modal__divider" />
            {renderTeamSquad('B')}
          </div>
          <div className="squad-modal__mobile-view">
            {renderTeamSquad(activeTeam)}
          </div>
        </div>

        <div className="squad-modal__footer">
          <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave} disabled={saving}>
            <IoSave size={16} /> {saving ? 'Saving...' : 'Save Squad'}
          </button>
          <button className="scoring-admin__btn scoring-admin__btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TICKER CONFIG TAB
// ═══════════════════════════════════════════════════════════════════════════════

function TickerTab({ config, setConfig, onFeedback }: {
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const ticker = config.tickerConfig || {
    mode: 'html' as const,
    position: 'bottom' as const,
    height: 120,
    showBowlerOnRight: true,
    animationSpeed: 500,
    widgetModes: ['run_rate'] as TickerStatWidget[],
    projectionRpos: [9, 12, 14],
  };

  const activeWidgetModes = ticker.widgetModes && ticker.widgetModes.length > 0
    ? ticker.widgetModes
    : (ticker.infoMode === 'target' ? ['chase'] : ticker.infoMode === 'projection' ? ['projection'] : ['run_rate']);

  const projectionRatesText = (ticker.projectionRpos && ticker.projectionRpos.length > 0
    ? ticker.projectionRpos
    : [9, 12, 14]).join(', ');

  const updateTicker = (updates: Partial<TickerConfig>) => {
    const updated = { ...ticker, ...updates };
    setConfig({ ...config, tickerConfig: updated });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await scoringService.saveOverlayConfig(config);
      onFeedback('Ticker config saved');
    } catch (err) {
      onFeedback(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scoring-admin__section">
      <h2 className="scoring-admin__section-title"><IoDesktop size={20} /> Scorecard Ticker</h2>
      <p className="scoring-admin__section-desc">Configure the bottom-of-screen ticker bar for OBS broadcast</p>

      <div className="scoring-admin__form-grid">
        <div className="scoring-admin__field">
          <label>Design</label>
          <select
            className="scoring-admin__select"
            value={ticker.design || 'glass'}
            onChange={e => updateTicker({ design: e.target.value as 'glass' | 'premium' })}
          >
            <option value="glass">Glass (Light frosted panels)</option>
            <option value="premium">Premium Gold (Dark purple &amp; gold)</option>
          </select>
        </div>

        <div className="scoring-admin__field">
          <label>Mode</label>
          <select
            className="scoring-admin__select"
            value={ticker.mode}
            onChange={e => updateTicker({ mode: e.target.value as 'html' | 'png' })}
          >
            <option value="html">HTML/CSS (animated)</option>
            <option value="png">PNG Template (static)</option>
          </select>
        </div>

        <div className="scoring-admin__field">
          <label>Position</label>
          <select
            className="scoring-admin__select"
            value={ticker.position}
            onChange={e => updateTicker({ position: e.target.value as 'top' | 'bottom' })}
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>

        <div className="scoring-admin__field">
          <label>Height (px)</label>
          <input
            type="number"
            className="scoring-admin__input"
            value={ticker.height}
            onChange={e => updateTicker({ height: Number(e.target.value) })}
          />
        </div>

        <div className="scoring-admin__field">
          <label>Animation Speed (ms)</label>
          <input
            type="number"
            className="scoring-admin__input"
            value={ticker.animationSpeed}
            onChange={e => updateTicker({ animationSpeed: Number(e.target.value) })}
          />
        </div>

        <div className="scoring-admin__field scoring-admin__field--checkbox">
          <label>
            <input
              type="checkbox"
              checked={ticker.showBowlerOnRight !== false}
              onChange={e => updateTicker({ showBowlerOnRight: e.target.checked })}
            />
            Show bowler stats on right side
          </label>
        </div>

        <div className="scoring-admin__field">
          <label>Dot Ball Symbol</label>
          <select
            className="scoring-admin__select"
            value={ticker.dotBallSymbol || '0'}
            onChange={e => updateTicker({ dotBallSymbol: e.target.value })}
          >
            <option value="0">0 (default)</option>
            <option value="•">• (dot)</option>
            <option value="🌳">🌳 (tree)</option>
            <option value="🌲">🌲 (evergreen)</option>
            <option value="🍃">🍃 (leaf)</option>
            <option value="❌">❌ (cross)</option>
            <option value="⚫">⚫ (black circle)</option>
            <option value="🔴">🔴 (red circle)</option>
          </select>
          <p className="scoring-admin__help">Symbol shown for dot balls in the over tracker</p>
        </div>

        <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
          <label>Score Row Widgets (can enable one or multiple)</label>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {([
              { key: 'run_rate', label: 'Run Rate (CRR / RRR)' },
              { key: 'projection', label: 'Projected Scores' },
              { key: 'chase', label: 'Runs/Balls to Win (2nd inns)' },
            ] as Array<{ key: TickerStatWidget; label: string }>).map(widget => (
              <label key={widget.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={activeWidgetModes.includes(widget.key)}
                  onChange={e => {
                    const nextSet = new Set(activeWidgetModes);
                    if (e.target.checked) nextSet.add(widget.key);
                    else nextSet.delete(widget.key);
                    const next = Array.from(nextSet) as TickerStatWidget[];
                    updateTicker({ widgetModes: next.length > 0 ? next : ['run_rate'] });
                  }}
                />
                {widget.label}
              </label>
            ))}
          </div>
          <p className="scoring-admin__help">Enabled widgets are rendered dynamically with adaptive spacing in premium ticker mode.</p>
        </div>

        <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
          <label>Projection RPO Options (comma-separated)</label>
          <input
            type="text"
            className="scoring-admin__input"
            value={projectionRatesText}
            onChange={e => {
              const parsed = e.target.value
                .split(',')
                .map(v => Number(v.trim()))
                .filter(v => Number.isFinite(v) && v > 0)
                .slice(0, 6);
              updateTicker({ projectionRpos: parsed.length > 0 ? parsed : [9, 12, 14] });
            }}
            placeholder="9, 12, 14"
          />
          <p className="scoring-admin__help">Used for alternate projection lines (for example 9/12/14 RPO).</p>
        </div>
      </div>

      {ticker.mode === 'html' && (
        <div className="scoring-admin__field scoring-admin__field--full">
          <label>Custom CSS (optional)</label>
          <textarea
            className="scoring-admin__textarea"
            rows={6}
            value={ticker.customCSS || ''}
            onChange={e => updateTicker({ customCSS: e.target.value })}
            placeholder={`.ticker { background: linear-gradient(to right, #1a1a2e, #16213e); }\n.ticker__score { font-size: 28px; }`}
          />
        </div>
      )}

      {ticker.mode === 'png' && (
        <div className="scoring-admin__field scoring-admin__field--full">
          <label>PNG Template URL</label>
          <input
            type="text"
            className="scoring-admin__input"
            value={ticker.pngTemplateUrl || ''}
            onChange={e => updateTicker({ pngTemplateUrl: e.target.value })}
            placeholder="https://storage.googleapis.com/..."
          />
          <p className="scoring-admin__help">Upload a PNG template with transparent areas where score data will be overlaid</p>
        </div>
      )}

      <div className="scoring-admin__actions">
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave} disabled={saving}>
          <IoSave size={16} /> {saving ? 'Saving...' : 'Save Ticker Config'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS & MVP TAB
// ═══════════════════════════════════════════════════════════════════════════════

function StatsTab({ config, setConfig, onFeedback }: {
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const weights: MVPWeights = config.mvpWeights || DEFAULT_MVP_WEIGHTS;

  const updateWeights = (updates: Partial<MVPWeights>) => {
    const updated = { ...weights, ...updates };
    setConfig({ ...config, mvpWeights: updated });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await scoringService.saveOverlayConfig(config);
      onFeedback('Stats config saved');
    } catch (err) {
      onFeedback(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scoring-admin__section">
      <h2 className="scoring-admin__section-title"><IoTrophy size={20} /> Stats & MVP Points</h2>
      <p className="scoring-admin__section-desc">Configure MVP point weights for real-time stats engine</p>

      <h3 className="scoring-admin__subsection-title">MVP Point Weights</h3>
      <div className="scoring-admin__form-grid scoring-admin__form-grid--3col">
        {Object.entries(weights).map(([key, value]) => (
          <div key={key} className="scoring-admin__field">
            <label>{formatWeightLabel(key)}</label>
            <input
              type="number"
              className="scoring-admin__input"
              value={value}
              onChange={e => updateWeights({ [key]: Number(e.target.value) } as Partial<MVPWeights>)}
              step={0.5}
              min={0}
            />
          </div>
        ))}
      </div>

      <div className="scoring-admin__field">
        <label>Min Balls for Strike Rate Bonus</label>
        <input
          type="number"
          className="scoring-admin__input"
          value={config.minBallsForSR || 4}
          onChange={e => setConfig({ ...config, minBallsForSR: Number(e.target.value) })}
          min={1}
        />
        <p className="scoring-admin__help">Batsmen must face at least this many balls to qualify for strike rate bonus</p>
      </div>

      <div className="scoring-admin__field scoring-admin__field--checkbox">
        <label>
          <input
            type="checkbox"
            checked={config.impactSubEnabled || false}
            onChange={e => setConfig({ ...config, impactSubEnabled: e.target.checked })}
          />
          Enable Impact Sub (decided at match time)
        </label>
        <p className="scoring-admin__help">When enabled, teams can substitute one player during the match</p>
      </div>

      <div className="scoring-admin__actions">
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave} disabled={saving}>
          <IoSave size={16} /> {saving ? 'Saving...' : 'Save Stats Config'}
        </button>
      </div>
    </div>
  );
}

function formatWeightLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBS WEBSOCKET TAB
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_BUTTON_ICONS = ['▶', '⏸', '⏩', '⏪', '⏭', '⏮', '⏯', '📹', '🔍', '💾', '🎬', '⚡'];
const DEFAULT_BUTTON_COLORS = ['#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#f97316', '#64748b'];

interface HotkeyDescriptor {
  raw: string;
  group: string;
  title: string;
  context: string;
}

function describeHotkey(rawHotkey: string): HotkeyDescriptor {
  const [namespace = 'general', ...rest] = rawHotkey.split('.');
  const tail = rest.length > 0 ? rest.join('.') : rawHotkey;
  const words = tail
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  let group = 'General';
  if (namespace.toLowerCase().includes('replaysource')) group = 'Replay Source Plugin';
  else if (namespace.toLowerCase().includes('obsbasic')) group = 'OBS Core';
  else if (namespace.toLowerCase().includes('libobs')) group = 'OBS Sources/Audio';

  const contextParts: string[] = [];
  contextParts.push(`Namespace: ${namespace}`);

  const lowered = rawHotkey.toLowerCase();
  if (lowered.includes('scene')) contextParts.push('Context: Scene control');
  else if (lowered.includes('source')) contextParts.push('Context: Source control');
  else if (lowered.includes('audio') || lowered.includes('mute')) contextParts.push('Context: Audio control');
  else if (lowered.includes('stream') || lowered.includes('record')) contextParts.push('Context: Stream/record control');

  return {
    raw: rawHotkey,
    group,
    title: words || rawHotkey,
    context: contextParts.join(' · '),
  };
}

function OBSWebSocketTab({ config, setConfig, onFeedback, baseUrl }: {
  config: ScoringOverlayConfig;
  setConfig: (c: ScoringOverlayConfig) => void;
  onFeedback: (msg: string) => void;
  baseUrl: string;
}) {
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'error'>('disconnected');
  const [availableHotkeys, setAvailableHotkeys] = useState<string[]>([]);
  const [discoveringHotkeys, setDiscoveringHotkeys] = useState(false);
  const [editingButtonIdx, setEditingButtonIdx] = useState<number | null>(null);

  const groupedHotkeys = useMemo(() => {
    const grouped = new Map<string, HotkeyDescriptor[]>();
    for (const hotkey of availableHotkeys) {
      const descriptor = describeHotkey(hotkey);
      const list = grouped.get(descriptor.group) || [];
      list.push(descriptor);
      grouped.set(descriptor.group, list);
    }
    return Array.from(grouped.entries())
      .map(([group, items]) => ({
        group,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [availableHotkeys]);

  const obsConfig = config.obsWebSocketConfig ?? {
    host: 'localhost',
    port: 4455,
    autoReplay: true,
    replayDelaySeconds: 3,
    replayDurationSeconds: 30,
  };

  const replayConfig: OBSReplayConfig = config.obsReplayConfig ?? { buttons: [] };

  const updateOBS = (updates: Partial<OBSWebSocketConfig>) => {
    setConfig({ ...config, obsWebSocketConfig: { ...obsConfig, ...updates } });
  };

  const updateReplayConfig = (updates: Partial<OBSReplayConfig>) => {
    setConfig({ ...config, obsReplayConfig: { ...replayConfig, ...updates } });
  };

  const updateButton = (idx: number, updates: Partial<OBSReplayButton>) => {
    const buttons = [...replayConfig.buttons];
    buttons[idx] = { ...buttons[idx], ...updates };
    updateReplayConfig({ buttons });
  };

  const addButton = () => {
    const newBtn: OBSReplayButton = {
      id: `btn_${Date.now()}`,
      label: 'New Button',
      icon: '▶',
      color: '#3b82f6',
      action: 'hotkey_name',
      hotkeyName: '',
      order: replayConfig.buttons.length,
      enabled: true,
    };
    updateReplayConfig({ buttons: [...replayConfig.buttons, newBtn] });
    setEditingButtonIdx(replayConfig.buttons.length);
  };

  const removeButton = (idx: number) => {
    const buttons = replayConfig.buttons.filter((_, i) => i !== idx);
    updateReplayConfig({ buttons });
    if (editingButtonIdx === idx) setEditingButtonIdx(null);
  };

  const moveButton = (idx: number, dir: -1 | 1) => {
    const buttons = [...replayConfig.buttons];
    const target = idx + dir;
    if (target < 0 || target >= buttons.length) return;
    [buttons[idx], buttons[target]] = [buttons[target], buttons[idx]];
    updateReplayConfig({ buttons: buttons.map((b, i) => ({ ...b, order: i })) });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await scoringService.saveOverlayConfig(config);
      onFeedback('OBS config saved');
    } catch (err) {
      onFeedback(`Save failed: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnectionStatus('connecting');
    try {
      const { obsService } = await import('../services/obsService');
      const ok = await obsService.connect(obsConfig.host, obsConfig.port, obsConfig.password);
      setConnectionStatus(ok ? 'connected' : 'error');
      onFeedback(ok ? 'Connected to OBS' : 'Failed to connect to OBS');
    } catch {
      setConnectionStatus('error');
      onFeedback('Failed to connect to OBS');
    }
  };

  const handleDiscoverHotkeys = async () => {
    if (connectionStatus !== 'connected') {
      onFeedback('Connect to OBS first');
      return;
    }
    setDiscoveringHotkeys(true);
    try {
      const { obsService } = await import('../services/obsService');
      const hotkeys = await obsService.getHotkeyList();
      setAvailableHotkeys(hotkeys);
      onFeedback(`Found ${hotkeys.length} hotkeys`);
    } catch {
      onFeedback('Failed to fetch hotkeys');
    } finally {
      setDiscoveringHotkeys(false);
    }
  };

  const dockUrl = `${baseUrl}/cricket/scorer/obs-dock`;

  const copyDockUrl = () => {
    navigator.clipboard.writeText(dockUrl)
      .then(() => onFeedback('Dock URL copied!'))
      .catch(() => onFeedback('Copy failed — select the URL manually'));
  };

  return (
    <div className="scoring-admin__section">
      <h2 className="scoring-admin__section-title"><IoLink size={20} /> OBS WebSocket & Replay Control</h2>
      <p className="scoring-admin__section-desc">
        Connect to OBS Studio (WebSocket 5.x) for replay buffer control and Replay Source plugin integration.
        Works over WiFi — enter the OBS computer's LAN IP from any device on the same network.
      </p>

      {/* ── Add to OBS Dock ── */}
      <div className="obs-dock-url-card">
        <div className="obs-dock-url-card__header">
          <span className="obs-dock-url-card__badge">📺 OBS Custom Browser Dock URL</span>
          <span className="obs-dock-url-card__hint">Universal — pick any match from inside the dock</span>
        </div>
        <div className="obs-dock-url-card__row">
          <code className="obs-dock-url-card__url" title="Select all and copy">{dockUrl}</code>
          <button className="obs-dock-url-card__copy" onClick={copyDockUrl}>
            📋 Copy
          </button>
          <button className="obs-dock-url-card__open" onClick={() => globalThis.open(dockUrl, '_blank')}>
            ↗
          </button>
        </div>
        <ol className="obs-dock-url-card__steps">
          <li>OBS → <strong>Docks</strong> menu → <strong>Custom Browser Docks…</strong></li>
          <li>Click <strong>+</strong>, name it e.g. <em>Cricket Control</em>, paste the URL above → <strong>Apply</strong></li>
          <li>Inside the dock: select your match, then enter the OBS host below and click <strong>Connect</strong></li>
        </ol>
      </div>

      {/* Connection */}
      <h3 className="scoring-admin__subsection-title">Connection</h3>
      <div className="scoring-admin__connection-status">
        <span className={`scoring-admin__status-dot scoring-admin__status-dot--${connectionStatus}`} />
        <span>{connectionStatus === 'connected' ? 'Connected to OBS' : connectionStatus === 'connecting' ? 'Connecting…' : connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}</span>
      </div>

      <div className="scoring-admin__form-grid">
        <div className="scoring-admin__field">
          <label>OBS Host (LAN IP or localhost)</label>
          <input
            type="text"
            className="scoring-admin__input"
            value={obsConfig.host}
            onChange={e => updateOBS({ host: e.target.value })}
            placeholder="192.168.1.x or localhost"
          />
          <small className="scoring-admin__hint">Enter OBS computer's local IP for WiFi control from mobile</small>
        </div>
        <div className="scoring-admin__field">
          <label>Port</label>
          <input
            type="number"
            className="scoring-admin__input"
            value={obsConfig.port}
            onChange={e => updateOBS({ port: Number(e.target.value) })}
          />
        </div>
        <div className="scoring-admin__field">
          <label>Password (optional)</label>
          <input
            type="password"
            className="scoring-admin__input"
            value={obsConfig.password || ''}
            onChange={e => updateOBS({ password: e.target.value || undefined })}
            placeholder="OBS WebSocket password"
          />
        </div>
      </div>

      <div className="scoring-admin__actions" style={{ marginBottom: '1.5rem' }}>
        <button className="scoring-admin__btn scoring-admin__btn--secondary" onClick={handleConnect} disabled={connectionStatus === 'connecting'}>
          <IoLink size={16} /> {connectionStatus === 'connecting' ? 'Connecting…' : connectionStatus === 'connected' ? 'Reconnect' : 'Connect & Test'}
        </button>
        <button className="scoring-admin__btn scoring-admin__btn--secondary" onClick={handleDiscoverHotkeys} disabled={discoveringHotkeys || connectionStatus !== 'connected'}>
          {discoveringHotkeys ? 'Discovering…' : `🔍 Discover Hotkeys (${availableHotkeys.length})`}
        </button>
      </div>

      {groupedHotkeys.length > 0 && (
        <div className="scoring-admin__form-card" style={{ marginBottom: '1.25rem' }}>
          <h3 className="scoring-admin__subsection-title">Discovered Hotkeys (Grouped Context)</h3>
          <p className="scoring-admin__hint">Use this list to identify scene/source/general mappings before assigning replay buttons.</p>
          <div style={{ display: 'grid', gap: '0.75rem', maxHeight: 260, overflow: 'auto', paddingRight: 4 }}>
            {groupedHotkeys.map(group => (
              <div key={group.group} style={{ border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{group.group}</div>
                {group.items.map(item => (
                  <div key={item.raw} style={{ marginBottom: '0.35rem' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{item.title}</div>
                    <div className="scoring-admin__hint" style={{ fontSize: '0.74rem' }}>{item.context}</div>
                    <code style={{ fontSize: '0.72rem', opacity: 0.8 }}>{item.raw}</code>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replay Source Scene Config */}
      <h3 className="scoring-admin__subsection-title">Replay Source Scene Mapping</h3>
      <p className="scoring-admin__hint" style={{ marginBottom: '0.75rem' }}>
        Scenes to switch to when showing replays or DRS review. Leave blank to skip scene switch.
      </p>
      <div className="scoring-admin__form-grid">
        <div className="scoring-admin__field">
          <label>Replay Scene Name</label>
          <input
            type="text"
            className="scoring-admin__input"
            value={replayConfig.replaySceneName || ''}
            onChange={e => updateReplayConfig({ replaySceneName: e.target.value || undefined })}
            placeholder="e.g. Replay"
          />
        </div>
        <div className="scoring-admin__field">
          <label>DRS Review Scene Name</label>
          <input
            type="text"
            className="scoring-admin__input"
            value={replayConfig.drsSceneName || ''}
            onChange={e => updateReplayConfig({ drsSceneName: e.target.value || undefined })}
            placeholder="e.g. DRS Review"
          />
        </div>
      </div>

      {/* Auto-replay settings */}
      <h3 className="scoring-admin__subsection-title">Auto-Replay on Boundaries / Wickets</h3>
      <div className="scoring-admin__form-grid">
        <div className="scoring-admin__field scoring-admin__field--checkbox">
          <label>
            <input
              type="checkbox"
              checked={obsConfig.autoReplay}
              onChange={e => updateOBS({ autoReplay: e.target.checked })}
            />
            Auto-trigger OBS replay buffer save on boundaries &amp; wickets
          </label>
        </div>
        <div className="scoring-admin__field">
          <label>Replay Delay (seconds)</label>
          <input
            type="number"
            className="scoring-admin__input"
            value={obsConfig.replayDelaySeconds}
            onChange={e => updateOBS({ replayDelaySeconds: Number(e.target.value) })}
            min={0}
            max={30}
          />
        </div>
        <div className="scoring-admin__field">
          <label>Replay Buffer Duration (seconds)</label>
          <input
            type="number"
            className="scoring-admin__input"
            value={obsConfig.replayDurationSeconds}
            onChange={e => updateOBS({ replayDurationSeconds: Number(e.target.value) })}
            min={5}
            max={120}
          />
        </div>
      </div>

      {/* Replay Source Button Configurator */}
      <h3 className="scoring-admin__subsection-title" style={{ marginTop: '1.5rem' }}>
        Replay Source Control Buttons
        <span className="scoring-admin__hint" style={{ marginLeft: 8, fontWeight: 400 }}>
          — shown in OBS Control Dock for one-tap control from mobile
        </span>
      </h3>
      <p className="scoring-admin__hint" style={{ marginBottom: '1rem' }}>
        Each button triggers an OBS hotkey. Hotkey names are discovered from your OBS instance
        (includes Replay Source plugin hotkeys like play, pause, slow forward, etc.).
        Click <strong>Discover Hotkeys</strong> above while connected to populate the dropdown.
      </p>

      {/* Button list */}
      <div className="obs-btn-config-list">
        {replayConfig.buttons.map((btn, idx) => (
          <div key={btn.id} className={`obs-btn-config-row ${editingButtonIdx === idx ? 'obs-btn-config-row--editing' : ''}`}>
            <div className="obs-btn-config-preview" style={{ '--rbtn-color': btn.color } as React.CSSProperties}>
              <span className="obs-btn-config-icon">{btn.icon}</span>
              <span className="obs-btn-config-name">{btn.label}</span>
              {btn.hotkeyName && <span className="obs-btn-config-hotkey">{btn.hotkeyName}</span>}
            </div>
            <div className="obs-btn-config-actions">
              <button className="scoring-admin__btn-icon" onClick={() => moveButton(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
              <button className="scoring-admin__btn-icon" onClick={() => moveButton(idx, 1)} disabled={idx === replayConfig.buttons.length - 1} title="Move down">↓</button>
              <button
                className={`scoring-admin__btn-icon ${btn.enabled ? 'active' : ''}`}
                onClick={() => updateButton(idx, { enabled: !btn.enabled })}
                title={btn.enabled ? 'Disable' : 'Enable'}
              >
                {btn.enabled ? '✓' : '○'}
              </button>
              <button className="scoring-admin__btn-icon" onClick={() => setEditingButtonIdx(editingButtonIdx === idx ? null : idx)} title="Edit">✏️</button>
              <button className="scoring-admin__btn-icon scoring-admin__btn-icon--danger" onClick={() => removeButton(idx)} title="Delete">✕</button>
            </div>

            {editingButtonIdx === idx && (
              <div className="obs-btn-config-editor">
                <div className="scoring-admin__form-grid">
                  <div className="scoring-admin__field">
                    <label>Label</label>
                    <input
                      className="scoring-admin__input"
                      value={btn.label}
                      onChange={e => updateButton(idx, { label: e.target.value })}
                    />
                  </div>
                  <div className="scoring-admin__field">
                    <label>Icon (emoji)</label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {DEFAULT_BUTTON_ICONS.map(ic => (
                        <button
                          key={ic}
                          className={`obs-icon-chip ${btn.icon === ic ? 'active' : ''}`}
                          onClick={() => updateButton(idx, { icon: ic })}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                    <input
                      className="scoring-admin__input"
                      value={btn.icon}
                      onChange={e => updateButton(idx, { icon: e.target.value })}
                      placeholder="Paste any emoji"
                      style={{ maxWidth: 80 }}
                    />
                  </div>
                  <div className="scoring-admin__field">
                    <label>Color</label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {DEFAULT_BUTTON_COLORS.map(c => (
                        <button
                          key={c}
                          className="obs-color-chip"
                          style={{ background: c, outline: btn.color === c ? `2px solid #fff` : 'none' }}
                          onClick={() => updateButton(idx, { color: c })}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={btn.color}
                      onChange={e => updateButton(idx, { color: e.target.value })}
                    />
                  </div>
                  <div className="scoring-admin__field">
                    <label>Action Type</label>
                    <select
                      className="scoring-admin__input"
                      value={btn.action}
                      onChange={e => updateButton(idx, { action: e.target.value as OBSReplayButton['action'] })}
                    >
                      <option value="hotkey_name">Trigger OBS Hotkey by Name (Replay Source)</option>
                      <option value="hotkey_sequence">Trigger by Key Sequence (simulate keypress)</option>
                      <option value="scene_switch">Switch Scene</option>
                      <option value="replay_buffer_save">Save Replay Buffer</option>
                      <option value="replay_buffer_start">Start Replay Buffer</option>
                      <option value="replay_buffer_stop">Stop Replay Buffer</option>
                    </select>
                  </div>

                  {btn.action === 'hotkey_name' && (
                    <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                      <label>OBS Hotkey Name</label>
                      {availableHotkeys.length > 0 ? (
                        <select
                          className="scoring-admin__input"
                          value={btn.hotkeyName || ''}
                          onChange={e => updateButton(idx, { hotkeyName: e.target.value })}
                        >
                          <option value="">— Select hotkey —</option>
                          {groupedHotkeys.map(group => (
                            <optgroup key={group.group} label={group.group}>
                              {group.items.map(item => (
                                <option key={item.raw} value={item.raw}>{item.title} — {item.raw}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="scoring-admin__input"
                          value={btn.hotkeyName || ''}
                          onChange={e => updateButton(idx, { hotkeyName: e.target.value })}
                          placeholder="e.g. ReplaySource.replay — click Discover Hotkeys to populate"
                        />
                      )}
                      <small className="scoring-admin__hint">
                        Hotkey name from OBS (connect + Discover Hotkeys to see all options including Replay Source plugin hotkeys)
                      </small>
                    </div>
                  )}

                  {btn.action === 'hotkey_sequence' && (
                    <div className="scoring-admin__field" style={{ gridColumn: '1 / -1' }}>
                      <label>Key ID (OBS format)</label>
                      <input
                        className="scoring-admin__input"
                        value={btn.keySequence?.keyId || ''}
                        onChange={e => updateButton(idx, {
                          keySequence: { ...btn.keySequence, keyId: e.target.value },
                        })}
                        placeholder="e.g. OBS_KEY_F1"
                      />
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        {(['shift', 'ctrl', 'alt'] as const).map(mod => (
                          <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
                            <input
                              type="checkbox"
                              checked={!!(btn.keySequence as Record<string, boolean> | undefined)?.[mod]}
                              onChange={e => updateButton(idx, {
                                keySequence: { keyId: '', ...btn.keySequence, [mod]: e.target.checked },
                              })}
                            />
                            {mod.charAt(0).toUpperCase() + mod.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {btn.action === 'scene_switch' && (
                    <div className="scoring-admin__field">
                      <label>Scene Name</label>
                      <input
                        className="scoring-admin__input"
                        value={btn.sceneName || ''}
                        onChange={e => updateButton(idx, { sceneName: e.target.value })}
                        placeholder="e.g. Replay"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {replayConfig.buttons.length === 0 && (
          <div className="scoring-admin__hint" style={{ padding: '1rem 0', textAlign: 'center' }}>
            No buttons configured. Click <strong>+ Add Button</strong> to create your first replay control button.
          </div>
        )}
      </div>

      <button
        className="scoring-admin__btn scoring-admin__btn--secondary"
        onClick={addButton}
        style={{ marginTop: '0.75rem' }}
      >
        + Add Button
      </button>

      <div className="scoring-admin__actions" style={{ marginTop: '1.5rem' }}>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={handleSave} disabled={saving}>
          <IoSave size={16} /> {saving ? 'Saving…' : 'Save All OBS Settings'}
        </button>
      </div>
    </div>
  );
}
