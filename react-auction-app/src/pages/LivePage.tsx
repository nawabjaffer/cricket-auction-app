// ============================================================================
// LIVE PAGE - V3 Premium Broadcast View
// Full-screen camera with player/bid overlays for live streaming
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveStreamingStore } from '../store/liveStreamingStore';
import { useAuctionStore } from '../store/auctionStore';
import { cameraManager } from '../services/cameraManager';
import { premiumService } from '../services/premiumService';
import { useAdminAuth } from '../hooks/useAdminAuth';
import type { CameraSource } from '../types/streaming';
import './LivePage.css';

// Utility to format currency
const formatCurrency = (amount: number): string => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

export default function LivePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAdminAuth();
  
  // Store state
  const {
    broadcast,
    overlay,
    currentPlayer,
    currentBid,
    currentTeam,
    bidHistory,
    showSuccessAnimation,
    isPremium,
    maxCameras,
    setCameraSources,
    setPremiumStatus,
    syncPlayer,
    syncBid,
    triggerSuccessAnimation,
    setLive,
  } = useLiveStreamingStore();

  // Main auction store for syncing
  const auctionStore = useAuctionStore();

  // Local state
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [activeCamera, setActiveCamera] = useState<number>(1);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [showSetup, setShowSetup] = useState(true);
  const [_isStarted, setIsStarted] = useState(false);

  // Video refs for multi-camera
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);

  // Check premium status
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
      return;
    }

    // Load premium status
    const loadPremium = async () => {
      const user = premiumService.getCurrentUser();
      if (user) {
        setPremiumStatus(
          premiumService.canUseLiveStreaming(),
          premiumService.getMaxCameras()
        );
      } else {
        // For demo purposes, enable premium features
        // In production, this would check actual subscription
        setPremiumStatus(true, 4);
      }
    };

    loadPremium();
  }, [isAuthenticated, navigate, setPremiumStatus]);

  // Subscribe to camera changes
  useEffect(() => {
    const unsubscribe = cameraManager.subscribe((sources) => {
      setCameras(sources);
      setCameraSources(sources);
    });

    const unsubDevices = cameraManager.subscribeToDevices(setDevices);

    // Initialize camera manager
    cameraManager.initialize(maxCameras || 4);

    return () => {
      unsubscribe();
      unsubDevices();
    };
  }, [maxCameras, setCameraSources]);

  // Sync auction state
  useEffect(() => {
    syncPlayer(auctionStore.currentPlayer);
    syncBid(
      auctionStore.currentBid,
      auctionStore.selectedTeam,
      auctionStore.bidHistory
    );
  }, [
    auctionStore.currentPlayer,
    auctionStore.currentBid,
    auctionStore.selectedTeam,
    auctionStore.bidHistory,
    syncPlayer,
    syncBid,
  ]);

  // Listen for sold events to trigger animation
  useEffect(() => {
    const unsubscribe = useAuctionStore.subscribe(
      (state) => {
        if (state.activeOverlay === 'sold') {
          triggerSuccessAnimation();
        }
      }
    );

    return unsubscribe;
  }, [triggerSuccessAnimation]);

  // Attach streams to video elements
  useEffect(() => {
    cameras.forEach((camera, index) => {
      const videoEl = videoRefs.current[index];
      if (videoEl && camera.stream) {
        if (videoEl.srcObject !== camera.stream) {
          videoEl.srcObject = camera.stream;
          videoEl.play().catch(console.error);
        }
      }
    });
  }, [cameras]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Camera switching: 1, 2, 3, 4
      if (e.key >= '1' && e.key <= '4') {
        const cameraIndex = parseInt(e.key);
        if (cameras[cameraIndex - 1]) {
          setActiveCamera(cameraIndex);
          cameraManager.switchCamera(cameraIndex);
        }
      }

      // Escape to exit
      if (e.key === 'Escape') {
        if (showSetup) {
          navigate('/admin');
        } else {
          setShowSetup(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cameras, navigate, showSetup]);

  // Add camera handler
  const handleAddCamera = async (deviceId: string) => {
    await cameraManager.addCamera(deviceId);
  };

  // Start broadcast
  const handleStartBroadcast = () => {
    setIsStarted(true);
    setShowSetup(false);
    setLive(true);
  };

  // Stop broadcast
  const handleStopBroadcast = () => {
    setIsStarted(false);
    setLive(false);
    cameraManager.stopAll();
  };

  // Premium gate
  if (!isPremium) {
    return (
      <div className="live-page">
        <div className="live-page__premium-gate">
          <h2>🎬 Premium Feature</h2>
          <p>
            Live streaming with multi-camera support is a premium feature.
            Upgrade your account to access OBS integration, RTMP streaming,
            and broadcast-quality overlays.
          </p>
          <button className="upgrade-btn" onClick={() => navigate('/admin')}>
            Learn More
          </button>
        </div>
      </div>
    );
  }

  // Setup screen
  if (showSetup) {
    return (
      <div className="live-page">
        <div className="live-page__premium-gate" style={{ maxWidth: 600 }}>
          <h2>🎬 Live Broadcast Setup</h2>
          <p>Select camera sources and configure your broadcast.</p>

          <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem', fontSize: '1rem' }}>
              Available Cameras ({cameras.length}/{maxCameras})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {devices.map((device, index) => {
                const isAdded = cameras.some(c => c.deviceId === device.deviceId);
                return (
                  <div
                    key={device.deviceId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '0.5rem',
                    }}
                  >
                    <span style={{ color: '#fff' }}>
                      {device.label || `Camera ${index + 1}`}
                    </span>
                    <button
                      onClick={() => handleAddCamera(device.deviceId)}
                      disabled={isAdded || cameras.length >= maxCameras}
                      style={{
                        padding: '0.5rem 1rem',
                        background: isAdded ? '#22c55e' : '#3b82f6',
                        border: 'none',
                        borderRadius: '0.25rem',
                        color: '#fff',
                        cursor: isAdded || cameras.length >= maxCameras ? 'not-allowed' : 'pointer',
                        opacity: cameras.length >= maxCameras && !isAdded ? 0.5 : 1,
                      }}
                    >
                      {isAdded ? '✓ Added' : 'Add'}
                    </button>
                  </div>
                );
              })}

              {devices.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '1rem' }}>
                  No cameras detected. Please connect a camera and refresh.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => cameraManager.refreshDevices()}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '0.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Refresh Devices
              </button>

              <button
                onClick={handleStartBroadcast}
                disabled={cameras.length === 0}
                className="upgrade-btn"
                style={{
                  opacity: cameras.length === 0 ? 0.5 : 1,
                  cursor: cameras.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Start Broadcast
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate('/admin')}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
          >
            ← Back to Admin
          </button>
        </div>
      </div>
    );
  }

  // Main broadcast view
  return (
    <div className="live-page">
      {/* Camera Container */}
      <div className="live-page__camera-container">
        {cameras.length > 0 ? (
          <>
            {/* Primary/Active Camera - Fullscreen */}
            <video
              ref={(el) => { videoRefs.current[activeCamera - 1] = el; }}
              className="live-page__camera-video live-page__camera-video--fullscreen"
              autoPlay
              muted
              playsInline
            />

            {/* PIP Cameras */}
            {cameras.map((camera, index) => {
              if (index + 1 === activeCamera) return null; // Skip active camera
              return (
                <div
                  key={camera.id}
                  className={`live-page__pip-camera live-page__pip-camera--top-${index === 0 ? 'right' : index === 1 ? 'left' : 'right'}`}
                  onClick={() => {
                    setActiveCamera(index + 1);
                    cameraManager.switchCamera(index + 1);
                  }}
                >
                  <video
                    ref={(el) => { videoRefs.current[index] = el; }}
                    autoPlay
                    muted
                    playsInline
                  />
                </div>
              );
            })}
          </>
        ) : (
          <div className="live-page__camera-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
            <p>No camera connected</p>
          </div>
        )}
      </div>

      {/* Camera Selector */}
      <div className="live-page__camera-selector">
        {[1, 2, 3, 4].map((num) => {
          const hasCamera = cameras[num - 1];
          return (
            <button
              key={num}
              className={`live-page__camera-btn ${activeCamera === num ? 'live-page__camera-btn--active' : ''} ${!hasCamera ? 'live-page__camera-btn--empty' : ''}`}
              onClick={() => {
                if (hasCamera) {
                  setActiveCamera(num);
                  cameraManager.switchCamera(num);
                }
              }}
              disabled={!hasCamera}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Live Indicator */}
      {broadcast.isLive && (
        <div className="live-page__live-indicator">
          <span className="live-page__live-dot" />
          <span className="live-page__live-text">Live</span>
        </div>
      )}

      {/* Player Overlay */}
      {overlay.player.visible && currentPlayer && (
        <motion.div
          className="live-page__player-overlay"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="live-page__player-image">
            <img
              src={currentPlayer.imageUrl}
              alt={currentPlayer.name}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentPlayer.name);
              }}
            />
          </div>

          <div className="live-page__player-info">
            <h2 className="live-page__player-name">{currentPlayer.name}</h2>
            <p className="live-page__player-role">{currentPlayer.role}</p>

            <div className="live-page__player-stats">
              {currentPlayer.matches && (
                <div className="live-page__player-stat">
                  <div className="live-page__player-stat-value">{currentPlayer.matches}</div>
                  <div className="live-page__player-stat-label">Matches</div>
                </div>
              )}
              {currentPlayer.runs && (
                <div className="live-page__player-stat">
                  <div className="live-page__player-stat-value">{currentPlayer.runs}</div>
                  <div className="live-page__player-stat-label">Runs</div>
                </div>
              )}
              {currentPlayer.wickets && (
                <div className="live-page__player-stat">
                  <div className="live-page__player-stat-value">{currentPlayer.wickets}</div>
                  <div className="live-page__player-stat-label">Wickets</div>
                </div>
              )}
            </div>
          </div>

          <div className="live-page__player-base-price">
            <div className="live-page__player-base-price-label">Base Price</div>
            <div className="live-page__player-base-price-value">
              {formatCurrency(currentPlayer.basePrice)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Bid Overlay */}
      {overlay.bid.visible && (
        <motion.div
          className="live-page__bid-overlay"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {currentBid > 0 ? (
            <>
              <div className="live-page__current-bid">
                <div className="live-page__current-bid-label">Current Bid</div>
                <div className="live-page__current-bid-amount">
                  {formatCurrency(currentBid)}
                </div>
              </div>

              {currentTeam && (
                <div className="live-page__bidding-team">
                  <div className="live-page__team-logo">
                    <img
                      src={currentTeam.logoUrl}
                      alt={currentTeam.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentTeam.name);
                      }}
                    />
                  </div>
                  <div className="live-page__team-name">{currentTeam.name}</div>
                </div>
              )}

              {bidHistory.length > 0 && (
                <div className="live-page__bid-history">
                  {bidHistory.slice(0, overlay.bid.historyCount).map((bid, index) => (
                    <div key={index} className="live-page__bid-history-item">
                      <span className="live-page__bid-history-team">{bid.teamName}</span>
                      <span className="live-page__bid-history-amount">
                        {formatCurrency(bid.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="live-page__no-bid">
              <p>Waiting for bids...</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Success Animation */}
      <AnimatePresence>
        {showSuccessAnimation && (
          <motion.div
            className="live-page__success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {overlay.successAnimation.type === 'stamp' && (
              <div 
                className="live-page__stamp"
                style={{ color: overlay.successAnimation.stampColor }}
              >
                {overlay.successAnimation.stampText}
              </div>
            )}

            {overlay.successAnimation.type === 'glow' && (
              <div className="live-page__glow-overlay" />
            )}

            {overlay.successAnimation.type === 'confetti' && (
              <div className="live-page__confetti">
                {Array.from({ length: 50 }).map((_, i) => (
                  <div
                    key={i}
                    className="live-page__confetti-piece"
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 0.5}s`,
                      '--color': ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'][Math.floor(Math.random() * 5)],
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="live-page__controls">
        <button
          className="live-page__control-btn"
          onClick={() => setShowSetup(true)}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>

        <button
          className="live-page__control-btn"
          onClick={handleStopBroadcast}
          title="Stop Broadcast"
          style={{ background: 'rgba(239, 68, 68, 0.3)' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
      </div>

      {/* Keyboard Hints */}
      <div className="live-page__keyboard-hints">
        <span className="live-page__keyboard-hint">
          <kbd>1-4</kbd> Switch Camera
        </span>
        <span className="live-page__keyboard-hint">
          <kbd>Esc</kbd> Settings
        </span>
      </div>
    </div>
  );
}
