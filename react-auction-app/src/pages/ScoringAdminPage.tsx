// ============================================================================
// SCORING ADMIN PAGE — /:tenantSlug/scoring/admin
// Match setup, provider config, ads, overlay branding, animation triggers
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoAdd, IoTrash, IoSave, IoRefresh, IoClose, IoPlay, IoStop, IoTrophy, IoSettings, IoImage, IoFlash, IoHelp } from 'react-icons/io5';
import { GiCricketBat } from 'react-icons/gi';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { useInitialData, useAuctionDataLoader } from '../hooks';
import { useTeams } from '../store';
import { getDatabase } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { scoringService } from '../services/scoring';
import { uploadFileToStorage } from '../services';
import type { MatchSetup, ScoringAd, ScoringOverlayConfig, LiveQuestion, MatchScoringConfig } from '../types/scoring';
import './ScoringAdminPage.css';

type Tab = 'matches' | 'provider' | 'ads' | 'overlay' | 'animations';

const DEFAULT_OVERLAY_CONFIG: ScoringOverlayConfig = {
  showLiveBadge: true,
  enableBoundaryAnimation: true,
  enableWicketAnimation: true,
  enableDuckOutAnimation: true,
  enableHatTrickAnimation: true,
  enableSixerAnimation: true,
  liveQuestions: [],
};

