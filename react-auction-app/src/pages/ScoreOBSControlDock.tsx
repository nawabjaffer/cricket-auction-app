// ============================================================================
// SCORE OBS CONTROL DOCK — /:tenantSlug/cricket/scorer/obs-dock
// Compact dock panel for controlling scoring overlays + OBS replay in OBS
// Add as Custom Browser Dock in OBS: Docks → Custom Browser Docks
// Works over WiFi: enter OBS computer's LAN IP as host
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { IoPlay, IoPause, IoPlayBack, IoPlayForward, IoRefresh, IoRadio } from 'react-icons/io5';
import { onValue, ref } from 'firebase/database';
import { scoringService } from '../services/scoring';
import { initializeSharedOBSProfileService, sharedOBSProfileService } from '../services/sharedOBSProfileService';
import { realtimeSync } from '../services/realtimeSync';
import { tenantPath } from '../services/tenantPath';
import { obsService } from '../services/obsService';
import { obsConnectionBridgeService, type OBSConnectionBridgePresence } from '../services/obsConnectionBridgeService';
import { CRICKET_REPLAY_MEDIA_INPUT, CRICKET_LIVE_SCENE, obsStreamingPresetService } from '../services/obsStreamingPresetService';
import { obsReplaySourceService } from '../services/scoring/obsReplaySourceService';
import { liveCommentService } from '../services/liveCommentService';
import { requestYouTubeReadToken, startYouTubeLiveChat } from '../services/youtubeLiveChat';
import { nextLiveComment } from '../utils/liveComments';
import { normalizePlayerName } from '../utils/playerName';
import { isInningsBreak } from '../utils/inningsBreak';
import { getAnimationActionDelayMs } from '../utils/animationAction';
import { getDockReplayButtons, resolveReplayButton } from '../utils/obsReplayConfig';
import type {
  MatchSetup, LiveScore, OverlayControlState, OverlayType,
  OBSReplayButton, OBSReplayConfig, ScoringOverlayConfig, LiveComment, LiveCommentSettings,
} from '../types/scoring';
import { DEFAULT_FIELD_PLACEMENTS, DEFAULT_LIVE_COMMENT_SETTINGS } from '../types/scoring';
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
  { key: 'player_stats_notes', label: 'Player Notes', icon: '📝', color: '#e5bb65' },
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

const EVENT_ANIMATION_CONFIG_KEYS: Partial<Record<OverlayType, keyof Pick<ScoringOverlayConfig,
  'fourAnimation' | 'sixAnimation' | 'wicketAnimation' | 'duckOutAnimation' | 'hatTrickAnimation'>>> = {
  boundary_four: 'fourAnimation',
  boundary_six: 'sixAnimation',
  wicket: 'wicketAnimation',
  duck_out: 'duckOutAnimation',
  hat_trick: 'hatTrickAnimation',
};

type DockConnectionMode = 'ip' | 'local' | 'relay';

const DOCK_MODE_OPTIONS: { key: DockConnectionMode; label: string; hint: string }[] = [
  { key: 'ip', label: 'IP Address', hint: 'Connect straight to the OBS machine using its LAN IP.' },
  { key: 'local', label: 'Local', hint: 'Dock is running on the same computer as OBS (127.0.0.1).' },
  { key: 'relay', label: 'Same Wi-Fi', hint: 'Phone sends commands over Firebase to the dock open on the OBS machine.' },
];

type ReplayActionLogStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
interface ReplayActionLogEntry {
  id: string;
  label: string;
  status: ReplayActionLogStatus;
  detail: string;
  updatedAt: number;
}
const REPLAY_BUTTON_DEBOUNCE_MS = 2000;

