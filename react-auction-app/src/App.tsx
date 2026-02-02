// ============================================================================
// MAIN APP COMPONENT
// Root component with providers and layout
// ============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  GiCricketBat, 
  GiBaseballGlove,
} from 'react-icons/gi';
import { 
  IoBaseball,
  IoStar,
  IoPerson,
  IoClose,
  IoSearch,
} from 'react-icons/io5';
import {
  Header,
  SoldOverlay,
  UnsoldOverlay,
  EndOverlay,
  CoinJar,
  NotificationContainer,
  TeamSquadView,
  ConnectToTeam,
  AnalyticsCarousel,
  AdminPanel,
} from './components';
import { 
  useAuction, 
  useInitialData, 
  useRefreshData, 
  useKeyboardShortcuts, 
  useTheme,
  useHotkeyHelp,
  useImagePreload,
  useFeatureFlagsInit,
  useAuctionDataLoader,
  useSaveInitialSnapshot,
  useAdminPlayersOverrides,
} from './hooks';
import { useRealtimeDesktopSync } from './hooks/useRealtimeSync';
import { audioService, imageCacheService } from './services';
import { useActiveOverlay, useNotification, useCurrentPlayer, useSoldPlayers, useUnsoldPlayers, useAvailablePlayers, useOriginalPlayers, useTeams } from './store';
import { extractDriveFileId } from './utils/driveImage';
import './index.css';

// Create Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
    },
  },
});

// Main App with Providers
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuctionApp />
    </QueryClientProvider>
  );
}

