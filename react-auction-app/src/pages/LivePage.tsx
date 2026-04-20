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
import { useAuction, useInitialData, useRealtimeMobileSync, useRealtimeDesktopSync, useTheme } from '../hooks';
import type { CameraSource } from '../types/streaming';
import type { Player, Team } from '../types';
import { realtimeSync, type BroadcastControlState, type PersistedCameraConfig } from '../services/realtimeSync';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import { Header, AnalyticsCarousel, ConnectToTeam, BreakOverlay } from '../components';
import PlayerOverlay from '../components/Live/PlayerOverlay';
import SoldAnimation from '../components/Live/SoldAnimation';
import PlayerTransitionOverlay from '../components/Live/PlayerTransitionOverlay';
import './LivePage.css';

// Utility to format currency
const formatCurrency = (amount: number): string => {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  if (safeAmount >= 10000000) return `₹${(safeAmount / 10000000).toFixed(2)} Cr`;
  if (safeAmount >= 100000) return `₹${(safeAmount / 100000).toFixed(2)} L`;
  return `₹${safeAmount.toLocaleString('en-IN')}`;
};

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
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
  const [showSetup, setShowSetup] = useState(() => {
    // Skip setup if already completed this session
    return sessionStorage.getItem('live-broadcast-started') !== 'true';
  });
  const [_isStarted, setIsStarted] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
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
  const [showLiveTransition, setShowLiveTransition] = useState(false);

  const { currentTheme } = useTheme();

  // Broadcast control state (synced from /live-admin)
  const [broadcastControl, setBroadcastControl] = useState<BroadcastControlState | null>(null);
  const [liveSponsors, setLiveSponsors] = useState<SponsorRecord[]>([]);

  // Subscribe to broadcast control from /live-admin
  useEffect(() => {
    const unsub = realtimeSync.subscribeBroadcastControl((control) => {
      setBroadcastControl(control);
    });

    const loadSponsors = async () => {
      try {
        const sponsors = await auctionPersistence.getSponsors();
        setLiveSponsors(sponsors);
      } catch (err) {
        console.error('[LivePage] Failed to load sponsors:', err);
      }
    };
    loadSponsors();
    const unsubSponsors = auctionPersistence.subscribeSponsors((updated) => {
      setLiveSponsors(updated);
    });

    return () => {
      unsub();
      unsubSponsors();
    };
  }, []);

  // Apply camera layout changes from /live-admin in real-time
  useEffect(() => {
    if (broadcastControl?.cameraLayout) {
      cameraManager.setLayout(broadcastControl.cameraLayout);
    }
  }, [broadcastControl?.cameraLayout]);

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

  // Auto-start cameras from persisted config (Firebase).
  // Runs on mount AND reacts to config changes from /live-admin.
  // Handles: first visit, page refresh, and real-time config updates.
  const lastAppliedConfigRef = useRef<number>(0);
  useEffect(() => {
    let cancelled = false;

    const applyCameraConfig = async (config: PersistedCameraConfig) => {
      // Skip if we already applied this exact config version
      if (config.lastUpdate <= lastAppliedConfigRef.current) return;

      try {
        // Request camera permission (quick probe, then release)
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(t => t.stop());

        if (cancelled) return;

        // Stop existing cameras before applying new config
        cameraManager.stopAll();

        // Add each saved camera
        for (const deviceId of config.deviceIds) {
          if (cancelled) return;
          await cameraManager.addCamera(deviceId);
        }

        // Apply layout
        if (config.layout) {
          cameraManager.setLayout(config.layout);
        }

        if (!cancelled) {
          lastAppliedConfigRef.current = config.lastUpdate;
          setIsStarted(true);
          setShowSetup(false);
          setLive(true);
          sessionStorage.setItem('live-broadcast-started', 'true');
        }
      } catch (err) {
        console.warn('[LivePage] Failed to apply camera config:', err);
      }
    };

    const unsub = realtimeSync.subscribeCameraConfig((config: PersistedCameraConfig | null) => {
      if (cancelled || !config || !config.deviceIds?.length) return;
      applyCameraConfig(config);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Fallback removed — don't auto-pick a player. Wait for N press or sync.
  // (Previously auto-selected originalPlayers[0] which showed player details before auction starts)

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
  // Keyboard shortcuts - Auction bidding only (camera controls moved to /live-admin)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const key = e.key.toLowerCase();
      const teams = auction.getEligibleTeams();

      // L - Toggle back to auction page with transition
      if (key === 'l') {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        setShowLiveTransition(true);
        setTimeout(() => navigate('/'), 1200);
        return;
      }

      // Team bidding: 1-8 for teams
      if (/^[1-8]$/.test(key)) {
        const teamIndex = Number.parseInt(key, 10) - 1;
        if (teamIndex < teams.length && auction.currentPlayer) {
          e.preventDefault();
          auction.raiseBidForTeam(teams[teamIndex], bidMultiplier);
        }
      }

      // Bid multiplier: Q to increase, W to decrease
      if (key === 'q') setBidMultiplier((prev) => Math.min(prev * 2, 64));
      if (key === 'w') setBidMultiplier((prev) => Math.max(prev / 2, 1));

      // Show live menu bar
      if (e.key === '=') setShowHeader((prev) => !prev);

      // Toggle marquee
      if (e.key === '-') setShowCarousel((prev) => !prev);

      // Toggle debug
      if (e.key === '0') setShowDebug((prev) => !prev);

      // Sold (S)
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
        if (soldAnimationData) setSoldAnimationData(null);
        auction.clearBidState();
        setPlayerTransitionActive(true);
        setTimeout(() => {
          auction.selectNextPlayer();
          setPlayerTransitionActive(false);
        }, 400);
      }

      // Undo (Z)
      if (key === 'z') { e.preventDefault(); auction.closeOverlay(); }

      // Reset Auction (Shift+R)
      if (key === 'r' && e.shiftKey) {
        e.preventDefault();
        if (window.confirm('Are you sure you want to reset the auction?')) auction.resetAuction();
      }

      // Teams overlay toggle (T)
      if (key === 't') { e.preventDefault(); setShowTeamStats((prev) => !prev); }

      // [ ] P O - Team navigation
      if (e.key === '[') { e.preventDefault(); setSelectedTeamIndex((prev) => (prev > 0 ? prev - 1 : teams.length - 1)); if (!showTeamStats) setShowTeamStats(true); }
      if (e.key === ']') { e.preventDefault(); setSelectedTeamIndex((prev) => (prev < teams.length - 1 ? prev + 1 : 0)); if (!showTeamStats) setShowTeamStats(true); }
      if (key === 'p') { e.preventDefault(); setSelectedTeamIndex((prev) => (prev > 0 ? prev - 1 : teams.length - 1)); setShowTeamStats(true); }
      if (key === 'o') { e.preventDefault(); setSelectedTeamIndex((prev) => (prev < teams.length - 1 ? prev + 1 : 0)); setShowTeamStats(true); }

      // Escape
      if (e.key === 'Escape') {
        if (showSetup) navigate('/admin');
        else setShowHeader(false);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [auction, bidMultiplier, navigate, showSetup, soldAnimationData, showTeamStats]);

  // Add camera handler
  const handleAddCamera = async (deviceId: string) => {
    await cameraManager.addCamera(deviceId);
  };

  // Start broadcast
  const handleStartBroadcast = () => {
    setIsStarted(true);
    setShowSetup(false);
    setLive(true);
    sessionStorage.setItem('live-broadcast-started', 'true');
  };

  // Stop broadcast
  const handleStopBroadcast = useCallback(() => {
    setIsStarted(false);
    setLive(false);
    cameraManager.stopAll();
    sessionStorage.removeItem('live-broadcast-started');
    lastAppliedConfigRef.current = 0; // Allow re-applying config on next start
  }, [setLive]);
  void handleStopBroadcast;

  // Reset auction handler
  const handleResetAuction = useCallback(() => {
    if (window.confirm('Are you sure you want to reset the auction? This will clear all sold/unsold data.')) {
      auction.resetAuction();
    }
  }, [auction]);
  void handleResetAuction;

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
                        background: isAdded ? '#E4BE75' : '#3b82f6',
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
  const displayTeamName = toSafeText(displayTeam?.name, 'TEAM');
  const selectedTeam = teams[selectedTeamIndex];
  const selectedTeamName = toSafeText(selectedTeam?.name, 'Team');
  const selectedTeamRemainingPurse = toSafeNumber(selectedTeam?.remainingPurse);
  const selectedTeamHighestBid = toSafeNumber(selectedTeam?.highestBid);
  const selectedTeamAllocated = toSafeNumber(selectedTeam?.allocatedAmount);

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
              label: 'Live Admin Panel',
              description: 'Camera & broadcast control',
              onClick: () => navigate('/live-admin'),
            },
            {
              label: 'Keyboard Shortcuts',
              description: '1-8 Bid, S Sold, U Unsold, N Next, L Back',
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

            {/* PIP Cameras (display only - controls on /live-admin) */}
            {cameras.map((camera, index) => {
              if (index + 1 === activeCamera) return null;
              return (
                <div
                  key={camera.id}
                  className={`live-page__pip-camera live-page__pip-camera--top-${index === 0 ? 'right' : index === 1 ? 'left' : 'right'}`}
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

      {/* Live Indicator */}
      {broadcast.isLive && (
        <div className="live-page__live-indicator">
          <span className="live-page__live-dot" />
          <span className="live-page__live-text">Live</span>
        </div>
      )}

      {/* Waiting Overlay — shown before auction starts (no player selected) */}
      <AnimatePresence>
        {!currentPlayer && !playerTransitionActive && broadcastControl?.mode !== 'break' && (
          <motion.div
            className="live-page__waiting-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Animated background shapes */}
            <div className="live-page__waiting-bg">
              <div className="live-page__waiting-shape live-page__waiting-shape--1" />
              <div className="live-page__waiting-shape live-page__waiting-shape--2" />
              <div className="live-page__waiting-shape live-page__waiting-shape--3" />
            </div>

            <motion.div
              className="live-page__waiting-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 25 }}
            >
              {/* Tournament Logo */}
              {currentTheme.seasonLogo ? (
                <motion.img
                  src={currentTheme.seasonLogo}
                  alt="Tournament"
                  className="live-page__waiting-logo"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
              ) : (
                <div className="live-page__waiting-logo-fallback">
                  {currentTheme.name?.split(' ').map(w => w[0]).join('').substring(0, 3) || 'EPL'}
                </div>
              )}

              {/* Title */}
              <h1 className="live-page__waiting-title">
                {currentTheme.name || 'AUCTION'} <span className="live-page__waiting-title-accent">LIVE</span>
              </h1>
              <p className="live-page__waiting-subtitle">Auction will begin shortly</p>

              {/* Pulsing indicator */}
              <div className="live-page__waiting-pulse">
                <span className="live-page__waiting-pulse-dot" />
                <span>STANDBY</span>
              </div>

              {/* Sponsor logos */}
              {liveSponsors.filter(s => s.active !== false && s.logoUrl).length > 0 && (
                <div className="live-page__waiting-sponsors">
                  {liveSponsors.filter(s => s.active !== false && s.isTitleSponsor && s.logoUrl).map(s => (
                    <img key={s.id} src={s.logoUrl} alt={s.name} className="live-page__waiting-sponsor-logo live-page__waiting-sponsor-logo--title" />
                  ))}
                  {liveSponsors.filter(s => s.active !== false && !s.isTitleSponsor && s.logoUrl).slice(0, 6).map(s => (
                    <img key={s.id} src={s.logoUrl} alt={s.name} className="live-page__waiting-sponsor-logo" />
                  ))}
                </div>
              )}
            </motion.div>

            <div className="live-page__waiting-footer">
              Press <kbd>N</kbd> to start auction
              <span style={{ marginLeft: '1.5rem', opacity: 0.5 }}>powered by <b>NJS Creative Labs</b></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          {toSafeNumber(currentBid) > 0 ? (
            <>
              <div className="live-page__current-bid">
                <div className="live-page__current-bid-label">Current Bid</div>
                <div className="live-page__current-bid-amount">
                  {formatCurrency(toSafeNumber(currentBid))}
                </div>
              </div>

              {displayTeam && (
                <div className="live-page__bidding-team">
                  <div className="live-page__team-logo">
                    {displayTeam.logoUrl ? (
                      <img
                        src={displayTeam.logoUrl}
                        alt={displayTeamName}
                        loading="eager"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          // Try Google Drive thumbnail format if available
                          if (!img.src.includes('thumbnail')) {
                            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTeamName)}&background=random`;
                          }
                        }}
                      />
                    ) : (
                      <div className="team-logo-fallback">
                        {displayTeamName.split(' ').map(w => w[0]).join('').substring(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="live-page__team-name">{displayTeamName}</div>
                </div>
              )}

              {bidHistory.length > 0 && (
                <div className="live-page__bid-history">
                  {bidHistory.slice(0, overlay.bid.historyCount).map((bid, index) => (
                    <div key={index} className="live-page__bid-history-item">
                      <span className="live-page__bid-history-team">{toSafeText(bid.teamName, 'Team')}</span>
                      <span className="live-page__bid-history-amount">
                        {formatCurrency(toSafeNumber(bid.amount))}
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
            stampColor={soldAnimationData.type === 'sold' ? '#E4BE75' : '#ef4444'}
            onComplete={() => setSoldAnimationData(null)}
            duration={3500}
          />
        )}
      </AnimatePresence>

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
                  alt={selectedTeamName}
                  style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'contain' }}
                />
              )}
              <div>
                <h3 style={{ margin: 0, color: teams[selectedTeamIndex]?.primaryColor || '#fff', fontSize: '1.25rem' }}>
                  {selectedTeamName}
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
                  ₹{(selectedTeamRemainingPurse / 100000).toFixed(1)}L
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
                  ₹{(selectedTeamHighestBid / 100000).toFixed(1)}L
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
                <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Icon Player</div>
              </div>
            </div>

            {/* Additional Info */}
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                <span style={{ opacity: 0.7 }}>Allocated Amount:</span>
                <span style={{ color: '#60a5fa' }}>₹{(selectedTeamAllocated / 100000).toFixed(1)}L</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ opacity: 0.7 }}>Under-age Players:</span>
                <span style={{ color: '#fbbf24' }}>{teams[selectedTeamIndex]?.underAgePlayers || 0}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Break Overlay controlled by /live-admin */}
      <BreakOverlay
        isVisible={broadcastControl?.mode === 'break'}
        durationSeconds={(() => {
          const total = broadcastControl?.breakDuration || 120;
          const startedAt = broadcastControl?.breakStartedAt;
          if (startedAt && broadcastControl?.lastUpdate) {
            // Use lastUpdate to ensure recalc when Firebase pushes new value
            const elapsed = Math.floor((broadcastControl.lastUpdate - startedAt) / 1000);
            return Math.max(total - elapsed, 1);
          }
          return total;
        })()}
        key={broadcastControl?.breakStartedAt || 'break'}
        sponsorDisplayDuration={broadcastControl?.sponsorDisplayDuration || 15}
        sponsors={liveSponsors}
        organizerLogo={currentTheme.seasonLogo}
        auctionTitle={currentTheme.name ? `${currentTheme.name} AUCTION` : undefined}
        onClose={() => {
          realtimeSync.setBroadcastControl({ mode: 'auction', lastUpdate: Date.now() });
        }}
      />

      {/* L-key transition overlay (back to auction) */}
      <AnimatePresence>
        {showLiveTransition && (
          <motion.div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#000',
              overflow: 'hidden',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: '50%',
                background: `linear-gradient(180deg, ${currentTheme.colors.primary || '#0a0f1e'} 0%, ${currentTheme.colors.secondary || '#1a1040'} 100%)`,
                transformOrigin: 'top center',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            />
            <motion.div
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '50%',
                background: `linear-gradient(0deg, ${currentTheme.colors.primary || '#0a0f1e'} 0%, ${currentTheme.colors.secondary || '#1a1040'} 100%)`,
                transformOrigin: 'bottom center',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            />
            <motion.div
              style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
              initial={{ rotateY: 0, scale: 0.5, opacity: 0 }}
              animate={{ rotateY: 360, scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: 'easeInOut' }}
            >
              {currentTheme.seasonLogo ? (
                <img src={currentTheme.seasonLogo} alt="Logo" style={{ width: 120, height: 120, objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.3))' }} />
              ) : (
                <div style={{ fontSize: '4rem', background: `linear-gradient(135deg, ${currentTheme.colors.accent || '#a78bfa'}, ${currentTheme.colors.primary || '#60a5fa'})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>
                  {currentTheme.name || 'LIVE'}
                </div>
              )}
              <div style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' }}>
                BACK TO AUCTION
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NJS Creative Labs branding */}
      <div className="njs-branding-watermark" aria-hidden>
        powered by <b>NJS Creative Labs</b>
      </div>
    </div>
  );
}
