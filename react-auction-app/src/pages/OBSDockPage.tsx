// ============================================================================
// OBS DOCK PAGE - Custom Browser Dock Panel for OBS Studio
// Add as a Custom Browser Dock in OBS: Docks → Custom Browser Docks
// Provides scene switching, streaming controls, and auction state preview
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRealtimeMobileSync } from '../hooks';
import { useCurrencySuffix } from '../store';
import { obsService } from '../services/obsService';
import { obsIntegrationPlugin } from '../services/obsIntegrationPlugin';
import type { OBSConnectionState } from '../types/streaming';
import './OBSDockPage.css';

export default function OBSDockPage() {
  const { currentPlayer, currentBid, selectedTeam } = useRealtimeMobileSync();
  const currencySuffix = useCurrencySuffix();

  // Connection state
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');
  const [connState, setConnState] = useState<OBSConnectionState>('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // OBS state
  const [scenes, setScenes] = useState<string[]>([]);
  const [currentScene, setCurrentScene] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoSync, setAutoSync] = useState(true);

  // Scene map
  const [sceneMap, setSceneMap] = useState(obsIntegrationPlugin.getSceneMap());

  // Subscribe to OBS connection state
  useEffect(() => {
    const unsub = obsIntegrationPlugin.onConnectionChange((state) => {
      setConnState(state);
      if (state === 'connected') {
        setConnectError(null);
        obsIntegrationPlugin.refreshScenes().then((s) => {
          setScenes(s);
          const cur = obsIntegrationPlugin.getCurrentScene();
          if (cur) setCurrentScene(cur);
        }).catch(() => {});
      } else if (state === 'disconnected' || state === 'error') {
        setScenes([]);
        setCurrentScene('');
      }
    });
    return unsub;
  }, []);

  // Subscribe to OBS events for scene/streaming changes
  useEffect(() => {
    const unsub = obsService.onEvent((event, data) => {
      if (event === 'CurrentProgramSceneChanged') {
        const d = data as { sceneName?: string };
        if (d.sceneName) setCurrentScene(d.sceneName);
      }
      if (event === 'StreamStateChanged') {
        const d = data as { outputActive?: boolean };
        setIsStreaming(!!d.outputActive);
      }
    });
    return unsub;
  }, []);

  const handleConnect = useCallback(async () => {
    const portNum = parseInt(port, 10);
    if (!host.trim()) { setConnectError('Host is required'); return; }
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) { setConnectError('Port must be 1–65535'); return; }

    setIsConnecting(true);
    setConnectError(null);
    try {
      const ok = await obsIntegrationPlugin.connect({
        host: host.trim(),
        port: portNum,
        password: password || undefined,
      });
      if (!ok) {
        const state = connState;
        if (state === 'error') {
          setConnectError('Could not reach OBS. Check host/port and that OBS WebSocket server is enabled.');
        } else {
          setConnectError('Connection failed. Check your password and OBS WebSocket settings.');
        }
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsConnecting(false);
    }
  }, [host, port, password, connState]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  }, [handleConnect]);

  const handleDisconnect = useCallback(() => {
    obsIntegrationPlugin.disconnect();
    setConnectError(null);
  }, []);

  const handleSwitchScene = useCallback(async (sceneName: string) => {
    const ok = await obsIntegrationPlugin.setScene(sceneName);
    if (ok) setCurrentScene(sceneName);
  }, []);

  const handleToggleStream = useCallback(async () => {
    if (isStreaming) {
      await obsIntegrationPlugin.stopStreaming();
    } else {
      await obsIntegrationPlugin.startStreaming();
    }
  }, [isStreaming]);

  const handleAutoSyncToggle = useCallback(() => {
    const next = !autoSync;
    setAutoSync(next);
    obsIntegrationPlugin.setAutoModeSync(next);
  }, [autoSync]);

  const handleSceneMapChange = useCallback((mode: keyof typeof sceneMap, sceneName: string) => {
    const updated = obsIntegrationPlugin.updateSceneMap({ [mode]: sceneName });
    setSceneMap(updated);
  }, [sceneMap]);

  const statusColor = useMemo(() => {
    switch (connState) {
      case 'connected': return '#22c55e';
      case 'connecting': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  }, [connState]);

  const statusLabel = useMemo(() => {
    switch (connState) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting…';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  }, [connState]);

  const isConnected = connState === 'connected';

  return (
    <div className="obs-dock">
      <div className="obs-dock__header">
        <span className="obs-dock__title">Auction × OBS</span>
        <div className="obs-dock__header-status">
          <span className="obs-dock__status" style={{ background: statusColor }} />
          <span className="obs-dock__status-text" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Connection Section */}
      {!isConnected && (
        <div className="obs-dock__section">
          <div className="obs-dock__conn-help">
            In OBS: <b>Tools → WebSocket Server Settings → Enable</b>
          </div>
          <div className="obs-dock__conn-fields">
            <input
              className="obs-dock__input"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Host (e.g. localhost)"
              disabled={isConnecting}
            />
            <input
              className="obs-dock__input obs-dock__input--port"
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="4455"
              disabled={isConnecting}
            />
          </div>
          <input
            className="obs-dock__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="WebSocket password (if set)"
            disabled={isConnecting}
          />

          {connectError && (
            <div className="obs-dock__error">
              ⚠ {connectError}
            </div>
          )}

          <button
            className="obs-dock__btn obs-dock__btn--connect"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <><span className="obs-dock__spinner" /> Connecting…</>
            ) : 'Connect to OBS'}
          </button>

          {connState === 'error' && !isConnecting && (
            <p className="obs-dock__muted" style={{ marginTop: 6 }}>
              Make sure OBS is open and WebSocket server is enabled on port {port}.
            </p>
          )}
        </div>
      )}

      {/* Connected Controls */}
      {isConnected && (
        <>
          {/* Quick Status */}
          <div className="obs-dock__section obs-dock__status-bar">
            <span className="obs-dock__label">OBS Connected ✓</span>
            <button
              className="obs-dock__btn obs-dock__btn--sm obs-dock__btn--ghost"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>

          {/* Scenes */}
          <div className="obs-dock__section">
            <div className="obs-dock__section-title">Scenes</div>
            <div className="obs-dock__scene-grid">
              {scenes.map((s) => (
                <button
                  key={s}
                  className={`obs-dock__scene-btn ${s === currentScene ? 'active' : ''}`}
                  onClick={() => handleSwitchScene(s)}
                >
                  {s}
                </button>
              ))}
              {scenes.length === 0 && (
                <span className="obs-dock__muted">No scenes found</span>
              )}
            </div>
          </div>

          {/* Scene Mapping */}
          <div className="obs-dock__section">
            <div className="obs-dock__section-title">
              Auto Scene Mapping
              <label className="obs-dock__toggle-label">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={handleAutoSyncToggle}
                />
                <span className="obs-dock__toggle-track">
                  <span className="obs-dock__toggle-thumb" />
                </span>
              </label>
            </div>
            {autoSync && (
              <div className="obs-dock__map-grid">
                {(Object.keys(sceneMap) as Array<keyof typeof sceneMap>).map((mode) => (
                  <div key={mode} className="obs-dock__map-row">
                    <span className="obs-dock__map-mode">{mode}</span>
                    <select
                      className="obs-dock__select"
                      value={sceneMap[mode]}
                      onChange={(e) => handleSceneMapChange(mode, e.target.value)}
                    >
                      <option value="">— none —</option>
                      {scenes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Streaming Control */}
          <div className="obs-dock__section">
            <button
              className={`obs-dock__btn obs-dock__btn--stream ${isStreaming ? 'live' : ''}`}
              onClick={handleToggleStream}
            >
              {isStreaming ? '⏹ Stop Streaming' : '▶ Start Streaming'}
            </button>
          </div>

          {/* Live Auction Status */}
          <div className="obs-dock__section obs-dock__auction-preview">
            <div className="obs-dock__section-title">Auction Status</div>
            {currentPlayer ? (
              <div className="obs-dock__player-row">
                <div className="obs-dock__player-info">
                  <strong>{currentPlayer.name}</strong>
                  <span>{currentPlayer.role}</span>
                </div>
                <div className="obs-dock__bid-badge">
                  {currentBid > 0 ? `₹${currentBid.toFixed(1)}${currencySuffix}` : 'Base'}
                </div>
              </div>
            ) : (
              <span className="obs-dock__muted">No active player</span>
            )}
            {selectedTeam && (
              <div className="obs-dock__team-badge">
                Bidding: {selectedTeam.name}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="obs-dock__footer">
        <span className="obs-dock__muted">Browser Source URL:</span>
        <code className="obs-dock__url">{window.location.origin}/obs-overlay</code>
      </div>
    </div>
  );
}