export default function ScoringAdminPage() {
  const navigate = useNavigate();
  const { isAuthenticated, extendSession } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<Tab>('matches');

  useInitialData();
  useAuctionDataLoader();

  const allTeams = useTeams();

  // Initialize scoring service
  useEffect(() => {
    try {
      const db = getDatabase();
      scoringService.initialize(db, tenantPath('scoring'));
    } catch { /* already initialized */ }
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

  // Load data
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    try {
      unsubs.push(scoringService.subscribeMatches(setMatches));
      unsubs.push(scoringService.subscribeAds(setAds));
      unsubs.push(scoringService.subscribeOverlayConfig((cfg) => setOverlayConfig(cfg)));
    } catch { /* service not initialized yet */ }
    return () => unsubs.forEach(u => u());
  }, []);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }, []);

  if (!isAuthenticated) return null;

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

      {/* Tabs */}
      <nav className="scoring-admin__tabs">
        {([
          { key: 'matches', icon: <IoTrophy size={16} />, label: 'Matches' },
          { key: 'provider', icon: <IoSettings size={16} />, label: 'Providers' },
          { key: 'ads', icon: <IoImage size={16} />, label: 'Ads' },
          { key: 'overlay', icon: <IoPlay size={16} />, label: 'Overlay' },
          { key: 'animations', icon: <IoFlash size={16} />, label: 'Animations' },
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
            onFeedback={showFeedback}
            saving={saving}
            setSaving={setSaving}
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

function MatchesTab({ matches, teams, onFeedback, saving, setSaving }: {
  matches: MatchSetup[];
  teams: { id: string; name: string; logoUrl?: string; primaryColor?: string }[];
  onFeedback: (msg: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    teamAId: '', teamBId: '', venue: '', date: '', maxOvers: 20, tossWonBy: '', tossElected: '' as '' | 'bat' | 'bowl',
  });

  const resetForm = () => {
    setForm({ teamAId: '', teamBId: '', venue: '', date: '', maxOvers: 20, tossWonBy: '', tossElected: '' });
    setEditId(null);
    setShowForm(false);
  };

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
        date: form.date,
        maxOvers: form.maxOvers,
        tossWonBy: form.tossWonBy || undefined,
        tossElected: form.tossElected || undefined,
        status: 'scheduled',
        createdAt: editId ? (matches.find(m => m.id === editId)?.createdAt ?? Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };
      await scoringService.createMatch(match);
      onFeedback(editId ? 'Match updated' : 'Match created');
      resetForm();
    } catch (err) {
      onFeedback('Failed to save match');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (match: MatchSetup) => {
    setForm({
      teamAId: match.teamA.id,
      teamBId: match.teamB.id,
      venue: match.venue,
      date: match.date,
      maxOvers: match.maxOvers,
      tossWonBy: match.tossWonBy || '',
      tossElected: (match.tossElected || '') as '' | 'bat' | 'bowl',
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
      await scoringService.updateMatch(matchId, { status });
      onFeedback(`Match status: ${status}`);
    } catch {
      onFeedback('Failed to update status');
    }
  };

  return (
    <div className="scoring-admin__section">
      <div className="scoring-admin__section-header">
        <h2>Matches</h2>
        <button className="scoring-admin__btn scoring-admin__btn--primary" onClick={() => setShowForm(!showForm)}>
          <IoAdd size={16} /> {showForm ? 'Cancel' : 'New Match'}
        </button>
      </div>

      {showForm && (
        <motion.div className="scoring-admin__form-card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }}>
          <div className="scoring-admin__form-grid">
            <div className="scoring-admin__field">
              <label>Team A *</label>
              <select value={form.teamAId} onChange={e => setForm(f => ({ ...f, teamAId: e.target.value }))} className="scoring-admin__select">
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Team B *</label>
              <select value={form.teamBId} onChange={e => setForm(f => ({ ...f, teamBId: e.target.value }))} className="scoring-admin__select">
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Venue *</label>
              <input type="text" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} placeholder="Stadium name" className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field">
              <label>Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field">
              <label>Max Overs</label>
              <input type="number" min={1} max={50} value={form.maxOvers} onChange={e => setForm(f => ({ ...f, maxOvers: Number(e.target.value) }))} className="scoring-admin__input" />
            </div>
            <div className="scoring-admin__field">
              <label>Toss Won By</label>
              <select value={form.tossWonBy} onChange={e => setForm(f => ({ ...f, tossWonBy: e.target.value }))} className="scoring-admin__select">
                <option value="">Not decided</option>
                {form.teamAId && <option value={form.teamAId}>{teams.find(t => t.id === form.teamAId)?.name}</option>}
                {form.teamBId && <option value={form.teamBId}>{teams.find(t => t.id === form.teamBId)?.name}</option>}
              </select>
            </div>
            <div className="scoring-admin__field">
              <label>Elected to</label>
              <select value={form.tossElected} onChange={e => setForm(f => ({ ...f, tossElected: e.target.value as '' | 'bat' | 'bowl' }))} className="scoring-admin__select">
                <option value="">—</option>
                <option value="bat">Bat</option>
                <option value="bowl">Bowl</option>
              </select>
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
        {matches.length === 0 && (
          <div className="scoring-admin__empty">No matches created yet. Click "New Match" to get started.</div>
        )}
        {matches.map(match => (
          <div key={match.id} className="scoring-admin__match-card">
            <div className="scoring-admin__match-teams">
              <span className="scoring-admin__team-name">{match.teamA.name}</span>
              <span className="scoring-admin__vs">vs</span>
              <span className="scoring-admin__team-name">{match.teamB.name}</span>
            </div>
            <div className="scoring-admin__match-meta">
              <span>{match.venue}</span>
              <span>{new Date(match.date).toLocaleDateString()}</span>
              <span>{match.maxOvers} overs</span>
              <span className={`scoring-admin__status scoring-admin__status--${match.status}`}>{match.status}</span>
            </div>
            <div className="scoring-admin__match-actions">
              {match.status === 'scheduled' && (
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--success" onClick={() => handleStatusChange(match.id, 'live')}>
                  <IoPlay size={14} /> Start
                </button>
              )}
              {match.status === 'live' && (
                <button className="scoring-admin__btn scoring-admin__btn--sm scoring-admin__btn--warning" onClick={() => handleStatusChange(match.id, 'completed')}>
                  <IoStop size={14} /> End
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
      await scoringService.saveOverlayConfig(config);
      onFeedback('Overlay config saved');
    } catch {
      onFeedback('Failed to save overlay config');
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

  const handleSave = async () => {
    try {
      await scoringService.saveOverlayConfig(config);
      onFeedback('Animation config saved');
    } catch {
      onFeedback('Failed to save');
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
    setConfig({ ...config, liveQuestions: [...config.liveQuestions, question] });
    setNewQ({ text: '', options: '', duration: 10 });
  };

  const removeQuestion = (id: string) => {
    setConfig({ ...config, liveQuestions: config.liveQuestions.filter(q => q.id !== id) });
  };

  const handleUpload = async (file: File, field: keyof ScoringOverlayConfig) => {
    try {
      const url = await uploadFileToStorage(file, `media/scoring/animations/${field}-${Date.now()}`);
      setConfig({ ...config, [field]: url });
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

      <div className="scoring-admin__form-card">
        <h3 className="scoring-admin__subsection-title">❓ Live Questions (Q key)</h3>
        <p className="scoring-admin__hint">Queue trivia questions to display during the broadcast. Press Q in the overlay to show the next question.</p>

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

        {config.liveQuestions.length > 0 && (
          <div className="scoring-admin__question-list">
            {config.liveQuestions.map((q, i) => (
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
            { key: ';', desc: 'Current Bowler Stats' },
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
