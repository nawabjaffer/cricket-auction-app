// ============================================================================
// STREAMING TAB - V3 Premium Live Streaming Settings
// Admin panel tab for configuring OBS, cameras, and broadcast settings
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoVideocam, IoRadio, IoSettings, IoPlay, IoStop } from 'react-icons/io5';
import { useLiveStreamingStore } from '../../store/liveStreamingStore';
import { obsService } from '../../services/obsService';
import { premiumService } from '../../services/premiumService';
import type { PremiumTier } from '../../types/premium';
import type { OBSConnectionState, SuccessAnimationType } from '../../types/streaming';

interface StreamingTabProps {
  onClose?: () => void;
}

export default function StreamingTab({ onClose }: StreamingTabProps) {
  const navigate = useNavigate();
  
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
              <span style={{ fontWeight: 600, color: '#fff' }}>Subscription Status</span>
              {tierBadge(currentTier)}
            </div>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>
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
        <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.5rem' }}>
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

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.7)',
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
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
            Your plan supports up to <strong style={{ color: '#fff' }}>{maxCameras} cameras</strong>.
          </p>
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.5)',
            }}
          >
            Use keyboard shortcuts 1-4 to switch between cameras during broadcast.
          </p>
        </div>
      </div>
    </div>
  );
}
