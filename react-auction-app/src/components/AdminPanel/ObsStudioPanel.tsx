import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IoAdd, IoCheckmarkCircle, IoCopyOutline, IoPlay, IoRadioButtonOn, IoRefresh, IoSave, IoStop, IoWarning,
} from 'react-icons/io5';
import { onValue, ref } from 'firebase/database';
import { obsService } from '../../services/obsService';
import { obsConnectionBridgeService, type OBSConnectionBridgePresence } from '../../services/obsConnectionBridgeService';
import { realtimeSync } from '../../services/realtimeSync';
import { getActiveTenant, tenantPath } from '../../services/tenantPath';
import { useLiveStreamingStore } from '../../store/liveStreamingStore';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import type { OBSConnectionState } from '../../types/streaming';
import type { OBSReplayConfig } from '../../types/scoring';
import './ObsStudioPanel.css';

export interface ObsOverlaySource {
  id: string;
  label: string;
  url: string;
  hint: string;
}

interface ObsStudioPanelProps {
  locked?: boolean;
  sources: ObsOverlaySource[];
  replayConfig: OBSReplayConfig;
}

interface SceneList { currentProgramSceneName: string; scenes: Array<{ sceneName: string; sceneIndex: number }> }
interface StreamStatus { outputActive: boolean; outputReconnecting?: boolean; outputDuration: number; outputCongestion?: number; outputSkippedFrames?: number; outputTotalFrames?: number }
interface RecordStatus { outputActive: boolean; outputPaused?: boolean; outputDuration: number }
interface ObsStats { cpuUsage: number; memoryUsage: number; availableDiskSpace: number; activeFps: number; averageFrameRenderTime: number; renderSkippedFrames: number; renderTotalFrames: number }
interface ObsVersion { obsVersion: string; obsWebSocketVersion: string }

interface SavedConnection { host: string; port: string; remember: boolean; password?: string }

const storageKey = () => `obs-studio-connection:${getActiveTenant()}`;

function loadConnection(): SavedConnection {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedConnection>;
      return {
        host: parsed.host || 'localhost',
        port: parsed.port || '4455',
        remember: Boolean(parsed.remember),
        password: parsed.remember ? parsed.password : undefined,
      };
    }
  } catch { /* corrupt or unavailable storage: fall back to defaults */ }
  return { host: 'localhost', port: '4455', remember: false };
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(part => String(part).padStart(2, '0')).join(':');
}

const settled = <T,>(promise: Promise<T>) => promise.catch(() => null);

