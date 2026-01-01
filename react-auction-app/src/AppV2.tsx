// ============================================================================
// AUCTION APP V2 - MAIN APPLICATION COMPONENT
// Complete rewrite with modern patterns and improved UX
// ============================================================================

import React, { useState, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';

// V2 Components
import { Button, Card, Kbd, Badge, Modal } from './components/v2/ui';
import { 
  RoleIcon, 
  RoleBadge, 
} from './components/v2/PlayerCard';
import { 
  TeamSelector, 
  TeamBidOverlay,
} from './components/v2/TeamComponents';
import { 
  SoldOverlay, 
  UnsoldOverlay, 
  EndOverlay, 
  NotificationContainer,
} from './components/v2/Overlays';

// V2 Hooks
import { 
  useAuctionV2, 
  useKeyboardShortcutsV2, 
  usePlayerStats,
  useNotificationV2,
  useThemeV2,
  useHotkeyHelpV2,
} from './hooks/v2';

// V2 Store
import { useAuctionStoreV2 } from './store/v2/auctionStoreV2';

// Icons
import { GiCricketBat } from 'react-icons/gi';
import { IoHelp, IoRefresh, IoSunny, IoMoon } from 'react-icons/io5';

// Create Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
    },
  },
});

// ============================================================================
// APP ROOT WITH PROVIDERS
// ============================================================================

export default function AppV2() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuctionAppV2 />
    </QueryClientProvider>
  );
}

// ============================================================================
// MAIN AUCTION APP
// ============================================================================

