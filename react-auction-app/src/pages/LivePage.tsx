// ============================================================================
// LIVE PAGE - V3 Premium Broadcast View
// Full-screen camera with player/bid overlays for live streaming
// Reuses existing auction business logic with broadcast-optimized design
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveStreamingStore } from '../store/liveStreamingStore';
import { useAuctionStore } from '../store/auctionStore';
import { cameraManager } from '../services/cameraManager';
import { premiumService } from '../services/premiumService';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAuction, useInitialData, useRealtimeMobileSync, useRealtimeDesktopSync } from '../hooks';
import type { CameraSource } from '../types/streaming';
import type { Player, Team } from '../types';
import { Header, AnalyticsCarousel, ConnectToTeam } from '../components';
import PlayerOverlay from '../components/Live/PlayerOverlay';
import SoldAnimation from '../components/Live/SoldAnimation';
import PlayerTransitionOverlay from '../components/Live/PlayerTransitionOverlay';
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
    isPremium,
    maxCameras,
    setCameraSources,
    setPremiumStatus,
    syncPlayer,
    syncBid,
    setLive,
  } = useLiveStreamingStore();

  // Main auction store for syncing
  const auctionStore = useAuctionStore();
  const { currentPlayer: syncPlayerState, currentBid: syncBidValue, selectedTeam: syncTeamState, auctionActive, isConnected } = useRealtimeMobileSync();

  // Get teams from auction store
  const teams = auctionStore.teams;

  // Use auction hook for bidding functionality (reuse existing business logic)
  const auction = useAuction();

  // Enable desktop sync for Firebase broadcasting (allows mobile bidding to work)
  useRealtimeDesktopSync();

  // Ensure data is loaded for full player details (matches, runs, etc.)
  useInitialData();

  // Get player stats for display
  const playerStats = auction.getPlayerStats();

  // Local state
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [activeCamera, setActiveCamera] = useState<number>(1);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [showSetup, setShowSetup] = useState(true);
  const [_isStarted, setIsStarted] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [showConnectToTeamModal, setShowConnectToTeamModal] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(true);
  const [bidMultiplier, setBidMultiplier] = useState(1);
  const [soldAnimationData, setSoldAnimationData] = useState<{
    type: 'sold' | 'unsold';
    player: Player | null;
    team: Team | null;
    amount: number;
  } | null>(null);
  const [showTeamStats, setShowTeamStats] = useState(false);
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [playerTransitionActive, setPlayerTransitionActive] = useState(false);

  // Video refs for multi-camera
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);
  
  // Refs to track last synced values (prevents infinite loops)
  const lastSyncedPlayerIdRef = useRef<string | null>(null);
  const lastSyncedBidRef = useRef<number>(0);
  const lastSyncedTeamIdRef = useRef<string | null>(null);

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

  // Sync auction state from local store (if running on same device)
  // Uses ref-based comparison to prevent infinite update loops
  useEffect(() => {
    const playerId = auctionStore.currentPlayer?.id ?? null;
    const bid = auctionStore.currentBid;
    const teamId = auctionStore.selectedTeam?.id ?? null;
    
    // Only sync if values actually changed
    const playerChanged = playerId !== lastSyncedPlayerIdRef.current;
    const bidChanged = bid !== lastSyncedBidRef.current;
    const teamChanged = teamId !== lastSyncedTeamIdRef.current;
    
    if (playerChanged || bidChanged || teamChanged) {
      console.log('[LivePage] Local auction sync (values changed):', {
        playerId,
        playerName: auctionStore.currentPlayer?.name,
        bid,
        teamId,
      });
      
      if (playerChanged) {
        lastSyncedPlayerIdRef.current = playerId;
        syncPlayer(auctionStore.currentPlayer);
      }
      
      if (bidChanged || teamChanged) {
        lastSyncedBidRef.current = bid;
        lastSyncedTeamIdRef.current = teamId;
        syncBid(bid, auctionStore.selectedTeam, auctionStore.bidHistory);
      }
    }
  }, [
    auctionStore.currentPlayer,
    auctionStore.currentBid,
    auctionStore.selectedTeam,
    auctionStore.bidHistory,
    syncPlayer,
    syncBid,
  ]);

  // Sync auction state from realtime stream (for /live view)
  // Also uses ref-based comparison to prevent loops
  useEffect(() => {
    if (!syncPlayerState) return;
    
    const playerId = syncPlayerState.id;
    const teamId = syncTeamState?.id ?? null;

    // Only sync if values actually changed from last sync
    const playerChanged = playerId !== lastSyncedPlayerIdRef.current;
    const bidChanged = syncBidValue !== lastSyncedBidRef.current;
    const teamChanged = teamId !== lastSyncedTeamIdRef.current;

    if (!playerChanged && !bidChanged && !teamChanged) return;

    console.log('[LivePage] Realtime sync (values changed):', {
      playerId,
      playerName: syncPlayerState.name,
      bid: syncBidValue,
      teamId,
    });

    // Prefer full player details from loaded players
    const fullPlayer: Player | null = auctionStore.originalPlayers.find(p => p.id === syncPlayerState.id) || syncPlayerState;
    const fullTeam: Team | null = syncTeamState
      ? (auctionStore.teams.find(t => t.id === syncTeamState.id) || syncTeamState)
      : null;

    if (playerChanged) {
      lastSyncedPlayerIdRef.current = playerId;
      syncPlayer(fullPlayer);
    }
    
    if (bidChanged || teamChanged) {
      lastSyncedBidRef.current = syncBidValue;
      lastSyncedTeamIdRef.current = teamId;
      syncBid(syncBidValue, fullTeam, auctionStore.bidHistory);
    }
  }, [
    syncPlayerState,
    syncBidValue,
    syncTeamState,
    auctionStore.originalPlayers,
    auctionStore.teams,
    auctionStore.bidHistory,
    syncPlayer,
    syncBid,
  ]);

  // Fallback: if no current player is available, use first loaded player
  useEffect(() => {
    if (currentPlayer || auctionStore.currentPlayer || syncPlayerState) return;
    if (auctionStore.originalPlayers.length === 0) return;

    syncPlayer(auctionStore.originalPlayers[0]);
  }, [
    currentPlayer,
    auctionStore.currentPlayer,
    syncPlayerState,
    auctionStore.originalPlayers,
    syncPlayer,
  ]);

  // Listen for sold/unsold events to trigger animation with player details
  useEffect(() => {
    let prevOverlay: string | null = null;
    const unsubscribe = useAuctionStore.subscribe(
      (state) => {
        if (state.activeOverlay === 'sold' && prevOverlay !== 'sold') {
          // Get the last sold player
          const lastSold = state.soldPlayers.at(-1);
          if (lastSold) {
            const team = state.teams.find(t => t.name === lastSold.teamName) || null;
            setSoldAnimationData({
              type: 'sold',
              player: lastSold as Player,
              team,
              amount: lastSold.soldAmount || 0,
            });
          }
        }
        if (state.activeOverlay === 'unsold' && prevOverlay !== 'unsold') {
          const lastUnsold = state.unsoldPlayers.at(-1);
          if (lastUnsold) {
            setSoldAnimationData({
              type: 'unsold',
              player: lastUnsold as Player,
              team: null,
              amount: 0,
            });
          }
        }
        prevOverlay = state.activeOverlay;
      }
    );

    return unsubscribe;
  }, []);

  // Keep active camera index valid
  useEffect(() => {
    if (cameras.length === 0) return;
    if (activeCamera > cameras.length) {
      setActiveCamera(1);
      cameraManager.switchCamera(1);
    }
  }, [cameras.length, activeCamera]);

  // Attach active stream to main video - use callback ref for reliable binding
  const setMainVideoRef = useCallback((el: HTMLVideoElement | null) => {
    mainVideoRef.current = el;
    
    if (el) {
      const activeStream = cameras[activeCamera - 1]?.stream || cameras[0]?.stream;
      
      console.log('[LivePage] Video ref callback:', {
        hasEl: !!el,
        hasStream: !!activeStream,
        camerasCount: cameras.length,
        activeCamera,
      });
      
      if (activeStream && el.srcObject !== activeStream) {
        el.srcObject = activeStream;
        el.play().catch((err) => {
          console.error('[LivePage] Video play failed:', err);
        });
      }
    }
  }, [cameras, activeCamera]);

  // Re-attach stream when camera changes
  useEffect(() => {
    const activeStream = cameras[activeCamera - 1]?.stream || cameras[0]?.stream;
    const videoEl = mainVideoRef.current;
    
    console.log('[LivePage] Video binding effect:', {
      hasVideoEl: !!videoEl,
      hasStream: !!activeStream,
      camerasCount: cameras.length,
      activeCamera,
    });
    
    if (videoEl && activeStream) {
      if (videoEl.srcObject !== activeStream) {
        videoEl.srcObject = activeStream;
      }
      // Always try to play
      videoEl.play().catch((err) => {
        console.error('[LivePage] Video play failed:', err);
      });
    }
  }, [cameras, activeCamera]);

  // Attach streams to PIP video elements
  useEffect(() => {
    cameras.forEach((camera, index) => {
      if (index + 1 === activeCamera) return;
      const videoEl = videoRefs.current[index];
      if (videoEl && camera.stream) {
        if (videoEl.srcObject !== camera.stream) {
          videoEl.srcObject = camera.stream;
          videoEl.play().catch(console.error);
        }
      }
    });
  }, [cameras, activeCamera]);

  // Keyboard shortcuts - Full auction functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't handle if user is typing in an input
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      const teams = auction.getEligibleTeams();

      // Team bidding: 1-8 for teams
      if (/^[1-8]$/.test(key)) {
        const teamIndex = Number.parseInt(key, 10) - 1;
        if (teamIndex < teams.length && auction.currentPlayer) {
          e.preventDefault();
          auction.raiseBidForTeam(teams[teamIndex], bidMultiplier);
        }
      }

      // Bid multiplier: Q to increase, W to decrease
      if (key === 'q') {
        setBidMultiplier((prev) => Math.min(prev * 2, 64));
      }
      if (key === 'w') {
        setBidMultiplier((prev) => Math.max(prev / 2, 1));
      }

      // Show live menu bar
      if (e.key === '=') {
        setShowHeader((prev) => !prev);
      }

      // Toggle marquee
      if (e.key === '-') {
        setShowCarousel((prev) => !prev);
      }

      // Toggle debug details
      if (e.key === '0') {
        setShowDebug((prev) => !prev);
      }

      // Sold (S) - use actual auction logic
      if (key === 's' && auction.currentPlayer && auction.selectedTeam) {
        e.preventDefault();
        auction.markAsSold();
      }

      // Unsold (U)
      if (key === 'u' && auction.currentPlayer) {
        e.preventDefault();
        auction.markAsUnsold();
      }

      // Next player (N)
      if (key === 'n') {
        e.preventDefault();
        // If we're showing sold/unsold animation, close it first
        if (soldAnimationData) {
          setSoldAnimationData(null);
        }
        // Clear any bid state and overlay
        auction.clearBidState();
        
        // Trigger exit animation before moving to next player
        setPlayerTransitionActive(true);
        setTimeout(() => {
          // Re-check state to ensure clearBidState took effect
          auction.selectNextPlayer();
          setPlayerTransitionActive(false);
        }, 400);
      }

      // Undo (Z)
      if (key === 'z') {
        e.preventDefault();
        auction.closeOverlay();
      }

      // Reset Auction (R) - with Shift modifier for safety
      if (key === 'r' && e.shiftKey) {
        e.preventDefault();
        if (window.confirm('Are you sure you want to reset the auction?')) {
          auction.resetAuction();
        }
      }

      // Teams overlay toggle (T) - Show/hide team stats panel
      if (key === 't') {
        e.preventDefault();
        setShowTeamStats((prev) => !prev);
      }

      // Navigate between teams in stats view
      // [ - Previous team
      if (e.key === '[') {
        e.preventDefault();
        setSelectedTeamIndex((prev) => (prev > 0 ? prev - 1 : teams.length - 1));
        if (!showTeamStats) setShowTeamStats(true);
      }

      // ] - Next team
      if (e.key === ']') {
        e.preventDefault();
        setSelectedTeamIndex((prev) => (prev < teams.length - 1 ? prev + 1 : 0));
        if (!showTeamStats) setShowTeamStats(true);
      }

      // P - Show previous team's auction info
      if (key === 'p') {
        e.preventDefault();
        setSelectedTeamIndex((prev) => (prev > 0 ? prev - 1 : teams.length - 1));
        setShowTeamStats(true);
      }

      // O - Show next team's auction info (O for "other/next")
      if (key === 'o') {
        e.preventDefault();
        setSelectedTeamIndex((prev) => (prev < teams.length - 1 ? prev + 1 : 0));
        setShowTeamStats(true);
      }

      // Escape to exit
      if (e.key === 'Escape') {
        if (showSetup) {
          navigate('/admin');
        } else {
          setShowHeader(false);
        }
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [auction, bidMultiplier, cameras, navigate, showSetup]);

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

  // Reset auction handler
  const handleResetAuction = useCallback(() => {
    if (window.confirm('Are you sure you want to reset the auction? This will clear all sold/unsold data.')) {
      auction.resetAuction();
    }
  }, [auction]);

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

  const displayTeam = currentTeam || syncTeamState || auctionStore.selectedTeam;

  // Main broadcast view
  return (
    <div className="live-page">
      {showHeader && (
        <Header
          variant="live"
          onShowConnectToTeam={() => setShowConnectToTeamModal(true)}
          showConnectionStatus={showConnectionStatus && isConnected}
          onDismissConnectionStatus={() => setShowConnectionStatus(false)}
          menuExtras={[
            {
              label: 'Go to Admin Dashboard',
              description: 'Full controls',
              onClick: () => navigate('/admin'),
            },
            {
              label: 'Go to Camera Settings',
              description: 'Devices & preview',
              onClick: () => navigate('/camera'),
            },
            {
              label: 'Open Live Setup',
              description: 'Broadcast setup',
              onClick: () => setShowSetup(true),
            },
            {
              label: 'Keyboard Shortcuts',
              description: '1-8 Bid, S Sold, U Unsold, N Next',
              onClick: () => {},
            },
          ]}
          bidMultiplier={bidMultiplier}
        />
      )}

      {showConnectToTeamModal && createPortal(
        <ConnectToTeam open={showConnectToTeamModal} onClose={() => setShowConnectToTeamModal(false)} />,
        document.body
      )}
      {/* Camera Container */}
      <div className="live-page__camera-container">
        {cameras.length > 0 ? (
          <>
            {/* Primary/Active Camera - Fullscreen */}
            <video
              ref={setMainVideoRef}
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
      <AnimatePresence mode="wait">
        {overlay.player.visible && currentPlayer && !playerTransitionActive && (
          <PlayerOverlay player={currentPlayer} />
        )}
      </AnimatePresence>

      {/* Player Transition Overlay */}
      <AnimatePresence>
        {playerTransitionActive && <PlayerTransitionOverlay active={playerTransitionActive} />}
      </AnimatePresence>

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

              {displayTeam && (
                <div className="live-page__bidding-team">
                  <div className="live-page__team-logo">
                    {displayTeam.logoUrl ? (
                      <img
                        src={displayTeam.logoUrl}
                        alt={displayTeam.name}
                        loading="eager"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          // Try Google Drive thumbnail format if available
                          if (!img.src.includes('thumbnail')) {
                            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTeam.name)}&background=random`;
                          }
                        }}
                      />
                    ) : (
                      <div className="team-logo-fallback">
                        {displayTeam.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="live-page__team-name">{displayTeam.name}</div>
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

      {/* Enhanced Sold/Unsold Animation with Player Details */}
      <AnimatePresence>
        {soldAnimationData && (
          <SoldAnimation
            type={soldAnimationData.type}
            player={soldAnimationData.player}
            team={soldAnimationData.team}
            amount={soldAnimationData.amount}
            stampColor={soldAnimationData.type === 'sold' ? '#22c55e' : '#ef4444'}
            onComplete={() => setSoldAnimationData(null)}
            duration={3500}
          />
        )}
      </AnimatePresence>

      {/* Controls */}
      {showHeader && (
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
            onClick={handleResetAuction}
            title="Reset Auction (R)"
            style={{ background: 'rgba(251, 191, 36, 0.3)' }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
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
      )}

      {/* Bid Multiplier Indicator */}
      {bidMultiplier > 1 && (
        <div className="live-page__bid-multiplier">
          <span className="live-page__bid-multiplier-label">×{bidMultiplier}</span>
          <span className="live-page__bid-multiplier-keys">Q↑ W↓</span>
        </div>
      )}

      {/* Team Quick Keys (only when header visible) */}
      {showHeader && (
        <div className="live-page__team-keys">
          {auction.getEligibleTeams().slice(0, 8).map((team, index) => (
            <button
              key={team.id}
              className="live-page__team-key"
              onClick={() => auction.raiseBidForTeam(team, bidMultiplier)}
              disabled={!auction.currentPlayer}
            >
              <span className="live-page__team-key-num">{index + 1}</span>
              <span className="live-page__team-key-name">{team.name.substring(0, 3).toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}

      <AnalyticsCarousel visible={showCarousel} />

      {/* Debug Panel - Shows in development */}
      {import.meta.env.DEV && showDebug && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            padding: '10px',
            borderRadius: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            zIndex: 1000,
            maxWidth: '300px',
          }}
        >
          <div><strong>DEBUG INFO</strong></div>
          <div>Cameras: {cameras.length}</div>
          <div>Active Camera: {activeCamera}</div>
          <div>Has Stream: {cameras[activeCamera - 1]?.stream ? 'Yes' : 'No'}</div>
          <div>Video Ref: {mainVideoRef.current ? 'Set' : 'Null'}</div>
          <div>---</div>
          <div><strong>PLAYER STATS</strong></div>
          <div>Total: {playerStats.total}</div>
          <div style={{ color: '#4ade80' }}>Sold: {playerStats.sold}</div>
          <div style={{ color: '#f87171' }}>Unsold: {playerStats.unsold}</div>
          <div>Available: {playerStats.available}</div>
          <div>Round: {auction.currentRound}{auction.isRound2Active ? ' (Round 2+)' : ''}</div>
          <div>---</div>
          <div>Overlay Visible: {overlay.player.visible ? 'Yes' : 'No'}</div>
          <div>Current Player: {currentPlayer ? currentPlayer.name : 'None'}</div>
          <div>Auction Store Player: {auctionStore.currentPlayer?.name || 'None'}</div>
          <div>Realtime Sync Player: {syncPlayerState?.name || 'None'}</div>
          <div>---</div>
          <div>Current Bid: {currentBid}</div>
          <div>Bidding Team: {currentTeam?.name || 'None'}</div>
          <div>Mobile Connected: {isConnected ? '✅' : '❌'}</div>
          <div>Auction Active: {auctionActive ? '✅' : '❌'}</div>
        </div>
      )}

      {/* Team Stats Panel - Toggle with T key, navigate with [ ] P O */}
      <AnimatePresence>
        {showTeamStats && teams.length > 0 && (
          <motion.div
            className="live-page__team-stats-panel"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(20px)',
              borderRadius: '16px',
              padding: '20px',
              minWidth: '320px',
              maxHeight: '80vh',
              overflow: 'auto',
              zIndex: 100,
              border: `2px solid ${teams[selectedTeamIndex]?.primaryColor || '#333'}`,
            }}
          >
            {/* Team Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              {teams[selectedTeamIndex]?.logoUrl && (
                <img 
                  src={teams[selectedTeamIndex].logoUrl} 
                  alt={teams[selectedTeamIndex].name}
                  style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'contain' }}
                />
              )}
              <div>
                <h3 style={{ margin: 0, color: teams[selectedTeamIndex]?.primaryColor || '#fff', fontSize: '1.25rem' }}>
                  {teams[selectedTeamIndex]?.name || 'Team'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>
                  Team {selectedTeamIndex + 1} of {teams.length}
                </p>
              </div>
            </div>

            {/* Navigation Hint */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '8px', 
              marginBottom: '16px',
              fontSize: '0.75rem',
              opacity: 0.6
            }}>
              <span>[ P ← Prev</span>
              <span>|</span>
              <span>Next → ] O</span>
              <span>|</span>
              <span>T to close</span>
            </div>

            {/* Team Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ade80' }}>
                  {teams[selectedTeamIndex]?.playersBought || 0}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Players Bought</div>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>
                  ₹{((teams[selectedTeamIndex]?.remainingPurse || 0) / 100000).toFixed(1)}L
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Remaining Purse</div>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#60a5fa' }}>
                  {teams[selectedTeamIndex]?.totalPlayerThreshold || 15}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Max Slots</div>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f472b6' }}>
                  {teams[selectedTeamIndex]?.remainingPlayers || 0}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Open Slots</div>
              </div>
            </div>

            {/* Highest Bid & Captain Info */}
            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#a78bfa' }}>
                  ₹{((teams[selectedTeamIndex]?.highestBid || 0) / 100000).toFixed(1)}L
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Highest Bid</div>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '12px', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#34d399' }}>
                  {teams[selectedTeamIndex]?.captain || 'None'}
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Captain</div>
              </div>
            </div>

            {/* Additional Info */}
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                <span style={{ opacity: 0.7 }}>Allocated Amount:</span>
                <span style={{ color: '#60a5fa' }}>₹{((teams[selectedTeamIndex]?.allocatedAmount || 0) / 100000).toFixed(1)}L</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ opacity: 0.7 }}>Under-age Players:</span>
                <span style={{ color: '#fbbf24' }}>{teams[selectedTeamIndex]?.underAgePlayers || 0}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
