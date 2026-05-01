// ============================================================================
// MAIN APP COMPONENT
// Root component with providers and layout
// ============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTenantNavigate as useNavigate } from './hooks/useTenantNavigate';
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
  IoPhonePortrait,
  IoTv,
  IoSettings,
  IoCamera,
  IoPeople,
  IoStatsChart,
  IoShieldCheckmark,
  IoKeypad,
  IoInformationCircle,
} from 'react-icons/io5';
import {
  Header,
  SoldOverlay,
  UnsoldOverlay,
  EndOverlay,
  BreakOverlay,
  TeamStandingsOverlay,
  TopPicksOverlay,
  CoinJar,
  NotificationContainer,
  TeamSquadView,
  ConnectToTeam,
  AnalyticsCarousel,
  AdminPanel,
  SponsorShowcase,
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
  useBootPreload,
} from './hooks';
import { useRealtimeDesktopSync, useRealtimeMobileSync } from './hooks/useRealtimeSync';
import { audioService, imageCacheService } from './services';
import { auctionPersistence, type SponsorRecord, type AdminSettings } from './services/auctionPersistence';
import { ALL_PLAYER_STAT_FIELDS } from './components/AdminPanel/ThemeSettingsExtended';
import { auctionRules } from './services/auctionRules';
import { realtimeSync } from './services/realtimeSync';
import { getCachedStorageUrl, resolveImageAsync } from './services/firebaseStorageService';
import { useActiveOverlay, useNotification, useCurrentPlayer, useSoldPlayers, useAvailablePlayers, useOriginalPlayers, useTeams, useOrganizerLogo, useOrganizerName } from './store';
import { useAuctionStore } from './store/auctionStore';
import { extractDriveFileId } from './utils/driveImage';
import { formatRoleDisplay, getRoleCategory, parseRoleDetails, getRoleBadgeColor } from './utils/roleFormatter';
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

const FALLBACK_SPONSORS: SponsorRecord[] = [
  { id: 'fallback-title', name: 'EPL Title Partner', tier: 'title', isTitleSponsor: true, active: true, order: 1 },
  { id: 'fallback-gold-1', name: 'Power Play Energy', tier: 'gold', active: true, order: 2, website: 'powerplay.example' },
  { id: 'fallback-gold-2', name: 'Boundary Foods', tier: 'gold', active: true, order: 3, website: 'boundary.example' },
  { id: 'fallback-silver-1', name: 'Wicket Finance', tier: 'silver', active: true, order: 4, website: 'wicket.example' },
  { id: 'fallback-silver-2', name: 'Super Over Mobility', tier: 'silver', active: true, order: 5, website: 'superover.example' },
  { id: 'fallback-partner-1', name: 'Stadium Brew', tier: 'partner', active: true, order: 6, website: 'stadiumbrew.example' },
];

// Main App with Providers
export default function App({ mirrorMode = false }: { mirrorMode?: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuctionApp mirrorMode={mirrorMode} />
    </QueryClientProvider>
  );
}

