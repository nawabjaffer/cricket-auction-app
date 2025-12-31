// ============================================================================
// MAIN APP COMPONENT
// Root component with providers and layout
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
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
  TeamSelector,
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
} from './hooks';
import { audioService } from './services';
import { useActiveOverlay, useNotification, useCurrentPlayer, useSoldPlayers, useTeams } from './store';
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
  const allTeams = useTeams();

  // Keyboard shortcuts with team overlay toggle
  useKeyboardShortcuts({ 
    enabled: !showCoinJar,
    onViewToggle: () => setShowTeamOverlay(prev => !prev),
    onEscape: () => setShowTeamOverlay(false),
    onHeaderToggle: () => setShowHeader(prev => !prev),
    onBidMultiplierChange: (multiplier) => setBidMultiplier(multiplier),
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
                <img src="/assets/BCC Season 6.jpg" alt="BCC" className="club-logo" />
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
                  {currentPlayer.role === 'Batsman' && <GiCricketBat />}
                  {currentPlayer.role === 'Bowler' && <IoBaseball />}
                  {currentPlayer.role === 'All-Rounder' && <IoStar />}
                  {(currentPlayer.role === 'Wicket-Keeper' || currentPlayer.role === 'Wicket Keeper' || currentPlayer.role === 'Wicket Keeper Batsman') && <GiBaseballGlove />}
                  {!currentPlayer.role && <IoPerson />}
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
                  <span className="role-arrow">▶</span>
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
              <div className="empty-title">No Player Selected</div>
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
              <img 
                src="/placeholder_player.png" 
                alt="Player placeholder"
                className="placeholder-image"
              />
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
                            onError={(e) => {
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