export default function ObsStudioPanel({ locked = false, sources, replayConfig }: Readonly<ObsStudioPanelProps>) {
  const { isEnabled } = useFeatureFlags();
  const { setOBSEnabled, setOBSConnectionState } = useLiveStreamingStore();
  const initial = useRef(loadConnection()).current;

  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [password, setPassword] = useState(initial.password ?? '');
  const [remember, setRemember] = useState(initial.remember);
  const [status, setStatus] = useState<OBSConnectionState>(obsService.getConnectionState());
  const [sharedConnection, setSharedConnection] = useState<OBSConnectionBridgePresence | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [version, setVersion] = useState<ObsVersion | null>(null);
  const [scenes, setScenes] = useState<string[]>([]);
  const [currentScene, setCurrentScene] = useState('');
  const [stream, setStream] = useState<StreamStatus | null>(null);
  const [record, setRecord] = useState<RecordStatus | null>(null);
  const [replayActive, setReplayActive] = useState<boolean | null>(null);
  const [stats, setStats] = useState<ObsStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const connected = status === 'connected';

  useEffect(() => obsService.onConnectionChange(state => {
    setStatus(state);
    setOBSConnectionState(state);
  }), [setOBSConnectionState]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void realtimeSync.ensureInitialized().then(() => {
      if (!active) return;
      const db = realtimeSync.getDatabase();
      if (!db) return;
      unsubscribe = onValue(ref(db, tenantPath('scoring/obsConnectionBridge')), snapshot => {
        const presence = snapshot.exists() ? snapshot.val() as OBSConnectionBridgePresence : null;
        setSharedConnection(obsConnectionBridgeService.isAlive(presence) && !obsConnectionBridgeService.isOwner(presence)
          ? presence
          : null);
      });
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;
    void (async () => {
      await realtimeSync.ensureInitialized();
      const db = realtimeSync.getDatabase();
      if (cancelled || !db) return;
      obsConnectionBridgeService.start(db, tenantPath('scoring'), replayConfig, 'admin');
      obsConnectionBridgeService.updateReplayConfig(replayConfig);
    })();
    return () => { cancelled = true; };
  }, [connected, replayConfig]);

  const refresh = useCallback(async () => {
    if (!obsService.isConnected()) return;
    const [sceneList, streamStatus, recordStatus, obsStats, replay] = await Promise.all([
      settled(obsService.request<SceneList>('GetSceneList')),
      settled(obsService.request<StreamStatus>('GetStreamStatus')),
      settled(obsService.request<RecordStatus>('GetRecordStatus')),
      settled(obsService.request<ObsStats>('GetStats')),
      settled(obsService.request<{ outputActive: boolean }>('GetReplayBufferStatus')),
    ]);
    if (sceneList) {
      setScenes([...sceneList.scenes].sort((a, b) => b.sceneIndex - a.sceneIndex).map(scene => scene.sceneName));
      setCurrentScene(sceneList.currentProgramSceneName);
    }
    if (streamStatus) setStream(streamStatus);
    if (recordStatus) setRecord(recordStatus);
    if (obsStats) setStats(obsStats);
    setReplayActive(replay ? replay.outputActive : null);
  }, []);

  useEffect(() => {
    if (!connected) {
      setStream(null); setRecord(null); setStats(null); setScenes([]); setCurrentScene(''); setVersion(null); setReplayActive(null);
      return undefined;
    }
    void settled(obsService.request<ObsVersion>('GetVersion')).then(result => { if (result) setVersion(result); });
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 2000);
    return () => window.clearInterval(timer);
  }, [connected, refresh]);

  useEffect(() => {
    if (!sharedConnection) return undefined;
    const timer = window.setInterval(() => {
      if (obsConnectionBridgeService.isExpired(sharedConnection)) setSharedConnection(null);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [sharedConnection]);

  const handleConnect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      try {
        localStorage.setItem(storageKey(), JSON.stringify({ host, port, remember, password: remember ? password : undefined }));
      } catch { /* storage unavailable: connection still works for this session */ }
      const ok = await obsService.connect(host, Number.parseInt(port, 10) || 4455, password || undefined);
      setOBSEnabled(ok);
      if (!ok) setNotice({ tone: 'error', text: obsService.getLastErrorDetail() || 'Could not connect. Check that OBS is running with WebSocket enabled.' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    obsService.disconnect();
    setOBSEnabled(false);
  };

  const run = async (label: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: 'ok', text: success });
      await refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : `${label} failed` });
    } finally {
      setBusy(null);
    }
  };

  const toggleStream = () => {
    if (stream?.outputActive) {
      if (!window.confirm('Stop the live stream?')) return;
      void run('stream', () => obsService.request('StopStream'), 'Stream stopped');
    } else {
      void run('stream', () => obsService.request('StartStream'), 'Stream started');
    }
  };

  const toggleRecord = () => void (record?.outputActive
    ? run('record', () => obsService.request('StopRecord'), 'Recording stopped')
    : run('record', () => obsService.request('StartRecord'), 'Recording started'));

  const toggleRecordPause = () => void run('pause', () => obsService.request(record?.outputPaused ? 'ResumeRecord' : 'PauseRecord'));

  const toggleReplayBuffer = () => void run('replay', () => obsService.request(replayActive ? 'StopReplayBuffer' : 'StartReplayBuffer'));

  const addSource = async (source: ObsOverlaySource) => {
    if (!currentScene) return;
    const inputSettings = { url: source.url, width: 1920, height: 1080, fps: 30, shutdown: false, restart_when_active: false };
    await run(`source-${source.id}`, async () => {
      try {
        await obsService.request('CreateInput', {
          sceneName: currentScene,
          inputName: source.label,
          inputKind: 'browser_source',
          inputSettings,
          sceneItemEnabled: true,
        });
      } catch {
        // The input already exists: refresh its URL and make sure it is present in the current scene.
        await obsService.request('SetInputSettings', { inputName: source.label, inputSettings: { url: source.url }, overlay: true });
        try {
          await obsService.request('CreateSceneItem', { sceneName: currentScene, sourceName: source.label });
        } catch { /* already part of this scene */ }
      }
    }, `"${source.label}" is set up in scene "${currentScene}"`);
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ tone: 'ok', text: 'URL copied' });
    } catch {
      setNotice({ tone: 'error', text: 'Copy is not available in this browser' });
    }
  };

  if (!isEnabled('obs-studio-integration')) {
    return (
      <section className="obs-panel obs-panel--disabled">
        <h3>OBS Studio Control</h3>
        <p>This feature is turned off. Enable “OBS Studio Control” under System → Features to manage OBS from here.</p>
      </section>
    );
  }

  const droppedPct = stream?.outputTotalFrames ? ((stream.outputSkippedFrames ?? 0) / stream.outputTotalFrames) * 100 : 0;
  const diagnostics = connected ? null : obsService.getConnectionDiagnostics();
  const displayStatus = !connected && sharedConnection ? 'connected' : status;

  return (
    <div className="obs-panel">
      <section className="obs-card">
        <header className="obs-card__head">
          <div>
            <h3>OBS Studio connection</h3>
            <p>Control OBS Studio through its built-in WebSocket server. For another device on the same Wi-Fi, enter the OBS computer’s LAN IP; use <code>localhost</code> only on the OBS computer.</p>
          </div>
          <span className={`obs-pill obs-pill--${displayStatus}`}>
            {connected ? 'Connected here' : sharedConnection
              ? `Connected via ${sharedConnection.ownerType === 'dock' ? 'OBS Dock' : 'another tab'}`
              : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection failed' : 'Disconnected'}
          </span>
        </header>

        <div className="obs-form">
          <label><span>Host</span><input value={host} onChange={e => setHost(e.target.value)} disabled={connected} placeholder="localhost or 192.168.1.20" /></label>
          <label><span>Port</span><input value={port} onChange={e => setPort(e.target.value)} disabled={connected} inputMode="numeric" placeholder="4455" /></label>
          <label className="obs-form__wide"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={connected} placeholder="Leave empty if authentication is off" autoComplete="off" /></label>
        </div>
        <label className="obs-check">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} disabled={connected} />
          Remember the password on this device
        </label>

        <div className="obs-actions">
          {connected ? (
            <button type="button" className="obs-btn" onClick={handleDisconnect}><IoStop size={15} /> Disconnect</button>
          ) : (
            <button type="button" className="obs-btn obs-btn--primary" onClick={() => void handleConnect()} disabled={connecting || locked}>
              <IoPlay size={15} /> {connecting ? 'Connecting…' : sharedConnection ? 'Connect directly here' : 'Connect to OBS'}
            </button>
          )}
          {version && <span className="obs-meta">OBS {version.obsVersion} · WebSocket {version.obsWebSocketVersion}</span>}
        </div>

        {locked && <p className="obs-note obs-note--warn"><IoWarning size={15} /> OBS control requires a Pro or Enterprise plan.</p>}
        {sharedConnection && !connected && (
          <p className="obs-note obs-note--ok" role="status">
            <IoCheckmarkCircle size={15} /> OBS is active at {sharedConnection.host}:{sharedConnection.port}. Connect directly here to manage scenes and stream controls; the OBS Dock can relay replay actions over the same Wi-Fi.
          </p>
        )}
        {notice && <p className={`obs-note obs-note--${notice.tone === 'ok' ? 'ok' : 'error'}`}>{notice.tone === 'ok' ? <IoCheckmarkCircle size={15} /> : <IoWarning size={15} />} {notice.text}</p>}
        {diagnostics?.mixedContentLikely && (
          <p className="obs-note obs-note--warn"><IoWarning size={15} /> This page is served over HTTPS, so browsers may block ws:// connections to OBS. Use wss:// or open this admin over http on the same network.</p>
        )}
      </section>

      {connected && (
        <>
          <section className="obs-card">
            <header className="obs-card__head">
              <div><h3>Stream &amp; record</h3><p>Start, stop and monitor your output without leaving this app.</p></div>
              <button type="button" className="obs-btn obs-btn--ghost" onClick={() => void refresh()} title="Refresh now"><IoRefresh size={15} /> Refresh</button>
            </header>
            <div className="obs-controls">
              <div className={`obs-control ${stream?.outputActive ? 'is-live' : ''}`}>
                <div className="obs-control__title">
                  <span className={`obs-dot ${stream?.outputActive ? 'obs-dot--live' : ''}`} />
                  {stream?.outputReconnecting ? 'Reconnecting…' : stream?.outputActive ? 'LIVE' : 'Stream offline'}
                </div>
                <div className="obs-control__time">{formatDuration(stream?.outputDuration ?? 0)}</div>
                <button type="button" className={`obs-btn ${stream?.outputActive ? 'obs-btn--danger' : 'obs-btn--primary'}`} onClick={toggleStream} disabled={busy === 'stream'}>
                  {stream?.outputActive ? <><IoStop size={15} /> Stop stream</> : <><IoPlay size={15} /> Go live</>}
                </button>
                {stream?.outputActive && <small>Dropped frames {droppedPct.toFixed(1)}% · congestion {Math.round((stream.outputCongestion ?? 0) * 100)}%</small>}
              </div>

              <div className={`obs-control ${record?.outputActive ? 'is-recording' : ''}`}>
                <div className="obs-control__title">
                  <IoRadioButtonOn size={14} className={record?.outputActive ? 'obs-rec' : ''} />
                  {record?.outputPaused ? 'Recording paused' : record?.outputActive ? 'Recording' : 'Not recording'}
                </div>
                <div className="obs-control__time">{formatDuration(record?.outputDuration ?? 0)}</div>
                <div className="obs-actions">
                  <button type="button" className={`obs-btn ${record?.outputActive ? 'obs-btn--danger' : ''}`} onClick={toggleRecord} disabled={busy === 'record'}>
                    {record?.outputActive ? <><IoStop size={15} /> Stop</> : <><IoRadioButtonOn size={15} /> Record</>}
                  </button>
                  {record?.outputActive && <button type="button" className="obs-btn obs-btn--ghost" onClick={toggleRecordPause} disabled={busy === 'pause'}>{record.outputPaused ? 'Resume' : 'Pause'}</button>}
                </div>
              </div>

              <div className="obs-control">
                <div className="obs-control__title">Replay buffer</div>
                <div className="obs-control__time">{replayActive === null ? 'Unavailable' : replayActive ? 'Active' : 'Off'}</div>
                <div className="obs-actions">
                  <button type="button" className="obs-btn" onClick={toggleReplayBuffer} disabled={replayActive === null || busy === 'replay'}>
                    {replayActive ? 'Stop buffer' : 'Start buffer'}
                  </button>
                  <button type="button" className="obs-btn obs-btn--ghost" onClick={() => void run('save-replay', () => obsService.request('SaveReplayBuffer'), 'Replay saved')} disabled={!replayActive || busy === 'save-replay'}>
                    <IoSave size={14} /> Save replay
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="obs-card">
            <header className="obs-card__head">
              <div><h3>Scenes</h3><p>Click a scene to switch the program output.</p></div>
              <span className="obs-meta">{scenes.length} scene{scenes.length === 1 ? '' : 's'}</span>
            </header>
            <div className="obs-scenes">
              {scenes.map(scene => (
                <button
                  key={scene}
                  type="button"
                  className={`obs-scene ${scene === currentScene ? 'is-active' : ''}`}
                  onClick={() => void run('scene', () => obsService.setScene(scene))}
                  disabled={busy === 'scene'}
                >
                  {scene === currentScene && <span className="obs-scene__badge">PROGRAM</span>}
                  {scene}
                </button>
              ))}
              {scenes.length === 0 && <p className="obs-meta">No scenes found in OBS.</p>}
            </div>
          </section>

          {stats && (
            <section className="obs-card">
              <header className="obs-card__head"><div><h3>Performance</h3><p>Live health of the OBS machine.</p></div></header>
              <dl className="obs-stats">
                <div><dt>CPU</dt><dd>{stats.cpuUsage.toFixed(1)}%</dd></div>
                <div><dt>Memory</dt><dd>{Math.round(stats.memoryUsage)} MB</dd></div>
                <div><dt>FPS</dt><dd>{stats.activeFps.toFixed(1)}</dd></div>
                <div><dt>Render time</dt><dd>{stats.averageFrameRenderTime.toFixed(1)} ms</dd></div>
                <div><dt>Skipped (render)</dt><dd>{stats.renderSkippedFrames}/{stats.renderTotalFrames}</dd></div>
                <div><dt>Free disk</dt><dd>{(stats.availableDiskSpace / 1024).toFixed(1)} GB</dd></div>
              </dl>
            </section>
          )}

          <section className="obs-card">
            <header className="obs-card__head">
              <div><h3>Overlay sources</h3><p>Add these pages to the current scene as 1920 × 1080 browser sources.</p></div>
              <span className="obs-meta">Scene: {currentScene || '—'}</span>
            </header>
            <ul className="obs-sources">
              {sources.map(source => (
                <li key={source.id}>
                  <div>
                    <strong>{source.label}</strong>
                    <small>{source.hint}</small>
                    <code>{source.url}</code>
                  </div>
                  <div className="obs-actions">
                    <button type="button" className="obs-btn obs-btn--ghost" onClick={() => void copyUrl(source.url)}><IoCopyOutline size={14} /> Copy</button>
                    <button type="button" className="obs-btn" onClick={() => void addSource(source)} disabled={!currentScene || busy === `source-${source.id}`}><IoAdd size={14} /> Add to OBS</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
