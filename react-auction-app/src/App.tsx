// ============================================================================
// MAIN APP COMPONENT
// Root component with providers and layout
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
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
} from 'react-icons/io5';
import {
  Header,
  SoldOverlay,
  UnsoldOverlay,
  EndOverlay,
  CoinJar,
  NotificationContainer,
} from './components';
import { 
  useAuction, 
  useInitialData, 
  useRefreshData, 
  useKeyboardShortcuts, 
  useTheme,
  useHotkeyHelp,
  useImagePreload,
} from './hooks';
import { audioService } from './services';
import { useActiveOverlay, useNotification, useCurrentPlayer, useSoldPlayers, useUnsoldPlayers, useAvailablePlayers, useTeams } from './store';
import { getAlternativeDriveUrl } from './utils/driveImage';
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

  // Initialize theme and audio
  const { currentTheme } = useTheme();
  
  // Load initial data
  const { isLoading, isError, error } = useInitialData();
  const { refreshAll } = useRefreshData();

  // Auction state
  const auction = useAuction();
  const selectedTeam = auction.selectedTeam;
  const activeOverlay = useActiveOverlay();
  const notification = useNotification();
  const currentPlayer = useCurrentPlayer();
  const soldPlayers = useSoldPlayers();
  const unsoldPlayers = useUnsoldPlayers();
  const availablePlayers = useAvailablePlayers();
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
    enabled: !showCoinJar,
    onViewToggle: () => setShowTeamOverlay(prev => !prev),
    onEscape: () => setShowTeamOverlay(false),
    onHeaderToggle: () => setShowHeader(prev => !prev),
    onBidMultiplierChange: (multiplier) => setBidMultiplier(multiplier),
    onTeamSquadView: handleTeamSquadView,
  });

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

  // Preload player image - simple URL tracking
  const { loadedUrl: playerImageUrl, isLoading: isImageLoading } = useImagePreload(currentPlayer?.imageUrl);

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
          onShowHelp={() => setShowHelpModal(true)}
          bidMultiplier={bidMultiplier}
        />
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
              {[...Array(12)].map((_, i) => (
                <span key={i} className="particle" style={{ '--i': i } as React.CSSProperties} />
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
                    {isImageLoading && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <motion.div
                          className="w-16 h-16 border-4 border-transparent border-t-yellow-400 border-r-yellow-400 rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actual Image */}
                  <img 
                    src={playerImageUrl || '/placeholder_player.png'} 
                    alt={currentPlayer.name}
                    className="placeholder-image"
                    loading="eager"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      
                      // Try alternative if primary failed and it's a Drive URL
                      if (playerImageUrl && playerImageUrl.includes('drive.google.com')) {
                        // Only try alternative if we haven't already
                        if (!img.src.includes('/api/proxy-drive') && !img.src.includes('ui-avatars')) {
                          const altUrl = getAlternativeDriveUrl(playerImageUrl);
                          if (altUrl && img.src !== altUrl) {
                            console.log('[App] Trying alternative Drive URL:', altUrl);
                            img.src = altUrl;
                            return;
                          }
                        }
                        
                        // Final fallback: generate avatar from player name using ui-avatars
                        // This service works on localhost when crossOrigin is not enforced
                        if (!img.src.includes('ui-avatars')) {
                          const playerInitials = currentPlayer.name
                            .split(' ')
                            .map(word => word[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                          
                          const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(playerInitials)}&background=1976D2&color=ffffff&size=400&bold=true`;
                          console.log('[App] Using generated avatar for', currentPlayer.name, ':', avatarUrl);
                          img.src = avatarUrl;
                          return;
                        }
                      }
                      
                      // Final fallback to placeholder
                      console.warn('[App] Image loading failed, using placeholder for', currentPlayer.name);
                      img.src = '/placeholder_player.png';
                    }}
                    onLoad={() => {
                      // Image loaded successfully - loading spinner will fade out
                      console.log('[App] Image loaded successfully for', currentPlayer.name);
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
                <span>✕</span>
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
                              console.error('[SquadView] Image failed, using placeholder for', player.name);
                              (e.target as HTMLImageElement).src = '/placeholder_player.png';
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

      {/* Team Squad View Modal (V1) - rendered as portal to escape overflow constraints */}
      {showTeamSquadView && selectedTeamForSquad && createPortal(
        <>
          {console.log('[V1 App Render] Rendering TeamSquadViewModal - showTeamSquadView:', showTeamSquadView, 'selectedTeamForSquad:', selectedTeamForSquad)}
          <TeamSquadViewModal 
            teamId={selectedTeamForSquad}
            teams={allTeams}
            soldPlayers={soldPlayers}
            allPlayers={[...soldPlayers, ...unsoldPlayers, ...availablePlayers]}
            onClose={() => {
              setShowTeamSquadView(false);
              setSelectedTeamForSquad('');
            }}
          />
        </>,
        document.body
      )}

      {/* Notifications */}
      <NotificationContainer 
        notification={notification} 
        onClear={auction.clearNotification} 
      />
    </div>
  );
}

// Loading Screen
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[var(--theme-background)] flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce">🏏</div>
        <div className="text-xl font-semibold text-[var(--theme-text-primary)]">
          Loading Auction Data...
        </div>
        <div className="mt-4 w-48 h-2 bg-[var(--theme-secondary)]/20 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-[var(--theme-accent)] rounded-full animate-pulse" 
               style={{ width: '60%' }} />
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

// V1 Team Squad View Modal Component
interface TeamSquadViewModalProps {
  teamId: string;
  teams: any[];
  soldPlayers: any[];
  allPlayers: any[];
  onClose: () => void;
}

function TeamSquadViewModal({ teamId, teams, soldPlayers, allPlayers, onClose }: TeamSquadViewModalProps) {
  const team = teams.find(t => t.id === teamId);
  
  console.log('[V1 TeamSquadViewModal] Rendering - teamId:', teamId, 'team:', team, 'teams available:', teams.length);
  
  if (!team) {
    console.log('[V1 TeamSquadViewModal] Team not found!');
    return null;
  }

  // Filter players by both teamId and teamName for accurate matching
  const teamPlayers = soldPlayers.filter(p => p.teamId === team.id || p.teamName === team.name);
  console.log('[V1 TeamSquadViewModal] Rendering modal for:', team.name, 'players:', teamPlayers.length);
  console.log('[V1 TeamSquadViewModal] All sold players:', soldPlayers.map(p => ({ name: p.name, teamId: p.teamId, teamName: p.teamName })));
  console.log('[V1 TeamSquadViewModal] Filtered team players:', teamPlayers.map(p => p.name));
  
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        console.log('[V1 TeamSquadViewModal] ESC pressed, closing modal');
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  // Set up colors first
  const primaryColor = team.primaryColor || '#3b82f6';
  const secondaryColor = team.secondaryColor || '#06b6d4';
  
  // Use player placeholder image from assets
  const placeholderImage = '/placeholder_player.png';

  // Find captain image from all players (sold, unsold, available)
  let captainImage = placeholderImage;
  if (team.captain) {
    const captain = allPlayers.find(p => p.name?.toLowerCase() === team.captain?.toLowerCase());
    console.log('[V1 TeamSquadViewModal] Looking for captain:', team.captain, 'Found:', captain?.name, 'ImageUrl:', captain?.imageUrl);
    if (captain?.imageUrl && captain.imageUrl !== placeholderImage) {
      captainImage = captain.imageUrl;
    }
  } else {
    // If no captain specified, use the first team player's image
    const firstPlayer = teamPlayers[0];
    if (firstPlayer?.imageUrl && firstPlayer.imageUrl !== placeholderImage) {
      captainImage = firstPlayer.imageUrl;
      console.log('[V1 TeamSquadViewModal] No captain, using first player:', firstPlayer.name, 'ImageUrl:', firstPlayer.imageUrl);
    }
  }
  
  const midPoint = Math.ceil(teamPlayers.length / 2);
  const leftColumn = teamPlayers.slice(0, midPoint);
  const rightColumn = teamPlayers.slice(midPoint);
  const backgroundStyle = {
    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto"
      style={{
        ...backgroundStyle,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Decorative Elements (Geometric shapes from reference) */}
      <div className="absolute top-4 right-8 opacity-15">
        {/* Top right geometric pattern - hexagons and triangles */}
        <svg width="300" height="300" viewBox="0 0 300 300" fill="none" stroke="white" strokeWidth="2">
          {/* Hexagon */}
          <polygon points="150,20 190,45 190,95 150,120 110,95 110,45" />
          <polygon points="210,70 250,95 250,145 210,170 170,145 170,95" />
          <polygon points="90,70 130,95 130,145 90,170 50,145 50,95" />
          {/* Triangles */}
          <polygon points="240,20 270,70 210,70" />
          <polygon points="150,150 180,200 120,200" />
          <polygon points="60,20 90,70 30,70" />
        </svg>
      </div>
      <div className="absolute bottom-4 left-4 opacity-10">
        {/* Bottom left geometric pattern */}
        <svg width="250" height="250" viewBox="0 0 250 250" fill="none" stroke="white" strokeWidth="2">
          <polygon points="125,10 165,35 165,85 125,110 85,85 85,35" />
          <polygon points="185,60 225,85 225,135 185,160 145,135 145,85" />
          <polygon points="200,120 230,170 170,170" />
        </svg>
      </div>

      <div className="container mx-auto px-8 flex flex-row items-center justify-between h-full relative z-10" onClick={e => e.stopPropagation()}>
        {/* Left Side: Info */}
        <div className="flex-1 flex flex-col justify-between h-full py-16 pl-40 ml-12">
          {/* Heading Section - Top Left */}
          <div className="mb-auto pt-8">
            <h1 
              className="text-7xl font-black text-white uppercase leading-[0.8] tracking-tight mb-4"
              style={{
                textShadow: '0 0 40px rgba(255, 255, 255, 0.3), 0 0 80px rgba(255, 255, 255, 0.2), 0 4px 20px rgba(0, 0, 0, 0.5)'
              }}
            >
              {team.name}
            </h1>
            <div className="w-36 h-1.5 bg-white mb-4 shadow-lg" />
            <h2 
              className="text-5xl font-bold text-white uppercase tracking-[0.3em]"
              style={{
                textShadow: '0 0 30px rgba(255, 255, 255, 0.25), 0 0 60px rgba(255, 255, 255, 0.15), 0 2px 15px rgba(0, 0, 0, 0.4)'
              }}
            >
              SQUAD
            </h2>
          </div>

          {/* Player List Section - Vertical Center, Left Aligned */}
          <div className="flex flex-row gap-24 pl-6 mb-auto">
            {/* Column 1 */}
            <div className="flex flex-col gap-6 min-w-[300px]">
              {leftColumn.map((player) => (
                <div key={player.id} className="relative pb-2.5">
                  <span className="text-[1.7rem] font-bold text-black uppercase tracking-wide block leading-tight">
                    {player.name}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/85" />
                </div>
              ))}
              {leftColumn.length === 0 && (
                <span className="text-white/50 text-xl italic">No players yet</span>
              )}
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-6 min-w-[300px]">
              {rightColumn.map((player) => (
                <div key={player.id} className="relative pb-2.5">
                  <span className="text-[1.7rem] font-bold text-black uppercase tracking-wide block leading-tight">
                    {player.name}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white/85" />
                </div>
              ))}
            </div>
          </div>

          {/* Spacer for bottom */}
          <div className="h-16"></div>
        </div>

        {/* Right Side: Captain Image */}
        <div className="flex-1 h-full flex items-end justify-end relative pr-12">
          <div className="h-[85%] w-full relative">
            {/* Image Container */}
            <img 
              src={captainImage} 
              alt="Captain" 
              className="absolute bottom-0 right-0 h-full w-auto object-contain"
              style={{ 
                filter: 'drop-shadow(0 10px 40px rgba(0,0,0,0.5))',
                maxWidth: '100%'
              }}
              onError={(e) => {
                console.log('[V1 TeamSquadViewModal] Image failed to load:', captainImage);
                // Fallback to placeholder on error
                (e.target as HTMLImageElement).src = placeholderImage;
              }}
            />
          </div>
        </div>
      </div>

      {/* Close Hint */}
      <div className="absolute bottom-8 left-8 text-white/70 text-sm">
        Press <span className="px-2 py-1 bg-white/20 rounded font-mono text-sm">ESC</span> to close
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