export default function ScoreOBSControlDock() {
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [firstInningsComplete, setFirstInningsComplete] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('none');
  const [activeOverlayData, setActiveOverlayData] = useState<Record<string, unknown> | null>(null);
  const [autoActionEvent, setAutoActionEvent] = useState<{ matchId: string; control: OverlayControlState } | null>(null);
  const [animationSettings, setAnimationSettings] = useState<ScoringOverlayConfig | null>(null);
  const [liveCommentSettings, setLiveCommentSettings] = useState<LiveCommentSettings>(DEFAULT_LIVE_COMMENT_SETTINGS);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [youtubeStatus, setYoutubeStatus] = useState<'off' | 'connecting' | 'connected' | 'error'>('off');
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
  const [drsReviewOpen, setDrsReviewOpen] = useState(false);
  const drsReviewRef = useRef(false);
  drsReviewRef.current = drsReviewOpen;
  const actionGeneration = useRef(0);
  const [drsMediaStatus, setDrsMediaStatus] = useState<{ mediaState: string; mediaDuration: number | null; mediaCursor: number | null } | null>(null);
  const [execBusy, setExecBusy] = useState<string | null>(null);
  const [queuedActionCount, setQueuedActionCount] = useState(0);
  const [replayActionLogs, setReplayActionLogs] = useState<ReplayActionLogEntry[]>([]);
  const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedReplayButtonIdsRef = useRef(new Set<string>());
  const lastReplayButtonPressRef = useRef(new Map<string, number>());
  const activeSeriesAbortRef = useRef<AbortController | null>(null);
  const [obsErrorDetail, setObsErrorDetail] = useState('');
  const [obsAttemptedUrls, setObsAttemptedUrls] = useState<string[]>([]);
  const [obsFailureSummary, setObsFailureSummary] = useState<string[]>([]);
  const [obsMixedContentHint, setObsMixedContentHint] = useState(false);
  const [relayOnlyMode, setRelayOnlyMode] = useState(false);
  const [sharedObsBridge, setSharedObsBridge] = useState<OBSConnectionBridgePresence | null>(null);
  const autoRelayFromBridgeRef = useRef(false);
  const isNativeObsHost = Boolean((globalThis as unknown as { obsstudio?: unknown }).obsstudio)
    || /obs/i.test(globalThis.navigator?.userAgent || '');
  const isMobileClient = /iphone|ipad|ipod|android/i.test(globalThis.navigator?.userAgent || '');

  const [connectionMode, setConnectionMode] = useState<DockConnectionMode>(() => {
    const stored = localStorage.getItem('obs_dock_mode') as DockConnectionMode | null;
    if (stored === 'ip' || stored === 'local' || stored === 'relay') return stored;
    if (isNativeObsHost) return 'local';
    return isMobileClient ? 'relay' : 'ip';
  });
  const connectionModeRef = useRef(connectionMode);
  connectionModeRef.current = connectionMode;

  const [singleOverlayMode, setSingleOverlayMode] = useState(false);
  const [activeMatchPointer, setActiveMatchPointer] = useState<string | null>(null);
  const singleOverlayModeRef = useRef(false);
  const dockCleanupRef = useRef<Array<() => void>>([]);
  const breakSceneActiveRef = useRef(false);
  const preBreakSceneRef = useRef<string | null>(null);
  const lastAutoActionEventRef = useRef<string | null>(null);
  const autoActionTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const youtubeStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sharedObsBridge || !autoRelayFromBridgeRef.current) return;
    const timer = setInterval(() => {
      if (obsConnectionBridgeService.isAlive(sharedObsBridge)) return;
      setSharedObsBridge(null);
      autoRelayFromBridgeRef.current = false;
      setRelayOnlyMode(false);
      const fallbackMode: DockConnectionMode = isNativeObsHost ? 'local' : isMobileClient ? 'relay' : 'ip';
      connectionModeRef.current = fallbackMode;
      localStorage.setItem('obs_dock_mode', fallbackMode);
      setConnectionMode(fallbackMode);
    }, 1_000);
    return () => clearInterval(timer);
  }, [isMobileClient, isNativeObsHost, sharedObsBridge]);

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
            liveCommentService.initialize(db, tenantPath('scoring'));
            obsReplaySourceService.initialize(db, tenantPath('scoring'));
            dockCleanupRef.current.push(onValue(ref(db, tenantPath('scoring/obsConnectionBridge')), snapshot => {
              const presence = snapshot.exists() ? snapshot.val() as OBSConnectionBridgePresence : null;
              const activeBridge = obsConnectionBridgeService.isAlive(presence) ? presence : null;
              const remoteBridge = activeBridge && !obsConnectionBridgeService.isOwner(activeBridge) ? activeBridge : null;
              setSharedObsBridge(remoteBridge);
              if (remoteBridge) {
                if (obsService.isConnected()) obsService.disconnect();
                setRelayOnlyMode(true);
                setObsErrorDetail('');
                if (connectionModeRef.current !== 'relay') {
                  autoRelayFromBridgeRef.current = true;
                  localStorage.setItem('obs_dock_mode', 'relay');
                  setConnectionMode('relay');
                }
              } else if (activeBridge) {
                autoRelayFromBridgeRef.current = false;
                setRelayOnlyMode(false);
              } else if (!activeBridge && autoRelayFromBridgeRef.current) {
                autoRelayFromBridgeRef.current = false;
                setRelayOnlyMode(false);
                const fallbackMode: DockConnectionMode = isNativeObsHost ? 'local' : isMobileClient ? 'relay' : 'ip';
                connectionModeRef.current = fallbackMode;
                localStorage.setItem('obs_dock_mode', fallbackMode);
                setConnectionMode(fallbackMode);
              }
            }));
            initialized.current = true;
          } else {
            console.error('[ScoreOBSControlDock] Failed to get database');
            return;
          }
        }
        const all = await scoringService.getAllMatches();
        setMatches(all);

        // Load OBS config here, after scoringService is initialized
        const localCfg = await scoringService.getOverlayConfig().catch(() => null);
        let cfg = localCfg;
        if (localCfg?.obsSharingEnabled && localCfg.obsSharedProfileId) {
          try {
            await initializeSharedOBSProfileService();
            const shared = await sharedOBSProfileService.get(localCfg.obsSharedProfileId);
            if (shared) {
              cfg = {
                ...localCfg,
                obsWebSocketConfig: shared.obsWebSocketConfig,
                obsReplayConfig: shared.obsReplayConfig,
              };
            }
          } catch { /* fall back to tenant-local settings */ }
        }
        setAnimationSettings(cfg || localCfg);
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
          obsStreamingPresetService.configureLatestReplaySource(cfg.obsReplayConfig.instantReplaySourceNames ?? cfg.obsReplayConfig.instantReplaySourceName, cfg.obsWebSocketConfig?.replayDurationSeconds);
        }

        // Keep following Single Overlay Mode + the active match reactively after load
        dockCleanupRef.current.push(scoringService.subscribeOverlayConfig((liveCfg) => {
          setSingleOverlayMode(!!liveCfg.singleOverlayMode);
          setAnimationSettings(liveCfg);
          if (liveCfg.obsReplayConfig) {
            setReplayConfig(liveCfg.obsReplayConfig);
            obsStreamingPresetService.configureLatestReplaySource(liveCfg.obsReplayConfig.instantReplaySourceNames ?? liveCfg.obsReplayConfig.instantReplaySourceName, liveCfg.obsWebSocketConfig?.replayDurationSeconds);
          }
        }));
        dockCleanupRef.current.push(liveCommentService.subscribeSettings(setLiveCommentSettings));
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

  useEffect(() => {
    youtubeStopRef.current?.();
    youtubeStopRef.current = null;
    setYoutubeStatus('off');
    if (!selectedMatchId || !initialized.current) { setLiveComments([]); return; }
    return liveCommentService.subscribeQueue(selectedMatchId, setLiveComments);
  }, [selectedMatchId]);

  // Subscribe to live score
  useEffect(() => {
    if (!selectedMatchId) return;
    const unsub = scoringService.subscribeLiveScore(selectedMatchId, (score) => {
      setLiveScore({
        ...score,
        currentBatsmen: [
          { ...score.currentBatsmen[0], playerName: normalizePlayerName(score.currentBatsmen[0]?.playerName ?? '') },
          { ...score.currentBatsmen[1], playerName: normalizePlayerName(score.currentBatsmen[1]?.playerName ?? '') },
        ],
        currentBowler: { ...score.currentBowler, playerName: normalizePlayerName(score.currentBowler?.playerName ?? '') },
      });
    });
    return unsub;
  }, [selectedMatchId]);

  useEffect(() => {
    setFirstInningsComplete(false);
    if (!selectedMatchId) return;
    const db = realtimeSync.getDatabase();
    if (!db) return;
    return onValue(ref(db, tenantPath(`scoring/matches/${selectedMatchId}/innings/1`)), snapshot => {
      setFirstInningsComplete(snapshot.exists() && (snapshot.val() as { isCompleted?: boolean }).isCompleted === true);
    });
  }, [selectedMatchId]);

  // Subscribe to overlay control
  useEffect(() => {
    if (!selectedMatchId) return;
    let isInitialSnapshot = true;
    const unsub = scoringService.subscribeOverlayControl(selectedMatchId, (control: OverlayControlState) => {
      setActiveOverlay(control.activeOverlay);
      setActiveOverlayData(control.activeOverlayData || null);
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }
      setAutoActionEvent({ matchId: selectedMatchId, control });
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

  useEffect(() => {
    return obsService.onEvent((event, data) => {
      if (event !== 'CurrentProgramSceneChanged') return;
      const sceneName = (data as { sceneName?: string } | null)?.sceneName;
      if (!sceneName) return;
      const reviewing = sceneName === (replayConfig.drsSceneName || 'Cricket - DRS');
      drsReviewRef.current = reviewing;
      setDrsReviewOpen(reviewing);
    });
  }, [replayConfig.drsSceneName]);

  useEffect(() => {
    if (obsStatus !== 'connected' || !drsReviewOpen) {
      setDrsMediaStatus(null);
      return;
    }
    let active = true;
    const refreshMediaStatus = async () => {
      try {
        const status = await obsService.request<{ mediaState: string; mediaDuration: number | null; mediaCursor: number | null }>(
          'GetMediaInputStatus', { inputName: replayConfig.drsMediaInputName || replayConfig.buttons.find(button => button.id === 'cricket-preset-drs-play')?.inputName || CRICKET_REPLAY_MEDIA_INPUT },
        );
        if (active) setDrsMediaStatus(status);
      } catch {
        if (active) setDrsMediaStatus(null);
      }
    };
    void refreshMediaStatus();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshMediaStatus(); }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [obsStatus, drsReviewOpen, replayConfig.drsMediaInputName, replayConfig.buttons]);

  useEffect(() => {
    if (obsStatus !== 'connected') return;
    const db = realtimeSync.getDatabase();
    if (!db) return;
    obsConnectionBridgeService.start(db, tenantPath('scoring'), replayConfig, 'dock');
  }, [obsStatus, replayConfig]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  }, []);

  const updateReplayActionLog = useCallback((id: string, update: Partial<Omit<ReplayActionLogEntry, 'id' | 'updatedAt'>> & Pick<ReplayActionLogEntry, 'label'>) => {
    setReplayActionLogs(current => {
      const existing = current.find(entry => entry.id === id);
      const next: ReplayActionLogEntry = {
        ...existing,
        ...update,
        id,
        label: update.label || existing?.label || id,
        status: update.status || existing?.status || 'queued',
        detail: update.detail || existing?.detail || 'Queued',
        updatedAt: Date.now(),
      };
      return [next, ...current.filter(entry => entry.id !== id)].slice(0, 8);
    });
  }, []);

  const enqueueOBSAction = useCallback((actionId: string, label: string, action: () => Promise<void>) => {
    setQueuedActionCount(count => count + 1);
    updateReplayActionLog(actionId, { label, status: 'queued', detail: 'Queued' });
    const runAction = async () => {
      setQueuedActionCount(count => Math.max(0, count - 1));
      setExecBusy(actionId);
      updateReplayActionLog(actionId, { label, status: 'running', detail: 'Starting…' });
      try {
        await action();
        setReplayActionLogs(current => current.map(entry => entry.id === actionId && entry.status === 'running'
          ? { ...entry, status: 'completed', detail: 'Completed', updatedAt: Date.now() }
          : entry));
      } catch (error) {
        updateReplayActionLog(actionId, { label, status: 'failed', detail: error instanceof Error ? error.message : String(error) });
        showFeedback(`${actionId} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setExecBusy(null);
      }
    };
    const nextAction = actionQueueRef.current.then(runAction, runAction);
    actionQueueRef.current = nextAction;
    return nextAction;
  }, [showFeedback, updateReplayActionLog]);

  useEffect(() => {
    const adsScene = replayConfig.inningsBreakSceneName;
    if (drsReviewRef.current) return;
    const inBreak = isInningsBreak({
      firstInningsComplete,
      currentInnings: liveScore?.currentInnings,
      secondInningsStarted: liveScore?.currentInnings === 2,
    });
    if (obsStatus !== 'connected' || !adsScene) return;

    if (inBreak && !breakSceneActiveRef.current) {
      const currentScene = obsService.getCurrentScene();
      if (currentScene && currentScene !== adsScene) preBreakSceneRef.current = currentScene;
      breakSceneActiveRef.current = true;
      void obsService.setScene(adsScene).then(ok => {
        if (!ok) showFeedback(`Could not switch to OBS scene: ${adsScene}`);
      });
    } else if (!inBreak && breakSceneActiveRef.current) {
      const returnScene = replayConfig.inningsBreakReturnSceneName || preBreakSceneRef.current;
      breakSceneActiveRef.current = false;
      preBreakSceneRef.current = null;
      if (returnScene && returnScene !== adsScene) {
        void obsService.setScene(returnScene).then(ok => {
          if (!ok) showFeedback(`Could not return to OBS scene: ${returnScene}`);
        });
      }
    }
  }, [firstInningsComplete, liveScore?.currentInnings, obsStatus, replayConfig.inningsBreakSceneName, replayConfig.inningsBreakReturnSceneName, showFeedback, drsReviewOpen]);

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
    activeSeriesAbortRef.current?.abort();
  }, []);

  const execReplayButton = useCallback((configuredButton: OBSReplayButton) => {
    const button = resolveReplayButton(configuredButton, replayConfig);
    if (!button.enabled) return Promise.resolve();
    const opensDRS = button.action === 'drs_review' || button.id === 'drs' || button.id === 'cricket-preset-switch-drs'
      || (button.action === 'scene_switch' && button.sceneName === replayConfig.drsSceneName);
    const now = Date.now();
    const lastPress = lastReplayButtonPressRef.current.get(button.id) || 0;
    const transport = button.action === 'media_input_seek' || button.action === 'media_input_action';
    if ((!transport && queuedReplayButtonIdsRef.current.has(button.id)) || (!transport && now - lastPress < REPLAY_BUTTON_DEBOUNCE_MS)) {
      showFeedback(`${button.label} is already running or was just triggered.`);
      return Promise.resolve();
    }
    if (opensDRS) {
      activeSeriesAbortRef.current?.abort();
      actionGeneration.current++;
      drsReviewRef.current = true;
      setDrsReviewOpen(true);
    }
    const generation = actionGeneration.current;
    queuedReplayButtonIdsRef.current.add(button.id);
    lastReplayButtonPressRef.current.set(button.id, now);

    const action = enqueueOBSAction(button.id, button.label, async () => {
      if (generation !== actionGeneration.current) return;
      if (!obsService.isConnected() && connectionMode !== 'relay' && !sharedObsBridge) {
        await handleObsConnect();
      }
      if (obsService.isConnected()) {
        const controller = button.action === 'series' || button.action === 'drs_review' ? new AbortController() : null;
        if (controller) activeSeriesAbortRef.current = controller;
        updateReplayActionLog(button.id, { label: button.label, status: 'running', detail: controller ? `Running 0/${button.series?.length || 0} steps` : 'Sending action to OBS' });
        let result;
        try {
          result = await obsReplaySourceService.executeButton(button, {
            signal: controller?.signal,
            onProgress: progress => updateReplayActionLog(button.id, {
              label: button.label,
              status: progress.status === 'cancelled' ? 'cancelled' : progress.status === 'failed' ? 'failed' : 'running',
              detail: `${progress.status === 'waiting' ? 'Waiting' : progress.status === 'running' ? 'Running' : progress.status} · step ${progress.stepIndex + 1}/${progress.totalSteps}: ${progress.stepLabel}`,
            }),
          });
        } finally {
          if (controller && activeSeriesAbortRef.current === controller) activeSeriesAbortRef.current = null;
        }
        if (result.cancelled) {
          updateReplayActionLog(button.id, { label: button.label, status: 'cancelled', detail: `${result.completedSteps}/${result.totalSteps} steps completed · cancelled` });
          showFeedback(`${button.label} cancelled`);
          return;
        }
        if (result.success) {
          updateReplayActionLog(button.id, { label: button.label, status: 'completed', detail: `${result.completedSteps}/${result.totalSteps} steps completed` });
          showFeedback(`▶ ${button.label} (${result.completedSteps}/${result.totalSteps})`);
        } else {
          const error = result.errors[0] || `${result.completedSteps}/${result.totalSteps} steps completed`;
          updateReplayActionLog(button.id, { label: button.label, status: 'failed', detail: error });
          throw new Error(error);
        }
      } else if (selectedMatchId && sharedObsBridge) {
        const commandId = await obsReplaySourceService.sendRelayCommand(selectedMatchId, button.id);
        updateReplayActionLog(button.id, { label: button.label, status: 'running', detail: 'Sent to connected OBS Dock · waiting for result' });
        const result = await obsReplaySourceService.waitForRelayResult(selectedMatchId, commandId);
        if (!result.success) {
          updateReplayActionLog(button.id, { label: button.label, status: 'failed', detail: result.error || 'OBS action failed' });
          throw new Error(result.error || 'OBS action failed');
        }
        updateReplayActionLog(button.id, { label: button.label, status: 'completed', detail: 'Executed on OBS Dock' });
        showFeedback(`▶ ${button.label} executed on OBS`);
      } else {
        throw new Error(obsService.getLastErrorDetail() || 'OBS is disconnected. Reconnect from this Dock or connect the OBS Dock on the host computer.');
      }
    });
    return action.finally(() => queuedReplayButtonIdsRef.current.delete(button.id));
  }, [connectionMode, enqueueOBSAction, handleObsConnect, selectedMatchId, sharedObsBridge, showFeedback, updateReplayActionLog, replayConfig]);

  const cancelActiveReplaySeries = useCallback(() => {
    const controller = activeSeriesAbortRef.current;
    if (!controller) return;
    controller.abort();
    if (execBusy) updateReplayActionLog(execBusy, { label: replayConfig.buttons.find(button => button.id === execBusy)?.label || execBusy, status: 'cancelled', detail: 'Cancellation requested…' });
  }, [execBusy, replayConfig.buttons, updateReplayActionLog]);

  useEffect(() => {
    if (drsReviewRef.current) return;
    if (!selectedMatchId || !autoActionEvent || autoActionEvent.matchId !== selectedMatchId) return;
    const { control } = autoActionEvent;
    const eventKey = `${autoActionEvent.matchId}:${control.lastUpdated}:${control.activeOverlay}`;
    if (lastAutoActionEventRef.current === eventKey) return;
    if (!animationSettings) return;

    const configKey = EVENT_ANIMATION_CONFIG_KEYS[control.activeOverlay];
    const animation = configKey ? animationSettings[configKey] : undefined;
    if (!animation) return;
    const delayMs = getAnimationActionDelayMs(animation);
    if (delayMs === null) return;

    const button = replayConfig.buttons.find(item => item.id === animation.obsActionButtonId && item.enabled);
    if (!button) {
      if (animation.obsActionButtonId) showFeedback('Configured OBS action button is missing or disabled in Replay Controls.');
      return;
    }
    lastAutoActionEventRef.current = eventKey;

    if (delayMs === 0) {
      void execReplayButton(button);
      return;
    }
    const timer = setTimeout(() => {
      autoActionTimersRef.current.delete(timer);
      if (!drsReviewRef.current) void execReplayButton(button);
    }, delayMs);
    autoActionTimersRef.current.add(timer);
  }, [animationSettings, autoActionEvent, execReplayButton, replayConfig.buttons, selectedMatchId, showFeedback]);

  useEffect(() => () => {
    autoActionTimersRef.current.forEach(timer => clearTimeout(timer));
    autoActionTimersRef.current.clear();
  }, [selectedMatchId]);

  const triggerOverlay = useCallback(async (overlay: OverlayType) => {
    if (!selectedMatchId) return;
    try {
      const animationTypes = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
      const isAnimation = animationTypes.includes(overlay);
      const newOverlay = isAnimation ? overlay : (activeOverlay === overlay ? 'none' : overlay);
      if (newOverlay === 'field_placement') {
        const [activePlacementId, savedPlacements] = await Promise.all([
          scoringService.getActiveFieldPlacement(selectedMatchId),
          scoringService.getFieldPlacements(selectedMatchId),
        ]);
        const placement = savedPlacements.find(item => item.id === activePlacementId)
          || savedPlacements.find(item => item.isDefault)
          || DEFAULT_FIELD_PLACEMENTS.find(item => item.isDefault)
          || DEFAULT_FIELD_PLACEMENTS[0];
        if (placement) {
          if (!savedPlacements.some(item => item.id === placement.id)) {
            await scoringService.saveFieldPlacement(selectedMatchId, placement);
          }
          if (activePlacementId !== placement.id) {
            await scoringService.setActiveFieldPlacement(selectedMatchId, placement.id);
          }
        }
      }
      await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: newOverlay });
      setActiveOverlay(newOverlay);
      showFeedback(newOverlay === 'none' ? 'Overlay cleared' : `Showing: ${overlay.replace(/_/g, ' ')}`);
    } catch (err) {
      showFeedback(`Error: ${err}`);
    }
  }, [selectedMatchId, activeOverlay, showFeedback]);

  const publishComment = useCallback(async (comment: LiveComment) => {
    if (!selectedMatchId) return;
    try {
      await scoringService.setOverlayControl(selectedMatchId, {
        activeOverlay: 'live_comment',
        activeOverlayData: { ...comment } as unknown as Record<string, unknown>,
      });
      showFeedback(`Showing comment #${liveComments.findIndex(item => item.id === comment.id) + 1}`);
    } catch { showFeedback('Could not show audience comment'); }
  }, [liveComments, selectedMatchId, showFeedback]);

  const removeComment = useCallback(async (comment: LiveComment) => {
    if (!selectedMatchId) return;
    try {
      if (activeOverlay === 'live_comment' && activeOverlayData?.id === comment.id) {
        await scoringService.setOverlayControl(selectedMatchId, { activeOverlay: 'none', activeOverlayData: {} });
      }
      await liveCommentService.remove(selectedMatchId, comment.id);
    } catch { showFeedback('Could not remove audience comment'); }
  }, [activeOverlay, activeOverlayData, selectedMatchId, showFeedback]);

  const toggleAudienceComments = useCallback(async () => {
    try {
      await liveCommentService.updateSettings({ enabled: !liveCommentSettings.enabled });
      showFeedback(liveCommentSettings.enabled ? 'Audience comments closed' : 'Audience comments opened');
    } catch { showFeedback('Could not update audience comment status'); }
  }, [liveCommentSettings.enabled, showFeedback]);

  const connectYouTube = useCallback(async () => {
    if (!selectedMatchId || !liveCommentSettings.youtubeEnabled || !liveCommentSettings.youtubeClientId || !liveCommentSettings.youtubeVideoId) {
      showFeedback('Configure YouTube and select a match first');
      return;
    }
    setYoutubeStatus('connecting');
    try {
      const accessToken = await requestYouTubeReadToken(liveCommentSettings.youtubeClientId);
      const stop = await startYouTubeLiveChat(
        accessToken,
        liveCommentSettings.youtubeVideoId,
        comment => { void liveCommentService.importYouTubeComment(selectedMatchId, comment.id, comment).catch(() => {}); },
        error => {
          youtubeStopRef.current?.();
          youtubeStopRef.current = null;
          setYoutubeStatus('error');
          showFeedback(error.message);
        },
      );
      youtubeStopRef.current = stop;
      setYoutubeStatus('connected');
      showFeedback('YouTube Live Chat connected');
    } catch (error) {
      setYoutubeStatus('error');
      showFeedback(error instanceof Error ? error.message : 'YouTube connection failed');
    }
  }, [liveCommentSettings, selectedMatchId, showFeedback]);

  const disconnectYouTube = useCallback(() => {
    youtubeStopRef.current?.();
    youtubeStopRef.current = null;
    setYoutubeStatus('off');
    showFeedback('YouTube Live Chat disconnected');
  }, [showFeedback]);

  useEffect(() => {
    if (activeOverlay !== 'live_comment' || !selectedMatchId || !liveCommentSettings.autoAdvance || liveComments.length === 0) return;
    const activeId = String(activeOverlayData?.id || '');
    const timer = setTimeout(() => {
      const next = nextLiveComment(liveComments, activeId);
      if (!next) return;
      void scoringService.setOverlayControl(selectedMatchId, {
        activeOverlay: 'live_comment',
        activeOverlayData: { ...next } as unknown as Record<string, unknown>,
      });
    }, Math.max(3, Number(liveCommentSettings.displayDurationSeconds) || 8) * 1000);
    return () => clearTimeout(timer);
  }, [activeOverlay, activeOverlayData, liveComments, liveCommentSettings.autoAdvance, liveCommentSettings.displayDurationSeconds, selectedMatchId]);

  useEffect(() => () => {
    youtubeStopRef.current?.();
    youtubeStopRef.current = null;
  }, []);

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

  const handlePowerplayChange = useCallback(async (active: boolean) => {
    if (!selectedMatchId || !liveScore) return;
    const updated = { ...liveScore, isPowerplay: active, powerplayOverride: active, lastUpdated: Date.now() };
    setLiveScore(updated);
    try {
      await scoringService.saveLiveScore(selectedMatchId, updated);
      showFeedback(active ? 'Powerplay enabled' : 'Powerplay disabled');
    } catch (err) {
      setLiveScore(liveScore);
      showFeedback(`Powerplay update failed: ${err}`);
    }
  }, [selectedMatchId, liveScore, showFeedback]);

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
      if (drsReviewRef.current || replayConfig.dockReplayOnly) return;
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
  }, [triggerOverlay, clearOverlay, replayConfig.dockReplayOnly]);

  const selectedMatch = matches.find(m => m.id === selectedMatchId);
  useEffect(() => {
    if (selectedMatch?.status !== 'completed') return;
    youtubeStopRef.current?.();
    youtubeStopRef.current = null;
    setYoutubeStatus('off');
    if (activeOverlay === 'live_comment' && selectedMatchId) {
      void scoringService.setOverlayControl(selectedMatchId, { activeOverlay: 'none', activeOverlayData: {} });
    }
  }, [activeOverlay, selectedMatch?.status, selectedMatchId]);
  const obsIsConnected = obsStatus === 'connected';
  const relayReady = connectionMode === 'relay' || relayOnlyMode || (!obsIsConnected && obsStatus !== 'connecting');
  const enabledButtons = getDockReplayButtons(replayConfig, 'main');
  const enabledDrsButtons = getDockReplayButtons(replayConfig, 'drs').filter(button => button.id !== 'cricket-preset-drs-live');
  const audienceUrl = new URL(globalThis.location.href);
  audienceUrl.pathname = audienceUrl.pathname.replace(/\/obs-dock$/, '/live-chat');
  if (selectedMatchId) audienceUrl.searchParams.set('matchId', selectedMatchId);
  else audienceUrl.searchParams.delete('matchId');

  const goLive = async () => {
    activeSeriesAbortRef.current?.abort();
    actionGeneration.current++;
    try {
      await actionQueueRef.current;
      const sceneName = replayConfig.liveSceneName || CRICKET_LIVE_SCENE;
      if (obsService.isConnected()) {
        await obsService.request('SetCurrentProgramScene', { sceneName });
      } else {
        const button = replayConfig.buttons.find(item => item.id === 'cricket-preset-drs-live' && item.enabled);
        if (!button || !selectedMatchId || !sharedObsBridge) throw new Error('Reconnect OBS or enable Go Live in OBS WS Admin.');
        const id = await obsReplaySourceService.sendRelayCommand(selectedMatchId, button.id);
        const result = await obsReplaySourceService.waitForRelayResult(selectedMatchId, id);
        if (!result.success) throw new Error(result.error || 'Could not return to live.');
      }
      drsReviewRef.current = false;
      setDrsReviewOpen(false);
      showFeedback('Live scene restored');
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error));
    }
  };

  if (drsReviewOpen) return (
    <div className="score-dock score-dock--review">
      <header className="score-dock__header"><strong>DRS Review</strong><span>{obsIsConnected ? 'OBS connected' : sharedObsBridge ? 'Shared OBS' : 'OBS disconnected'}</span></header>
      <section className="score-dock__drs-review">
        <header><strong>{replayConfig.drsDurationSeconds || 40}s capture</strong>
          <span>{drsMediaStatus?.mediaState?.replace(/^OBS_MEDIA_STATE_/, '').toLowerCase() || (execBusy ? 'Loading clip...' : 'Awaiting media status')}
            {drsMediaStatus?.mediaCursor != null && drsMediaStatus.mediaDuration != null ? ` · ${(drsMediaStatus.mediaCursor / 1000).toFixed(1)} / ${(drsMediaStatus.mediaDuration / 1000).toFixed(1)}s` : ''}
          </span>
        </header>
        <div className="score-dock__drs-controls">
          {enabledDrsButtons.map(button => <button key={button.id} type="button" title={button.label} onClick={() => void execReplayButton(button)}>
            {button.action === 'media_input_seek' ? (Number(button.mediaFrameOffset ?? button.mediaCursorOffset) < 0 ? <IoPlayBack /> : <IoPlayForward />)
              : button.mediaAction?.endsWith('_PAUSE') ? <IoPause /> : button.mediaAction?.endsWith('_RESTART') ? <IoRefresh /> : <IoPlay />}
            <span>{button.label}</span>
          </button>)}
        </div>
        <button className="score-dock__drs-live" type="button" onClick={() => void goLive()}><IoRadio />Go Live</button>
        {activeSeriesAbortRef.current && <button type="button" onClick={cancelActiveReplaySeries}>Cancel replay</button>}
        {feedback && <p className="score-dock__drs-feedback" role="status">{feedback}</p>}
        {replayActionLogs.slice(0, 1).map(entry => <p className="score-dock__drs-feedback" key={entry.id} role="status">{entry.label}: {entry.detail}</p>)}
      </section>
    </div>
  );

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
      {(!replayConfig.dockReplayOnly || !obsIsConnected) && (
      <div className="score-dock__obs-connect-panel">
        {sharedObsBridge && !obsIsConnected ? (
          <div className="score-dock__obs-shared-connection" role="status">
            <span className="score-dock__obs-shared-dot" />
            <span>Using the existing OBS connection from Admin at {sharedObsBridge.host}:{sharedObsBridge.port}. This dock won't open another WebSocket.</span>
          </div>
        ) : (
          <>
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
          </>
        )}

        {connectionMode !== 'relay' && !sharedObsBridge && (
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

        {connectionMode === 'relay' && !sharedObsBridge && (
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
                This HTTPS page may block plain ws://. On the OBS computer, open this page inside OBS Studio and use Local. From another browser, keep that OBS dock connected and use Same Wi-Fi, or configure a trusted WSS endpoint.
              </p>
            )}
          </>
        )}
      </div>
      )}

      {/* Match Selector */}
      {!replayConfig.dockReplayOnly && <>
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
          <label className="score-dock__powerplay-toggle">
            <input type="checkbox" checked={liveScore.isPowerplay} onChange={e => void handlePowerplayChange(e.target.checked)} />
            Powerplay
          </label>
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
      </>}
      <div className="score-dock__replay-panel">
        <div className="score-dock__replay-header">
          <span className="score-dock__replay-title">🎬 Replay Control</span>
          {enabledButtons.length > 0 && <span className="score-dock__replay-count">{enabledButtons.length} buttons</span>}
          {execBusy && <span className="score-dock__replay-count">Running: {enabledButtons.find(button => button.id === execBusy)?.label || execBusy}</span>}
          {queuedActionCount > 0 && <span className="score-dock__replay-count" role="status">{queuedActionCount} queued</span>}
          {obsIsConnected && <span className="score-dock__replay-live-badge">LIVE</span>}
          {relayReady && !obsIsConnected && <span className="score-dock__replay-relay-badge">RELAY</span>}
        </div>

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


        {replayActionLogs.length > 0 && (
          <div className="score-dock__replay-log" aria-live="polite">
            <div className="score-dock__replay-log-head">
              <span>Replay activity</span>
              {activeSeriesAbortRef.current && (
                <button type="button" onClick={cancelActiveReplaySeries}>Cancel running series</button>
              )}
            </div>
            <ol>
              {replayActionLogs.map(entry => (
                <li key={entry.id} data-status={entry.status}>
                  <span className="score-dock__replay-log-time">{new Date(entry.updatedAt).toLocaleTimeString()}</span>
                  <strong>{entry.label}</strong>
                  <span>{entry.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Overlay Controls */}
      {!replayConfig.dockReplayOnly && <>
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

      {/* Audience Comment Queue */}
      <div className="score-dock__section score-dock__comments">
        <div className="score-dock__section-label">Audience Comments <span>{liveComments.length} queued</span></div>
        <div className="score-dock__comment-status-row">
          <span className={liveCommentSettings.enabled ? 'is-open' : ''}>{liveCommentSettings.enabled ? 'Link open' : 'Link closed'}</span>
          <button className={`score-dock__comment-toggle ${liveCommentSettings.enabled ? 'is-open' : ''}`} onClick={() => void toggleAudienceComments()} disabled={!selectedMatchId}>
            {liveCommentSettings.enabled ? 'Close link' : 'Open link'}
          </button>
        </div>
        {selectedMatchId && (
          <div className="score-dock__comment-link-row">
            <input value={audienceUrl.toString()} readOnly aria-label="Audience comment link" />
            <button onClick={() => { void navigator.clipboard?.writeText(audienceUrl.toString()).then(() => showFeedback('Audience link copied')).catch(() => showFeedback('Copy blocked by browser')); }}>Copy</button>
          </div>
        )}
        {liveCommentSettings.youtubeEnabled && (
          <div className="score-dock__youtube-row">
            <span className={`score-dock__youtube-status is-${youtubeStatus}`}>YouTube: {youtubeStatus}</span>
            {youtubeStatus === 'connected' ? (
              <button onClick={disconnectYouTube}>Disconnect</button>
            ) : (
              <button onClick={() => void connectYouTube()} disabled={!selectedMatchId || youtubeStatus === 'connecting'}>
                {youtubeStatus === 'connecting' ? 'Connecting...' : 'Connect YouTube'}
              </button>
            )}
          </div>
        )}
        <div className="score-dock__comment-queue">
          {liveComments.length === 0 ? <p>No comments in the queue.</p> : liveComments.map((comment, index) => (
            <article key={comment.id} className={activeOverlay === 'live_comment' && activeOverlayData?.id === comment.id ? 'is-on-air' : ''}>
              <span className="score-dock__comment-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="score-dock__comment-copy">
                <strong>{comment.name}{comment.source === 'youtube' ? ' · YouTube' : ''}</strong>
                <p>{comment.message}</p>
                <small>{comment.upvotes} upvotes{comment.details ? ` · ${comment.details}` : ''}</small>
              </div>
              <div className="score-dock__comment-actions">
                <button onClick={() => void publishComment(comment)}>{activeOverlayData?.id === comment.id ? 'Replay' : 'Show'}</button>
                <button className="is-remove" onClick={() => void removeComment(comment)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </div>

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
      </>}
      {feedback && <div className="score-dock__feedback">{feedback}</div>}
    </div>
  );
}