// Auction App Content
function AuctionApp({ mirrorMode = false }: { mirrorMode?: boolean }) {
  const navigate = useNavigate();
  const isMirrorMode = mirrorMode;
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
  const [showLiveTransition, setShowLiveTransition] = useState(false);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  // Restore keyboard focus when returning from /live or other pages
  useEffect(() => {
    // Blur any focused element (buttons, links from navigation) so keyboard shortcuts work
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  }, []);
  
  // Connect to Team modal state
  const [showConnectToTeamModal, setShowConnectToTeamModal] = useState(false);
  
  // Analytics carousel state
  const [showCarousel, setShowCarousel] = useState(true);
  
  // Admin panel state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [sponsorLoadState, setSponsorLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  
  // Break overlay state
  const [showBreakOverlay, setShowBreakOverlay] = useState(false);
  const breakDurationSeconds = 120; // 2 minutes default
  
  // Top 3 Buys carousel state
  const [showTopBuysOverlay, setShowTopBuysOverlay] = useState(false);
  const [topBuysIndex, setTopBuysIndex] = useState(0);
  
  // Team Standings overlay state (Feature 3 - 'g' key)
  const [showTeamStandingsOverlay, setShowTeamStandingsOverlay] = useState(false);
  
  // Admin settings for configurable features
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  
  // Image loading state
  const [imageLoadingState, setImageLoadingState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [imgSrc, setImgSrc] = useState<string>('');
  const currentPlayerIdRef = useRef<string | null>(null);

  // Initialize theme and audio
  const { currentTheme } = useTheme();
  
  // Initialize Firebase Realtime Database sync for desktop (broadcasts state to mobile devices)
  useRealtimeDesktopSync(!isMirrorMode);
  const mirrorSync = useRealtimeMobileSync(isMirrorMode);
  
  // Load auction data from Firebase if available
  useAuctionDataLoader();
  
  // Save initial snapshot to Firebase for reset functionality (skip in mirror mode)
  useSaveInitialSnapshot(!isMirrorMode);

  // Apply admin-edited player overrides
  useAdminPlayersOverrides();
  
  // Initialize feature flags
  useFeatureFlagsInit();
  
  // Connection status indicator
  const [showConnectionStatus, setShowConnectionStatus] = useState(true);
  
  // Load initial data
  const { isLoading, isError, error } = useInitialData();
  const { refreshAll } = useRefreshData();

  // Boot-time media preload — caches all player/team/sponsor images before
  // showing the main UI so subsequent transitions are instant.
  const bootPreload = useBootPreload(!isLoading && !isError);

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
  const availablePlayers = useAvailablePlayers();
  const allPlayers = useOriginalPlayers();
  const allTeams = useTeams();
  const organizerLogo = useOrganizerLogo();
  const organizerName = useOrganizerName();

  // Mirror follower mode: hydrate local store from realtime desktop state
  // so this page stays in lockstep with the controlling laptop.
  // We use a ref to hold the latest sync data and trigger only on lastUpdate
  // (a primitive) to avoid infinite re-render loops from new object references.
  const mirrorSyncRef = useRef(mirrorSync);
  mirrorSyncRef.current = mirrorSync;

  useEffect(() => {
    if (!isMirrorMode) return;
    const ms = mirrorSyncRef.current;
    if (!ms.isConnected || !ms.lastUpdate) return;

    useAuctionStore.setState((prev) => {
      const newState: Record<string, unknown> = {
        ...prev,
        currentPlayer: ms.currentPlayer,
        currentBid: ms.currentBid,
        selectedTeam: ms.selectedTeam,
        teams: ms.teams,
        bidHistory: ms.bidHistory,
        activeOverlay: ms.activeOverlay,
        auctionState: {
          ...prev.auctionState,
          currentPlayer: ms.currentPlayer,
          currentBid: ms.currentBid,
          selectedTeam: ms.selectedTeam,
          bidHistory: ms.bidHistory,
          isAuctionActive: ms.auctionActive,
        },
      };

      // When sold overlay is active, ensure soldPlayers has the current player
      // so SoldOverlay can display the correct data
      if (ms.activeOverlay === 'sold' && ms.currentPlayer && ms.selectedTeam) {
        const lastSold = prev.soldPlayers.at(-1);
        if (!lastSold || lastSold.id !== ms.currentPlayer.id) {
          newState.soldPlayers = [
            ...prev.soldPlayers,
            {
              ...ms.currentPlayer,
              soldAmount: ms.currentBid,
              teamName: ms.selectedTeam.name,
              teamId: ms.selectedTeam.id,
              soldDate: new Date().toISOString(),
            },
          ];
        }
      }

      return newState;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMirrorMode, mirrorSync.lastUpdate]);

  // Mirror follower mode: adopt desktop broadcast view mode (break/squad/standings).
  useEffect(() => {
    if (!isMirrorMode) return;
    const unsub = realtimeSync.subscribeBroadcastControl((control) => {
      const mode = control?.mode ?? 'auction';
      setShowBreakOverlay(mode === 'break');
      setShowTeamSquadView(mode === 'teamSquad');
      setShowTeamOverlay(mode === 'standings');
      if (mode === 'teamSquad' && control?.teamSquadTeamId) {
        setSelectedTeamForSquad(control.teamSquadTeamId);
      }
    });
    return () => unsub();
  }, [isMirrorMode]);

  // Mirror mode: block most keyboard events to prevent accidental control, but allow 'g' for standings
  useEffect(() => {
    if (!isMirrorMode) return;
    const swallow = (e: KeyboardEvent) => {
      // Allow 'g' key through for team standings overlay
      if (e.key === 'g' || e.key === 'G') return;
      e.preventDefault(); e.stopPropagation();
    };
    window.addEventListener('keydown', swallow, { capture: true });
    return () => window.removeEventListener('keydown', swallow, { capture: true });
  }, [isMirrorMode]);

  // Handle team squad view
  const handleTeamSquadView = (teamId: string) => {
    console.log('[V1 App] handleTeamSquadView called with teamId:', teamId);
    console.log('[V1 App] allTeams.length:', allTeams.length);
    console.log('[V1 App] Setting state - showTeamSquadView: true, selectedTeamForSquad:', teamId);
    setSelectedTeamForSquad(teamId);
    setShowTeamSquadView(true);
  };

  // ── Broadcast UI overlay state to /live and /obs-overlay ────────────────
  // Desktop tells the receivers which overlay should be visible via
  // `broadcastControl.mode`. The data payload (team id, break duration)
  // lets receivers render an identical view without local state.
  useEffect(() => {
    if (isMirrorMode) return;
    // Derive the current mode from local UI flags. Priority:
    //   break > teamSquad > standings (team stats) > auction (default)
    let mode: 'auction' | 'break' | 'teamSquad' | 'standings' = 'auction';
    if (showBreakOverlay) mode = 'break';
    else if (showTeamSquadView) mode = 'teamSquad';
    else if (showTeamOverlay) mode = 'standings';

    const payload = {
      mode,
      lastUpdate: Date.now(),
      ...(mode === 'break' ? { breakDuration: breakDurationSeconds, breakStartedAt: Date.now() } : {}),
      ...(mode === 'teamSquad' ? { teamSquadTeamId: selectedTeamForSquad || null } : {}),
      ...(mode === 'standings' ? { selectedTeamId: selectedTeam?.id || allTeams[0]?.id || null } : {}),
    };

    realtimeSync.setBroadcastControl(payload).catch((err) => {
      console.warn('[App] Failed to publish broadcast control:', err);
    });
    // We intentionally depend only on visibility flags + relevant ids to
    // avoid publishing on every player/bid change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMirrorMode, showBreakOverlay, showTeamSquadView, showTeamOverlay, selectedTeamForSquad, selectedTeam?.id]);

  const handleOpenTeamDisplay = useCallback(() => {
    const initialTeamId = selectedTeam?.id || allTeams[0]?.id || '';

    if (!initialTeamId) {
      console.warn('[V1 App] No teams available for team display');
      return;
    }

    setSelectedTeamForSquad(initialTeamId);
    setShowTeamSquadView(true);
  }, [allTeams, selectedTeam]);

  // Keyboard shortcuts with team overlay toggle
  useKeyboardShortcuts({ 
    enabled: !isMirrorMode && !showCoinJar && !showJumpModal && !showAdminPanel,
    onViewToggle: () => setShowTeamOverlay(prev => !prev),
    onEscape: () => setShowTeamOverlay(false),
    onHeaderToggle: () => setShowHeader(prev => !prev),
    onCarouselToggle: () => setShowCarousel(prev => !prev),
    onBidMultiplierChange: (multiplier) => setBidMultiplier(multiplier),
    onTeamSquadView: handleTeamSquadView,
    onTeamDisplayToggle: () => {
      if (showTeamSquadView) {
        setShowTeamSquadView(false);
      } else {
        handleOpenTeamDisplay();
      }
    },
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
    if (isMirrorMode) return;
    const handleAdminKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAdminPanel(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleAdminKeyboard);
    return () => window.removeEventListener('keydown', handleAdminKeyboard);
  }, [isMirrorMode]);

  // Break overlay keyboard shortcut (B key)
  useEffect(() => {
    if (isMirrorMode) return;
    const handleBreakKey = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        // Don't trigger when typing in input fields or when admin/modals are open
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (showAdminPanel || showJumpModal || showCoinJar) return;
        
        e.preventDefault();
        setShowBreakOverlay(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleBreakKey);
    return () => window.removeEventListener('keydown', handleBreakKey);
  }, [isMirrorMode, showAdminPanel, showJumpModal, showCoinJar]);

  // Live transition keyboard shortcut (L key) - flip transition to /live
  useEffect(() => {
    if (isMirrorMode) return;
    const handleLiveKey = (e: KeyboardEvent) => {
      if (e.key === 'l' || e.key === 'L') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (showAdminPanel || showJumpModal || showCoinJar || showBreakOverlay) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return; // Don't conflict with Ctrl+L etc.
        
        e.preventDefault();
        setShowLiveTransition(true);
        // Navigate to /live after animation completes
        setTimeout(() => {
          navigate('/live');
        }, 1200);
      }
    };

    window.addEventListener('keydown', handleLiveKey);
    return () => window.removeEventListener('keydown', handleLiveKey);
  }, [isMirrorMode, showAdminPanel, showJumpModal, showCoinJar, showBreakOverlay, navigate]);

  // Top 3 Buys carousel keyboard shortcut ("/" key)
  useEffect(() => {
    if (isMirrorMode) return;
    const handleTopBuysKey = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (showAdminPanel || showJumpModal || showCoinJar) return;

        e.preventDefault();
        setShowTopBuysOverlay(prev => {
          if (!prev) {
            setTopBuysIndex(0);
          }
          return !prev;
        });
      }
      // Navigate within top buys carousel
      if (showTopBuysOverlay) {
        if (e.key === 'ArrowRight') { e.preventDefault(); setTopBuysIndex(i => Math.min(i + 1, 2)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); setTopBuysIndex(i => Math.max(i - 1, 0)); }
        if (e.key === 'Escape') { e.preventDefault(); setShowTopBuysOverlay(false); }
      }
    };

    window.addEventListener('keydown', handleTopBuysKey);
    return () => window.removeEventListener('keydown', handleTopBuysKey);
  }, [isMirrorMode, showAdminPanel, showJumpModal, showCoinJar, showTopBuysOverlay]);

  // Team Standings overlay keyboard shortcut ('g' key) — works in both desktop and mirror mode
  useEffect(() => {
    const handleStandingsKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (!isMirrorMode && (showAdminPanel || showJumpModal || showCoinJar)) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

        e.preventDefault();
        setShowTeamStandingsOverlay(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleStandingsKey);
    return () => window.removeEventListener('keydown', handleStandingsKey);
  }, [isMirrorMode, showAdminPanel, showJumpModal, showCoinJar]);

  const handleJumpSubmit = () => {
    if (auction.selectionMode !== 'sequential') {
      setJumpError('Sequential mode only');
      return;
    }

    if (!availablePlayers.length) {
      setJumpError('No players available');
      return;
    }

    const rawPlayerId = jumpInput.trim();
    if (!rawPlayerId) {
      setJumpError('Enter player ID');
      return;
    }

    const findMatchingPlayerId = (input: string): string | null => {
      const exactMatch = allPlayers.find((player) => player.id === input);
      if (exactMatch) return exactMatch.id;

      if (!/^\d+$/.test(input)) return null;

      const numericInput = Number.parseInt(input, 10);
      if (!Number.isFinite(numericInput)) return null;

      const numericMatch = allPlayers.find((player) => {
        const suffixDigits = player.id.match(/(\d+)$/)?.[1];
        if (!suffixDigits) return false;
        return Number.parseInt(suffixDigits, 10) === numericInput;
      });

      return numericMatch?.id ?? null;
    };

    const playerId = findMatchingPlayerId(rawPlayerId);
    if (!playerId) {
      setJumpError(`ID "${rawPlayerId}" not found`);
      return;
    }

    // Find player by ID
    const targetPlayer = allPlayers.find(p => p.id === playerId);
    if (!targetPlayer) {
      setJumpError(`ID "${rawPlayerId}" not found`);
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

  // Load sponsors from Firebase (no local fallback until load completes)
  useEffect(() => {
    let isMounted = true;
    let unsubscribeSponsors: (() => void) | null = null;

    const loadSponsors = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Database not ready');

        auctionPersistence.initialize(db);
        unsubscribeSponsors = auctionPersistence.subscribeSponsors((dbSponsors) => {
          if (!isMounted) return;
          setSponsors(dbSponsors.slice(0, 20));
          setSponsorLoadState('ready');
        });
      } catch {
        if (isMounted) {
          setSponsors([]);
          setSponsorLoadState('error');
        }
      }
    };

    void loadSponsors();

    return () => {
      isMounted = false;
      unsubscribeSponsors?.();
    };
  }, []);

  // Load admin settings for configurable features
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const ok = await realtimeSync.ensureInitialized();
        if (!ok || !alive) return;
        const db = realtimeSync.getDatabase();
        if (db) auctionPersistence.initialize(db);
        const settings = await auctionPersistence.getAdminSettings();
        if (alive && settings) setAdminSettings(settings);
      } catch { /* ignore */ }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const effectiveSponsors = useMemo(() => {
    if (sponsorLoadState !== 'ready') return [];

    const validFirebaseSponsors = sponsors
      .filter((sponsor) => sponsor?.name?.trim())
      .filter((sponsor) => sponsor.active !== false && sponsor.isActive !== false);

    return validFirebaseSponsors.length > 0 ? validFirebaseSponsors : FALLBACK_SPONSORS;
  }, [sponsors, sponsorLoadState]);

  const usingFallbackSponsors = useMemo(
    () => sponsorLoadState === 'ready' && effectiveSponsors.length > 0 && effectiveSponsors[0]?.id?.startsWith('fallback-'),
    [effectiveSponsors, sponsorLoadState],
  );

  const titleSponsor = useMemo(
    () => effectiveSponsors.find((sponsor) => sponsor.isTitleSponsor || sponsor.tier?.toLowerCase() === 'title') || effectiveSponsors[0] || null,
    [effectiveSponsors],
  );

  const carouselSponsors = useMemo(
    () => effectiveSponsors.filter((sponsor) => sponsor.id !== titleSponsor?.id),
    [effectiveSponsors, titleSponsor],
  );

  const showcaseSponsors = useMemo(
    () => (carouselSponsors.length > 0 ? carouselSponsors : effectiveSponsors),
    [carouselSponsors, effectiveSponsors],
  );

  const selectedTeamPlayers = useMemo(
    () => soldPlayers.filter((player) => player.teamName === selectedTeam?.name),
    [soldPlayers, selectedTeam?.name],
  );

  const selectAdjacentOverlayTeam = useCallback((direction: 'prev' | 'next') => {
    if (!showTeamOverlay || allTeams.length === 0) return;

    const currentIndex = selectedTeam
      ? allTeams.findIndex((team) => team.id === selectedTeam.id)
      : 0;

    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = (safeIndex + delta + allTeams.length) % allTeams.length;

    auction.selectTeam(allTeams[nextIndex]);
  }, [allTeams, auction, selectedTeam, showTeamOverlay]);

  const teamTopBids = useMemo(
    () => [...selectedTeamPlayers].sort((a, b) => b.soldAmount - a.soldAmount).slice(0, 3),
    [selectedTeamPlayers],
  );

  const teamTotalSpend = useMemo(
    () => selectedTeamPlayers.reduce((sum, player) => sum + player.soldAmount, 0),
    [selectedTeamPlayers],
  );

  // Top 3 most expensive buys across ALL teams
  const globalTopBuys = useMemo(() => {
    return [...soldPlayers]
      .sort((a, b) => b.soldAmount - a.soldAmount)
      .slice(0, 3)
      .map((p) => {
        const team = allTeams.find(t => t.name === p.teamName);
        return { ...p, team };
      });
  }, [soldPlayers, allTeams]);

  const teamRoleBalance = useMemo(() => {
    const roleCount = {
      batting: 0,
      bowling: 0,
      fielding: 0,
    };

    selectedTeamPlayers.forEach((player) => {
      const normalizedRole = player.role.toLowerCase().trim();

      if (normalizedRole.includes('bat')) roleCount.batting += 1;
      if (normalizedRole.includes('bowl')) roleCount.bowling += 1;
      if (normalizedRole.includes('all')) {
        roleCount.batting += 1;
        roleCount.bowling += 1;
      }
      if (normalizedRole.includes('wicket')) roleCount.fielding += 2;
      else roleCount.fielding += 1;
    });

    const total = Math.max(roleCount.batting + roleCount.bowling + roleCount.fielding, 1);

    return {
      batting: Math.round((roleCount.batting / total) * 100),
      bowling: Math.round((roleCount.bowling / total) * 100),
      fielding: Math.round((roleCount.fielding / total) * 100),
    };
  }, [selectedTeamPlayers]);

  const selectedTeamStatus = useMemo(() => {
    if (!selectedTeam) {
      return {
        maxBid: 0,
        status: 'safe' as const,
        warning: '',
      };
    }

    const nextBid = auction.currentBid + 0.5;
    const validation = auctionRules.validateBid(selectedTeam, nextBid, auctionRules.minimumPlayerBasePrice, null);

    return {
      maxBid: auctionRules.calculateMaxBid(selectedTeam),
      status: auctionRules.getTeamStatus(selectedTeam, auction.currentBid, 0.5),
      warning: validation.valid && validation.isWarning ? validation.message : '',
    };
  }, [selectedTeam, auction.currentBid]);

  useEffect(() => {
    if (!showTeamOverlay && !showTeamSquadView) return;

    const handleOverlayTeamNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      
      if (event.key === 'p') {
        console.log('[App] "P" key pressed - opening team display');
        event.preventDefault();
        handleOpenTeamDisplay();
      }

      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const direction = event.key === '[' ? 'prev' : 'next';

        if (showTeamSquadView && allTeams.length > 0) {
          // Navigate teams in Team Squad View
          const currentIndex = allTeams.findIndex((t) => t.id === selectedTeamForSquad);
          const safeIndex = currentIndex >= 0 ? currentIndex : 0;
          const delta = direction === 'next' ? 1 : -1;
          const nextIndex = (safeIndex + delta + allTeams.length) % allTeams.length;
          setSelectedTeamForSquad(allTeams[nextIndex].id);
        } else if (showTeamOverlay) {
          // Navigate teams in Team Overlay
          selectAdjacentOverlayTeam(direction);
        }
      }
    };

    window.addEventListener('keydown', handleOverlayTeamNavigation);
    return () => window.removeEventListener('keydown', handleOverlayTeamNavigation);
  }, [selectAdjacentOverlayTeam, showTeamOverlay, showTeamSquadView, allTeams, selectedTeamForSquad]);

  // Play sounds when overlay changes
  useEffect(() => {
    if (activeOverlay === 'sold') {
      audioService.playSold().catch(err => {
        console.warn('[App] Failed to play sold sound:', err);
      });
    } else if (activeOverlay === 'unsold') {
      audioService.playUnsold().catch(err => {
        console.warn('[App] Failed to play unsold sound:', err);
      });
    }
  }, [activeOverlay]);

  // Handle coin jar animation complete
  const handleCoinJarComplete = () => {
    setShowCoinJar(false);
    setSelectedPlayerName('');
  };

  // Stats rows for player panel — configurable from admin settings
  const statRows = useMemo(() => {
    const configuredFields = adminSettings?.playerStatsFields ?? ['age', 'matches', 'runs', 'wickets', 'battingBestFigures', 'bowlingBestFigures'];
    const rows: { label: string; value: string | number; category: 'batting' | 'bowling' | 'general' }[] = [];

    if (!currentPlayer) return rows;

    for (const fieldKey of configuredFields) {
      const fieldDef = ALL_PLAYER_STAT_FIELDS.find(f => f.key === fieldKey);
      if (!fieldDef) continue;

      let value: string | number | undefined;
      let category: 'batting' | 'bowling' | 'general' = 'general';

      if (fieldKey.startsWith('battingStats.')) {
        const statKey = fieldKey.split('.')[1] as keyof typeof currentPlayer.battingStats;
        value = currentPlayer.battingStats?.[statKey];
        category = 'batting';
      } else if (fieldKey.startsWith('bowlingStats.')) {
        const statKey = fieldKey.split('.')[1] as keyof typeof currentPlayer.bowlingStats;
        value = currentPlayer.bowlingStats?.[statKey];
        category = 'bowling';
      } else if (['runs', 'battingBestFigures'].includes(fieldKey)) {
        value = (currentPlayer as unknown as Record<string, unknown>)[fieldKey] as string | number | undefined;
        category = 'batting';
      } else if (['wickets', 'bowlingBestFigures'].includes(fieldKey)) {
        value = (currentPlayer as unknown as Record<string, unknown>)[fieldKey] as string | number | undefined;
        category = 'bowling';
      } else {
        value = (currentPlayer as unknown as Record<string, unknown>)[fieldKey] as string | number | undefined;
      }

      // Skip empty, N/A, or zero-only values
      if (value == null) continue;
      const strVal = String(value).trim();
      if (!strVal || strVal === '0' || strVal === 'N/A' || strVal === '0.00') continue;

      rows.push({ label: fieldDef.label, value, category });
    }

    return rows;
  }, [currentPlayer, adminSettings?.playerStatsFields]);

  // Get current player image URL
  const playerImageUrl = currentPlayer?.imageUrl ?? null;

  // Firebase Storage image resolution (replaces manual Drive URL cycling)
  const transformedImageUrl = useMemo(() => {
    if (!playerImageUrl) return null;
    // Instant: check Firebase Storage cache
    const cached = getCachedStorageUrl(playerImageUrl);
    if (cached) return cached;
    // Sync fallback: Google Drive lh3
    const fileId = extractDriveFileId(playerImageUrl);
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=w800`;
    return playerImageUrl;
  }, [playerImageUrl]);

  // Background: resolve to Firebase Storage CDN
  useEffect(() => {
    if (!playerImageUrl || !currentPlayer?.name) return;
    const cached = getCachedStorageUrl(playerImageUrl);
    if (cached) {
      setImgSrc(cached);
      setImageLoadingState('loaded');
      return;
    }
    const storagePath = `images/players/${currentPlayer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    resolveImageAsync(playerImageUrl, storagePath, (url) => {
      // Only update if we're still looking at the same player
      if (currentPlayerIdRef.current === currentPlayer.id) {
        setImgSrc(url);
      }
    });
  }, [playerImageUrl, currentPlayer?.name, currentPlayer?.id]);

  // Preload player image - simple URL tracking
  const { onImageLoad } = useImagePreload(transformedImageUrl);

  // Image element ref for load/error handling
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset image state when player changes — also set the first URL to try
  const currentPlayerId = currentPlayer?.id ?? null;
  useEffect(() => {
    if (!currentPlayerId) return;
    currentPlayerIdRef.current = currentPlayerId;
    setImageLoadingState('loading');
    setImgSrc(transformedImageUrl || '/placeholder_player.png');
  }, [currentPlayerId, transformedImageUrl]);

  // Loading state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Error state
  if (isError) {
    return <ErrorScreen error={error} onRetry={refreshAll} />;
  }

  // Block main UI until media is warmed in local cache for smooth live auction
  if (!bootPreload.done) {
    return <LoadingScreen progress={bootPreload.progress} loaded={bootPreload.loaded} total={bootPreload.total} />;
  }

  return (
    <div 
      className={`app-shell text-white${isMirrorMode ? ' mirror-mode' : ''}`}
      style={{
        backgroundImage: currentTheme.background 
          ? `url(${currentTheme.background})` 
          : undefined,
      }}
    >
      {/* Mirror badge */}
      {isMirrorMode && (
        <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 9999, background: 'rgba(239,68,68,0.15)', color: '#fff', borderRadius: 8, fontSize: 8, fontWeight: 700, letterSpacing: 1, backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
          MIRROR
        </div>
      )}
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

      {/* NJS Creative Labs branding watermark */}
      <div className="njs-branding-watermark" aria-hidden>
        powered by <b>NJS Creative Labs</b>
      </div>

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
          menuExtras={[
            {
              label: 'Team Display',
              description: 'Browse all squads',
              icon: <IoPerson />,
              onClick: handleOpenTeamDisplay,
            },
          ]}
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
                <img src={organizerLogo || '/assets/BCC Season 6.png'} alt={organizerName || 'Auction'} className="club-logo" />
                <span>{organizerName || 'Auction'}</span>
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
                  {(() => {
                    const parsed = parseRoleDetails(currentPlayer.role);
                    const roleColor = getRoleBadgeColor(currentPlayer.role);
                    return (
                      <>
                        <span className="role-badge-chip role-badge-chip--primary" style={{ background: roleColor }}>
                          {parsed.badge}
                        </span>
                        <span className="role-core-text">{parsed.coreRole}</span>
                        {parsed.battingHand && (
                          <span className="role-detail-chip role-detail-chip--bat">
                            <span className="role-detail-icon"></span>
                            {parsed.battingHand}
                          </span>
                        )}
                        {parsed.bowlingStyle && (
                          <span className="role-detail-chip role-detail-chip--bowl">
                            <span className="role-detail-icon">⚾</span>
                            {parsed.bowlingStyle}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </motion.div>
                {statRows.length <= 5 ? (
                  /* ≤5 stats: classic list view */
                  statRows.map((row, index) => (
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
                  ))
                ) : statRows.length <= 9 ? (
                  /* 6-9 stats: single grid view */
                  <motion.div
                    className="stat-grid-view"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1 },
                      exit: { opacity: 0 }
                    }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    {statRows.map((row, index) => (
                      <motion.div
                        key={row.label}
                        className="stat-grid-cell"
                        variants={{
                          hidden: { opacity: 0, scale: 0.8 },
                          visible: { opacity: 1, scale: 1 },
                          exit: { opacity: 0, scale: 0.8 }
                        }}
                        transition={{ duration: 0.35, delay: 0.15 + index * 0.04 }}
                      >
                        <span className="stat-grid-value">{row.value}</span>
                        <span className="stat-grid-label">{row.label}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  /* >9 stats: split batting + bowling grids */
                  <motion.div
                    className="stat-split-view"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1 },
                      exit: { opacity: 0 }
                    }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    {(() => {
                      const battingRows = statRows.filter(r => r.category === 'batting' || r.category === 'general');
                      const bowlingRows = statRows.filter(r => r.category === 'bowling');
                      return (
                        <>
                          {battingRows.length > 0 && (
                            <div className="stat-split-section">
                              <div className="stat-split-title">🏏 Batting</div>
                              <div className="stat-grid-view stat-grid-view--compact">
                                {battingRows.map((row, index) => (
                                  <motion.div
                                    key={row.label}
                                    className="stat-grid-cell"
                                    variants={{
                                      hidden: { opacity: 0, scale: 0.8 },
                                      visible: { opacity: 1, scale: 1 },
                                      exit: { opacity: 0, scale: 0.8 }
                                    }}
                                    transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
                                  >
                                    <span className="stat-grid-value">{row.value}</span>
                                    <span className="stat-grid-label">{row.label}</span>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          )}
                          {bowlingRows.length > 0 && (
                            <div className="stat-split-section">
                              <div className="stat-split-title">⚾ Bowling</div>
                              <div className="stat-grid-view stat-grid-view--compact">
                                {bowlingRows.map((row, index) => (
                                  <motion.div
                                    key={row.label}
                                    className="stat-grid-cell"
                                    variants={{
                                      hidden: { opacity: 0, scale: 0.8 },
                                      visible: { opacity: 1, scale: 1 },
                                      exit: { opacity: 0, scale: 0.8 }
                                    }}
                                    transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
                                  >
                                    <span className="stat-grid-value">{row.value}</span>
                                    <span className="stat-grid-label">{row.label}</span>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </motion.div>
                )}
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
              <div className="empty-home-logos">
                {titleSponsor?.logoUrl && (
                  <div className="empty-title-sponsor-logo-wrap" title={`Title Sponsor: ${titleSponsor.name}`}>
                    <img
                      src={titleSponsor.logoUrl}
                      alt={`${titleSponsor.name} logo`}
                      className="empty-title-sponsor-logo"
                    />
                  </div>
                )}

                <div className="empty-epl-logo-wrap" title={organizerName || 'Auction'}>
                  <img
                    src={organizerLogo || '/assets/BCC Season 6.png'}
                    alt="Organizer logo"
                    className="empty-epl-logo"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>

              <div className="empty-title">
                {organizerName ? `Welcome to ${organizerName} Auction` : 'Welcome to the Auction'}
              </div>
              <div className="empty-hint">Press <kbd>N</kbd> for next player</div>
              {sponsorLoadState === 'ready' && (
                <>
                  <SponsorShowcase sponsors={showcaseSponsors} titleSponsor={titleSponsor} />
                  <div className="sponsor-data-source-note" role="status">
                    {usingFallbackSponsors
                      ? `Showing fallback sponsor data (${effectiveSponsors.length}) because Firebase sponsor data is missing or incomplete.`
                      : `Showing Firebase sponsor data (${effectiveSponsors.length}).`}
                  </div>
                </>
              )}
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
                initial={{ opacity: 0, y: 40, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.9 }}
                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              >
                {/* Paddle Logo — rises above the card */}
                <motion.div
                  className="team-bid-paddle"
                  key={`paddle-${selectedTeam.id}-${auction.currentBid}`}
                  initial={{ y: -60, scale: 0.8, opacity: 0, rotate: -20 }}
                  animate={{ y: -20, scale: 1.4, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 16, delay: 0.1 }}
                >
                  <motion.div
                    className="team-bid-paddle-inner"
                    animate={{ y: [0, -1, 0], scale: [1.0, 1.4, 1.0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {selectedTeam.logoUrl && (
                      <img
                        src={selectedTeam.logoUrl}
                        alt=""
                        className="team-bid-paddle-logo"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                  </motion.div>
                  <div className="team-bid-paddle-stick" />
                  {/* Glow ring */}
                  <motion.div
                    className="team-bid-paddle-glow"
                    animate={{  y: [-8, -8, -8] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>

                <div className="team-bid-card">
                  {/* Blurred team logo background */}
                  {selectedTeam.logoUrl && (
                    <img
                      src={selectedTeam.logoUrl}
                      alt=""
                      className="team-bid-bg-logo"
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="team-bid-header-row">
                    {selectedTeam.logoUrl && (
                      <img
                        src={selectedTeam.logoUrl}
                        alt=""
                        className="team-bid-logo"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="team-bid-name">{selectedTeam.name}</div>
                  </div>
                  {/* Bid amount — animated on change */}
                  <motion.div
                    className="team-bid-amount"
                    key={`bid-${auction.currentBid}`}
                    initial={{ scale: 1.3, color: '#fbbf24' }}
                    animate={{ scale: 1, color: '#ffffff' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    ₹{Number(auction.currentBid).toFixed(2)}L
                  </motion.div>
                  <div className="team-bid-max">Max: ₹{auction.getMaxBidForTeam(selectedTeam)?.toFixed(1)}L</div>
                </div>

                {/* Ripple burst on new bid */}
                <motion.div
                  className="team-bid-ripple"
                  key={`ripple-${auction.currentBid}`}
                  initial={{ scale: 0.5, opacity: 0.8 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
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
                          Loading player...
                        </motion.p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actual Image */}
                  <img 
                    ref={imgRef}
                    src={imageLoadingState === 'error' ? '/placeholder_player.png' : (imgSrc || '/placeholder_player.png')} 
                    alt={currentPlayer.name}
                    className="placeholder-image"
                    loading="eager"
                    onLoad={(e) => {
                      const loadedUrl = (e.target as HTMLImageElement).src;
                      
                      if (loadedUrl.includes('placeholder_player.png')) {
                        onImageLoad();
                        return;
                      }
                      
                      imageCacheService.markAsLoaded(loadedUrl);
                      setImageLoadingState('loaded');
                      onImageLoad();
                    }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      const failedUrl = img.src;
                      
                      if (failedUrl.includes('placeholder_player.png')) return;
                      
                      imageCacheService.markAsFailed(failedUrl);
                      setImageLoadingState('error');
                      setImgSrc('/placeholder_player.png');
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
              {(!currentPlayer?.role || getRoleCategory(currentPlayer.role) === 'Uncategorized') && (
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
                <motion.div
                  className="team-info-header"
                  key={selectedTeam.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                >
                  <motion.div
                    className="team-info-logo-shell"
                    initial={{ opacity: 0, scale: 0.9, rotate: -6 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 0.61, 0.36, 1] }}
                  >
                    {selectedTeam.logoUrl ? (
                      <img
                        src={selectedTeam.logoUrl}
                        alt={`${selectedTeam.name} logo`}
                        className="team-info-logo"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="team-info-logo-fallback">{selectedTeam.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </motion.div>

                  <div className="team-info-details">
                    <div className="team-name-large">{selectedTeam.name}</div>
                    <div className="team-meta">
                      <span className="meta-item">
                        <span className="meta-label">Budget</span>
                        <span className="meta-value">₹{((selectedTeam.allocatedAmount || 0) - teamTotalSpend).toFixed(1)}L</span>
                      </span>
                      <span className="meta-divider">•</span>
                      <span className="meta-item">
                        <span className="meta-label">Players</span>
                        <span className="meta-value">{selectedTeam.playersBought}/{selectedTeam.totalPlayerThreshold}</span>
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Sold Players Grid */}
              {selectedTeam && (
                <div className="team-analytics-section">
                  <div className="section-title">Team Analytics</div>
                  <div className="team-analytics-grid">
                    <div className="analytics-card">
                      <div className="analytics-card-title">Balance</div>
                      <div className="analytics-meter-row">
                        <span>Batting</span>
                        <div className="analytics-meter"><span style={{ width: `${teamRoleBalance.batting}%` }} /></div>
                        <strong>{teamRoleBalance.batting}%</strong>
                      </div>
                      <div className="analytics-meter-row">
                        <span>Bowling</span>
                        <div className="analytics-meter"><span style={{ width: `${teamRoleBalance.bowling}%` }} /></div>
                        <strong>{teamRoleBalance.bowling}%</strong>
                      </div>
                      <div className="analytics-meter-row">
                        <span>Fielding</span>
                        <div className="analytics-meter"><span style={{ width: `${teamRoleBalance.fielding}%` }} /></div>
                        <strong>{teamRoleBalance.fielding}%</strong>
                      </div>
                    </div>

                    <div className="analytics-card">
                      <div className="analytics-card-title">Top Picks</div>
                      {teamTopBids.length > 0 ? teamTopBids.map((player, index) => (
                        <div key={player.id} className="analytics-list-item">
                          <span>#{index + 1} {player.name}</span>
                          <strong>₹{player.soldAmount.toFixed(1)}L</strong>
                        </div>
                      )) : <div className="analytics-empty">No picks yet</div>}
                    </div>

                    <div className="analytics-card">
                      <div className="analytics-card-title">Budget & Rules</div>
                      <div className="analytics-list-item">
                        <span>Total Spend</span>
                        <strong>₹{teamTotalSpend.toFixed(1)}L</strong>
                      </div>
                      <div className="analytics-list-item">
                        <span>Remaining</span>
                        <strong>₹{((selectedTeam.allocatedAmount || 0) - teamTotalSpend).toFixed(1)}L</strong>
                      </div>
                      <div className="analytics-list-item">
                        <span>Max Allowed Bid</span>
                        <strong>₹{selectedTeamStatus.maxBid.toFixed(1)}L</strong>
                      </div>
                      <div className={`analytics-status-badge ${selectedTeamStatus.status}`}>
                        {selectedTeamStatus.status === 'danger' ? 'Budget Risk: High' : selectedTeamStatus.status === 'warning' ? 'Budget Risk: Warning' : 'Budget Risk: Safe'}
                      </div>
                      {selectedTeamStatus.warning && (
                        <div className="analytics-warning-text">{selectedTeamStatus.warning}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="sold-players-section">
                <div className="section-title">Squad</div>
                <div className="players-grid-apple">
                  {selectedTeamPlayers
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
                            <RoleIcon role={player.role} /> {formatRoleDisplay(player.role)}
                          </div>
                        </div>
                        <div className="player-price-apple">₹{player.soldAmount}L</div>
                      </motion.div>
                    ))}
                  {selectedTeamPlayers.length === 0 && (
                    <div className="empty-squad">No players bought yet</div>
                  )}
                </div>
              </div>

              <div className="panel-hint">
                Press <kbd>[</kbd> previous team • <kbd>]</kbd> next team • <kbd>ESC</kbd> to close
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

      {/* Break Overlay with sponsor ads */}
      <BreakOverlay
        isVisible={showBreakOverlay}
        durationSeconds={
          adminSettings?.auctionBreaks?.find(b => b.id === adminSettings?.currentBreakId)?.durationSeconds
          ?? breakDurationSeconds
        }
        sponsors={sponsors}
        auctionTitle={
          adminSettings?.auctionBreaks?.find(b => b.id === adminSettings?.currentBreakId)?.title
          ?? undefined
        }
        organizerLogo={adminSettings?.organizerLogo}
        onClose={() => setShowBreakOverlay(false)}
      />

      {/* ═══════ TOP PICKS OVERLAY (press "/") ═══════ */}
      <TopPicksOverlay
        visible={showTopBuysOverlay}
        onClose={() => setShowTopBuysOverlay(false)}
        topBuys={globalTopBuys}
        currentIndex={topBuysIndex}
      />

      {/* ═══════ TEAM STANDINGS OVERLAY (press "g") ═══════ */}
      <TeamStandingsOverlay
        visible={showTeamStandingsOverlay}
        onClose={() => setShowTeamStandingsOverlay(false)}
        teams={allTeams}
        soldPlayers={soldPlayers}
        settings={adminSettings}
      />

      {/* Live Transition Animation */}
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
            {/* Top curtain */}
            <motion.div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: `linear-gradient(180deg, ${currentTheme.colors.primary || '#0a0f1e'} 0%, ${currentTheme.colors.secondary || '#1a1040'} 100%)`,
                transformOrigin: 'top center',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            />
            {/* Bottom curtain */}
            <motion.div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: `linear-gradient(0deg, ${currentTheme.colors.primary || '#0a0f1e'} 0%, ${currentTheme.colors.secondary || '#1a1040'} 100%)`,
                transformOrigin: 'bottom center',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            />
            {/* Flipping logo */}
            <motion.div
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
              initial={{ rotateY: 0, scale: 0.5, opacity: 0 }}
              animate={{ rotateY: 360, scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: 'easeInOut' }}
            >
              {currentTheme.seasonLogo ? (
                <img
                  src={currentTheme.seasonLogo}
                  alt="Tournament Logo"
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.3))',
                  }}
                />
              ) : (
                <div style={{
                  fontSize: '4rem',
                  background: `linear-gradient(135deg, ${currentTheme.colors.accent || '#a78bfa'}, ${currentTheme.colors.primary || '#60a5fa'})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontWeight: 800,
                }}>
                  {currentTheme.name || 'LIVE'}
                </div>
              )}
              <div style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.8)',
              }}>
                GOING LIVE
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          allPlayers={allPlayers}
          specialCategories={adminSettings?.specialCategories}
          teamOwners={adminSettings?.teamOwners}
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
        onSettingsSaved={(settings) => setAdminSettings(settings)}
      />

      {/* Analytics Carousel - Bottom of screen (toggle with '-' key) */}
      <AnalyticsCarousel visible={showCarousel} />
    </div>
  );
}

// Loading Screen — cinematic broadcast-style transition
function LoadingScreen({ progress, loaded, total }: { readonly progress?: number; readonly loaded?: number; readonly total?: number } = {}) {
  const hasProgress = typeof progress === 'number' && typeof total === 'number' && total > 0;
  const pct = hasProgress ? Math.min(100, Math.round((progress as number) * 100)) : 0;

  // Read cached admin settings for loading screen configuration
  const [loadingConfig, setLoadingConfig] = useState<{ mode: 'logo' | 'video'; logoUrl?: string; videoUrl?: string; textOverlay?: string } | null>(null);
  const [cachedOrgLogo, setCachedOrgLogo] = useState('');
  useEffect(() => {
    // Try to get settings from localStorage cache for instant display
    try {
      const raw = localStorage.getItem('auction-storage');
      if (raw) {
        const data = JSON.parse(raw) as { state?: { organizerLogo?: string } };
        if (data.state?.organizerLogo) setCachedOrgLogo(data.state.organizerLogo);
      }
    } catch { /* ignore */ }
    // Then try async admin settings
    const load = async () => {
      try {
        const settings = await auctionPersistence.getAdminSettings();
        if (settings?.loadingScreen) setLoadingConfig(settings.loadingScreen);
        if (settings?.organizerLogo) setCachedOrgLogo(settings.organizerLogo);
      } catch { /* ignore */ }
    };
    void load();
  }, []);

  const effectiveLogoUrl = loadingConfig?.logoUrl || cachedOrgLogo || '/assets/BCC Season 6.png';
  const isVideoMode = loadingConfig?.mode === 'video' && loadingConfig.videoUrl;

  return (
    <div className="loading-transition">
      {/* Animated background */}
      <div className="loading-transition__bg">
        <div className="loading-transition__shape loading-transition__shape--1" />
        <div className="loading-transition__shape loading-transition__shape--2" />
        <div className="loading-transition__shape loading-transition__shape--3" />
      </div>

      {/* Curtain wipe — top & bottom panels close then open */}
      <motion.div
        className="loading-transition__curtain loading-transition__curtain--top"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: [0, 1, 1, 0] }}
        transition={{ duration: 3, times: [0, 0.3, 0.7, 1], ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.div
        className="loading-transition__curtain loading-transition__curtain--bottom"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: [0, 1, 1, 0] }}
        transition={{ duration: 3, times: [0, 0.3, 0.7, 1], ease: 'easeInOut', repeat: Infinity }}
      />

      {/* Center content */}
      <motion.div
        className="loading-transition__center"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.8] }}
        transition={{ duration: 3, times: [0, 0.3, 0.7, 1], ease: 'easeInOut', repeat: Infinity }}
      >
        {isVideoMode ? (
          <>
            <video
              src={loadingConfig!.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              style={{ maxWidth: 320, maxHeight: 200, borderRadius: 12, objectFit: 'contain' }}
            />
            {loadingConfig?.textOverlay && (
              <div className="loading-transition__title" style={{ marginTop: 16 }}>{loadingConfig.textOverlay}</div>
            )}
          </>
        ) : (
          <>
            <img
              src={effectiveLogoUrl}
              alt="Tournament"
              className="loading-transition__logo"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="loading-transition__title">AUCTION</div>
            <div className="loading-transition__subtitle">LIVE</div>
          </>
        )}
        {hasProgress && (
          <div style={{ marginTop: 24, textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>
            <div style={{ width: 260, height: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f97316)', transition: 'width 180ms ease-out' }} />
            </div>
            <div style={{ marginTop: 10, fontSize: 13, letterSpacing: 2 }}>
              PRELOADING MEDIA · {loaded}/{total}
            </div>
          </div>
        )}
      </motion.div>

      {/* Bottom branding */}
      <div className="loading-transition__footer">
        powered by <b>NJS Creative Labs</b>
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
  const [activeTab, setActiveTab] = useState<'features' | 'shortcuts'>('features');

  const features = [
    {
      icon: <GiCricketBat size={22} />,
      label: 'Auction',
      desc: 'Live player bidding with keyboard controls',
      color: '#f59e0b',
    },
    {
      icon: <IoPeople size={22} />,
      label: 'Teams',
      desc: 'Budget tracking & squad management',
      color: '#10b981',
    },
    {
      icon: <IoPhonePortrait size={22} />,
      label: 'Mobile Bidding',
      desc: 'Teams bid from phones via /connect-bidding',
      color: '#6366f1',
    },
    {
      icon: <IoTv size={22} />,
      label: 'Live Broadcast',
      desc: 'OBS-ready camera overlay at /live',
      color: '#ef4444',
    },
    {
      icon: <IoCamera size={22} />,
      label: 'Multi-Camera',
      desc: 'Single / PiP / Split / Quad layouts',
      color: '#ec4899',
    },
    {
      icon: <IoSettings size={22} />,
      label: 'Broadcast Control',
      desc: 'Switch modes & camera config at /live-admin',
      color: '#8b5cf6',
    },
    {
      icon: <IoStatsChart size={22} />,
      label: 'Analytics',
      desc: 'Real-time auction stats & sold/unsold lists',
      color: '#06b6d4',
    },
    {
      icon: <IoShieldCheckmark size={22} />,
      label: 'Bid Rules',
      desc: 'Budget caps, min-balance & increment guards',
      color: '#84cc16',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--theme-surface)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-xs text-[var(--theme-text-secondary)] uppercase tracking-widest font-semibold">
              powered by NJS Creative Labs
            </p>
            <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">
              EPL Auction — Help
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--theme-secondary)]/20 text-[var(--theme-text-secondary)]"
          >
            <IoClose size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--theme-secondary)]/20 mx-6">
          {([
            { id: 'features', icon: <IoInformationCircle size={16} />, label: 'Features' },
            { id: 'shortcuts', icon: <IoKeypad size={16} />, label: 'Shortcuts' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-[var(--theme-accent)] text-[var(--theme-accent)]'
                  : 'border-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'features' && (
            <div className="grid grid-cols-2 gap-3">
              {features.map(f => (
                <div
                  key={f.label}
                  className="flex items-start gap-3 p-3 rounded-xl bg-[var(--theme-secondary)]/10"
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white"
                    style={{ background: f.color }}
                  >
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--theme-text-primary)] leading-tight">
                      {f.label}
                    </p>
                    <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5 leading-snug">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-2.5">
              {hotkeyList.map((item: { key: string; description: string }) => (
                <div key={item.key} className="flex justify-between items-center">
                  <span className="text-sm text-[var(--theme-text-secondary)]">
                    {item.description}
                  </span>
                  <kbd className="px-2.5 py-1 bg-[var(--theme-secondary)]/20 rounded font-mono text-xs">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-6 pb-5 pt-2 border-t border-[var(--theme-secondary)]/20">
          <p className="text-[10px] text-[var(--theme-text-secondary)]/60 leading-relaxed text-center">
            For private use only. Player stats sourced from public cricket records. NJS Creative Labs is not affiliated with any cricket board or franchise. All team names and logos are property of their respective owners.
          </p>
        </div>
      </div>
    </div>
  );
}

// Role Icon Component - Using react-icons library
function RoleIcon({ role }: { readonly role: string }) {
  const iconClass = "role-icon-svg";
  const category = getRoleCategory(role);
  
  switch (category) {
    case 'Batsman':
      return <GiCricketBat className={iconClass} />;
    case 'Bowler':
      return <IoBaseball className={iconClass} />;
    case 'All-Rounder':
      return <IoStar className={iconClass} />;
    case 'Wicket Keeper Batsman':
      return <GiBaseballGlove className={iconClass} />;
    default:
      return <IoPerson className={iconClass} />;
  }
}