// Auction App Content
function AuctionApp() {
  const [showCoinJar, setShowCoinJar] = useState(false);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showTeamOverlay, setShowTeamOverlay] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [bidMultiplier, setBidMultiplier] = useState(1);
  const [showTeamSquadView, setShowTeamSquadView] = useState(false);
  const [selectedTeamForSquad, setSelectedTeamForSquad] = useState<string>('');
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [jumpError, setJumpError] = useState('');
  const jumpInputRef = useRef<HTMLInputElement>(null);
  
  // Connect to Team modal state
  const [showConnectToTeamModal, setShowConnectToTeamModal] = useState(false);
  
  // Analytics carousel state
  const [showCarousel, setShowCarousel] = useState(true);
  
  // Admin panel state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  // Image polling state
  const [imageLoadingState, setImageLoadingState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [currentImageAttempt, setCurrentImageAttempt] = useState(0);
  const imagePollingTimeoutRef = useRef<number | null>(null);
  const currentPlayerIdRef = useRef<string | null>(null);

  // Initialize theme and audio
  const { currentTheme } = useTheme();
  
  // Initialize Firebase Realtime Database sync for desktop (broadcasts state to mobile devices)
  useRealtimeDesktopSync();
  
  // Load auction data from Firebase if available
  useAuctionDataLoader();
  
  // Save initial snapshot to Firebase for reset functionality
  useSaveInitialSnapshot();

  // Apply admin-edited player overrides
  useAdminPlayersOverrides();
  
  // Initialize feature flags
  useFeatureFlagsInit();
  
  // Connection status indicator
  const [showConnectionStatus, setShowConnectionStatus] = useState(true);
  
  // Load initial data
  const { isLoading, isError, error } = useInitialData();
  const { refreshAll } = useRefreshData();

  // Auction state
  const auction = useAuction();

  // Handle reset auction
  const handleResetAuction = useCallback(() => {
    auction.resetAuction();
    refreshAll();
  }, [auction, refreshAll]);
  const selectedTeam = auction.selectedTeam;
  const activeOverlay = useActiveOverlay();
  const notification = useNotification();
  const currentPlayer = useCurrentPlayer();
  const soldPlayers = useSoldPlayers();
  const unsoldPlayers = useUnsoldPlayers();
  const availablePlayers = useAvailablePlayers();
  const allPlayers = useOriginalPlayers();
  const allTeams = useTeams();

  // Handle team squad view
  const handleTeamSquadView = (teamId: string) => {
    console.log('[V1 App] handleTeamSquadView called with teamId:', teamId);
    console.log('[V1 App] allTeams.length:', allTeams.length);
    console.log('[V1 App] Setting state - showTeamSquadView: true, selectedTeamForSquad:', teamId);
    setSelectedTeamForSquad(teamId);
    setShowTeamSquadView(true);
  };

  // Keyboard shortcuts with team overlay toggle
  useKeyboardShortcuts({ 
    enabled: !showCoinJar && !showJumpModal && !showAdminPanel,
    onViewToggle: () => setShowTeamOverlay(prev => !prev),
    onEscape: () => setShowTeamOverlay(false),
    onHeaderToggle: () => setShowHeader(prev => !prev),
    onCarouselToggle: () => setShowCarousel(prev => !prev),
    onBidMultiplierChange: (multiplier) => setBidMultiplier(multiplier),
    onTeamSquadView: handleTeamSquadView,
    onCustomAction: (action) => {
      console.log('[App] onCustomAction called with:', action);
      if (action === 'jumpToPlayer') {
        console.log('[App] Opening jump modal - current state:', { showJumpModal, jumpInput, jumpError });
        // Reset state completely
        setJumpError('');
        setJumpInput('');
        setShowJumpModal(true);
        
        // Force focus on input after a short delay
        setTimeout(() => {
          jumpInputRef.current?.focus();
          console.log('[App] Input focused, showJumpModal:', true);
        }, 100);
      }
    },
  });

  // Focus jump input when modal opens
  useEffect(() => {
    if (showJumpModal) {
      console.log('[App] Jump modal opened');
      const frame = requestAnimationFrame(() => {
        console.log('[App] Focusing jump input');
        jumpInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [showJumpModal]);

  // Admin panel keyboard shortcut (Ctrl+Shift+A)
  useEffect(() => {
    const handleAdminKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAdminPanel(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleAdminKeyboard);
    return () => window.removeEventListener('keydown', handleAdminKeyboard);
  }, []);

  const handleJumpSubmit = () => {
    if (auction.selectionMode !== 'sequential') {
      setJumpError('Sequential mode only');
      return;
    }

    if (!availablePlayers.length) {
      setJumpError('No players available');
      return;
    }

    const playerId = jumpInput.trim();
    if (!playerId) {
      setJumpError('Enter player ID');
      return;
    }

    // Find player by ID
    const targetPlayer = allPlayers.find(p => p.id === playerId);
    if (!targetPlayer) {
      setJumpError(`ID "${playerId}" not found`);
      return;
    }

    // Check if player is still available
    const isAvailable = availablePlayers.some(p => p.id === playerId);
    if (!isAvailable) {
      setJumpError(`${targetPlayer.name} already sold`);
      return;
    }

    // Jump to player
    const success = auction.jumpToPlayerId(playerId);
    if (!success) {
      setJumpError('Unable to jump');
      return;
    }

    // Close modal and reset state
    console.log('[App] Jump successful - closing modal');
    setShowJumpModal(false);
    setJumpInput('');
    setJumpError('');
  };

  // Initialize audio service
  useEffect(() => {
    audioService.initialize();
    return () => audioService.dispose();
  }, []);

  // Handle coin jar animation complete
  const handleCoinJarComplete = () => {
    setShowCoinJar(false);
    setSelectedPlayerName('');
  };

  // Stats rows for player panel
  const statRows = useMemo(() => ([
    { label: 'Matches', value: currentPlayer?.matches || '—' },
    { label: 'Runs', value: currentPlayer?.runs || '—' },
    { label: 'Wickets', value: currentPlayer?.wickets || '—' },
    { label: 'Bowling Best', value: currentPlayer?.bowlingBestFigures || '—' },
    { label: 'Highest Score', value: currentPlayer?.battingBestFigures || '—' },
  ]), [currentPlayer]);

  // Get current player image URL
  const playerImageUrl = currentPlayer?.imageUrl ?? null;

  // Transform Drive URL to use most reliable endpoint first
  const transformedImageUrl = useMemo(() => {
    if (!playerImageUrl) return null;
    
    // Check if it's a Drive URL and use export view (most reliable)
    const fileId = extractDriveFileId(playerImageUrl);
    if (fileId) {
      const exportUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      console.log('[App] Using Drive export URL:', exportUrl);
      return exportUrl;
    }
    
    return playerImageUrl;
  }, [playerImageUrl]);

  // Preload player image - simple URL tracking
  const { onImageLoad } = useImagePreload(transformedImageUrl);

  // Async image polling with exponential backoff
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Get all possible image URLs for retry
  const getImageUrlVariants = (player: typeof currentPlayer) => {
    if (!player?.imageUrl) return [];
    
    const fileId = extractDriveFileId(player.imageUrl);
    if (!fileId) return [player.imageUrl];
    
    // Return all possible Drive URL variants in priority order
    return [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
      `https://lh3.googleusercontent.com/d/${fileId}=w800`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
    ];
  };
  
  // Test if image URL is accessible
  const testImageUrl = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const testImg = new Image();
      testImg.onload = () => resolve(true);
      testImg.onerror = () => resolve(false);
      testImg.src = url;
      
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  };

  // Reset image state when player changes
  const currentPlayerId = currentPlayer?.id ?? null;
  useEffect(() => {
    if (!currentPlayerId) return;
    
    // Reset on player change
    currentPlayerIdRef.current = currentPlayerId;
    setCurrentImageAttempt(0);
    setImageLoadingState('loading');
    
    // Clear any existing polling timeout
    if (imagePollingTimeoutRef.current) {
      clearTimeout(imagePollingTimeoutRef.current);
      imagePollingTimeoutRef.current = null;
    }
  }, [currentPlayerId]);
  
  // Async polling effect - retry loading actual images
  useEffect(() => {
    if (!currentPlayer?.id) {
      return;
    }
    
    // Only run if we're in loading state
    if (imageLoadingState !== 'loading') {
      return;
    }
    
    // Start async polling
    const pollImage = async () => {
      const urlVariants = getImageUrlVariants(currentPlayer);
      const maxAttempts = 15; // Try up to 15 times before giving up
      
      if (currentImageAttempt >= maxAttempts) {
        console.warn('[App] Max polling attempts reached for', currentPlayer.name);
        setImageLoadingState('error');
        return;
      }
      
      // Calculate which URL variant to try based on attempt
      const variantIndex = currentImageAttempt % urlVariants.length;
      const urlToTry = urlVariants[variantIndex];
      
      console.log(`[App] Polling attempt ${currentImageAttempt + 1}/${maxAttempts} for ${currentPlayer.name}`);
      console.log(`[App] Testing URL variant ${variantIndex + 1}/${urlVariants.length}:`, urlToTry.substring(0, 80));
      
      const isAccessible = await testImageUrl(urlToTry);
      
      // Check if player changed during async operation
      if (currentPlayerIdRef.current !== currentPlayer.id) {
        console.log('[App] Player changed during polling, aborting');
        return;
      }
      
      if (isAccessible) {
        console.log('[App] ✅ Image accessible! Setting as source');
        if (imgRef.current) {
          imgRef.current.src = urlToTry;
        }
        setImageLoadingState('loaded');
      } else {
        console.log('[App] ❌ Image not accessible, scheduling retry...');
        setCurrentImageAttempt(prev => prev + 1);
        
        // Exponential backoff: 500ms, 1s, 2s, 4s, max 5s
        const backoffDelay = Math.min(500 * Math.pow(2, Math.floor(currentImageAttempt / urlVariants.length)), 5000);
        console.log(`[App] Next retry in ${backoffDelay}ms`);
        
        imagePollingTimeoutRef.current = setTimeout(() => {
          pollImage();
        }, backoffDelay);
      }
    };
    
    // Start polling if we're in loading state
    if (imageLoadingState === 'loading') {
      pollImage();
    }
    
    // Cleanup
    return () => {
      if (imagePollingTimeoutRef.current) {
        clearTimeout(imagePollingTimeoutRef.current);
        imagePollingTimeoutRef.current = null;
      }
    };
  }, [currentPlayer, currentImageAttempt, imageLoadingState, getImageUrlVariants, testImageUrl]);

  // Loading state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Error state
  if (isError) {
    return <ErrorScreen error={error} onRetry={refreshAll} />;
  }

  return (
    <div 
      className="app-shell text-white"
      style={{
        backgroundImage: currentTheme.background 
          ? `url(${currentTheme.background})` 
          : undefined,
      }}
    >
      {/* Single full-screen GIF (in front of background, behind UI) */}
      <div className="corner-gifs" aria-hidden>
        <img
          loading="lazy"
          src="/extras/left-top-right-bottom-corner.gif"
          alt=""
          className="corner-gif fullscreen"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />

        <img
          loading="lazy"
          src="/extras/left-bottom-right-top-corner.gif"
          alt=""
          className="corner-gif fullscreen"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Full-screen neon light bands (top + bottom) */}
      <div className="screen-neon-bands" aria-hidden />

      {showHeader && (
        <Header 
          onRefresh={refreshAll}
          onResetAuction={handleResetAuction}
          onShowHelp={() => setShowHelpModal(true)}
          bidMultiplier={bidMultiplier}
          onJumpToPlayer={() => {
            setJumpError('');
            setJumpInput('');
            setShowJumpModal(true);
          }}
          onShowConnectToTeam={() => setShowConnectToTeamModal(true)}
          showConnectionStatus={showConnectionStatus}
          onDismissConnectionStatus={() => setShowConnectionStatus(false)}
        />
      )}

      {/* Connect to Team Modal */}
      {showConnectToTeamModal && createPortal(
        <ConnectToTeam open={showConnectToTeamModal} onClose={() => setShowConnectToTeamModal(false)} />,
        document.body
      )}

      {/* Main Player View - Two column layout */}
      <main className={`hero-split ${showHeader ? '' : 'no-header'}`}>
        {/* LEFT - Player Details */}
        <section className="hero-left">
          <AnimatePresence mode="wait">
          {currentPlayer ? (
            <motion.div
              key={currentPlayer.id}
              className="player-details-animated"
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.div 
                className="player-name-display"
                variants={{
                  hidden: { opacity: 0, x: -50, filter: 'blur(10px)' },
                  visible: { opacity: 1, x: 0, filter: 'blur(0px)' },
                  exit: { opacity: 0, x: 50, filter: 'blur(10px)' }
                }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
              >
                <img src="/assets/BCC Season 6.png" alt="BCC" className="club-logo" />
                <span>Brother Cricket Club</span>
              </motion.div>
              <motion.div 
                className="neon-bar-wrapper"
                variants={{
                  hidden: { opacity: 0, x: -60, filter: 'blur(12px)' },
                  visible: { opacity: 1, x: 0, filter: 'blur(0px)' },
                  exit: { opacity: 0, x: 60, filter: 'blur(12px)' }
                }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className="neon-bar">
                  <span className="neon-player-name">{currentPlayer.name}</span>
                </div>
                <span className="neon-role-icon">
                  {(() => {
                    const roleKey = String(currentPlayer.role ?? '')
                      .trim()
                      .toLowerCase()
                      .replaceAll(' ', '')
                      .replaceAll('-', '')
                      .replaceAll('_', '');

                    if (roleKey === 'batsman' || roleKey === 'batter') return <GiCricketBat />;
                    if (roleKey === 'bowler') return <IoBaseball />;
                    if (roleKey === 'allrounder' || roleKey === 'allround') return <IoStar />;
                    if (roleKey.startsWith('wicketkeeper') || roleKey.startsWith('wicketkeeperbatsman') || roleKey === 'wk') {
                      return <GiBaseballGlove />;
                    }
                    return <IoPerson />;
                  })()}
                </span>
              </motion.div>
              
              <motion.div 
                className="stat-stack"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1 },
                  exit: { opacity: 0 }
                }}
                transition={{ duration: 0.3 }}
              >
                <motion.div 
                  className="player-role-badge"
                  variants={{
                    hidden: { opacity: 0, x: -40, filter: 'blur(8px)' },
                    visible: { opacity: 1, x: 0, filter: 'blur(0px)' },
                    exit: { opacity: 0, x: 40, filter: 'blur(8px)' }
                  }}
                  transition={{ duration: 0.5, delay: 0.15, ease: [0.32, 0.72, 0, 1] }}
                >
                  <span className="role-arrow">▶▶</span>
                  <span className="role-text">{currentPlayer.role || 'Player'}</span>
                </motion.div>
                {statRows.map((row, index) => (
                  <motion.div 
                    key={row.label} 
                    className="stat-row"
                    variants={{
                      hidden: { opacity: 0, x: -30, filter: 'blur(6px)' },
                      visible: { opacity: 1, x: 0, filter: 'blur(0px)' },
                      exit: { opacity: 0, x: 30, filter: 'blur(6px)' }
                    }}
                    transition={{ duration: 0.45, delay: 0.2 + index * 0.06, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <span className="stat-label">{row.label}</span>
                    <span className="stat-divider" aria-hidden="true" />
                    <span className="stat-value">{row.value}</span>
                  </motion.div>
                ))}
              </motion.div>

              {/* Bid Info */}
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              className="empty-state-left"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="empty-title">Welcome to BCC Auctions</div>
              <div className="empty-hint">Press <kbd>N</kbd> for next player</div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>

        {/* RIGHT - Player Image & Animations */}
        <section className="hero-right">
          {/* Team Bid Card - Floating over player */}
          <AnimatePresence>
            {selectedTeam && (
              <motion.div
                className="team-bid-overlay"
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                <div className="team-bid-card">
                  <div className="team-bid-name">{selectedTeam.name}</div>
                  <div className="team-bid-amount">₹{auction.currentBid.toFixed(2)}L</div>
                  <div className="team-bid-max">Max: ₹{auction.getMaxBidForTeam(selectedTeam)?.toFixed(1)}L</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div 
              key={currentPlayer?.id ?? 'empty'}
              className="player-image-container"
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(15px)' }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            >
            {/* Animated background effects */}
            <div className="glow-orb glow-orb-1" />
            <div className="glow-orb glow-orb-2" />
            <div className="glow-orb glow-orb-3" />
            
            {/* Particle effects */}
            <div className="particles">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={`particle-${i}`} className="particle" style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>

            {/* Player Image or Placeholder */}
            <motion.div 
              className="player-placeholder"
              initial={{ opacity: 0, y: 30, filter: 'blur(15px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.32, 0.72, 0, 1] }}
            >
              {currentPlayer && (
                <>
                  {/* Loading Spinner Overlay */}
                  <AnimatePresence>
                    {imageLoadingState === 'loading' && (
                      <motion.div
                        className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/60 to-black/80 rounded-lg z-10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {/* Cricket ball spinner */}
                        <motion.div
                          className="relative w-20 h-20"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        >
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-500 to-red-700 shadow-lg" />
                          <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/40" />
                          <motion.div 
                            className="absolute inset-0 rounded-full bg-white/10"
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        </motion.div>
                        <motion.p
                          className="mt-4 text-white/70 text-sm font-medium"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          {imageLoadingState === 'loading' && currentImageAttempt > 0 
                            ? `Loading image... (attempt ${currentImageAttempt})`
                            : 'Loading player...'}
                        </motion.p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actual Image */}
                  <img 
                    ref={imgRef}
                    src={imageLoadingState === 'error' ? '/placeholder_player.png' : (transformedImageUrl || '/placeholder_player.png')} 
                    alt={currentPlayer.name}
                    className="placeholder-image"
                    loading="eager"
                    onLoad={(e) => {
                      const loadedUrl = (e.target as HTMLImageElement).src;
                      
                      // Don't mark as loaded if it's placeholder (means polling failed)
                      if (loadedUrl.includes('placeholder_player.png')) {
                        console.log('[App] Fallback image loaded for', currentPlayer.name);
                        onImageLoad();
                        return;
                      }
                      
                      console.log('[App] ✅ Actual image loaded successfully for', currentPlayer.name);
                      imageCacheService.markAsLoaded(loadedUrl);
                      setImageLoadingState('loaded');
                      onImageLoad();
                    }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      const failedUrl = img.src;
                      
                      // If the async-selected URL failed, continue polling
                      if (imageLoadingState === 'loaded' && !failedUrl.includes('placeholder')) {
                        console.warn('[App] Image that passed polling test failed to load:', failedUrl.substring(0, 80));
                        console.warn('[App] Resuming polling...');
                        setImageLoadingState('loading');
                        setCurrentImageAttempt(prev => prev + 1);
                      }
                      
                      imageCacheService.markAsFailed(failedUrl);
                    }}
                  />
                </>
              )}
              {!currentPlayer && (
                <img 
                  src="/placeholder_player.png" 
                  alt="Player placeholder"
                  className="placeholder-image"
                />
              )}
            </motion.div>

            {/* Animated rings */}
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />
            </motion.div>
          </AnimatePresence>

          {/* Role-based floating elements */}
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentPlayer?.role ?? 'default'}
              className="floating-elements"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="orbit-container">
              {/* Batsman - Bat icons */}
              {currentPlayer?.role === 'Batsman' && (
                <>
                  <span className="float-item float-1">
                    <GiCricketBat className="float-icon" />
                  </span>
                  <span className="float-item float-2">
                    <GiCricketBat className="float-icon" />
                  </span>
                  <span className="float-item float-3">
                    <GiCricketBat className="float-icon small" />
                  </span>
                </>
              )}

              {/* Bowler - Ball icons */}
              {currentPlayer?.role === 'Bowler' && (
                <>
                  <span className="float-item float-1">
                    <IoBaseball className="float-icon" />
                  </span>
                  <span className="float-item float-2">
                    <IoBaseball className="float-icon" />
                  </span>
                  <span className="float-item float-3">
                    <IoBaseball className="float-icon small" />
                  </span>
                </>
              )}

              {/* All-Rounder - Bat + Ball icons */}
              {currentPlayer?.role === 'All-Rounder' && (
                <>
                  <span className="float-item float-1">
                    <GiCricketBat className="float-icon" />
                  </span>
                  <span className="float-item float-2">
                    <IoBaseball className="float-icon" />
                  </span>
                  <span className="float-item float-3">
                    <IoStar className="float-icon small" />
                  </span>
                </>
              )}

              {/* Wicket-Keeper - Gloves icons */}
              {(currentPlayer?.role === 'Wicket-Keeper' || currentPlayer?.role === 'Wicket Keeper' || currentPlayer?.role === 'Wicket Keeper Batsman') && (
                <>
                  <span className="float-item float-1">
                    <GiBaseballGlove className="float-icon" />
                  </span>
                  <span className="float-item float-2">
                    <GiCricketBat className="float-icon" />
                  </span>
                  <span className="float-item float-3">
                    <GiBaseballGlove className="float-icon small" />
                  </span>
                </>
              )}

              {/* Default/Unknown role - Generic cricket icons */}
              {(!currentPlayer?.role || !['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper', 'Wicket Keeper', 'Wicket Keeper Batsman'].includes(currentPlayer.role)) && (
                <>
                  <span className="float-item float-1">
                    <IoBaseball className="float-icon" />
                  </span>
                  <span className="float-item float-2">
                    <GiCricketBat className="float-icon" />
                  </span>
                  <span className="float-item float-3">
                    <IoStar className="float-icon small" />
                  </span>
                </>
              )}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      {/* Team Overlay - Apple-themed sold players view */}
      <AnimatePresence>
        {showTeamOverlay && (
          <motion.div 
            className="team-overlay-apple"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTeamOverlay(false)}
          >
            <motion.div 
              className="team-panel-apple"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={e => e.stopPropagation()}
            >
              <button 
                className="panel-close-btn"
                onClick={() => setShowTeamOverlay(false)}
              >
                <IoClose />
              </button>

              {/* Team Tabs */}
              <div className="team-tabs">
                {allTeams.map((team, idx) => (
                  <button
                    key={team.name}
                    className={`team-tab ${selectedTeam?.name === team.name ? 'active' : ''}`}
                    onClick={() => auction.selectTeam(team)}
                  >
                    <span className="tab-number">{idx + 1}</span>
                    <span className="tab-name">{team.name}</span>
                    <span className="tab-count">{team.playersBought}</span>
                  </button>
                ))}
              </div>

              {/* Selected Team Info */}
              {selectedTeam && (
                <div className="team-info-header">
                  <div className="team-name-large">{selectedTeam.name}</div>
                  <div className="team-meta">
                    <span className="meta-item">
                      <span className="meta-label">Budget</span>
                      <span className="meta-value">₹{selectedTeam.remainingPurse?.toFixed(1)}L</span>
                    </span>
                    <span className="meta-divider">•</span>
                    <span className="meta-item">
                      <span className="meta-label">Players</span>
                      <span className="meta-value">{selectedTeam.playersBought}/{selectedTeam.totalPlayerThreshold}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Sold Players Grid */}
              <div className="sold-players-section">
                <div className="section-title">Squad</div>
                <div className="players-grid-apple">
                  {soldPlayers
                    .filter(p => p.teamName === selectedTeam?.name)
                    .map((player, idx) => (
                      <motion.div 
                        key={player.id}
                        className="player-card-apple"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <div className="player-avatar">
                          <img 
                            src={player.imageUrl || '/placeholder_player.png'} 
                            alt={player.name}
                            loading="lazy"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              const currentAttempt = Number.parseInt(img.dataset.squadErrorAttempt ?? '0', 10);
                              const nextAttempt = currentAttempt + 1;
                              img.dataset.squadErrorAttempt = nextAttempt.toString();
                              
                              // Prevent infinite loop - max 3 attempts
                              if (nextAttempt > 3) {
                                console.warn('[SquadView] Max error attempts reached for', player.name);
                                img.src = '/placeholder_player.png';
                                return;
                              }
                              
                              // Try fallback
                              if (nextAttempt === 1) {
                                // Use placeholder image
                                console.log('[SquadView] Trying placeholder for', player.name);
                                img.src = '/placeholder_player.png';
                                return;
                              }
                              
                              // Final fallback
                              console.error('[SquadView] Image failed, using placeholder for', player.name);
                              img.src = '/placeholder_player.png';
                            }}
                          />
                        </div>
                        <div className="player-info-apple">
                          <div className="player-name-apple">{player.name}</div>
                          <div className="player-role-apple">
                            <RoleIcon role={player.role} /> {player.role}
                          </div>
                        </div>
                        <div className="player-price-apple">₹{player.soldAmount}L</div>
                      </motion.div>
                    ))}
                  {soldPlayers.filter(p => p.teamName === selectedTeam?.name).length === 0 && (
                    <div className="empty-squad">No players bought yet</div>
                  )}
                </div>
              </div>

              <div className="panel-hint">
                Press <kbd>1-{allTeams.length}</kbd> to switch teams • <kbd>ESC</kbd> to close
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <SoldOverlay 
        isVisible={activeOverlay === 'sold'} 
        onClose={auction.closeOverlay} 
      />
      <UnsoldOverlay 
        isVisible={activeOverlay === 'unsold'} 
        onClose={auction.closeOverlay} 
      />
      <EndOverlay 
        isVisible={activeOverlay === 'end'} 
        onClose={auction.closeOverlay}
        onStartRound2={auction.startRound2}
        onStartNextRound={auction.startNextRound}
        onShowTeam={handleTeamSquadView}
      />

      {/* Coin Jar Animation */}
      <CoinJar 
        isAnimating={showCoinJar} 
        onAnimationComplete={handleCoinJarComplete}
        playerName={selectedPlayerName}
      />

      {/* Help Modal */}
      {showHelpModal && (
        <HelpModal onClose={() => setShowHelpModal(false)} />
      )}

      {/* Jump to Player Modal - Bottom Left Corner */}
      {showJumpModal && (() => {
        console.log('[App] 🎯 Rendering jump modal - showJumpModal:', showJumpModal);
        return createPortal(
        <div 
          className="fixed bottom-4 left-4 z-[11000]"
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            zIndex: 11000,
          }}
        >
          <div 
            className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-lg p-3" 
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              minWidth: '200px',
            }}
          >
            <div className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <IoSearch />
              <span>Jump to Player ID</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={jumpInputRef}
                type="text"
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleJumpSubmit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowJumpModal(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="flex-1 rounded bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Enter ID"
                style={{
                  minWidth: '120px',
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleJumpSubmit();
                }}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-all"
              >
                Go
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-1.5">
              Press F • ESC to close
            </div>
            {jumpError && (
              <div className="mt-2 p-2 rounded bg-red-900/50 border border-red-700/50 text-red-200 text-xs">
                {jumpError}
              </div>
            )}
          </div>
        </div>,
        document.body
      );
      })()}

      {/* Team Squad View - Redesigned full-screen team display */}
      {showTeamSquadView && selectedTeamForSquad && createPortal(
        <TeamSquadView 
          teamId={selectedTeamForSquad}
          teams={allTeams}
          soldPlayers={soldPlayers}
          allPlayers={[...soldPlayers, ...unsoldPlayers, ...availablePlayers]}
          onClose={() => {
            setShowTeamSquadView(false);
            setSelectedTeamForSquad('');
          }}
        />,
        document.body
      )}

      {/* Notifications */}
      <NotificationContainer 
        notification={notification} 
        onClear={auction.clearNotification} 
      />

      {/* Admin Panel */}
      <AdminPanel 
        isOpen={showAdminPanel} 
        onClose={() => setShowAdminPanel(false)}
      />

      {/* Analytics Carousel - Bottom of screen (toggle with '-' key) */}
      <AnalyticsCarousel visible={showCarousel} />
    </div>
  );
}

// Loading Screen
function LoadingScreen() {
  const cacheStats = imageCacheService.getStats();
  const totalCached = cacheStats.total;
  const successfulCached = cacheStats.successful;
  const loadPercentage = totalCached > 0 ? Math.round((successfulCached / totalCached) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--theme-background)] flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce"><GiCricketBat /></div>
        <div className="text-xl font-semibold text-[var(--theme-text-primary)] mb-4">
          Loading Auction Data & Images...
        </div>
        
        {/* Main progress bar */}
        <div className="mt-6 w-64 h-3 bg-[var(--theme-secondary)]/20 rounded-full overflow-hidden mx-auto shadow-lg">
          <div 
            className="h-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] rounded-full animate-pulse transition-all duration-500" 
            style={{ width: `${loadPercentage}%` }} 
          />
        </div>

        {/* Progress text */}
        <div className="mt-4 text-[var(--theme-text-secondary)] text-sm">
          {totalCached > 0 ? (
            <>
              <div>Images loaded: {successfulCached} / {totalCached}</div>
              <div className="text-xs mt-1 opacity-75">{loadPercentage}% complete</div>
            </>
          ) : (
            <div>Preparing images...</div>
          )}
        </div>

        {/* Status indicator */}
        <div className="mt-6 flex justify-center gap-2">
          <div className="w-2 h-2 bg-[var(--theme-accent)] rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 bg-[var(--theme-accent)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 bg-[var(--theme-accent)] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}

// Error Screen
function ErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--theme-background)] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)] mb-2">
          Failed to Load Data
        </h1>
        <p className="text-[var(--theme-text-secondary)] mb-6">
          {error?.message || 'Unable to connect to Google Sheets. Please check your configuration.'}
        </p>
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-[var(--theme-accent)] text-white rounded-lg font-semibold
                     hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// Help Modal
function HelpModal({ onClose }: { onClose: () => void }) {
  const hotkeyList = useHotkeyHelp();

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--theme-surface)] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-[var(--theme-text-primary)] mb-6">
          ⌨️ Keyboard Shortcuts
        </h2>
        <div className="space-y-3">
          {hotkeyList.map((item: { key: string; description: string }) => (
            <div key={item.key} className="flex justify-between items-center">
              <span className="text-[var(--theme-text-secondary)]">{item.description}</span>
              <kbd className="px-3 py-1 bg-[var(--theme-secondary)]/20 rounded font-mono text-sm">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-8 w-full py-3 bg-[var(--theme-accent)] text-white rounded-lg font-semibold"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

// Role Icon Component - Using react-icons library
function RoleIcon({ role }: { readonly role: string }) {
  const iconClass = "role-icon-svg";
  
  switch (role) {
    case 'Batsman':
      return <GiCricketBat className={iconClass} />;
    case 'Bowler':
      return <IoBaseball className={iconClass} />;
    case 'All-Rounder':
      return <IoStar className={iconClass} />;
    case 'Wicket-Keeper':
    case 'Wicket Keeper':
    case 'Wicket Keeper Batsman':
      return <GiBaseballGlove className={iconClass} />;
    default:
      return <IoPerson className={iconClass} />;
  }
}
