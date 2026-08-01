// ============================================================================
// STREAMING TAB - V3 Premium Live Streaming Settings
// Admin panel tab for configuring OBS, cameras, and broadcast settings
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useTenantNavigate as useNavigate } from '../../hooks/useTenantNavigate';
import { getTenantSlugFromPath } from '../../hooks/useTenantNavigate';
import { IoVideocam, IoRadio, IoSettings, IoPlay, IoStop } from 'react-icons/io5';
import { GiCricketBat } from 'react-icons/gi';
import { useLocation } from 'react-router-dom';
import { useLiveStreamingStore } from '../../store/liveStreamingStore';
import { obsService } from '../../services/obsService';
import { scoringService } from '../../services/scoring';
import { realtimeSync } from '../../services/realtimeSync';
import { tenantPath } from '../../services/tenantPath';
import { premiumService } from '../../services/premiumService';
import { featureFlagsService } from '../../services/featureFlagsService';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import type { PremiumTier } from '../../types/premium';
import type { OBSConnectionState, SuccessAnimationType } from '../../types/streaming';
import type { ScoringOverlayConfig } from '../../types/scoring';

interface StreamingTabProps {
  onClose?: () => void;
}

export default function StreamingTab({ onClose }: StreamingTabProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantSlug = getTenantSlugFromPath(location.pathname);
  const baseUrl = window.location.origin + (tenantSlug ? `/${tenantSlug}` : '');
  
  // Feature flags
  const { isEnabled } = useFeatureFlags();
  const ownerOverlayEnabled = isEnabled('owner-overlay-in-break');
  const superAdminEnabled = isEnabled('super-admin-bidding');

  // Save feedback
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const showSaveFeedback = useCallback((msg: string) => {
    setSaveFeedback(msg);
    setTimeout(() => setSaveFeedback(null), 3000);
  }, []);
  
  // Store state
  const {
    broadcast,
    overlay,
    isPremium,
    maxCameras,
    setOBSEnabled,
    setOBSConnectionState,
    setRTMPEnabled,
    setRTMPConfig,
    setPlayerOverlayVisible,
    setBidOverlayVisible,
    setSuccessAnimationType,
    setPremiumStatus,
  } = useLiveStreamingStore();

  // Local state
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [obsStatus, setObsStatus] = useState<OBSConnectionState>('disconnected');
  const [rtmpUrl, setRtmpUrl] = useState(broadcast.rtmp.serverUrl);
  const [rtmpKey, setRtmpKey] = useState(broadcast.rtmp.streamKey);
  const [currentTier, setCurrentTier] = useState<PremiumTier>('free');
  const [isConnecting, setIsConnecting] = useState(false);
  const [singleOverlayMode, setSingleOverlayMode] = useState(false);
  const [savingSingleOverlay, setSavingSingleOverlay] = useState(false);

  // Load + follow the cricket scoring "Single Overlay Mode" flag (tenant-scoped)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) return;
        try { scoringService.initialize(db, tenantPath('scoring')); } catch { /* already initialized */ }
        const cfg = await scoringService.getOverlayConfig().catch(() => null);
        setSingleOverlayMode(!!cfg?.singleOverlayMode);
        unsub = scoringService.subscribeOverlayConfig((liveCfg) => setSingleOverlayMode(!!liveCfg.singleOverlayMode));
      } catch { /* non-critical */ }
    };
    init();
    return () => unsub?.();
  }, []);

  const handleToggleSingleOverlay = async (enabled: boolean) => {
    setSingleOverlayMode(enabled);
    setSavingSingleOverlay(true);
    try {
      const cfg = await scoringService.getOverlayConfig().catch(() => null);
      const updated: ScoringOverlayConfig = {
        ...(cfg || {
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
        }),
        singleOverlayMode: enabled,
      };
      await scoringService.saveOverlayConfig(updated);
      showSaveFeedback(enabled ? 'Single Overlay Mode enabled' : 'Single Overlay Mode disabled');
    } catch {
      showSaveFeedback('Failed to save Single Overlay Mode');
    } finally {
      setSavingSingleOverlay(false);
    }
  };

  // Load premium status
  useEffect(() => {
    const user = premiumService.getCurrentUser();
    if (user) {
      setCurrentTier(user.tier);
      setPremiumStatus(
        premiumService.canUseLiveStreaming(),
        premiumService.getMaxCameras()
      );
    } else {
      // Demo mode - enable all features
      setCurrentTier('pro');
      setPremiumStatus(true, 4);
    }
  }, [setPremiumStatus]);

  // Subscribe to OBS connection state
  useEffect(() => {
    const unsubscribe = obsService.onConnectionChange((state) => {
      setObsStatus(state);
      setOBSConnectionState(state);
    });

    return unsubscribe;
  }, [setOBSConnectionState]);

  // Connect to OBS
  const handleConnectOBS = async () => {
    if (!premiumService.canUseOBS() && currentTier !== 'pro' && currentTier !== 'enterprise') {
      alert('OBS integration requires Pro or Enterprise tier');
      return;
    }

    setIsConnecting(true);
    try {
      const success = await obsService.connect(
        obsHost,
        parseInt(obsPort),
        obsPassword || undefined
      );

      if (success) {
        setOBSEnabled(true);
      }
    } catch (error) {
      console.error('Failed to connect to OBS:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from OBS
  const handleDisconnectOBS = () => {
    obsService.disconnect();
    setOBSEnabled(false);
  };

  // Save RTMP settings
  const handleSaveRTMP = () => {
    setRTMPConfig(rtmpUrl, rtmpKey);
    setRTMPEnabled(true);
  };

  // Open live page
  const handleOpenLive = () => {
    if (onClose) onClose();
    navigate('/live');
  };

  // Premium tier badges
  const tierBadge = (tier: PremiumTier) => {
    const colors: Record<PremiumTier, string> = {
      free: '#6b7280',
      basic: '#3b82f6',
      pro: '#8b5cf6',
      enterprise: '#f59e0b',
    };

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.25rem 0.5rem',
          background: colors[tier],
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#fff',
          textTransform: 'uppercase',
        }}
      >
        {tier}
      </span>
    );
  };

  return (
    <div className="admin-panel__tab-content">
      {/* Premium Status Banner */}
      <div
        style={{
          padding: '1rem',
          background: isPremium
            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))'
            : 'rgba(107, 114, 128, 0.1)',
          borderRadius: '0.75rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600, color: '#000' }}>Subscription Status</span>
              {tierBadge(currentTier)}
            </div>
            <p style={{ fontSize: '0.875rem', color: 'rgba(0, 0, 0, 0.6)', margin: 0 }}>
              {isPremium
                ? `Up to ${maxCameras} cameras • OBS Integration • RTMP Streaming`
                : 'Upgrade to access live streaming features'}
            </p>
          </div>
          {!isPremium && (
            <button
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #ffd700, #ff9500)',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#000',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Upgrade
            </button>
          )}
        </div>
      </div>

      {/* Quick Launch */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">
          <IoVideocam /> Quick Launch
        </h3>
        <button
          onClick={handleOpenLive}
          disabled={!isPremium}
          style={{
            width: '100%',
            padding: '1rem',
            background: isPremium
              ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
              : 'rgba(107, 114, 128, 0.3)',
            border: 'none',
            borderRadius: '0.75rem',
            color: '#fff',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: isPremium ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <IoPlay /> Open Live Broadcast View
        </button>
        <p style={{ fontSize: '0.75rem', color: 'rgba(0, 0, 0, 0.5)', marginTop: '0.5rem' }}>
          Opens the full-screen broadcast view at /live
        </p>
      </div>

      {/* OBS Integration */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">
          <IoRadio /> OBS Studio Integration
          {currentTier !== 'pro' && currentTier !== 'enterprise' && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#f59e0b' }}>
              (Pro+)
            </span>
          )}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={obsHost}
              onChange={(e) => setObsHost(e.target.value)}
              placeholder="Host (localhost)"
              className="admin-panel__input"
              style={{ flex: 2 }}
              disabled={obsStatus === 'connected'}
            />
            <input
              type="text"
              value={obsPort}
              onChange={(e) => setObsPort(e.target.value)}
              placeholder="Port"
              className="admin-panel__input"
              style={{ flex: 1 }}
              disabled={obsStatus === 'connected'}
            />
          </div>

          <input
            type="password"
            value={obsPassword}
            onChange={(e) => setObsPassword(e.target.value)}
            placeholder="Password (optional)"
            className="admin-panel__input"
            disabled={obsStatus === 'connected'}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background:
                  obsStatus === 'connected'
                    ? '#22c55e'
                    : obsStatus === 'connecting'
                    ? '#f59e0b'
                    : obsStatus === 'error'
                    ? '#ef4444'
                    : '#6b7280',
              }}
            />
            <span style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', flex: 1 }}>
              {obsStatus === 'connected'
                ? 'Connected to OBS'
                : obsStatus === 'connecting'
                ? 'Connecting...'
                : obsStatus === 'error'
                ? 'Connection failed'
                : 'Disconnected'}
            </span>

            {obsStatus === 'connected' ? (
              <button
                onClick={handleDisconnectOBS}
                className="admin-panel__btn admin-panel__btn--secondary"
              >
                <IoStop /> Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnectOBS}
                disabled={isConnecting || (currentTier !== 'pro' && currentTier !== 'enterprise')}
                className="admin-panel__btn admin-panel__btn--primary"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* OBS Integration Guide */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">
          <IoSettings /> OBS Setup Guide
        </h3>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          fontSize: '0.85rem',
          color: 'rgba(0, 0, 0, 0.8)',
        }}>
          {/* Step 1 */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#3b82f6',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>1</span>
            <div>
              <strong style={{ color: '#000' }}>Enable OBS WebSocket</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                In OBS Studio, go to <strong>Tools → WebSocket Server Settings</strong>. Enable the server, set the port to <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.75rem' }}>4455</code> (default), and optionally set a password. Click <em>Apply</em>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#3b82f6',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>2</span>
            <div>
              <strong style={{ color: '#000' }}>Connect from This App</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                Enter the host, port, and password above, then click <em>Connect</em>. The status dot turns green when connected.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#3b82f6',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>3</span>
            <div>
              <strong style={{ color: '#000' }}>Add Browser Source for Live View</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                In OBS, click <strong>Sources → + → Browser</strong>. Set the URL to:
              </p>
              <code style={{
                display: 'block',
                marginTop: '0.35rem',
                padding: '0.35rem 0.6rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 6,
                fontSize: '0.78rem',
                color: '#60a5fa',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}>{window.location.origin}/live</code>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                Set resolution to <strong>1920 × 1080</strong>. This captures the full broadcast view (camera + overlays).
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#8b5cf6',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>4</span>
            <div>
              <strong style={{ color: '#000' }}>Add Transparent Overlay (Optional)</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                For compositing over your own camera in OBS, add a <strong>second Browser Source</strong> with:
              </p>
              <code style={{
                display: 'block',
                marginTop: '0.35rem',
                padding: '0.35rem 0.6rem',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: 6,
                fontSize: '0.78rem',
                color: '#a78bfa',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}>{window.location.origin}/obs-overlay</code>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                This shows only player info, bid ticker, and sold animation on a transparent background — perfect for layering over your camera feed.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#8b5cf6',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>5</span>
            <div>
              <strong style={{ color: '#000' }}>Add Control Dock (Optional)</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                In OBS, go to <strong>Docks → Custom Browser Docks</strong>. Add a new dock with URL:
              </p>
              <code style={{
                display: 'block',
                marginTop: '0.35rem',
                padding: '0.35rem 0.6rem',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: 6,
                fontSize: '0.78rem',
                color: '#a78bfa',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}>{window.location.origin}/obs-dock</code>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'rgba(0, 0, 0, 0.6)', lineHeight: 1.5 }}>
                This adds a dockable panel inside OBS for switching scenes, controlling streams, and monitoring auction state — all without leaving OBS.
              </p>
            </div>
          </div>

          {/* Quick reference card */}
          <div style={{
            marginTop: '0.25rem',
            padding: '0.75rem',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '0.5rem',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#000', marginBottom: '0.5rem' }}>Quick Reference URLs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(0,0,0,0.5)' }}>Full broadcast:</span>
                <code style={{ color: '#60a5fa' }}>/live</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(0,0,0,0.5)' }}>Transparent overlay:</span>
                <code style={{ color: '#a78bfa' }}>/obs-overlay</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(0,0,0,0.5)' }}>Auction OBS dock:</span>
                <code style={{ color: '#a78bfa' }}>/obs-dock</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(0,0,0,0.5)' }}>Cricket scoring dock:</span>
                <code style={{ color: '#34d399' }}>/cricket/scorer/obs-dock</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(0,0,0,0.5)' }}>Admin controls:</span>
                <code style={{ color: '#60a5fa' }}>/live-admin</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RTMP Settings */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">
          <IoSettings /> RTMP Streaming
          {currentTier === 'free' || currentTier === 'basic' ? (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#f59e0b' }}>
              (Pro+)
            </span>
          ) : null}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            value={rtmpUrl}
            onChange={(e) => setRtmpUrl(e.target.value)}
            placeholder="RTMP Server URL (e.g., rtmp://live.twitch.tv/app)"
            className="admin-panel__input"
            disabled={currentTier === 'free' || currentTier === 'basic'}
          />

          <input
            type="password"
            value={rtmpKey}
            onChange={(e) => setRtmpKey(e.target.value)}
            placeholder="Stream Key"
            className="admin-panel__input"
            disabled={currentTier === 'free' || currentTier === 'basic'}
          />

          <button
            onClick={handleSaveRTMP}
            disabled={currentTier === 'free' || currentTier === 'basic' || !rtmpUrl}
            className="admin-panel__btn admin-panel__btn--primary"
          >
            Save RTMP Settings
          </button>
        </div>
      </div>

      {/* Overlay Settings */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">Overlay Settings</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className="admin-panel__checkbox-label">
            <input
              type="checkbox"
              checked={overlay.player.visible}
              onChange={(e) => setPlayerOverlayVisible(e.target.checked)}
            />
            Show Player Overlay (bottom 20%, 60% width)
          </label>

          <label className="admin-panel__checkbox-label">
            <input
              type="checkbox"
              checked={overlay.bid.visible}
              onChange={(e) => setBidOverlayVisible(e.target.checked)}
            />
            Show Bid Overlay (bottom right corner)
          </label>

          <label className="admin-panel__checkbox-label">
            <input
              type="checkbox"
              checked={ownerOverlayEnabled}
              onChange={async () => {
                await featureFlagsService.toggleFeature('owner-overlay-in-break', !ownerOverlayEnabled);
                showSaveFeedback(`Owner Overlay ${!ownerOverlayEnabled ? 'enabled' : 'disabled'}`);
              }}
            />
            Show Owner Images in Break Overlay
          </label>

          <label className="admin-panel__checkbox-label">
            <input
              type="checkbox"
              checked={superAdminEnabled}
              onChange={async () => {
                await featureFlagsService.toggleFeature('super-admin-bidding', !superAdminEnabled);
                showSaveFeedback(`Super Admin Bidding ${!superAdminEnabled ? 'enabled' : 'disabled'}`);
              }}
            />
            Super Admin Bidding (control all teams without team login)
          </label>
          {superAdminEnabled && (
            <div style={{
              marginLeft: '1.5rem',
              padding: '0.75rem',
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
            }}>
              <p style={{ margin: 0, color: 'rgba(0,0,0,0.7)' }}>
                <strong style={{ color: '#8b5cf6' }}>Super Admin is ON</strong> — Open the Bid Controller page to control bids for all teams:
              </p>
              <code style={{
                display: 'block',
                marginTop: '0.35rem',
                padding: '0.35rem 0.6rem',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: 6,
                fontSize: '0.78rem',
                color: '#a78bfa',
                wordBreak: 'break-all',
                userSelect: 'all',
                cursor: 'pointer',
              }}
                onClick={() => { if (onClose) onClose(); navigate('/connect-bidding-admin'); }}
              >{baseUrl}/connect-bidding-admin</code>
            </div>
          )}

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                color: 'rgba(0, 0, 0, 0.7)',
                marginBottom: '0.5rem',
              }}
            >
              Success Animation
            </label>
            <select
              value={overlay.successAnimation.type}
              onChange={(e) => setSuccessAnimationType(e.target.value as SuccessAnimationType)}
              className="admin-panel__select"
              style={{ width: '100%' }}
            >
              <option value="stamp">Stamp Animation</option>
              <option value="confetti">Confetti</option>
              <option value="glow">Glow Pulse</option>
              <option value="fireworks">Fireworks</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </div>

      {/* Camera Info */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">Camera Support</h3>
        <div
          style={{
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '0.5rem',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(0, 0, 0, 0.7)' }}>
            Your plan supports up to <strong style={{ color: '#000' }}>{maxCameras} cameras</strong>.
          </p>
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.75rem',
              color: 'rgba(0, 0, 0, 0.5)',
            }}
          >
            Use keyboard shortcuts 1-4 to switch between cameras during broadcast.
          </p>
        </div>
      </div>

      {/* ── Scoring Section ── */}
      <div className="admin-panel__section">
        <h3 className="admin-panel__section-title">
          <GiCricketBat /> Scoring
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.55)', margin: '0 0 0.75rem' }}>
          Manage live match scoring, OBS overlays, and scorecard updates.
        </p>

        {/* Single Overlay Mode toggle */}
        <div style={{
          padding: '0.75rem',
          marginBottom: '0.75rem',
          background: singleOverlayMode ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${singleOverlayMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '0.5rem',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#000' }}>
            <input
              type="checkbox"
              checked={singleOverlayMode}
              disabled={savingSingleOverlay}
              onChange={(e) => handleToggleSingleOverlay(e.target.checked)}
            />
            Single Overlay Mode (All Matches)
          </label>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'rgba(0,0,0,0.6)', lineHeight: 1.5 }}>
            One universal Overlay / Dock / Scorer link follows whichever match is started — no per-match links to swap in OBS.
            Use the <strong>Quick Actions</strong> bar in Scoring Admin for those universal links; start/end matches from the <strong>Matches</strong> tab there.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Scoring Admin */}
          <button
            onClick={() => { if (onClose) onClose(); navigate('/scoring/admin'); }}
            className="admin-panel__btn admin-panel__btn--primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.75rem' }}
          >
            <GiCricketBat size={16} /> Open Scoring Admin
          </button>

          {/* Score Update Page */}
          <button
            onClick={() => { if (onClose) onClose(); navigate('/match/score/update'); }}
            className="admin-panel__btn admin-panel__btn--secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Update Scorecard
          </button>
        </div>

        {/* Scoring URLs reference */}
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '0.5rem',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#000', marginBottom: '0.5rem' }}>Scoring URLs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Scoring admin:</span>
              <code style={{ color: '#60a5fa', cursor: 'pointer' }} onClick={() => { if (onClose) onClose(); navigate('/scoring/admin'); }}>/scoring/admin</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Update scorecard:</span>
              <code style={{ color: '#60a5fa', cursor: 'pointer' }} onClick={() => { if (onClose) onClose(); navigate('/match/score/update'); }}>/match/score/update</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Score OBS overlay:</span>
              <code style={{ color: '#a78bfa' }}>/obs-overlay?mode=scoring&amp;matchId=MATCH_ID</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Bid controller:</span>
              <code style={{ color: '#60a5fa', cursor: 'pointer' }} onClick={() => { if (onClose) onClose(); navigate('/connect-bidding-admin'); }}>/connect-bidding-admin</code>
            </div>
          </div>
        </div>
      </div>

      {/* Save Feedback Toast */}
      {saveFeedback && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.6rem 1.25rem',
          background: '#22c55e',
          color: '#fff',
          borderRadius: '0.5rem',
          fontWeight: 600,
          fontSize: '0.85rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          zIndex: 9999,
        }}>
          ✓ {saveFeedback}
        </div>
      )}
    </div>
  );
}