function AuctionAppV2() {
  // Local UI state
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showHeader, setShowHeader] = useState(false);

  // V2 Hooks
  const auction = useAuctionV2();
  const stats = usePlayerStats();
  const { theme, setTheme, isDark } = useThemeV2();
  const { notifications, dismiss: dismissNotification } = useNotificationV2();
  const store = useAuctionStoreV2();

  // Keyboard shortcuts
  useKeyboardShortcutsV2({
    enabled: true,
    onViewToggle: () => setShowTeamPanel((prev) => !prev),
    onEscape: () => {
      setShowTeamPanel(false);
      setShowHelpModal(false);
    },
    onHeaderToggle: () => setShowHeader((prev) => !prev),
    onBidMultiplierChange: (multiplier) => {
      store.addNotification('info', 'Bid Multiplier', `Set to ${multiplier}x`);
    },
  });

  // Computed values
  const eligibleTeams = useMemo(() => auction.getEligibleTeams(), [auction]);

  // Get last sold player for overlay
  const lastSoldPlayer = useMemo(() => {
    return auction.soldPlayers.at(-1);
  }, [auction.soldPlayers]);

  // Get last unsold player for overlay
  const lastUnsoldPlayer = useMemo(() => {
    return auction.unsoldPlayers.at(-1);
  }, [auction.unsoldPlayers]);

  // Local override image for player placeholder (from local drive)
  const [overrideImage, setOverrideImage] = useState<{ playerId: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentOverrideImage =
    overrideImage && auction.currentPlayer?.id && overrideImage.playerId === auction.currentPlayer.id
      ? overrideImage.dataUrl
      : null;

  const handlePlayerImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!auction.currentPlayer?.id) return;
      setOverrideImage(typeof reader.result === 'string'
        ? { playerId: auction.currentPlayer.id, dataUrl: reader.result }
        : null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div 
      className={clsx(
        'min-h-screen bg-background text-text-primary transition-colors duration-300',
        'relative overflow-hidden'
      )}
    >
      {/* Animated Background (back layer) */}
      <div className="fixed inset-0 z-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Corner GIFs (mid layer): in front of background, behind UI */}
      <div className="corner-gifs fixed inset-0 z-[1]" aria-hidden>
        <img
          loading="lazy"
          src="/extras/left-top-right-bottom-corner.gif"
          alt=""
          className="corner-gif fullscreen"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Full-screen neon light bands (top + bottom) */}
      <div className="screen-neon-bands" aria-hidden />

      {/* Header */}
      <AnimatePresence>
        {showHeader && (
          <Header
            onRefresh={() => {}}
            onShowHelp={() => setShowHelpModal(true)}
            bidMultiplier={store.bidMultiplier}
            theme={theme}
            onThemeToggle={() => setTheme(isDark ? 'light' : 'dark')}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={clsx(
        'relative z-10 min-h-screen flex flex-col',
        showHeader ? 'pt-16' : 'pt-0'
      )}>
        {/* Two-column layout */}
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Left Panel - Player Details */}
          <section className="flex-1 flex flex-col justify-center p-8 lg:p-12">
            <AnimatePresence mode="wait">
              {auction.currentPlayer ? (
                <motion.div
                  key={auction.currentPlayer.id}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  {/* Club Logo */}
                  <div className="flex items-center gap-3">
                    <img 
                      src="/BCC_Logo.png" 
                      alt="BCC" 
                      className="w-12 h-12 rounded-xl object-cover shadow-lg"
                    />
                    <span className="text-text-secondary font-medium">Brother Cricket Club</span>
                  </div>

                  {/* Player Name & Role */}
                  <div>
                    <div className="flex items-center gap-4 mb-2">
                      <RoleBadge role={auction.currentPlayer.role} />
                    </div>
                    <h1 className="text-5xl lg:text-6xl font-black text-text-primary leading-tight">
                      {auction.currentPlayer.name}
                    </h1>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard 
                      label="Matches" 
                      value={auction.currentPlayer.stats?.matches ?? '—'} 
                    />
                    <StatCard 
                      label="Runs" 
                      value={auction.currentPlayer.stats?.runs ?? '—'} 
                    />
                    <StatCard 
                      label="Wickets" 
                      value={auction.currentPlayer.stats?.wickets ?? '—'} 
                    />
                    <StatCard 
                      label="Highest" 
                      value={auction.currentPlayer.stats?.highestScore ?? '—'} 
                    />
                    <StatCard 
                      label="Best Bowling" 
                      value={auction.currentPlayer.stats?.bestBowling ?? '—'} 
                    />
                    <StatCard 
                      label="Base Price" 
                      value={`₹${auction.currentPlayer.basePrice}L`}
                      highlight 
                    />
                  </div>

                  {/* Current Bid Display */}
                  <Card variant="glass" className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-text-secondary mb-1">Current Bid</div>
                        <div className="text-4xl font-black text-accent">
                          ₹{auction.currentBid.toFixed(2)}L
                        </div>
                        {auction.selectedTeam && (
                          <div className="text-text-secondary mt-1">
                            by <span className="text-text-primary font-semibold">{auction.selectedTeam.name}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={auction.incrementBid}
                        >
                          ↑ Increase
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={auction.decrementBid}
                        >
                          ↓ Decrease
                        </Button>
                      </div>
                    </div>
                    {store.bidMultiplier > 1 && (
                      <Badge variant="info" className="mt-3">
                        {store.bidMultiplier}x Multiplier Active
                      </Badge>
                    )}
                  </Card>
                </motion.div>
              ) : (
                <EmptyState onNext={auction.selectNextPlayer} />
              )}
            </AnimatePresence>
          </section>

          {/* Right Panel - Player Image & Team Bid */}
          <section className="flex-1 relative flex items-center justify-center p-8">
            {/* Team Bid Overlay */}
            <AnimatePresence>
              {auction.selectedTeam && (
                <TeamBidOverlay
                  team={auction.selectedTeam}
                  currentBid={auction.currentBid}
                  maxBid={auction.getMaxBidForTeam(auction.selectedTeam)}
                />
              )}
            </AnimatePresence>

            {/* Player Placeholder */}
            <AnimatePresence mode="wait">
              <motion.div
                key={auction.currentPlayer?.id ?? 'empty'}
                className="relative"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
              >
                {/* Glow Effects */}
                <div className="absolute inset-0 -z-10">
                  <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl scale-150 animate-pulse" />
                </div>

                {/* Player Image */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePlayerImageFile}
                />
                <div className="relative w-72 h-72 lg:w-96 lg:h-96 rounded-full overflow-hidden ring-4 ring-accent/30 shadow-2xl">
                  <img
                    src={currentOverrideImage || auction.currentPlayer?.imageUrl || '/placeholder_player.png'}
                    alt="Player"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder_player.png'; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      padding: '6px 10px',
                      fontSize: 12,
                      borderRadius: 8,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    Upload
                  </button>
                </div>

                {/* Floating Role Icon */}
                {auction.currentPlayer && (
                  <motion.div
                    className="absolute -bottom-4 -right-4 w-20 h-20 bg-surface rounded-2xl shadow-xl flex items-center justify-center"
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                  >
                    <RoleIcon role={auction.currentPlayer.role} size="lg" />
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>

        {/* Bottom Action Bar */}
        <ActionBar
          onNext={auction.selectNextPlayer}
          onSold={auction.markAsSold}
          onUnsold={auction.markAsUnsold}
          onUndo={auction.undoLastAction}
          hasPlayer={!!auction.currentPlayer}
          hasTeam={!!auction.selectedTeam}
          stats={stats}
        />
      </main>

      {/* Team Selector Panel */}
      <AnimatePresence>
        {showTeamPanel && (
          <motion.div
            className="fixed inset-x-0 bottom-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-border p-6"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
          >
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Select Team</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowTeamPanel(false)}
                >
                  Close <Kbd>ESC</Kbd>
                </Button>
              </div>
              <TeamSelector
                teams={auction.teams}
                selectedTeam={auction.selectedTeam}
                eligibleTeams={eligibleTeams}
                getMaxBid={auction.getMaxBidForTeam}
                onSelect={(team) => {
                  auction.placeBid(team);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <SoldOverlay
        isVisible={store.activeOverlay === 'sold'}
        onClose={auction.closeOverlay}
        player={lastSoldPlayer}
      />
      <UnsoldOverlay
        isVisible={store.activeOverlay === 'unsold'}
        onClose={auction.closeOverlay}
        player={lastUnsoldPlayer}
      />
      <EndOverlay
        isVisible={store.activeOverlay === 'end'}
        onClose={auction.closeOverlay}
        onStartRound2={auction.startRound2}
        hasUnsoldPlayers={auction.unsoldPlayers.some(p => p.canRetry)}
        stats={stats}
      />

      {/* Help Modal */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* Notifications */}
      <NotificationContainer
        notifications={notifications}
        onDismiss={dismissNotification}
      />

      {/* Floating toggle buttons */}
      <div className="fixed bottom-4 left-4 flex flex-col gap-2 z-30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHeader(prev => !prev)}
          className="bg-surface/80 backdrop-blur-sm"
        >
          <Kbd>H</Kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTeamPanel(prev => !prev)}
          className="bg-surface/80 backdrop-blur-sm"
        >
          <Kbd>V</Kbd>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// HEADER COMPONENT
// ============================================================================

interface HeaderProps {
  onRefresh: () => void;
  onShowHelp: () => void;
  bidMultiplier: number;
  theme: string;
  onThemeToggle: () => void;
}

function Header({ onRefresh, onShowHelp, bidMultiplier, theme, onThemeToggle }: Readonly<HeaderProps>) {
  return (
    <motion.header
      className="fixed top-0 inset-x-0 z-50 h-16 bg-surface/80 backdrop-blur-xl border-b border-border"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      exit={{ y: -100 }}
    >
      <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GiCricketBat className="w-8 h-8 text-accent" />
          <span className="text-xl font-bold">Cricket Auction</span>
          <Badge variant="info">v2.0</Badge>
        </div>
        <div className="flex items-center gap-2">
          {bidMultiplier > 1 && (
            <Badge variant="warning">{bidMultiplier}x</Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onThemeToggle}>
            {theme === 'dark' ? <IoSunny className="w-5 h-5" /> : <IoMoon className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <IoRefresh className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowHelp}>
            <IoHelp className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.header>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  highlight?: boolean;
}

function StatCard({ label, value, highlight }: Readonly<StatCardProps>) {
  return (
    <div className={clsx(
      'p-4 rounded-xl',
      highlight ? 'bg-accent/10 border border-accent/30' : 'bg-surface/50'
    )}>
      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={clsx(
        'text-xl font-bold',
        highlight ? 'text-accent' : 'text-text-primary'
      )}>{value}</div>
    </div>
  );
}

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

function EmptyState({ onNext }: Readonly<{ onNext: () => void }>) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="text-center py-20"
    >
      <div className="text-8xl mb-6">🏏</div>
      <h2 className="text-3xl font-bold text-text-primary mb-2">
        Ready to Start
      </h2>
      <p className="text-text-secondary mb-8">
        Press <Kbd>N</Kbd> for next player or click the button below
      </p>
      <Button variant="primary" size="lg" onClick={onNext}>
        Start Auction
      </Button>
    </motion.div>
  );
}

// ============================================================================
// ACTION BAR COMPONENT
// ============================================================================

interface ActionBarProps {
  onNext: () => void;
  onSold: () => void;
  onUnsold: () => void;
  onUndo: () => void;
  hasPlayer: boolean;
  hasTeam: boolean;
  stats: { total: number; sold: number; unsold: number; available: number };
}

function ActionBar({ onNext, onSold, onUnsold, onUndo, hasPlayer, hasTeam, stats }: Readonly<ActionBarProps>) {
  return (
    <div className="sticky bottom-0 bg-surface/90 backdrop-blur-xl border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-text-muted">Available:</span>{' '}
              <span className="font-bold text-text-primary">{stats.available}</span>
            </div>
            <div>
              <span className="text-text-muted">Sold:</span>{' '}
              <span className="font-bold text-green-400">{stats.sold}</span>
            </div>
            <div>
              <span className="text-text-muted">Unsold:</span>{' '}
              <span className="font-bold text-orange-400">{stats.unsold}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={onUndo}
              disabled={!hasPlayer}
            >
              <Kbd>Z</Kbd> Undo
            </Button>
            <Button 
              variant="secondary" 
              onClick={onNext}
            >
              <Kbd>N</Kbd> Next
            </Button>
            <Button 
              variant="danger" 
              onClick={onUnsold}
              disabled={!hasPlayer}
            >
              <Kbd>U</Kbd> Unsold
            </Button>
            <Button 
              variant="success" 
              onClick={onSold}
              disabled={!hasPlayer || !hasTeam}
            >
              <Kbd>S</Kbd> Sold
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELP MODAL COMPONENT
// ============================================================================

function HelpModal({ isOpen, onClose }: Readonly<{ isOpen: boolean; onClose: () => void }>) {
  const shortcuts = useHotkeyHelpV2();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Content className="max-w-md">
        <Modal.Header>⌨️ Keyboard Shortcuts</Modal.Header>
        <Modal.Body>
          <div className="space-y-3">
            {shortcuts.map((item) => (
              <div key={item.key} className="flex justify-between items-center">
                <span className="text-text-secondary">{item.description}</span>
                <Kbd>{item.key}</Kbd>
              </div>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={onClose}>
            Got it!
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
