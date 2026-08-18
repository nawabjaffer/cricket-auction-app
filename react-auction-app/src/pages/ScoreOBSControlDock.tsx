// ============================================================================
// SCORE OBS CONTROL DOCK — /:tenantSlug/cricket/scorer/obs-dock
// Compact dock panel for controlling scoring overlays + OBS replay in OBS
// Add as Custom Browser Dock in OBS: Docks → Custom Browser Docks
// Works over WiFi: enter OBS computer's LAN IP as host
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { scoringService } from '../services/scoring';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { obsService } from '../services/obsService';
import { obsReplaySourceService } from '../services/scoring/obsReplaySourceService';
import type {
  MatchSetup, LiveScore, OverlayControlState, OverlayType,
  OBSReplayButton, OBSReplayConfig,
} from '../types/scoring';
import './ScoreOBSControlDock.css';

const OVERLAY_BUTTONS: { key: OverlayType; label: string; icon: string; shortcut: string; color: string }[] = [
  { key: 'full_scorecard', label: 'Scorecard', icon: '📊', shortcut: 'F', color: '#3b82f6' },
  { key: 'batsman_striker', label: 'Striker', icon: '🏏', shortcut: '[', color: '#22c55e' },
  { key: 'batsman_nonstriker', label: 'Non-Striker', icon: '🏏', shortcut: ']', color: '#14b8a6' },
  { key: 'bowler', label: 'Bowler', icon: '⚾', shortcut: ';', color: '#a855f7' },
  { key: 'boundary_four', label: '4!', icon: '4️⃣', shortcut: '4', color: '#eab308' },
  { key: 'boundary_six', label: '6!', icon: '6️⃣', shortcut: '6', color: '#f97316' },
  { key: 'wicket', label: 'Wicket', icon: '🔴', shortcut: 'W', color: '#ef4444' },
  { key: 'duck_out', label: 'Duck', icon: '🦆', shortcut: 'D', color: '#f59e0b' },
  { key: 'hat_trick', label: 'Hat-Trick', icon: '🎩', shortcut: 'H', color: '#ec4899' },
  { key: 'live_question', label: 'Question', icon: '❓', shortcut: 'Q', color: '#6366f1' },
  { key: 'ads_break', label: 'Ads Break', icon: '📺', shortcut: 'A', color: '#64748b' },
];

const STATS_OVERLAY_BUTTONS: { key: OverlayType; label: string; icon: string; color: string }[] = [
  { key: 'stats_fours', label: '4s (Match)', icon: '4️⃣', color: '#eab308' },
  { key: 'tournament_fours', label: '4s (Tourney)', icon: '4️⃣', color: '#ca8a04' },
  { key: 'stats_sixes', label: '6s (Match)', icon: '6️⃣', color: '#f97316' },
  { key: 'tournament_sixes', label: '6s (Tourney)', icon: '6️⃣', color: '#ea580c' },
  { key: 'stats_sr', label: 'SR (Match)', icon: '📈', color: '#22c55e' },
  { key: 'tournament_sr', label: 'SR (Tourney)', icon: '📈', color: '#16a34a' },
  { key: 'stats_mvp', label: 'MVP (Match)', icon: '🏆', color: '#fbbf24' },
  { key: 'tournament_mvp', label: 'MVP (Tourney)', icon: '🏆', color: '#d97706' },
  { key: 'match_summary', label: 'Summary', icon: '📋', color: '#3b82f6' },
  { key: 'points_table', label: 'Points Table', icon: '📊', color: '#0ea5e9' },
  { key: 'award_orange_cap_match', label: 'Orange (Match)', icon: '🧢', color: '#fb923c' },
  { key: 'award_orange_cap', label: 'Orange (Tourney)', icon: '🧢', color: '#f97316' },
  { key: 'award_purple_cap_match', label: 'Purple (Match)', icon: '🧢', color: '#c084fc' },
  { key: 'award_purple_cap', label: 'Purple (Tourney)', icon: '🧢', color: '#a855f7' },
  { key: 'match_intro', label: 'Match Intro', icon: '🎬', color: '#6366f1' },
  { key: 'field_placement', label: 'Field', icon: '🟢', color: '#10b981' },
];

type DockConnectionMode = 'ip' | 'local' | 'relay';

const DOCK_MODE_OPTIONS: { key: DockConnectionMode; label: string; hint: string }[] = [
  { key: 'ip', label: 'IP Address', hint: 'Connect straight to the OBS machine using its LAN IP.' },
  { key: 'local', label: 'Local', hint: 'Dock is running on the same computer as OBS (127.0.0.1).' },
  { key: 'relay', label: 'Same Wi-Fi', hint: 'Phone sends commands over Firebase to the dock open on the OBS machine.' },
];

export default function ScoreOBSControlDock() {
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('none');
  const [feedback, setFeedback] = useState('');
  const initialized = useRef(false);

  const handleMatchChange = (matchId: string) => {
    if (matchId === selectedMatchId) return;
    setLiveScore(null);
    setActiveOverlay('none');
    setSelectedMatchId(matchId);
    try {
      const url = new URL(globalThis.location.href);
      if (matchId) { url.searchParams.set('matchId', matchId); }
      else { url.searchParams.delete('matchId'); }
      globalThis.history.replaceState(null, '', url.toString());
    } catch { /* non-critical */ }
  };

  // OBS connection state
  const [obsHost, setObsHost] = useState(() => localStorage.getItem('obs_dock_host') || 'localhost');
  const [obsPort, setObsPort] = useState(() => localStorage.getItem('obs_dock_port') || '4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsStatus, setObsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [obsConnecting, setObsConnecting] = useState(false);
  const [replayConfig, setReplayConfig] = useState<OBSReplayConfig>({ buttons: [] });
  const [replayScene, setReplayScene] = useState('');
  const [drsScene, setDrsScene] = useState('');
  const [execBusy, setExecBusy] = useState<string | null>(null);
  const [obsErrorDetail, setObsErrorDetail] = useState('');
  const [obsAttemptedUrls, setObsAttemptedUrls] = useState<string[]>([]);
  const [obsFailureSummary, setObsFailureSummary] = useState<string[]>([]);
  const [obsMixedContentHint, setObsMixedContentHint] = useState(false);
  const [relayOnlyMode, setRelayOnlyMode] = useState(false);
  const isNativeObsHost = Boolean((globalThis as unknown as { obsstudio?: unknown }).obsstudio)
    || /obs/i.test(globalThis.navigator?.userAgent || '');
  const isMobileClient = /iphone|ipad|ipod|android/i.test(globalThis.navigator?.userAgent || '');

  const [connectionMode, setConnectionMode] = useState<DockConnectionMode>(() => {
    const stored = localStorage.getItem('obs_dock_mode') as DockConnectionMode | null;
    if (stored === 'ip' || stored === 'local' || stored === 'relay') return stored;
    if (isNativeObsHost) return 'local';
    return isMobileClient ? 'relay' : 'ip';
  });

  const [singleOverlayMode, setSingleOverlayMode] = useState(false);
  const [activeMatchPointer, setActiveMatchPointer] = useState<string | null>(null);
  const singleOverlayModeRef = useRef(false);
  const dockCleanupRef = useRef<Array<() => void>>([]);

  const isLoopbackHost = (value: string): boolean => {
    const host = value.trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  };

  const hasExplicitSecureEndpoint = (value: string): boolean => {
    const host = value.trim().toLowerCase();
    return host.startsWith('wss://') || host.startsWith('https://');
  };

  useEffect(() => {
    singleOverlayModeRef.current = singleOverlayMode;
  }, [singleOverlayMode]);

  // Initialize scoring service + load matches
  useEffect(() => {
    const init = async () => {
      try {
        if (!initialized.current) {
          await realtimeSync.ensureInitialized();
          const db = realtimeSync.getDatabase();
          if (db) {
            scoringService.initialize(db, tenantPath('scoring'));
            obsReplaySourceService.initialize(db, tenantPath('scoring'));
            initialized.current = true;
          } else {
            console.error('[ScoreOBSControlDock] Failed to get database');
            return;
          }
        }
        const all = await scoringService.getAllMatches();
        setMatches(all);

        // Load OBS config here, after scoringService is initialized
        const cfg = await scoringService.getOverlayConfig().catch(() => null);
        const singleMode = !!cfg?.singleOverlayMode;
        setSingleOverlayMode(singleMode);

        const params = new URLSearchParams(globalThis.location.search);
        const qMatch = params.get('matchId');
        if (qMatch && all.some(m => m.id === qMatch)) {
          setSelectedMatchId(qMatch);
        } else if (singleMode) {
          const activeId = await scoringService.getActiveMatch().catch(() => null);
          setActiveMatchPointer(activeId);
          if (activeId && all.some(m => m.id === activeId)) {
            setSelectedMatchId(activeId);
          } else if (all.length > 0) {
            const live = all.find(m => m.status === 'live');
            setSelectedMatchId(live?.id || all[0].id);
          }
        } else if (all.length > 0) {
          const live = all.find(m => m.status === 'live');
          setSelectedMatchId(live?.id || all[0].id);
        }

        if (cfg?.obsWebSocketConfig) {
          const { host, port, password } = cfg.obsWebSocketConfig;
          if (!localStorage.getItem('obs_dock_host')) {
            setObsHost(isNativeObsHost ? '127.0.0.1' : (host || 'localhost'));
          }
          if (!localStorage.getItem('obs_dock_port')) setObsPort(String(port || 4455));
          if (password) setObsPassword(password);
        }
        if (cfg?.obsReplayConfig) {
          setReplayConfig(cfg.obsReplayConfig);
          setReplayScene(cfg.obsReplayConfig.replaySceneName || '');
          setDrsScene(cfg.obsReplayConfig.drsSceneName || '');
        }

        // Keep following Single Overlay Mode + the active match reactively after load
        dockCleanupRef.current.push(scoringService.subscribeOverlayConfig((liveCfg) => {
          setSingleOverlayMode(!!liveCfg.singleOverlayMode);
        }));
        dockCleanupRef.current.push(scoringService.subscribeActiveMatch((id) => {
          setActiveMatchPointer(id);
          if (!singleOverlayModeRef.current) return;
          const liveParams = new URLSearchParams(globalThis.location.search);
          if (liveParams.get('matchId')) return;
          if (id) setSelectedMatchId(id);
        }));
      } catch (err) { console.error('[ScoreOBSControlDock] Init error:', err); }
    };
    init();
    return () => {
      dockCleanupRef.current.forEach(fn => fn());
      dockCleanupRef.current = [];
    };
  }, []);

  // Subscribe to live score
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsub = scoringService.subscribeLiveScore(selectedMatchId, (score) => {
      setLiveScore(score);
    });
    return unsub;
  }, [selectedMatchId]);

  // Subscribe to overlay control
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsub = scoringService.subscribeOverlayControl(selectedMatchId, (control: OverlayControlState) => {
      setActiveOverlay(control.activeOverlay);
    });
    return unsub;
  }, [selectedMatchId]);

  // Restart relay watcher whenever the selected match or OBS connection changes
  useEffect(() => {
    if (!selectedMatchId || obsStatus !== 'connected' || replayConfig.buttons.length === 0) return;
    obsReplaySourceService.watchRelayCommands(selectedMatchId, replayConfig);
    // watchRelayCommands calls stopRelayWatch() internally before subscribing
  }, [selectedMatchId, obsStatus, replayConfig]);

  // Track OBS connection status
  useEffect(() => {
    const unsub = obsService.onConnectionChange((state) => {
      setObsStatus(state);
      if (state !== 'error') setObsErrorDetail('');
    });
    return unsub;
  // obsService is a singleton, no deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  }, []);

  const handleObsConnect = useCallback(async () => {
    if (connectionMode === 'relay') {
      setRelayOnlyMode(true);
      setObsErrorDetail('');
      setObsAttemptedUrls([]);
      setObsFailureSummary([]);
      setObsMixedContentHint(false);
      showFeedback('Relay mode active — commands go via Firebase');
      return;
    }

    const effectiveHost = connectionMode === 'local' ? '127.0.0.1' : obsHost.trim();
    const port = parseInt(obsPort, 10);
    if (!effectiveHost || isNaN(port)) return;

    if (connectionMode === 'ip' && isMobileClient && isLoopbackHost(effectiveHost)) {
      setObsErrorDetail('On iPhone/mobile, localhost or 127.0.0.1 points to your phone, not OBS laptop. Enter OBS laptop LAN IP (example: 192.168.x.x).');
      setObsFailureSummary([]);
      setObsAttemptedUrls([]);
      setObsMixedContentHint(false);
      setRelayOnlyMode(false);
      showFeedback('Use OBS laptop LAN IP');
      return;
    }

    const securePage = globalThis.location?.protocol === 'https:';
    if (connectionMode === 'ip' && isMobileClient && securePage && !hasExplicitSecureEndpoint(effectiveHost)) {
      // Safari blocks ws:// from https pages, so fall back to Firebase relay.
      setConnectionMode('relay');
      localStorage.setItem('obs_dock_mode', 'relay');
      setRelayOnlyMode(true);
      setObsErrorDetail('Direct OBS socket is blocked on iPhone over HTTPS. Switched to Same Wi-Fi relay mode: keep the dock connected on the OBS laptop.');
      setObsFailureSummary([]);
      setObsAttemptedUrls([]);
      setObsMixedContentHint(true);
      showFeedback('Switched to Same Wi-Fi relay');
      return;
    }

    setRelayOnlyMode(false);

    localStorage.setItem('obs_dock_host', effectiveHost);
    localStorage.setItem('obs_dock_port', obsPort);
    setObsConnecting(true);
    setObsAttemptedUrls([]);
    setObsFailureSummary([]);
    setObsMixedContentHint(false);
    try {
      const ok = await obsService.connect(effectiveHost, port, obsPassword || undefined);
      if (!ok) {
        const detail = obsService.getLastErrorDetail();
        const diag = obsService.getConnectionDiagnostics();
        setObsAttemptedUrls(diag.attemptedUrls);
        setObsFailureSummary(diag.failures.slice(-2));
        setObsMixedContentHint(diag.mixedContentLikely);
        setObsErrorDetail(detail || 'Connection failed');
        showFeedback('OBS connection failed');
      } else {
        setObsAttemptedUrls([]);
        setObsFailureSummary([]);
        setObsMixedContentHint(false);
        setObsErrorDetail('');
        showFeedback('OBS connected');
      }
    } catch {
      const diag = obsService.getConnectionDiagnostics();
      setObsAttemptedUrls(diag.attemptedUrls);
      setObsFailureSummary(diag.failures.slice(-2));
      setObsMixedContentHint(diag.mixedContentLikely);
      setObsErrorDetail(obsService.getLastErrorDetail() || 'Connection failed');
    } finally {
      setObsConnecting(false);
    }
  }, [connectionMode, obsHost, obsPort, obsPassword, isMobileClient, showFeedback]);

  const handleModeChange = useCallback((mode: DockConnectionMode) => {
    setConnectionMode(mode);
    localStorage.setItem('obs_dock_mode', mode);
    setObsErrorDetail('');
    setObsAttemptedUrls([]);
    setObsFailureSummary([]);
    setObsMixedContentHint(false);

    if (mode === 'relay') {
      setRelayOnlyMode(true);
      obsService.disconnect();
      showFeedback('Same Wi-Fi relay mode selected');
      return;
    }

    setRelayOnlyMode(false);
    if (mode === 'local') {
      setObsHost('127.0.0.1');
      localStorage.setItem('obs_dock_host', '127.0.0.1');
    }
  }, [showFeedback]);

  const handleObsDisconnect = useCallback(() => {
    obsService.disconnect();
    obsReplaySourceService.stopRelayWatch();
  }, []);

  const execReplayButton = useCallback(async (button: OBSReplayButton) => {
    if (execBusy || !button.enabled) return;
    setExecBusy(button.id);
    try {
      if (obsStatus === 'connected') {
        const ok = await obsReplaySourceService.executeButton(button);
        showFeedback(ok ? `▶ ${button.label}` : `${button.label}: configure hotkey first`);
      } else if (selectedMatchId) {
        // Relay via Firebase (mobile → dock on OBS machine)
        await obsReplaySourceService.sendRelayCommand(selectedMatchId, button.id);
        showFeedback(`📡 ${button.label} sent`);
      } else {
        showFeedback('Connect to OBS or select a match');
      }
    } catch (err) {
      showFeedback(`Error: ${err}`);
    } finally {
      setExecBusy(null);
    }
  }, [execBusy, obsStatus, selectedMatchId, showFeedback]);

  const handleSwitchReplayScene = useCallback(async (scene: string) => {
    if (!scene) return;
    const ok = await obsService.setScene(scene);
    showFeedback(ok ? `Scene: ${scene}` : 'OBS not connected');
  }, [showFeedback]);

  const triggerOverlay = useCallback(async (overlay: OverlayType) => {
    if (!selectedMatchId) return;
    try {
      const animationTypes = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
      const isAnimation = animationTypes.includes(overlay);
      const newOverlay = isAnimation ? overlay : (activeOverlay === overlay ? 'none' : overlay);
      await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: newOverlay });
      setActiveOverlay(newOverlay);
      showFeedback(newOverlay === 'none' ? 'Overlay cleared' : `Showing: ${overlay.replace(/_/g, ' ')}`);
    } catch (err) {
      showFeedback(`Error: ${err}`);
    }
  }, [selectedMatchId, activeOverlay, showFeedback]);

  const clearOverlay = useCallback(async () => {
    if (!selectedMatchId) return;
    try {
      await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: 'none' });
      setActiveOverlay('none');
      showFeedback('Overlay cleared');
    } catch (err) {
      showFeedback(`Error: ${err}`);
    }
  }, [selectedMatchId, showFeedback]);

  const handleStartNextMatch = useCallback(async () => {
    const next = [...matches]
      .filter(m => m.status === 'scheduled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    if (!next) { showFeedback('No upcoming scheduled match'); return; }
    try {
      await scoringService.startMatchQuick(next.id);
      showFeedback(`Started: ${next.teamA.name} vs ${next.teamB.name}`);
    } catch {
      showFeedback('Failed to start next match');
    }
  }, [matches, showFeedback]);

  const handleEndSession = useCallback(async () => {
    try {
      await scoringService.setActiveMatch(null);
      showFeedback('Session ended');
    } catch {
      showFeedback('Failed to end session');
    }
  }, [showFeedback]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toUpperCase();
      const mapping: Record<string, OverlayType> = {
        'F': 'full_scorecard',
        '[': 'batsman_striker',
        ']': 'batsman_nonstriker',
        ';': 'bowler',
        '4': 'boundary_four',
        '6': 'boundary_six',
        'W': 'wicket',
        'D': 'duck_out',
        'H': 'hat_trick',
        'Q': 'live_question',
        'A': 'ads_break',
      };
      if (e.key === 'Escape') {
        clearOverlay();
      } else if (mapping[key]) {
        triggerOverlay(mapping[key]);
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [triggerOverlay, clearOverlay]);

  const selectedMatch = matches.find(m => m.id === selectedMatchId);
  const obsIsConnected = obsStatus === 'connected';
  const relayReady = connectionMode === 'relay' || relayOnlyMode || (!obsIsConnected && obsStatus !== 'connecting');
  const enabledButtons = replayConfig.buttons.filter(b => b.enabled).sort((a, b) => a.order - b.order);

  return (
    <div className="score-dock">
      {/* Header */}
      <div className="score-dock__header">
        <span className="score-dock__title">Score × OBS</span>
        <div className="score-dock__header-right">
          {isNativeObsHost && <span className="score-dock__obs-native">Native</span>}
          {(connectionMode === 'relay' || relayOnlyMode) && <span className="score-dock__obs-relay">Relay</span>}
          <span className={`score-dock__obs-badge score-dock__obs-badge--${obsStatus}`}>
            <span className="score-dock__obs-badge-dot" />
            {obsStatus === 'connected' ? 'OBS' : obsStatus === 'connecting' ? '...' : obsStatus === 'error' ? 'ERR' : 'OBS'}
          </span>
          <span className={`score-dock__live-dot ${liveScore ? 'active' : ''}`} />
        </div>
      </div>

      {/* OBS Connection Panel */}
      <div className="score-dock__obs-connect-panel">
        <div className="score-dock__mode-switch" role="tablist" aria-label="OBS connection mode">
          {DOCK_MODE_OPTIONS.map(option => (
            <button
              key={option.key}
              role="tab"
              aria-selected={connectionMode === option.key}
              className={`score-dock__mode-btn ${connectionMode === option.key ? 'score-dock__mode-btn--active' : ''}`}
              onClick={() => handleModeChange(option.key)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="score-dock__obs-hint">
          {DOCK_MODE_OPTIONS.find(o => o.key === connectionMode)?.hint}
        </p>

        {connectionMode !== 'relay' && (
          <>
            <div className="score-dock__obs-connect-row">
              <input
                className="score-dock__obs-input score-dock__obs-input--host"
                placeholder="192.168.x.x or localhost"
                value={connectionMode === 'local' ? '127.0.0.1' : obsHost}
                onChange={e => setObsHost(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleObsConnect(); }}
                disabled={connectionMode === 'local'}
              />
              <input
                className="score-dock__obs-input score-dock__obs-input--port"
                placeholder="4455"
                value={obsPort}
                onChange={e => setObsPort(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleObsConnect(); }}
              />
            </div>
            <div className="score-dock__obs-connect-row">
              <input
                className="score-dock__obs-input"
                type="password"
                placeholder="OBS password (optional)"
                value={obsPassword}
                onChange={e => setObsPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleObsConnect(); }}
              />
              {obsIsConnected ? (
                <button className="score-dock__obs-btn score-dock__obs-btn--disconnect" onClick={handleObsDisconnect}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="score-dock__obs-btn score-dock__obs-btn--connect"
                  onClick={handleObsConnect}
                  disabled={obsConnecting || obsStatus === 'connecting'}
                >
                  {obsConnecting || obsStatus === 'connecting' ? (
                    <span className="score-dock__obs-spinner" />
                  ) : 'Connect'}
                </button>
              )}
            </div>
          </>
        )}

        {connectionMode === 'relay' && (
          <p className="score-dock__obs-hint score-dock__obs-hint--warn">
            Relay mode active: your phone sends commands via Firebase. Keep this dock open and connected to OBS on the laptop/desktop.
          </p>
        )}
        {obsIsConnected && (
          <p className="score-dock__obs-hint">
            ✓ OBS connected — hotkeys will execute instantly
          </p>
        )}
        {obsStatus === 'error' && connectionMode !== 'relay' && (
          <>
            <p className="score-dock__obs-hint score-dock__obs-hint--error">
              ✕ Cannot reach OBS. Check host/port, OBS WebSocket, and password.
            </p>
            {obsErrorDetail && <p className="score-dock__obs-hint score-dock__obs-hint--error">{obsErrorDetail}</p>}
            {obsAttemptedUrls.length > 0 && (
              <p className="score-dock__obs-hint score-dock__obs-hint--error">
                Attempts: {obsAttemptedUrls.join(' -> ')}
              </p>
            )}
            {obsFailureSummary.map((item, idx) => (
              <p key={`obs-failure-${idx}`} className="score-dock__obs-hint score-dock__obs-hint--error">{item}</p>
            ))}
            {obsMixedContentHint && (
              <p className="score-dock__obs-hint score-dock__obs-hint--warn">
                iPhone/Safari note: this page is HTTPS, so direct ws:// LAN socket may be blocked. Switch to Same Wi-Fi mode.
              </p>
            )}
          </>
        )}
      </div>

      {/* Match Selector */}
      <div className="score-dock__match-selector">
        <div className="score-dock__match-selector-label">Match</div>
        <select
          className="score-dock__select"
          value={selectedMatchId}
          onChange={e => handleMatchChange(e.target.value)}
        >
          <option value="">— Select match —</option>
          {matches.map(m => (
            <option key={m.id} value={m.id}>
              {m.status === 'live' ? '● ' : ''}{m.teamA.name} vs {m.teamB.name}{m.status !== 'live' ? ` (${m.status})` : ' LIVE'}
            </option>
          ))}
        </select>
        {!selectedMatchId && (
          <p className="score-dock__match-hint">Select a match to enable overlay controls</p>
        )}
      </div>

      {singleOverlayMode && (
        <div className="score-dock__match-selector">
          {selectedMatch?.status === 'completed' && selectedMatchId === activeMatchPointer ? (
            <>
              <p className="score-dock__match-hint">🏁 Match ended — start the next one to keep the universal link live</p>
              <div className="score-dock__session-actions">
                <button className="score-dock__obs-btn score-dock__obs-btn--native" onClick={handleStartNextMatch}>▶ Start Next Match</button>
                <button className="score-dock__obs-btn" onClick={handleEndSession}>End Session</button>
              </div>
            </>
          ) : (
            <p className="score-dock__match-hint">🔗 Following active match (Single Overlay Mode)</p>
          )}
        </div>
      )}

      {/* Live Score Preview */}
      {liveScore && selectedMatch && (
        <div className="score-dock__score-preview">
          <div className="score-dock__score-teams">
            <span className="score-dock__batting-team">{liveScore.battingTeamId === selectedMatch.teamA.id ? selectedMatch.teamA.name : selectedMatch.teamB.name}</span>
            <span className="score-dock__score-value">{liveScore.runs}/{liveScore.wickets}</span>
            <span className="score-dock__overs">({liveScore.overs} ov)</span>
          </div>
          <div className="score-dock__batsmen">
            <span className="score-dock__batsman">
              🏏 {liveScore.currentBatsmen[0]?.playerName || '—'} {liveScore.currentBatsmen[0]?.runs || 0}*({liveScore.currentBatsmen[0]?.balls || 0})
            </span>
            <span className="score-dock__batsman">
              {liveScore.currentBatsmen[1]?.playerName || '—'} {liveScore.currentBatsmen[1]?.runs || 0}({liveScore.currentBatsmen[1]?.balls || 0})
            </span>
          </div>
          <div className="score-dock__bowler-info">
            ⚾ {liveScore.currentBowler?.playerName || '—'} {liveScore.currentBowler?.wickets || 0}/{liveScore.currentBowler?.runs || 0}
          </div>
          <div className="score-dock__this-over">
            {liveScore.currentOverBalls?.map((b, i) => (
              <span key={`ball-${i}`} className={`score-dock__ball ${b === 'W' ? 'wicket' : b === '4' ? 'four' : b === '6' ? 'six' : ''}`}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ REPLAY SOURCE CONTROL ═══ */}
      <div className="score-dock__replay-panel">
        <div className="score-dock__replay-header">
          <span className="score-dock__replay-title">🎬 Replay Control</span>
          {obsIsConnected && <span className="score-dock__replay-live-badge">LIVE</span>}
          {relayReady && !obsIsConnected && <span className="score-dock__replay-relay-badge">RELAY</span>}
        </div>

        {/* Scene switchers — only shown when scenes are actually configured */}
        {(replayScene || drsScene) && (
          <div className="score-dock__replay-scenes">
            {replayScene && (
              <button
                className="score-dock__scene-switch-btn score-dock__scene-switch-btn--replay"
                onClick={() => handleSwitchReplayScene(replayScene)}
              >
                📺 Replay Scene
              </button>
            )}
            {drsScene && (
              <button
                className="score-dock__scene-switch-btn score-dock__scene-switch-btn--drs"
                onClick={() => handleSwitchReplayScene(drsScene)}
              >
                🔍 DRS Scene
              </button>
            )}
          </div>
        )}

        {/* Configurable hotkey buttons from admin config */}
        {enabledButtons.length > 0 ? (
          <div className="score-dock__replay-btn-grid">
            {enabledButtons.map(btn => (
              <button
                key={btn.id}
                className={`score-dock__rpbtn ${execBusy === btn.id ? 'score-dock__rpbtn--busy' : ''}`}
                style={{ '--rbtn-color': btn.color } as React.CSSProperties}
                onClick={() => execReplayButton(btn)}
                disabled={execBusy === btn.id}
                title={btn.action === 'series'
                  ? `Series: ${(btn.series || []).length} steps`
                  : (btn.hotkeyName ? `Hotkey: ${btn.hotkeyName}` : btn.label)}
              >
                <span className="score-dock__rpbtn-icon">{btn.icon}</span>
                <span className="score-dock__rpbtn-label">{btn.label}</span>
                {btn.action === 'series' && (
                  <span className="score-dock__rpbtn-series">{(btn.series || []).length}×</span>
                )}
                {execBusy === btn.id && <span className="score-dock__rpbtn-spinner" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="score-dock__replay-empty">
            <span>No replay buttons configured.</span>
            <span>Go to Scoring Admin → OBS WS → Replay Buttons to set up.</span>
          </div>
        )}

        {/* Quick built-in replay buffer buttons */}
        <div className="score-dock__replay-buffer-row">
          <button className="score-dock__rbuf-btn" onClick={async () => {
            if (obsIsConnected) {
              await obsService.request('SaveReplayBuffer').catch(() => {});
              showFeedback('💾 Replay saved');
            } else showFeedback('OBS not connected');
          }}>
            💾 Save Replay
          </button>
          <button className="score-dock__rbuf-btn" onClick={async () => {
            if (obsIsConnected) {
              await obsService.request('StartReplayBuffer').catch(() => {});
              showFeedback('▶ Buffer started');
            } else showFeedback('OBS not connected');
          }}>
            ▶ Start Buffer
          </button>
          <button className="score-dock__rbuf-btn score-dock__rbuf-btn--stop" onClick={async () => {
            if (obsIsConnected) {
              await obsService.request('StopReplayBuffer').catch(() => {});
              showFeedback('⏹ Buffer stopped');
            } else showFeedback('OBS not connected');
          }}>
            ⏹ Stop
          </button>
        </div>
      </div>

      {/* Overlay Controls */}
      <div className="score-dock__section">
        <div className="score-dock__section-label">Overlay Controls</div>
        <div className="score-dock__overlay-grid">
          {OVERLAY_BUTTONS.map(btn => (
            <button
              key={btn.key}
              className={`score-dock__overlay-btn ${activeOverlay === btn.key ? 'active' : ''}`}
              style={{ '--btn-color': btn.color } as React.CSSProperties}
              onClick={() => triggerOverlay(btn.key)}
              title={`${btn.label} (${btn.shortcut})`}
            >
              <span className="score-dock__overlay-icon">{btn.icon}</span>
              <span className="score-dock__overlay-label">{btn.label}</span>
              <kbd className="score-dock__kbd">{btn.shortcut}</kbd>
            </button>
          ))}
        </div>
        <button className="score-dock__clear-btn" onClick={clearOverlay}>
          ✕ Clear Overlay (ESC)
        </button>
      </div>

      {/* Active Overlay Indicator */}
      {activeOverlay !== 'none' && (
        <div className="score-dock__active-indicator">
          <span className="score-dock__active-dot" />
          <span>{activeOverlay.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
      )}

      {/* Stats Overlay Controls */}
      <div className="score-dock__section">
        <div className="score-dock__section-label">Stats & Awards</div>
        <div className="score-dock__overlay-grid">
          {STATS_OVERLAY_BUTTONS.map(btn => (
            <button
              key={btn.key}
              className={`score-dock__overlay-btn ${activeOverlay === btn.key ? 'active' : ''}`}
              style={{ '--btn-color': btn.color } as React.CSSProperties}
              onClick={() => triggerOverlay(btn.key)}
              title={btn.label}
            >
              <span className="score-dock__overlay-icon">{btn.icon}</span>
              <span className="score-dock__overlay-label">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && <div className="score-dock__feedback">{feedback}</div>}

      {/* Shortcuts Reference */}
      <div className="score-dock__section score-dock__shortcuts">
        <div className="score-dock__section-label">Keyboard Shortcuts</div>
        <div className="score-dock__shortcut-list">
          {OVERLAY_BUTTONS.map(btn => (
            <div key={btn.key} className="score-dock__shortcut-row">
              <kbd className="score-dock__kbd">{btn.shortcut}</kbd>
              <span>{btn.label}</span>
            </div>
          ))}
          <div className="score-dock__shortcut-row">
            <kbd className="score-dock__kbd">ESC</kbd>
            <span>Clear</span>
          </div>
        </div>
      </div>
    </div>
  );
}
